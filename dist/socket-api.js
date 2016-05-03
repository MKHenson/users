"use strict";
var users_1 = require("./users");
var socket_event_types_1 = require("./socket-event-types");
/**
* Handles express errors
*/
class SocketAPI {
    constructor(comms) {
        this._comms = comms;
        // Setup all socket API listeners
        comms.on(socket_event_types_1.EventType[socket_event_types_1.EventType.Echo], this.onEcho.bind(this));
        comms.on(socket_event_types_1.EventType[socket_event_types_1.EventType.MetaRequest], this.onMeta.bind(this));
    }
    /**
     * Responds to a meta request from a client
     * @param {SocketEvents.IMetaEvent} e
     */
    onMeta(e) {
        var comms = this._comms;
        if (!users_1.UserManager.get)
            return;
        users_1.UserManager.get.getUser(e.clientEvent.username).then(function (user) {
            if (!user)
                return Promise.reject("Could not find user " + e.clientEvent.username);
            if (e.clientEvent.property && e.clientEvent.val !== undefined)
                return users_1.UserManager.get.setMetaVal(user.dbEntry, e.clientEvent.property, e.clientEvent.val);
            else if (e.clientEvent.property)
                return users_1.UserManager.get.getMetaVal(user.dbEntry, e.clientEvent.property);
            else if (e.clientEvent.val)
                return users_1.UserManager.get.setMeta(user.dbEntry, e.clientEvent.val);
            else
                return users_1.UserManager.get.getMetaData(user.dbEntry);
        }).then(function (metaVal) {
            comms.broadcastEventToClient({
                error: undefined,
                eventType: e.clientEvent.eventType,
                val: metaVal
            }, e.client);
        }).catch(function (err) {
            comms.broadcastEventToClient({ error: err.toString(), eventType: e.clientEvent.eventType }, e.client);
        });
    }
    /**
     * Responds to a echo request from a client
     */
    onEcho(e) {
        e.responseEvent = {
            eventType: socket_event_types_1.EventType.Echo,
            message: e.clientEvent.message
        };
        if (e.clientEvent.broadcast)
            e.responseType = socket_event_types_1.EventResponseType.ReBroadcast;
        else
            e.responseType = socket_event_types_1.EventResponseType.RespondClient;
    }
}
exports.SocketAPI = SocketAPI;
