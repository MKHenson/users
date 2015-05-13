import * as http from "http";
import * as mongodb from "mongodb";
import { ISessionEntry } from "./Definitions";
export interface ISessionOptions {
    path?: string;
    /**
    * If present, the cookie (and hence the session) will apply to the given domain, including any subdomains.
    * For example, on a request from foo.example.org, if the domain is set to '.example.org', then this session will persist across any subdomain of example.org.
    * By default, the domain is not set, and the session will only be visible to other requests that exactly match the domain.
    */
    domain?: string;
    /**
    * A persistent connection is one that will last after the user closes the window and visits the site again (true).
    * A non-persistent that will forget the user once the window is closed (false)
    */
    persistent?: boolean;
    /**
    * If true, the cookie will be encrypted
    */
    secure?: boolean;
    /**
    * If you wish to create a persistent session (one that will last after the user closes the window and visits the site again) you must specify a lifetime as a number of seconds.
    * Common values are 86400 for one day, and 604800 for one week.
    * The lifetime controls both when the browser's cookie will expire, and when the session object will be freed by the sessions module.
    * By default, the browser cookie will expire when the window is closed, and the session object will be freed 24 hours after the last request is seen.
    */
    lifetime?: number;
}
/**
* A class that manages session data for active users
*/
export declare class SessionManager {
    private _dbCollection;
    private _timeout;
    private _cleanupProxy;
    private _options;
    /**
    * Creates an instance of a session manager
    * @param { mongodb.Collection} sessionCollection The mongoDB collection to use for saving sessions
    */
    constructor(dbCollection: mongodb.Collection, options?: ISessionOptions);
    /**
    * Gets an array of all active sessions
    * @param {number} startIndex
    * @param {number} limit
    */
    getActiveSessions(startIndex?: number, limit?: number): Promise<Array<ISessionEntry>>;
    /**
    * Clears the users session cookie so that its no longer tracked
    * @param {string} sessionId The session ID to remove, if null then the currently authenticated session will be used
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>}
    */
    clearSession(sessionId: string, request: http.ServerRequest, response: http.ServerResponse): Promise<boolean>;
    /**
    * Attempts to get a session from the request object of the client
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<Session>} Returns a session or null if none can be found
    */
    getSession(request: http.ServerRequest, response: http.ServerResponse): Promise<Session>;
    /**
    * Attempts to create a session from the request object of the client
    * @param {http.ServerRequest} request
    * @returns {Promise<Session>}
    */
    createSession(request: http.ServerRequest, response?: http.ServerResponse): Promise<Session>;
    /**
    * Each time a session is created, a timer is started to check all sessions in the DB.
    * Once the lifetime of a session is up its then removed from the DB and we check for any remaining sessions.
    * @param {boolean} force If true, this will force a cleanup instead of waiting on the next timer
    */
    cleanup(force?: boolean): void;
    /**
    * Looks at the headers from the HTTP request to determine if a session cookie has been asssigned and returns the ID.
    * @param {http.ServerRequest} req
    * @returns {string} The ID of the user session, or an empty string
    */
    private getIDFromRequest(req);
    /**
    * Creates a random session ID.
    * The ID is a pseude-random ASCII string which contains at least the specified number of bits of entropy (64 in this case)
    * the return value is a string of length [bits/6] of characters from the base64 alphabet
    * @returns {string} A user session ID
    */
    private createID();
}
/**
* A class to represent session data
*/
export declare class Session {
    _id: mongodb.ObjectID;
    sessionId: string;
    data: any;
    /**
    * The specific time when this session will expire
    */
    expiration: number;
    /**
    * The options of this session system
    */
    options: ISessionOptions;
    /**
    * Creates an instance of the session
    * @param {string} sessionId The ID of the session
    * @param {SessionOptions} options The options associated with this session
    * @param {ISessionEntry} data The data of the session in the database
    */
    constructor(sessionId: string, options: ISessionOptions, data?: ISessionEntry);
    /**
    * Fills in the data of this session from the data saved in the database
    * @param {ISessionEntry} data The data fetched from the database
    */
    open(data: ISessionEntry): void;
    /**
    * Creates an object that represents this session to be saved in the database
    * @returns {ISessionEntry}
    */
    save(): ISessionEntry;
    /**
    * This method returns the value to send in the Set-Cookie header which you should send with every request that goes back to the browser, e.g.
    * response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
    */
    getSetCookieHeaderValue(): any;
    /**
    * Converts from milliseconds to string, since the epoch to Cookie 'expires' format which is Wdy, DD-Mon-YYYY HH:MM:SS GMT
    */
    private dateCookieString(ms);
    /**
    * Pads a string with 0's
    */
    private pad(n);
}
