"use strict";
var ws = require("ws");
var events = require("events");
var https = require("https");
var fs = require("fs");
var winston = require("winston");
var users_1 = require("../users");
var socket_event_types_1 = require("../socket-event-types");
var socket_api_1 = require("../socket-api");
/**
 * An event class that is emitted to all listeners of the communications controller.
 * This wraps data around events sent via the web socket to the users server. Optionally
 * these events can respond to the client who initiated the event as well as to all listeners.
 */
class ClientEvent {
    constructor(event, client) {
        this.client = client;
        this.error = null;
        this.clientEvent = event;
        this.responseType = socket_event_types_1.EventResponseType.NoResponse;
    }
}
exports.ClientEvent = ClientEvent;
/**
 * A wrapper class for client connections made to the CommsController
 */
class ClientConnection {
    constructor(ws, domain, controller) {
        var that = this;
        this.domain = domain;
        this._controller = controller;
        users_1.UserManager.get.loggedIn(ws.upgradeReq, null).then(function (user) {
            ws.clientConnection = that;
            that.ws = ws;
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
    onMessage(message) {
        winston.info(`Received message from client: '${message}'`, { process: process.pid });
        try {
            var event = JSON.parse(message);
            this._controller.alertMessage(new ClientEvent(event, this));
        }
        catch (err) {
            winston.error(`Could not parse socket message: '${err}'`, { process: process.pid });
        }
    }
    /**
    * Called whenever a client disconnnects
    */
    onClose() {
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
    onError(err) {
        winston.error(`An error has occurred for web socket : '${err.message}'`, { process: process.pid });
    }
}
/**
* A controller that deals with any any IPC or web socket communications
*/
class CommsController extends events.EventEmitter {
    /**
    * Creates an instance of the Communication server
    * @param {IConfig} cfg
    */
    constructor(cfg) {
        super();
        var that = this;
        CommsController.singleton = this;
        // dummy request processing - this is not actually called as its handed off to the socket api
        var processRequest = function (req, res) {
            res.writeHead(200);
            res.end("All glory to WebSockets!\n");
        };
        // Create the web socket server
        if (cfg.ssl) {
            var httpsServer = null;
            var caChain = [fs.readFileSync(cfg.sslIntermediate), fs.readFileSync(cfg.sslRoot)];
            var privkey = cfg.sslKey ? fs.readFileSync(cfg.sslKey) : null;
            var theCert = cfg.sslCert ? fs.readFileSync(cfg.sslCert) : null;
            winston.info(`Attempting to start Websocket server with SSL...`, { process: process.pid });
            httpsServer = https.createServer({ key: privkey, cert: theCert, passphrase: cfg.sslPassPhrase, ca: caChain }, processRequest);
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
        this._server.on('connection', function connection(ws) {
            var headers = ws.upgradeReq.headers;
            var clientApproved = false;
            for (var i = 0, l = cfg.websocket.approvedSocketDomains.length; i < l; i++) {
                if ((headers.origin && headers.origin.match(new RegExp(cfg.websocket.approvedSocketDomains[i])))) {
                    new ClientConnection(ws, cfg.websocket.approvedSocketDomains[i], that);
                    clientApproved = true;
                }
            }
            if (!clientApproved) {
                winston.error(`A connection was made by ${headers.host || headers.origin} but it is not on the approved domain list`);
                ws.terminate();
                ws.close();
            }
        });
        // Setup the socket API
        new socket_api_1.SocketAPI(this);
    }
    /**
    * Sends an event to all connected clients of this server listening for a specific event
    * @param {ClientEvent<def.SocketEvents.IEvent>} event The event to alert the server of
    */
    alertMessage(event) {
        if (!event.clientEvent)
            return winston.error(`Websocket alert error: No ClientEvent set`, { process: process.pid });
        this.emit(socket_event_types_1.EventType[event.clientEvent.eventType], event);
        if (event.responseType != socket_event_types_1.EventResponseType.NoResponse && !event.responseEvent)
            return winston.error(`Websocket alert error: The response type is expecting a responseEvent but one is not created`, { process: process.pid });
        if (event.responseType == socket_event_types_1.EventResponseType.RespondClient)
            this.broadcastEventToClient(event.responseEvent, event.client);
        else if (event.responseType == socket_event_types_1.EventResponseType.ReBroadcast)
            this.broadcastEventToAll(event.responseEvent);
    }
    /**
    * Sends an event to the client specified
    * @param {IEvent} event The event to broadcast
    */
    broadcastEventToClient(event, client) {
        var that = this;
        return new Promise(function (resolve, reject) {
            client.ws.send(JSON.stringify(event), undefined, function (error) {
                if (error) {
                    winston.error(`Websocket broadcase error: '${error}'`, { process: process.pid });
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
    broadcastEventToAll(event) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var numResponded = 0, errorOccurred = false, releventClients = [];
            // First find all listening clients that need to be notified when this event happens
            for (var i = 0, l = that._server.clients.length; i < l; i++) {
                var client = that._server.clients[i];
                releventClients.push(client);
            }
            // Now go through each client and let them know about the event
            var clientLength = releventClients.length;
            for (var i = 0; i < clientLength; i++) {
                var client = releventClients[i];
                client.send(JSON.stringify(event), undefined, function (error) {
                    if (errorOccurred)
                        return;
                    if (error) {
                        winston.error(`Websocket broadcase error: '${error}'`, { process: process.pid });
                        errorOccurred = true;
                        return reject();
                    }
                    numResponded++;
                    if (numResponded >= clientLength)
                        return resolve();
                });
            }
            ;
            // No active listeners
            if (clientLength == 0)
                return resolve();
        });
    }
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    initialize(db) {
        return Promise.resolve(null);
    }
}
exports.CommsController = CommsController;
