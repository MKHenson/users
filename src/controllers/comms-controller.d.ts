import * as mongodb from "mongodb";
import * as def from "webinate-users";
/**
* Describes the event being sent to connected clients
*/
export declare enum EventType {
    Login = 0,
    Logout = 1,
    Activated = 2,
    Removed = 3,
    FilesUploaded = 4,
    FilesRemoved = 5,
    BucketUploaded = 6,
    BucketRemoved = 7,
}
/**
* A controller that deals with any any IPC or web socket communications
*/
export declare class CommsController {
    static singleton: CommsController;
    private _server;
    /**
    * Creates an instance of the Communication server
    * @param {IConfig} cfg
    */
    constructor(cfg: def.IConfig);
    /**
    * Sends an event to all connected clients of this server listening for a specific event
    * @param {IEvent} event The event to broadcast
    */
    broadcastEvent(event: def.SocketEvents.IEvent): Promise<any>;
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    initialize(db: mongodb.Db): Promise<void>;
}
