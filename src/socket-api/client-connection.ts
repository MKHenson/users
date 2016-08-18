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
import {CommsController} from "./comms-controller";
import {ClientEvent} from "./client-event";
import {EventResponseType, EventType} from "./socket-event-types";
import {SocketAPI} from "./socket-api";

/**
 * A wrapper class for client connections made to the CommsController
 */
export class ClientConnection
{
    public ws: ws;
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
        winston.info(`Websocket disconnected: ${this.domain}`, {process : process.pid})

        this.ws.removeAllListeners("message");
        this.ws.removeAllListeners("close");
        this.ws.removeAllListeners("error");
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