﻿import express = require("express");
import bodyParser = require('body-parser');

// NEW ES6 METHOD
import * as entities from "entities";
import * as def from "./Definitions";
import * as mongodb from "mongodb";
import {Session, ISessionEntry} from "./Session";
import {UserManager} from "./Users";

/**
* Main class to use for managing users
*/
class Controller
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
		this._config = config;
		
		// Setup the rest calls
		var router = express.Router();
		router.use(bodyParser.urlencoded({ 'extended': true }));
		router.use(bodyParser.json());
		router.use(bodyParser.json({ type: 'application/vnd.api+json' }));
		
		
		router.get("/authenticated", this.authenticated.bind(this));
		router.get("/sessions", this.getSessions.bind(this));
		router.get("/logout", this.logout.bind(this));
		router.get("/resend-activation/:user", this.resendActivation.bind(this));		
		router.get("/activate-account", this.activateAccount.bind(this));

		router.delete("/sessions/:id", this.deleteSession.bind(this));
		router.delete("/remove-user/:user", this.removeUser.bind(this));
				
		router.post("/login", this.login.bind(this));
		router.post("/register", this.register.bind(this));
        router.post("/create-user", this.createUser.bind(this));

        router.put("/approve-activation/:user", this.approveActivation.bind(this));
		
		
		// Register the path
		e.use(config.restURL, router);
	}

	/**
	* Called to initialize this controller and its related database objects
	* @returns {Promise<Controller>}
	*/
	initialize(): Promise<void>
	{
		var that = this;
		var database: mongodb.Db;
		var userCollection: mongodb.Collection;
		var sessionCollection: mongodb.Collection;

		return new Promise<void>(function (resolve, reject)
		{
			// Open the DB
			that.openDB().then(function (db)
			{
				database = db;
				
				// Get the users collection
				return that.createCollection(that._config.userCollection, database)
								
			}).then(function (collection)
			{
				userCollection = collection;

				// Get the session collection
				return that.createCollection(that._config.sessionCollection, database)
								
			}).then(function (collection)
			{
				sessionCollection = collection;

				// Create the user manager
				that._userManager = new UserManager(userCollection, sessionCollection, that._config);
				return that._userManager.initialize();

			}).then(function (collection)
			{
				// Initialization is finished
				resolve();

			}).catch(function (error: Error)
			{
				reject(error);
			})
		});
	}

	/**
	* Checks a user is logged in and has permission
	* @param {def.UserPrivileges} level
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {string} existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
	* @param {Function} next
	*/
    private requestHasPermission(level: def.UserPrivileges, req: express.Request, res: express.Response, existingUser?: string): Promise<boolean>
	{
		var that = this;
		return new Promise(function( resolve, reject )
		{
			that._userManager.loggedIn(req, res).then(function (user)
			{
				if (!user)
					return reject(new Error("You must be logged in to make this request"));

				if (existingUser !== undefined)
                {
                    if ((user.dbEntry.email != existingUser && user.dbEntry.username != existingUser) && user.dbEntry.privileges > level)
                        return reject(new Error("You don't have permission to make this request"));
                }
				else if (user.dbEntry.privileges > level)
					return reject(new Error("You don't have permission to make this request"));
		
				resolve(true);
			})
		})
	}

	/**
	* Resends the activation link to the user
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private getSessions(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		var that = this;

        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function(user)
		{
			return that._userManager.sessionManager.getActiveSessions(parseInt(req.query.index), parseInt(req.query.limit));

		}).then(function (sessions)
		{
            var token: def.IGetResponse<ISessionEntry> = {
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
		
        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user)
		{
			return that._userManager.sessionManager.clearSession(req.params.id, req, res )

		}).then(function (result)
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
	* Forces the activation of the user's account
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private activateAccount(req: express.Request, res: express.Response, next: Function): any
	{
		var redirectURL = this._config.accountActivatedURL;

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

        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user)
		{
			return that._userManager.approveActivation(req.params.user);

		}).then(function()
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
	* Attempts to log the user in
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private login(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');

        var token: def.IUserAPILogin = req.body;

		this._userManager.logIn(token.username, token.password, token.rememberMe, req, res).then(function (user)
		{
            return res.end(JSON.stringify(<def.IUserResponse>{
				message: (user ? "User is authenticated" : "User is not authenticated"),
				authenticated: (user ? true : false),
				error: false
			}));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IUserResponse>{
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
            return res.end(JSON.stringify(<def.IUserResponse>{
				message: error.message,
				authenticated: false,
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

        var token: def.IUserAPIRegister = req.body;
        
		this._userManager.register(token.username, token.password, token.email, token.captcha, token.challenge, req, res).then(function (user)
		{
            return res.end(JSON.stringify(<def.IUserResponse>{
				message: (user ? "Please activate your account with the link sent to your email address" : "User is not authenticated"),
				authenticated: (user ? true : false),
				error: false
			}));

		}).catch(function (error: Error)
		{
            return res.end(JSON.stringify(<def.IUserResponse>{
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
	private removeUser(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');
		var that = this;

		var username: string = req.params["user"];
		
		that.requestHasPermission(def.UserPrivileges.Admin, req, res, username).then(function (user)
		{
			return that._userManager.removeUser(username);

		}).then(function (user)
		{
			var token: def.IResponse = {
				error: false,
				message: `User ${username} has been removed`
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

		var token: def.IUserAPIRegister = req.body;

		// Not allowed to create super users
		if (token.privileges == def.UserPrivileges.SuperAdmin)
			return res.end(JSON.stringify(<def.IResponse>{
				message: "You cannot create a user with super admin permissions",
				error: true
			}));
			

		this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user)
		{
			return that._userManager.createUser(token.username, token.email, token.password, token.privileges);

		}).then(function(user)
		{
			var token: def.IResponse = {
				error: false,
				message: `User ${user.dbEntry.username} has been created`
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
	* Checks to see if the current session is logged in
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
	private authenticated(req: express.Request, res: express.Response, next: Function): any
	{
		// Set the content type
		res.setHeader('Content-Type', 'application/json');

		this._userManager.loggedIn(req, res).then(function (user)
		{
			return res.end(JSON.stringify(<def.IUserResponse>{
				message: (user ? "User is authenticated" : "User is not authenticated"),
				authenticated: (user ? true : false),
				error: false
			}));

		}).catch(function (error: Error)
		{
			return res.end(JSON.stringify(<def.IUserResponse>{
				message: error.message,
				authenticated: false,
				error: true
			}));
		});
	}

	/**
	* Creates a new mongodb collection
	* @param {string} name The name of the collection to create
	* @param {mongodb.Db} db The database to use
	* @param {Promise<mongodb.Collection>}
	*/
	private createCollection(name: string, db: mongodb.Db): Promise<mongodb.Collection>
	{
		return new Promise<mongodb.Collection>(function (resolve, reject)
		{
			db.createCollection(name, function (err: Error, collection: mongodb.Collection) 
			{
				if (err || !collection)
					return reject(new Error("Error creating collection: " + err.message));
				else
					return resolve(collection);
			});
		});
	}

	/**
	* Connects this controller to a mongo database 
	* @param {mongodb.ServerOptions} opts Any additional options
	* @returns {Promise<mongodb.Db>}
	*/
	private openDB(opts?: mongodb.ServerOptions): Promise<mongodb.Db>
	{
		var that = this;
		return new Promise<mongodb.Db>(function (resolve, reject)
		{
			var mongoServer: mongodb.Server = new mongodb.Server(that._config.host, that._config.portDatabase, opts);
			var mongoDB: mongodb.Db = new mongodb.Db(that._config.databaseName, mongoServer, { w: 1 });
			mongoDB.open(function (err: Error, db: mongodb.Db)
			{
				if (err || !db)
					reject(err);
				else
					resolve(db);
			});
		});
	}
}


//export = Controller;
export default Controller;