import express = require("express");
import * as def from "webinate-users";
import * as mongodb from "mongodb";
import { Controller } from "./controller";
/**
* Main class to use for managing users
*/
export declare class UserController extends Controller {
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
    initialize(db: mongodb.Db): Promise<void>;
    /**
    * Gets a specific user by username or email - the "username" parameter must be set. The user data will be obscured unless the verbose parameter
    * is specified. Specify the verbose=true parameter in order to get all user data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getUser(req, res, next);
    /**
    * Gets a list of users. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * Also specify the verbose=true parameter in order to get all user data. You can also search with the
    * search query
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
    * Activates the user's account
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
    * Attempts to log the user in. Expects the username, password and rememberMe parameters be set.
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
    * Attempts to send the webmaster an email message
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    messageWebmaster(req: express.Request, res: express.Response, next: Function): any;
    /**
    * Attempts to register a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private register(req, res, next);
    /**
    * Sets a user's meta data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private setData(req, res, next);
    /**
    * Sets a user's meta value
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private setVal(req, res, next);
    /**
    * Gets a user's meta value
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getVal(req, res, next);
    /**
    * Gets a user's meta data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getData(req, res, next);
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
    * Checks to see if the current session is logged in. If the user is, it will be returned redacted. You can specify the 'verbose' query parameter.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    * @returns {IAuthenticationResponse}
    */
    private authenticated(req, res, next);
}
