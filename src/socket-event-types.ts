"use strict";

/**
* Describes the event being sent to connected clients
*/
export enum EventType
{
    /**
     * Event sent to clients whenever a user logs in.
     * Event type: IUserEvent
     */
    Login = 1,

    /**
     * Event sent to clients whenever a user logs out.
     * Event type: IUserEvent
     */
    Logout = 2,

    /**
     * Event sent to clients whenever a user's account is activated.
     * Event type: IUserEvent
     */
    Activated = 3,

    /**
     * Event sent to clients whenever a user's account is removed.
     * Event type: IUserEvent
     */
    Removed = 4,

    /**
     * Event sent to clients whenever a user uploads a new file.
     * Event type: IFileAddedEvent
     */
    FileUploaded = 5,

    /**
     * Event sent to clients whenever a user file is removed.
     * Event type: IFileRemovedEvent
     */
    FileRemoved = 6,

    /**
     * Event sent to clients whenever a user creates a new bucket
     * Event type: IBucketAddedEvent
     */
    BucketUploaded = 7,

    /**
     * Event sent to clients whenever a user removes a bucket
     * Event type: IBucketRemovedEvent
     */
    BucketRemoved = 8,

    /**
     * Event both sent to the server as well as optionally to clients. Gets or sets user meta data.
     * Event type: IMetaEvent
     */
    MetaRequest = 9,

    /**
     * Event both sent to the server as well as to clients. The echo simply echoes a message.
     * Event type: IEchoEvent
     */
    Echo = 10
}

/** Describes how users should respond to a socket events
 */
export enum EventResponseType
{
    /** The default the response is EventResponseType.NoResponse. */
    NoResponse,

    /** A response event is sent back to the initiating client. */
    RespondClient,

    /** A response event is sent to all connected clients. */
    ReBroadcast
}