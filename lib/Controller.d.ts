import express = require("express");
import * as def from "./Definitions";
/**
* Main class to use for managing users
*/
declare class Controller {
    private _transport;
    private _from;
    private _adminEmail;
    private _userManager;
    private _config;
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    constructor(e: express.Express, config: def.IConfig);
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    initialize(): Promise<void>;
    /**
    * Checks a user is logged in and has permission
    * @param {def.UserPrivileges} level
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {string} existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
    * @param {Function} next
    */
    private requestHasPermission(level, req, res, existingUser?);
    /**
    * Gets a specific user by username or email. Specify the verbose=true parameter in order to get all user data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getUser(req, res, next);
    /**
    * Gets a list of users. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * Also specify the verbose=true parameter in order to get all user data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getUsers(req, res, next);
    /**
    * Gets a list of active sessions. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getSessions(req, res, next);
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private deleteSession(req, res, next);
    /**
    * Forces the activation of the user's account
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private activateAccount(req, res, next);
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private resendActivation(req, res, next);
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private requestPasswordReset(req, res, next);
    /**
    * resets the password if the user has a valid password token
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private passwordReset(req, res, next);
    /**
    * Approves a user's activation code so they can login without email validation
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private approveActivation(req, res, next);
    /**
    * Attempts to log the user in
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private login(req, res, next);
    /**
    * Attempts to log the user out
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private logout(req, res, next);
    /**
    * Attempts to register a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private register(req, res, next);
    /**
    * Removes a user from the database
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private removeUser(req, res, next);
    /**
    * Allows an admin to create a new user without registration
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private createUser(req, res, next);
    /**
    * Checks to see if the current session is logged in
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private authenticated(req, res, next);
    /**
    * Creates a new mongodb collection
    * @param {string} name The name of the collection to create
    * @param {mongodb.Db} db The database to use
    * @param {Promise<mongodb.Collection>}
    */
    private createCollection(name, db);
    /**
    * Connects this controller to a mongo database
    * @param {mongodb.ServerOptions} opts Any additional options
    * @returns {Promise<mongodb.Db>}
    */
    private openDB(opts?);
}
export default Controller;
