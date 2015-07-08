﻿import express = require("express");
import bodyParser = require('body-parser');

// NEW ES6 METHOD
import * as http from "http";
import * as entities from "entities";
import * as def from "../Definitions";
import * as mongodb from "mongodb";
import {Session} from "../Session";
import {UserManager, User} from "../Users";
import {hasAdminRights} from "../PermissionController";
import {Controller} from "./Controller"
import {BucketManager} from "../BucketManager";

/**
* Main class to use for managing users
*/
export class UserController extends Controller
{
	private _transport: Transport;
	private _from: string;
	private _adminEmail: string;
	private _userManager: UserManager;
    private _config: def.IConfig;
    

	/**
	* Creates an instance of the user manager
	* @param {mongodb.Collection} userCollection The mongo collection that stores the users
	* @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
	* @param {def.IConfig} The config options of this manager
	*/
    constructor(e: express.Express, config: def.IConfig)
    {
        super();

		this._config = config;
		
		// Setup the rest calls
		var router = express.Router();
		router.use(bodyParser.urlencoded({ 'extended': true }));
		router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));

        router.get("/users/:username", <any>[hasAdminRights, this.getUser.bind(this)]);
        router.get("/users", <any>[hasAdminRights, this.getUsers.bind(this)]);
        router.get("/who-am-i", this.authenticated.bind(this));
		router.get("/authenticated", this.authenticated.bind(this));
        router.get("/sessions", <any>[hasAdminRights, this.getSessions.bind(this)]);
		router.get("/logout", this.logout.bind(this));
		router.get("/resend-activation/:user", this.resendActivation.bind(this));		
        router.get("/activate-account", this.activateAccount.bind(this));
        router.get("/request-password-reset/:user", this.requestPasswordReset.bind(this));
        router.get("/password-reset", this.passwordReset.bind(this));
        router.delete("/sessions/:id", <any>[hasAdminRights, this.deleteSession.bind(this)]);
        router.delete("/remove-user/:user", <any>[hasAdminRights, this.removeUser.bind(this)]);	
		router.post("/login", this.login.bind(this));
		router.post("/register", this.register.bind(this));
        router.post("/create-user", <any>[hasAdminRights, this.createUser.bind(this)]);

        router.put("/approve-activation/:user", <any>[hasAdminRights, this.approveActivation.bind(this)]);
		
		// Register the path
        e.use(config.restURL, router);
    }

    

	/**
	* Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
	*/
    initialize(db: mongodb.Db): Promise<void>
	{
        var that = this;
        
		return new Promise<void>(function (resolve, reject)
        {
            Promise.all([
                that.createCollection(that._config.userCollection, db),
                that.createCollection(that._config.sessionCollection, db)

            ]).then(function( collections )
            {
                // Create the user manager
                that._userManager = UserManager.create(collections[0], collections[1], that._config);
                that._userManager.initialize().then(function ()
                {
                    // Initialization is finished
                    resolve();

                })

            }).catch(function (error: Error)
            {
                reject(error);
            })
		});
	}

    /**
	* Gets a specific user by username or email - the "username" parameter must be set. The user data will be obscured unless the verbose parameter
    * is specified. Specify the verbose=true parameter in order to get all user data
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private getUser(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var user = req._user;
   
        if (!user)
            return res.end(JSON.stringify(<def.IResponse>{
                message: "No user found",
                error: true
            })); 

        var token: def.IGetUser = {
            error: false,
            message: `Found ${user.dbEntry.username}`,
            data: user.generateCleanedData(Boolean(req.query.verbose))
        };

        return res.end(JSON.stringify(token));

      
    }

    /**
	* Gets a list of users. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * Also specify the verbose=true parameter in order to get all user data. You can also search with the
    * search query
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private getUsers(req: express.Request, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var totalNumUsers: number = 0;
        
        that._userManager.numUsers(new RegExp(req.query.search)).then(function(numUsers)
        {
            totalNumUsers = numUsers;
            return that._userManager.getUsers(parseInt(req.query.index), parseInt(req.query.limit), new RegExp(req.query.search));
        })
        .then(function (users)
        {
            var sanitizedData = [];

            for (var i = 0, l = users.length; i < l; i++)
                sanitizedData.push(users[i].generateCleanedData(Boolean(req.query.verbose)));

            var token: def.IGetUsers = {
                error: false,
                message: `Found ${users.length} users`,
                data: sanitizedData,
                count: totalNumUsers
            };
            
            return res.end(JSON.stringify(token));

        }).catch(function (error: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: error.message,
                error: true
            }));
        });
    }

	/**
	* Gets a list of active sessions. You can limit the haul by specifying the 'index' and 'limit' query parameters.
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private getSessions(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		var that = this;

        that._userManager.sessionManager.getActiveSessions(parseInt(req.query.index), parseInt(req.query.limit)).then(function (sessions)
        {
            var token: def.IGetSessions = {
				error: false,
				message: `Found ${sessions.length} active sessions`,
				data: sessions
			};

			return res.end(JSON.stringify(token));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
	}
	
	/**
	* Resends the activation link to the user
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private deleteSession(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		var that = this;
		
        that._userManager.sessionManager.clearSession(req.params.id, req, res ).then(function (result)
		{
            var token: def.IResponse = {
				error: false,
				message: `Session ${req.params.id} has been removed`,
			};

			return res.end(JSON.stringify(token));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
	}

	/**
	* Activates the user's account
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private activateAccount(req: express.Request, res: express.Response, next: Function): any
	{
		var redirectURL = this._config.accountRedirectURL;

		// Check the user's activation and forward them onto the admin message page
		this._userManager.checkActivation(req.query.user, req.query.key).then(function (success: boolean)
		{
			res.writeHead(302, { 'Location': `${redirectURL}?message=${entities.encodeHTML("Your account has been activated!") }&status=success` });
			res.end();

		}).catch(function (error: Error)
		{
			res.writeHead(302, { 'Location': `${redirectURL}?message=${entities.encodeHTML(error.message) }&status=error` });
			res.end();
		});
	}

	/**
	* Resends the activation link to the user
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private resendActivation(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		
		this._userManager.resendActivation(req.params.user).then(function (success)
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: "An activation link has been sent, please check your email for further instructions",
				error: false
			}));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
    }

    /**
	* Resends the activation link to the user
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private requestPasswordReset(req: express.Request, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');

        this._userManager.requestPasswordReset(req.params.user).then(function (success)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: "Instructions have been sent to your email on how to change your password",
                error: false
            }));

        }).catch(function (error: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: error.message,
                error: true
            }));
        });
    }

    /**
	* resets the password if the user has a valid password token
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private passwordReset(req: express.Request, res: express.Response, next: Function): any
    {
        var redirectURL = this._config.passwordRedirectURL;

        // Check the user's activation and forward them onto the admin message page
        this._userManager.resetPassword(req.query.user, req.query.key, req.query.password).then(function (success: boolean)
        {
            res.writeHead(302, { 'Location': `${redirectURL}?message=${entities.encodeHTML("Your password has been reset!") }&status=success` });
            res.end();

        }).catch(function (error: Error)
        {
            res.writeHead(302, { 'Location': `${redirectURL}?message=${entities.encodeHTML(error.message) }&status=error` });
            res.end();
        });
    }

	/**
	* Approves a user's activation code so they can login without email validation
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private approveActivation(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		var that = this;

        that._userManager.approveActivation(req.params.user).then(function()
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: "Activation code has been approved",
				error: false
			}));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
	}
	
	/**
	* Attempts to log the user in. Expects the username, password and rememberMe parameters be set.
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private login(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');

        var token: def.ILoginToken = req.body;

		this._userManager.logIn(token.username, token.password, token.rememberMe, req, res).then(function (user)
		{
            return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: (user ? "User is authenticated" : "User is not authenticated"),
				authenticated: (user ? true : false),
				error: false
			}));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: error.message,
				authenticated: false,
				error: true
			}));
		});
	}

	/**
	* Attempts to log the user out
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private logout(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		
		this._userManager.logOut(req, res).then(function( result )
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: "Successfully logged out",
				error: false
			}));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
	}
	
	/**
	* Attempts to register a new user
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private register(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');

        var token: def.IRegisterToken = req.body;
        
		this._userManager.register(token.username, token.password, token.email, token.captcha, token.challenge, req, res).then(function (user)
		{
            return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: (user ? "Please activate your account with the link sent to your email address" : "User is not authenticated"),
				authenticated: (user ? true : false),
				error: false
			}));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: error.message,
				authenticated: false,
				error: true
			}));
		});
	}

	/**
	* Removes a user from the database
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private removeUser(req: def.AuthRequest, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		var that = this;

        var toRemove = req.params.user;
        if (!toRemove)
            return res.end(JSON.stringify(<def.IResponse>{ message: "No user found", error: true }));
        
        that._userManager.removeUser(toRemove).then(function ()
        {
            return BucketManager.get.removeBucket(toRemove);

        }).then(function ()
		{
			var token: def.IResponse = {
				error: false,
                message: `User ${toRemove} has been removed`
			};

			return res.end(JSON.stringify(token));

		}).catch(function (error: Error)
		{
			return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
    }

    

	/**
	* Allows an admin to create a new user without registration
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private createUser(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		var that = this;
        var createdUser: User;
        var token: def.IRegisterToken = req.body;

		// Not allowed to create super users
		if (token.privileges == def.UserPrivileges.SuperAdmin)
			return res.end(JSON.stringify(<def.IResponse>{
				message: "You cannot create a user with super admin permissions",
				error: true
			}));
			

		that._userManager.createUser(token.username, token.email, token.password, token.privileges).then(function(user)
        {
            createdUser = user;
            return BucketManager.get.createUserBucket(user.dbEntry.username);
            
        }).then(function()
        {
            var token: def.IGetUser = {
                error: false,
                message: `User ${createdUser.dbEntry.username} has been created`,
                data: createdUser.dbEntry
            };
            
            return res.end(JSON.stringify(token));

        })
        .catch(function (error: Error)
		{
			return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
    }

	/**
	* Checks to see if the current session is logged in. If the user is, it will be returned redacted. You can specify the 'verbose' query parameter.
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
    * @returns {IAuthenticationResponse}
	*/
	private authenticated(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');

		this._userManager.loggedIn(req, res).then(function (user)
		{
			return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: (user ? "User is authenticated" : "User is not authenticated"),
				authenticated: (user ? true : false),
                error: false,
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {})
			}));

		}).catch(function (error: Error)
		{
			return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: error.message,
				authenticated: false,
				error: true
			}));
		});
	}
}