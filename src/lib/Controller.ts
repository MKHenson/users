import express = require("express");
import bodyParser = require('body-parser');

// NEW ES6 METHOD
import * as http from "http";
import * as entities from "entities";
import * as def from "./Definitions";
import * as mongodb from "mongodb";
import {Session} from "./Session";
import {UserManager, User} from "./Users";

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

        var matches: Array<RegExp> = [];
        for (var i = 0, l = config.approvedDomains.length; i < l; i++)
            matches.push(new RegExp(config.approvedDomains[i]));

        // Approves the valid domains for CORS requests
        router.all("*", function (req: express.Request, res: express.Response, next: Function)
        {
            if ((<http.ServerRequest>req).headers.origin)
            {
                for (var m = 0, l = matches.length; m < l; m++)
                    if ((<http.ServerRequest>req).headers.origin.match(matches[m]))
                    {
                        res.setHeader('Access-Control-Allow-Origin', (<http.ServerRequest>req).headers.origin);
                        res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
                        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, X-Mime-Type, X-File-Name, Cache-Control');
                        res.setHeader("Access-Control-Allow-Credentials", "true");
                        break;
                    }
            }
            else
                console.log(`${(<http.ServerRequest>req).headers.origin} Does not have permission. Add it to the allowed `);


            if (req.method === 'OPTIONS')
            {
                res.status(200);
                res.end();
            }
            else
                next();
        });
		
        router.get("/users/:username", this.getUser.bind(this));
        router.get("/users", this.getUsers.bind(this));
        router.get("/who-am-i", this.authenticated.bind(this));
		router.get("/authenticated", this.authenticated.bind(this));
		router.get("/sessions", this.getSessions.bind(this));
		router.get("/logout", this.logout.bind(this));
		router.get("/resend-activation/:user", this.resendActivation.bind(this));		
        router.get("/activate-account", this.activateAccount.bind(this));
        router.get("/request-password-reset/:user", this.requestPasswordReset.bind(this));
        router.get("/password-reset", this.passwordReset.bind(this));

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
	* Gets a specific user by username or email. Specify the verbose=true parameter in order to get all user data
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private getUser(req: express.Request, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;

        this.requestHasPermission(def.UserPrivileges.Admin, req, res, req.params.username).then(function()
        {
            return that._userManager.getUser(req.params.username);

        }).then(function (user: User)
        {
            if (!user)
                return Promise.reject(new Error("No user found"));

            var token: def.IGetUser = {
                error: false,
                message: `Found ${user.dbEntry.username}`,
                data: user.generateCleanedData(Boolean(req.query.verbose))
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
        
        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user)
        {
            return that._userManager.numUsers(new RegExp(req.query.search));

        }).then(function(numUsers)
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

        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function(user)
		{
			return that._userManager.sessionManager.getActiveSessions(parseInt(req.query.index), parseInt(req.query.limit));

		}).then(function (sessions)
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

		var token: def.IRegisterToken = req.body;

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
            var token: def.IGetUser = {
				error: false,
                message: `User ${user.dbEntry.username} has been created`,
                data: user.dbEntry
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
            var mongoServer: mongodb.Server = new mongodb.Server(that._config.databaseHost, that._config.databasePort, opts);
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