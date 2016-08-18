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
import {EventResponseType, EventType} from "./socket-event-types";
import {SocketAPI} from "./socket-api";
import {ClientConnection} from "./client-connection";
import {ClientEvent} from "./client-event";

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
            winston.info("Creating secure socket connection", { process: process.pid });
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
        {
             winston.info("Creating regular socket connection", { process: process.pid });
             this._server = new ws.Server({ port: cfg.websocket.port });
        }


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

            if (cfg.debugMode)
                winston.info(`Websocket connection origin: ${headers.origin}`, {process : process.pid})

            var clientApproved = false;
            for (var i = 0, l = cfg.websocket.approvedSocketDomains.length; i < l; i++)
            {
                if ((headers.origin && headers.origin.match(new RegExp(cfg.websocket.approvedSocketDomains[i]))))
                {
                    new ClientConnection(ws, headers.origin, that);
                    clientApproved = true;
                }
            }

            if (!clientApproved)
            {
                winston.error(`A connection was made by ${headers.origin} but it is not on the approved domain list. Make sure the host is on the approvedSocketDomains parameter in the config file.`);
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
            return winston.error(`Websocket alert error: The response type is expecting a responseEvent but none exist`, { process: process.pid } );

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
                releventClients: Array<ws>  = [];

            // First find all listening clients that need to be notified when this event happens
            for (var i = 0, l = that._server.clients.length; i < l; i++)
            {
                var client = that._server.clients[i];
                releventClients.push(client);
            }

            // Now go through each client and let them know about the event
            var clientLength = releventClients.length;
            for (var i = 0; i < clientLength; i++)
            {
                var client = releventClients[i];
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