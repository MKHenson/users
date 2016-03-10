import * as ws from "ws";
import * as mongodb from "mongodb";
import * as def from "webinate-users";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as winston from "winston";
import {UserManager, User} from "../users";

interface ISocketClient extends ws
{
    clientConnection: ClientConnection;
}

class ClientConnection
{
    private _ws: ISocketClient;
    public user: User;
    public clientType: def.IWebsocketClient;

    constructor(ws: ws, clientType: def.IWebsocketClient)
    {
        var that = this;
        this.clientType = clientType;

        UserManager.get.loggedIn(ws.upgradeReq, null).then(function (user)
        {
            (<ISocketClient>ws).clientConnection = that;
            that._ws = (<ISocketClient>ws);
            that.user = user;
            ws.on('message', that.onMessage.bind(that));
            ws.on('close', that.onClose.bind(that));
            ws.on('error', that.onError.bind(that));

        }).catch(this.onError);
    }

    /**
	* Called whenever we recieve a message from a client
    * @param {string|any} message
	*/
    private onMessage(message: string)
    {
    }

    /**
	* Called whenever a client disconnnects
	*/
    private onClose()
    {
        this._ws.removeAllListeners("message");
        this._ws.removeAllListeners("close");
        this._ws.removeAllListeners("error");
        this._ws.clientConnection = null;
        this._ws = null;
    }

    /**
	* Called whenever an error has occurred
    * @param {Error} err
	*/
    private onError(err: Error)
    {
        winston.error(`An error has occurred for web socket : '${err.message}'`, { process: process.pid })
    }
}

/**
* Describes the event being sent to connected clients
*/
export enum EventType
{
    Login,
    Logout,
    Activated,
    Removed,
    FilesUploaded,
    FilesRemoved,
    BucketUploaded,
    BucketRemoved
}

/**
* A controller that deals with any any IPC or web socket communications
*/
export class CommsController
{
    public static singleton: CommsController;
    private _server: ws.Server;

    /**
	* Creates an instance of the Communication server
    * @param {IConfig} cfg
	*/
    constructor(cfg: def.IConfig)
    {
        var that = this;

        CommsController.singleton = this;

        // dummy request processing - this is not actually called as its handed off to the socket api
        var processRequest = function (req, res) {
            res.writeHead(200);
            res.end("All glory to WebSockets!\n");
        };

        // Create the web socket server
        if (cfg.ssl)
        {
            var httpsServer: https.Server = null;
            var caChain = [fs.readFileSync(cfg.sslIntermediate), fs.readFileSync(cfg.sslRoot)];
            var privkey = cfg.sslKey ? fs.readFileSync(cfg.sslKey) : null;
            var theCert = cfg.sslCert ? fs.readFileSync(cfg.sslCert) : null;

            winston.info(`Attempting to start Websocket server with SSL...`, { process: process.pid });
            httpsServer = https.createServer( { key: privkey, cert: theCert, passphrase: cfg.sslPassPhrase, ca: caChain }, processRequest);
            httpsServer.listen(cfg.websocket.port);
            this._server = new ws.Server({ server: httpsServer });
        }
        else
            this._server = new ws.Server({ port: cfg.websocket.port });

        winston.info("Websockets attempting to listen on HTTP port " + cfg.websocket.port, { process: process.pid });

        // Handle errors
        this._server.on('error', function connection(err) {
            winston.error("Websocket error: " + err.toString());
            that._server.close();
        });

        // A client has connected to the server
        this._server.on('connection', function connection(ws: ws)
        {
            var headers = (<http.ServerRequest>ws.upgradeReq).headers;

            var clientApproved = false;
            for (var i = 0, l = cfg.websocket.clients.length; i < l; i++)
            {
                if ((headers.origin && headers.origin.match(new RegExp(cfg.websocket.clients[i].origin))))
                {
                    new ClientConnection(ws, cfg.websocket.clients[i]);
                    clientApproved = true;
                }
            }

            if (!clientApproved)
            {
                winston.error(`A connection was made by ${headers.host || headers.origin} but it is not on the approved domain list`);
                ws.terminate();
            }
        });
    }

    /**
	* Sends an event to all connected clients of this server listening for a specific event
    * @param {IEvent} event The event to broadcast
	*/
    broadcastEvent(event: def.SocketEvents.IEvent): Promise<any>
    {
        var that = this;
        return new Promise(function (resolve, reject)
        {
            var numResponded = 0,
                errorOccurred = false,
                releventClients: Array<ISocketClient>  = [];

            // First find all listening clients that need to be notified when this event happens
            for (var i = 0, l = that._server.clients.length; i < l; i++)
            {
                var client: ISocketClient = <ISocketClient>that._server.clients[i];
                releventClients.push(client);
            }

            // Now go through each client and let them know about the event
            var clientLength = releventClients.length;
            for (var i = 0; i < clientLength; i++)
            {
                var client: ISocketClient = releventClients[i];
                client.send(JSON.stringify(event), undefined, function (error: Error)
                {
                    if (errorOccurred)
                        return;

                    if (error)
                    {
                        errorOccurred = true;
                        return reject();
                    }

                    numResponded++;
                    if (numResponded >= clientLength)
                        return resolve();
                });
            };

            // No active listeners
            if (clientLength == 0)
                return resolve();
        });
    }

    /**
	* Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
	*/
    initialize(db: mongodb.Db): Promise<void>
    {
        return Promise.resolve<void>();
    }
}