"use strict";

import * as def from "webinate-users";
import {ClientConnection} from "./client-connection";
import {EventResponseType, EventType} from "./socket-event-types";

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