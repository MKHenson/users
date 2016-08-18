"use strict";

import {UserManager, User, UserPrivileges} from "../users";
import {ClientEvent} from "./client-event";
import {CommsController} from "./comms-controller";
import {EventType, EventResponseType} from "./socket-event-types";
import * as def from "webinate-users";

/**
* Handles express errors
*/
export class SocketAPI
{
    private _comms : CommsController;

    constructor( comms: CommsController )
    {
        this._comms = comms;

        // Setup all socket API listeners
        comms.on( EventType[EventType.Echo], this.onEcho.bind(this) );
        comms.on( EventType[EventType.MetaRequest], this.onMeta.bind(this) );
    }

    /**
     * Responds to a meta request from a client
     * @param {SocketEvents.IMetaEvent} e
     */
    private onMeta( e: ClientEvent<def.SocketEvents.IMetaEvent> )
    {
        var comms = this._comms;

        if (!UserManager.get)
            return;

        UserManager.get.getUser(e.clientEvent.username).then(function(user) {

            if ( !user )
                return Promise.reject("Could not find user " + e.clientEvent.username );
            if ( e.clientEvent.property && e.clientEvent.val !== undefined )
                return UserManager.get.setMetaVal(user.dbEntry, e.clientEvent.property, e.clientEvent.val );
            else if ( e.clientEvent.property )
                return UserManager.get.getMetaVal(user.dbEntry, e.clientEvent.property );
            else if ( e.clientEvent.val )
                return UserManager.get.setMeta(user.dbEntry, e.clientEvent.val );
            else
               return UserManager.get.getMetaData( user.dbEntry );

        }).then(function( metaVal ) {

            comms.broadcastEventToClient( <def.SocketEvents.IMetaEvent>{
                error : undefined,
                eventType : e.clientEvent.eventType,
                val: metaVal
            }, e.client );

        }).catch(function( err: Error ) {
            comms.broadcastEventToClient( { error : err.toString(), eventType : e.clientEvent.eventType }, e.client );
        });
    }

    /**
     * Responds to a echo request from a client
     */
    private onEcho( e: ClientEvent<def.SocketEvents.IEchoEvent> )
    {
        e.responseEvent = <def.SocketEvents.IEchoEvent> {
            eventType: EventType.Echo,
            message : e.clientEvent.message
        };

        if ( e.clientEvent.broadcast )
            e.responseType = EventResponseType.ReBroadcast;
        else
            e.responseType = EventResponseType.RespondClient;
    }
}