"use strict";
/**
* Describes the event being sent to connected clients
*/
(function (EventType) {
    /**
     * Event sent to clients whenever a user logs in.
     * Event type: IUserEvent
     */
    EventType[EventType["Login"] = 1] = "Login";
    /**
     * Event sent to clients whenever a user logs out.
     * Event type: IUserEvent
     */
    EventType[EventType["Logout"] = 2] = "Logout";
    /**
     * Event sent to clients whenever a user's account is activated.
     * Event type: IUserEvent
     */
    EventType[EventType["Activated"] = 3] = "Activated";
    /**
     * Event sent to clients whenever a user's account is removed.
     * Event type: IUserEvent
     */
    EventType[EventType["Removed"] = 4] = "Removed";
    /**
     * Event sent to clients whenever a user uploads a new file.
     * Event type: IFilesAddedEvent
     */
    EventType[EventType["FilesUploaded"] = 5] = "FilesUploaded";
    /**
     * Event sent to clients whenever a user file is removed.
     * Event type: IFilesRemovedEvent
     */
    EventType[EventType["FilesRemoved"] = 6] = "FilesRemoved";
    /**
     * Event sent to clients whenever a user creates a new bucket
     * Event type: IBucketAddedEvent
     */
    EventType[EventType["BucketUploaded"] = 7] = "BucketUploaded";
    /**
     * Event sent to clients whenever a user removes a bucket
     * Event type: IBucketRemovedEvent
     */
    EventType[EventType["BucketRemoved"] = 8] = "BucketRemoved";
    /**
     * Event both sent to the server as well as optionally to clients. Gets or sets user meta data.
     * Event type: IMetaEvent
     */
    EventType[EventType["MetaRequest"] = 9] = "MetaRequest";
    /**
     * Event both sent to the server as well as to clients. The echo simply echoes a message.
     * Event type: IEchoEvent
     */
    EventType[EventType["Echo"] = 10] = "Echo";
})(exports.EventType || (exports.EventType = {}));
var EventType = exports.EventType;
/** Describes how users should respond to a socket events
 */
(function (EventResponseType) {
    /** The default the response is EventResponseType.NoResponse. */
    EventResponseType[EventResponseType["NoResponse"] = 0] = "NoResponse";
    /** A response event is sent back to the initiating client. */
    EventResponseType[EventResponseType["RespondClient"] = 1] = "RespondClient";
    /** A response event is sent to all connected clients. */
    EventResponseType[EventResponseType["ReBroadcast"] = 2] = "ReBroadcast";
})(exports.EventResponseType || (exports.EventResponseType = {}));
var EventResponseType = exports.EventResponseType;
