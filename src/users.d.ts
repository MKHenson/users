import * as mongodb from "mongodb";
import * as http from "http";
import * as express from "express";
import * as def from "webinate-users";
import { SessionManager } from "./session";
export declare enum UserPrivileges {
    SuperAdmin = 1,
    Admin = 2,
    Regular = 3,
}
export declare class User {
    dbEntry: def.IUserEntry;
    /**
    * Creates a new User instance
    * @param {IUserEntry} dbEntry The data object that represents the user in the DB
    */
    constructor(dbEntry: def.IUserEntry);
    /**
    * Generates an object that can be sent to clients.
    * @param {boolean} showPrivate If true, sensitive database data will be sent (things like passwords will still be safe - but hashed)
    * @returns {IUserEntry}
    */
    generateCleanedData(showPrivate?: boolean): def.IUserEntry;
    /**
    * Generates the object to be stored in the database
    * @returns {IUserEntry}
    */
    generateDbEntry(): def.IUserEntry;
    /**
    * Creates a random string that is assigned to the dbEntry registration key
    * @param {number} length The length of the password
    * @returns {string}
    */
    generateKey(length?: number): string;
}
/**
* Main class to use for managing users
*/
export declare class UserManager {
    private static _singleton;
    sessionManager: SessionManager;
    private _userCollection;
    private _config;
    private _transport;
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {IConfig} The config options of this manager
    */
    constructor(userCollection: mongodb.Collection, sessionCollection: mongodb.Collection, config: def.IConfig);
    /**
    * Called whenever a session is removed from the database
    * @returns {Promise<void>}
    */
    onSessionRemoved(sessionId: string): void;
    /**
    * Initializes the API
    * @returns {Promise<void>}
    */
    initialize(): Promise<void>;
    /**
    * Attempts to register a new user
    * @param {string} username The username of the user
    * @param {string} pass The users secret password
    * @param {string} email The users email address
    * @param {string} captcha The captcha value the user guessed
    * @param {string} captchaChallenge The captcha challenge
    * @param {any} meta Any optional data associated with this user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<User>}
    */
    register(username?: string, pass?: string, email?: string, captcha?: string, captchaChallenge?: string, meta?: any, request?: express.Request, response?: express.Response): Promise<User>;
    /**
    * Creates the link to send to the user for activation
    * @param {string} user The user we are activating
    * @param {string} origin The origin of where the activation link came from
    * @returns {string}
    */
    private createActivationLink(user, origin);
    /**
    * Creates the link to send to the user for password reset
    * @param {string} username The username of the user
     * @param {string} origin The origin of where the activation link came from
    * @returns {string}
    */
    private createResetLink(user, origin);
    /**
    * Approves a user's activation code so they can login without email validation
    * @param {string} username The username or email of the user
    * @returns {Promise<void>}
    */
    approveActivation(username: string): Promise<void>;
    /**
    * Attempts to send the an email to the admin user
    * @param {string} message The message body
    * @param {string} name The name of the sender
    * @param {string} from The email of the sender
    * @returns {Promise<boolean>}
    */
    sendAdminEmail(message: string, name?: string, from?: string): Promise<any>;
    /**
    * Attempts to resend the activation link
    * @param {string} username The username of the user
    * @param {string} origin The origin of where the request came from (this is emailed to the user)
    * @returns {Promise<boolean>}
    */
    resendActivation(username: string, origin: string): Promise<boolean>;
    /**
    * Sends the user an email with instructions on how to reset their password
    * @param {string} username The username of the user
    * @param {string} origin The site where the request came from
    * @returns {Promise<boolean>}
    */
    requestPasswordReset(username: string, origin: string): Promise<boolean>;
    /**
    * Creates a hashed password
    * @param {string} pass The password to hash
    * @returns {Promise<boolean>}
    */
    private hashPassword(pass);
    /**
    * Compares a password to the stored hash in the database
    * @param {string} pass The password to test
    * @param {string} hash The hash stored in the DB
    * @returns {Promise<boolean>}
    */
    private comparePassword(pass, hash);
    /**
    * Attempts to reset a user's password.
    * @param {string} username The username of the user
    * @param {string} code The password code
    * @param {string} newPassword The new password
    * @returns {Promise<boolean>}
    */
    resetPassword(username: string, code: string, newPassword: string): Promise<boolean>;
    /**
    * Checks the users activation code to see if its valid
    * @param {string} username The username of the user
    * @returns {Promise<boolean>}
    */
    checkActivation(username: string, code: string): Promise<boolean>;
    /**
    * Creates the script tag for the Google captcha API
    * @param {string}
    */
    getCaptchaHTML(): string;
    /**
    * Checks to see if a user is logged in
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @param {Promise<User>} Gets the user or null if the user is not logged in
    */
    loggedIn(request: http.ServerRequest, response: http.ServerResponse): Promise<User>;
    /**
    * Attempts to log the user out
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>}
    */
    logOut(request: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>;
    /**
    * Creates a new user
    * @param {string} user The unique username
    * @param {string} email The unique email
    * @param {string} password The password for the user
    * @param {string} origin The origin of where the request came from (this is emailed to the user)
    * @param {UserPrivileges} privilege The type of privileges the user has. Defaults to regular
    * @param {any} meta Any optional data associated with this user
    * @param {boolean} allowAdmin Should this be allowed to create a super user
    * @returns {Promise<User>}
    */
    createUser(user: string, email: string, password: string, origin: string, privilege?: UserPrivileges, meta?: any, allowAdmin?: boolean): Promise<User>;
    /**
    * Deletes a user from the database
    * @param {string} user The unique username or email of the user to remove
    * @returns {Promise<void>}
    */
    removeUser(user: string): Promise<void>;
    /**
    * Gets a user by a username or email
    * @param {string} user The username or email of the user to get
    * @param {string} email [Optional] Do a check if the email exists as well
    * @returns {Promise<User>} Resolves with either a valid user or null if none exists
    */
    getUser(user: string, email?: string): Promise<User>;
    /**
    * Attempts to log a user in
    * @param {string} username The username or email of the user
    * @param {string} pass The password of the user
    * @param {boolean} rememberMe True if the cookie persistence is required
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<User>}
    */
    logIn(username?: string, pass?: string, rememberMe?: boolean, request?: http.ServerRequest, response?: http.ServerResponse): Promise<User>;
    /**
    * Removes a user by his email or username
    * @param {string} username The username or email of the user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>} True if the user was in the DB or false if they were not
    */
    remove(username?: string, request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>;
    /**
    * Sets the meta data associated with the user
    * @param {IUserEntry} user The user
    * @param {any} data The meta data object to set
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>} True if the user was in the DB or false if they were not
    */
    setMeta(user: def.IUserEntry, data?: any, request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>;
    /**
    * Sets a meta value on the user. This updates the user's meta value by name
    * @param {IUserEntry} user The user
    * @param {any} name The name of the meta to set
    * @param {any} data The value of the meta to set
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>} True if the user was in the DB or false if they were not
    */
    setMetaVal(user: def.IUserEntry, name: string, val: any, request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>;
    /**
    * Gets the value of user's meta by name
    * @param {IUserEntry} user The user
    * @param {any} name The name of the meta to get
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<any>} The value to get
    */
    getMetaVal(user: def.IUserEntry, name: string, request?: http.ServerRequest, response?: http.ServerResponse): Promise<any>;
    /**
    * Gets the meta data of a user
    * @param {IUserEntry} user The user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<any>} The value to get
    */
    getMetaData(user: def.IUserEntry, request?: http.ServerRequest, response?: http.ServerResponse): Promise<any>;
    /**
    * Gets the total number of users
    * @param {RegExp} searchPhrases Search phrases
    * @returns {Promise<number>}
    */
    numUsers(searchPhrases?: RegExp): Promise<number>;
    /**
    * Prints user objects from the database
    * @param {number} limit The number of users to fetch
    * @param {number} startIndex The starting index from where we are fetching users from
    * @param {RegExp} searchPhrases Search phrases
    * @returns {Promise<Array<User>>}
    */
    getUsers(startIndex?: number, limit?: number, searchPhrases?: RegExp): Promise<Array<User>>;
    /**
    * Creates the user manager singlton
    */
    static create(users: mongodb.Collection, sessions: mongodb.Collection, config: def.IConfig): UserManager;
    /**
    * Gets the user manager singlton
    */
    static get: UserManager;
}
