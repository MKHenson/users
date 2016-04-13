"use strict";

import express = require("express");
import bodyParser = require('body-parser');

// NEW ES6 METHOD
import * as http from "http";
import * as entities from "entities";
import * as def from "webinate-users";
import * as mongodb from "mongodb";
import {Session} from "../session";
import {UserManager, User, UserPrivileges} from "../users";
import {ownerRights, adminRights, secret, identifyUser} from "../permission-controller";
import {Controller} from "./controller"
import {BucketManager} from "../bucket-manager";
import * as compression from "compression";
import * as winston from "winston";

/**
* Main class to use for managing users
*/
export class UserController extends Controller
{
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
        secret.key = config.secret;

		// Setup the rest calls
        var router = express.Router();
        router.use(compression());
		router.use(bodyParser.urlencoded({ 'extended': true }));
		router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));

        router.get("/users/:user/meta", <any>[ownerRights, this.getData.bind(this)]);
        router.get("/users/:user/meta/:name", <any>[ownerRights, this.getVal.bind(this)]);
        router.get("/users/:username", <any>[ownerRights, this.getUser.bind(this)]);
        router.get("/users", <any>[identifyUser, this.getUsers.bind(this)]);
        router.get("/who-am-i", this.authenticated.bind(this));
		router.get("/authenticated", this.authenticated.bind(this));
        router.get("/sessions", <any>[ownerRights, this.getSessions.bind(this)]);
		router.get("/logout", this.logout.bind(this));
		router.get("/users/:user/resend-activation", this.resendActivation.bind(this));
        router.get("/activate-account", this.activateAccount.bind(this));
        router.get("/users/:user/request-password-reset", this.requestPasswordReset.bind(this));
        router.delete("/sessions/:id", <any>[ownerRights, this.deleteSession.bind(this)]);
        router.delete("/users/:user", <any>[ownerRights, this.removeUser.bind(this)]);
		router.post("/users/login", this.login.bind(this));
		router.post("/users/register", this.register.bind(this));
        router.post("/users", <any>[ownerRights, this.createUser.bind(this)]);
        router.post("/message-webmaster", this.messageWebmaster.bind(this));
        router.post("/users/:user/meta/:name", <any>[adminRights, this.setVal.bind(this)]);
        router.post("/users/:user/meta", <any>[adminRights, this.setData.bind(this)]);
        router.put("/users/:user/approve-activation", <any>[ownerRights, this.approveActivation.bind(this)]);
        router.put("/password-reset", this.passwordReset.bind(this));

		// Register the path
        e.use(config.apiPrefix, router);
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
            var userCollection;
            var sessionCollection;

            Promise.all([
                that.createCollection(that._config.userCollection, db),
                that.createCollection(that._config.sessionCollection, db)

            ]).then(function( collections ) {

                userCollection = collections[0];
                sessionCollection = collections[1];

                return Promise.all([
                    that.ensureIndex(userCollection, "username"),
                    that.ensureIndex(userCollection, "createdOn"),
                    that.ensureIndex(userCollection, "lastLoggedIn"),
                ]);

            }).then(function () {

                // Create the user manager
                that._userManager = UserManager.create(userCollection, sessionCollection, that._config);
                return that._userManager.initialize();

            }).then(function () {

                // Initialization is finished
                resolve();

            }).catch(function (error: Error) {
                reject(error);
            });
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

        UserManager.get.getUser(req.params.username).then(function (user)
        {
            if (!user)
                return res.end(JSON.stringify(<def.IResponse>{ message: "No user found", error: true }));

            var token: def.IGetUser = {
                error: false,
                message: `Found ${user.dbEntry.username}`,
                data: user.generateCleanedData(Boolean(req.query.verbose))
            };

            return res.end(JSON.stringify(token));

        }).catch(function(err)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
	* Gets a list of users. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * Also specify the verbose=true parameter in order to get all user data. You can also search with the
    * search query
	* @param {def.AuthRequest} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private getUsers(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var totalNumUsers: number = 0;

        var verbose = Boolean(req.query.verbose);

        // Only admins are allowed to see sensitive data
        if (req._user && req._user.dbEntry.privileges == UserPrivileges.SuperAdmin && verbose)
            verbose = true;
        else
            verbose = false;

        that._userManager.numUsers(new RegExp(req.query.search)).then(function(numUsers)
        {
            totalNumUsers = numUsers;
            return that._userManager.getUsers(parseInt(req.query.index), parseInt(req.query.limit), new RegExp(req.query.search));
        })
        .then(function (users)
        {
            var sanitizedData = [];

            for (var i = 0, l = users.length; i < l; i++)
                sanitizedData.push(users[i].generateCleanedData(verbose));

            var token: def.IGetUsers = {
                error: false,
                message: `Found ${users.length} users`,
                data: sanitizedData,
                count: totalNumUsers
            };

            return res.end(JSON.stringify(token));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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
        var numSessions = 1;

        that._userManager.sessionManager.numActiveSessions().then(function (count)
        {
            numSessions = count;
            return that._userManager.sessionManager.getActiveSessions(parseInt(req.query.index), parseInt(req.query.limit))

        }).then(function (sessions)
        {
            var token: def.IGetSessions = {
				error: false,
				message: `Found ${sessions.length} active sessions`,
                data: sessions,
                count: numSessions
			};

			return res.end(JSON.stringify(token));

		}).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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
            winston.error(error.toString(), { process: process.pid });
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
            res.redirect(`${redirectURL}?message=${encodeURIComponent("Your account has been activated!") }&status=success&origin=${encodeURIComponent(req.query.origin)}`);

		}).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
            res.redirect(`${redirectURL}?message=${encodeURIComponent(error.message) }&status=error&origin=${encodeURIComponent(req.query.origin)}`);
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
        var origin = encodeURIComponent(req.headers["origin"] || req.headers["referer"]);

        this._userManager.resendActivation(req.params.user, origin).then(function (success)
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: "An activation link has been sent, please check your email for further instructions",
				error: false
			}));

		}).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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

        var origin = encodeURIComponent(req.headers["origin"] || req.headers["referer"]);

        this._userManager.requestPasswordReset(req.params.user, origin).then(function (success)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: "Instructions have been sent to your email on how to change your password",
                error: false
            }));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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
        res.setHeader('Content-Type', 'application/json');

        if (!req.body)
            return res.end(JSON.stringify(<def.IResponse>{ message: "Expecting body content and found none", error: true }));
        if (!req.body.user)
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a user", error: true }));
        if (!req.body.key)
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a key", error: true }));
        if (!req.body.password)
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a password", error: true }));

        // Check the user's activation and forward them onto the admin message page
        this._userManager.resetPassword(req.body.user, req.body.key, req.body.password).then(function (success: boolean)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: "Your password has been reset",
                error: false
            }));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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

        that._userManager.approveActivation(req.params.user).then(function()
		{
            return res.end(JSON.stringify(<def.IResponse>{
				message: "Activation code has been approved",
				error: false
			}));

		}).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {}),
				error: false
			}));

		}).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IResponse>{
				message: error.message,
				error: true
			}));
		});
    }

    /**
	* Attempts to send the webmaster an email message
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    messageWebmaster(req: express.Request, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');

        var token: any = req.body;

        if (!token.message)
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a message to send", error: true }));

        this._userManager.sendAdminEmail(token.message, token.name, token.from).then(function()
        {
            return res.end(JSON.stringify(<def.IAuthenticationResponse>{ message: "Your message has been sent to the support team", error: false }));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IResponse>{ message: error.message,  error: true }));
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

        this._userManager.register(token.username, token.password, token.email, token.captcha, token.challenge, {}, req, res).then(function (user)
		{
            return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: (user ? "Please activate your account with the link sent to your email address" : "User is not authenticated"),
                authenticated: (user ? true : false),
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {}),
				error: false
			}));

		}).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: error.message,
				authenticated: false,
				error: true
			}));
		});
    }

    /**
	* Sets a user's meta data
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private setData(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;

        var user = req._user.dbEntry;
        var val = req.body && req.body.value;
        if (!val)
            val = {};

        that._userManager.setMeta(user, val).then(function ()
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: `User's data has been updated`,
                error: false
            }));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IResponse>{
                message: error.message,
                error: true
            }));
        });
    }

    /**
	* Sets a user's meta value
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private setVal(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;

        var user = req._user.dbEntry;
        var name = req.params.name;

        that._userManager.setMetaVal(user, name, req.body.value ).then(function()
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: `Value '${name}' has been updated`,
                error: false
            }));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IResponse>{
                message: error.message,
                error: true
            }));
        });
    }

    /**
	* Gets a user's meta value
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private getVal(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;

        var user = req._user.dbEntry;
        var name = req.params.name;

        that._userManager.getMetaVal(user, name).then(function (val)
        {
            return res.end(JSON.stringify(val));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IResponse>{
                message: error.message,
                error: true
            }));
        });
    }

    /**
	* Gets a user's meta data
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private getData(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;

        var user = req._user.dbEntry;
        var name = req.params.name;

        that._userManager.getMetaData(user).then(function (val)
        {
            return res.end(JSON.stringify(val));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify(<def.IResponse>{
                message: error.message,
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

        that._userManager.removeUser(toRemove)//.then(function ()
        //{
        //    return BucketManager.get.removeBucketsByUser(toRemove);
        //
        //})
            .then(function ()
		{
			var token: def.IResponse = {
				error: false,
                message: `User ${toRemove} has been removed`
			};

			return res.end(JSON.stringify(token));

		}).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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

        // Set default privileges
        token.privileges = token.privileges ? token.privileges : UserPrivileges.Regular;

		// Not allowed to create super users
		if (token.privileges == UserPrivileges.SuperAdmin)
			return res.end(JSON.stringify(<def.IResponse>{
				message: "You cannot create a user with super admin permissions",
				error: true
			}));


        that._userManager.createUser(token.username, token.email, token.password, (this._config.ssl ? "https://" : "http://") + this._config.host, token.privileges, token.meta).then(function (user)
        {
            var token: def.IGetUser = {
                error: false,
                message: `User ${user.dbEntry.username} has been created`,
                data: user.dbEntry
            };

            return res.end(JSON.stringify(token));

        }).catch(function (error: Error)
        {
            winston.error(error.toString(), { process: process.pid });
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
            winston.error(error.toString(), { process: process.pid });
			return res.end(JSON.stringify(<def.IAuthenticationResponse>{
				message: error.message,
				authenticated: false,
				error: true
			}));
		});
	}
}