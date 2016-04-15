"use strict";

import * as ws from "ws";
import * as events from "events";
import * as mongodb from "mongodb";
import * as def from "webinate-users";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as winston from "winston";
import {UserManager, User} from "../users";
import {EventResponseType, EventType} from "../socket-event-types";
import {SocketAPI} from "../socket-api";

interface ISocketClient extends ws
{
    clientConnection: ClientConnection;
}

/**
 * An event class that is emitted to all listeners of the communications controller.
 * This wraps data around events sent via the web socket to the users server. Optionally
 * these events can respond to the client who initiated the event as well as to all listeners.
 */
export class ClientEvent<T extends def.SocketEvents.IEvent>
{
    /** The client who initiated the request */
    client: ClientConnection;

    /** The event sent from the client */
    clientEvent: T;

    /** An optional response event to be sent back to the client or all connected clients. This is dependent on the responseType */
    responseEvent: def.SocketEvents.IEvent;

    /** Describes how users should respond to a socket event. By default the response is EventResponseType.NoResponse.
     * if EventResponseType.RespondClient then the responseEvent is sent back to the initiating client.
     * if EventResponseType.ReBroadcast then the responseEvent is sent to all clients.
     */
    responseType: EventResponseType;

    /**
     * BY default the error is null, but if set, then an error response is given to the client
     */
    error : Error;

    constructor(event: T, client: ClientConnection)
    {
        this.client = client;
        this.error = null;
        this.clientEvent = event;
        this.responseType = EventResponseType.NoResponse;
    }
}

/**
 * A wrapper class for client connections made to the CommsController
 */
class ClientConnection
{
    public ws: ISocketClient;
    public user: User;
    public domain: string;
    private _controller: CommsController;

    constructor(ws: ws, domain: string, controller : CommsController)
    {
        var that = this;
        this.domain = domain;
        this._controller = controller;

        UserManager.get.loggedIn(ws.upgradeReq, null).then(function (user)
        {
            (<ISocketClient>ws).clientConnection = that;
            that.ws = (<ISocketClient>ws);
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
        winston.info(`Received message from client: '${message}'`, { process: process.pid } );
        try {
            var event : def.SocketEvents.IEvent = JSON.parse(message);
            this._controller.alertMessage(new ClientEvent(event, this));
        }
        catch(err) {
            winston.error(`Could not parse socket message: '${err}'`, { process: process.pid } );
        }
    }

    /**
	* Called whenever a client disconnnects
	*/
    private onClose()
    {
        this.ws.removeAllListeners("message");
        this.ws.removeAllListeners("close");
        this.ws.removeAllListeners("error");
        this.ws.clientConnection = null;
        this.ws = null;
        this._controller = null;
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
* A controller that deals with any any IPC or web socket communications
*/
export class CommsController extends events.EventEmitter
{
    public static singleton: CommsController;
    private _server: ws.Server;

    /**
	* Creates an instance of the Communication server
    * @param {IConfig} cfg
	*/
    constructor(cfg: def.IConfig)
    {
        super();
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
            for (var i = 0, l = cfg.websocket.approvedSocketDomains.length; i < l; i++)
            {
                if ((headers.origin && headers.origin.match(new RegExp(cfg.websocket.approvedSocketDomains[i]))))
                {
                    new ClientConnection(ws, cfg.websocket.approvedSocketDomains[i], that);
                    clientApproved = true;
                }
            }

            if (!clientApproved)
            {
                winston.error(`A connection was made by ${headers.host || headers.origin} but it is not on the approved domain list`);
                ws.terminate();
                ws.close();
            }
        });

        // Setup the socket API
        new SocketAPI(this);
    }

    /**
	* Sends an event to all connected clients of this server listening for a specific event
    * @param {ClientEvent<def.SocketEvents.IEvent>} event The event to alert the server of
	*/
    alertMessage( event: ClientEvent<def.SocketEvents.IEvent> )
    {
        if (!event.clientEvent)
            return winston.error(`Websocket alert error: No ClientEvent set`, { process: process.pid } );

        this.emit( EventType[event.clientEvent.eventType], event );

        if (event.responseType != EventResponseType.NoResponse && !event.responseEvent)
            return winston.error(`Websocket alert error: The response type is expecting a responseEvent but one is not created`, { process: process.pid } );

        if ( event.responseType == EventResponseType.RespondClient )
            this.broadcastEventToClient(event.responseEvent, event.client);
        else if ( event.responseType == EventResponseType.ReBroadcast )
            this.broadcastEventToAll(event.responseEvent);

    }

    /**
	* Sends an event to the client specified
    * @param {IEvent} event The event to broadcast
	*/
    broadcastEventToClient(event: def.SocketEvents.IEvent, client : ClientConnection ): Promise<any>
    {
        var that = this;
        return new Promise(function (resolve, reject)
        {
            client.ws.send(JSON.stringify(event), undefined, function (error: Error)
            {
                if (error)
                {
                    winston.error(`Websocket broadcase error: '${error}'`, { process: process.pid } );
                    return reject();
                }

                return resolve();
            });
        });
    }

    /**
	* Sends an event to all connected clients of this server listening for a specific event
    * @param {IEvent} event The event to broadcast
	*/
    broadcastEventToAll(event: def.SocketEvents.IEvent): Promise<any>
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
                        winston.error(`Websocket broadcase error: '${error}'`, { process: process.pid } );
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
        return Promise.resolve<void>(null);
    }
}