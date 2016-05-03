"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, Promise, generator) {
    return new Promise(function (resolve, reject) {
        generator = generator.call(thisArg, _arguments);
        function cast(value) { return value instanceof Promise && value.constructor === Promise ? value : new Promise(function (resolve) { resolve(value); }); }
        function onfulfill(value) { try { step("next", value); } catch (e) { reject(e); } }
        function onreject(value) { try { step("throw", value); } catch (e) { reject(e); } }
        function step(verb, value) {
            var result = generator[verb](value);
            result.done ? resolve(result.value) : cast(result.value).then(onfulfill, onreject);
        }
        step("next", void 0);
    });
};
var express = require("express");
var bodyParser = require('body-parser');
var users_1 = require("../users");
var permission_controller_1 = require("../permission-controller");
var controller_1 = require("./controller");
var compression = require("compression");
var winston = require("winston");
/**
* Main class to use for managing users
*/
class UserController extends controller_1.Controller {
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    constructor(e, config) {
        super();
        this._config = config;
        // Setup the rest calls
        var router = express.Router();
        router.use(compression());
        router.use(bodyParser.urlencoded({ 'extended': true }));
        router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));
        router.get("/users/:user/meta", [permission_controller_1.ownerRights, this.getData.bind(this)]);
        router.get("/users/:user/meta/:name", [permission_controller_1.ownerRights, this.getVal.bind(this)]);
        router.get("/users/:username", [permission_controller_1.ownerRights, this.getUser.bind(this)]);
        router.get("/users", [permission_controller_1.identifyUser, this.getUsers.bind(this)]);
        router.get("/who-am-i", this.authenticated.bind(this));
        router.get("/authenticated", this.authenticated.bind(this));
        router.get("/sessions", [permission_controller_1.ownerRights, this.getSessions.bind(this)]);
        router.get("/logout", this.logout.bind(this));
        router.get("/users/:user/resend-activation", this.resendActivation.bind(this));
        router.get("/activate-account", this.activateAccount.bind(this));
        router.get("/users/:user/request-password-reset", this.requestPasswordReset.bind(this));
        router.delete("/sessions/:id", [permission_controller_1.ownerRights, this.deleteSession.bind(this)]);
        router.delete("/users/:user", [permission_controller_1.ownerRights, this.removeUser.bind(this)]);
        router.post("/users/login", this.login.bind(this));
        router.post("/users/register", this.register.bind(this));
        router.post("/users", [permission_controller_1.ownerRights, this.createUser.bind(this)]);
        router.post("/message-webmaster", this.messageWebmaster.bind(this));
        router.post("/users/:user/meta/:name", [permission_controller_1.adminRights, this.setVal.bind(this)]);
        router.post("/users/:user/meta", [permission_controller_1.adminRights, this.setData.bind(this)]);
        router.put("/users/:user/approve-activation", [permission_controller_1.ownerRights, this.approveActivation.bind(this)]);
        router.put("/password-reset", this.passwordReset.bind(this));
        // Register the path
        e.use(config.apiPrefix, router);
    }
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    initialize(db) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var userCollection;
            var sessionCollection;
            Promise.all([
                that.createCollection(that._config.userCollection, db),
                that.createCollection(that._config.sessionCollection, db)
            ]).then(function (collections) {
                userCollection = collections[0];
                sessionCollection = collections[1];
                return Promise.all([
                    that.ensureIndex(userCollection, "username"),
                    that.ensureIndex(userCollection, "createdOn"),
                    that.ensureIndex(userCollection, "lastLoggedIn"),
                ]);
            }).then(function () {
                // Create the user manager
                that._userManager = users_1.UserManager.create(userCollection, sessionCollection, that._config);
                return that._userManager.initialize();
            }).then(function () {
                // Initialization is finished
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    }
    /**
    * Gets a specific user by username or email - the "username" parameter must be set. Some of the user data will be obscured unless the verbose parameter
    * is specified. Specify the verbose=true parameter in order to get all user data.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getUser(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        users_1.UserManager.get.getUser(req.params.username).then(function (user) {
            if (!user)
                return res.end(JSON.stringify({ message: "No user found", error: true }));
            var token = {
                error: false,
                message: `Found ${user.dbEntry.username}`,
                data: user.generateCleanedData(Boolean(req.query.verbose))
            };
            return res.end(JSON.stringify(token));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    }
    /**
    * Gets a list of users. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * Also specify the verbose=true parameter in order to get all user data. You can also filter usernames with the
    * search query
    * @param {def.AuthRequest} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getUsers(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var totalNumUsers = 0;
        var verbose = Boolean(req.query.verbose);
        // Only admins are allowed to see sensitive data
        if (req._user && req._user.dbEntry.privileges == users_1.UserPrivileges.SuperAdmin && verbose)
            verbose = true;
        else
            verbose = false;
        that._userManager.numUsers(new RegExp(req.query.search)).then(function (numUsers) {
            totalNumUsers = numUsers;
            return that._userManager.getUsers(parseInt(req.query.index), parseInt(req.query.limit), new RegExp(req.query.search));
        })
            .then(function (users) {
            var sanitizedData = [];
            for (var i = 0, l = users.length; i < l; i++)
                sanitizedData.push(users[i].generateCleanedData(verbose));
            var token = {
                error: false,
                message: `Found ${users.length} users`,
                data: sanitizedData,
                count: totalNumUsers
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    getSessions(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var numSessions = 1;
        that._userManager.sessionManager.numActiveSessions().then(function (count) {
            numSessions = count;
            return that._userManager.sessionManager.getActiveSessions(parseInt(req.query.index), parseInt(req.query.limit));
        }).then(function (sessions) {
            var token = {
                error: false,
                message: `Found ${sessions.length} active sessions`,
                data: sessions,
                count: numSessions
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    deleteSession(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        that._userManager.sessionManager.clearSession(req.params.id, req, res).then(function (result) {
            var token = {
                error: false,
                message: `Session ${req.params.id} has been removed`,
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    activateAccount(req, res, next) {
        var redirectURL = this._config.accountRedirectURL;
        // Check the user's activation and forward them onto the admin message page
        this._userManager.checkActivation(req.query.user, req.query.key).then(function (success) {
            res.redirect(`${redirectURL}?message=${encodeURIComponent("Your account has been activated!")}&status=success&origin=${encodeURIComponent(req.query.origin)}`);
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            res.redirect(`${redirectURL}?message=${encodeURIComponent(error.message)}&status=error&origin=${encodeURIComponent(req.query.origin)}`);
        });
    }
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    resendActivation(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var origin = encodeURIComponent(req.headers["origin"] || req.headers["referer"]);
        this._userManager.resendActivation(req.params.user, origin).then(function (success) {
            return res.end(JSON.stringify({
                message: "An activation link has been sent, please check your email for further instructions",
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    requestPasswordReset(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var origin = encodeURIComponent(req.headers["origin"] || req.headers["referer"]);
        this._userManager.requestPasswordReset(req.params.user, origin).then(function (success) {
            return res.end(JSON.stringify({
                message: "Instructions have been sent to your email on how to change your password",
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    passwordReset(req, res, next) {
        res.setHeader('Content-Type', 'application/json');
        if (!req.body)
            return res.end(JSON.stringify({ message: "Expecting body content and found none", error: true }));
        if (!req.body.user)
            return res.end(JSON.stringify({ message: "Please specify a user", error: true }));
        if (!req.body.key)
            return res.end(JSON.stringify({ message: "Please specify a key", error: true }));
        if (!req.body.password)
            return res.end(JSON.stringify({ message: "Please specify a password", error: true }));
        // Check the user's activation and forward them onto the admin message page
        this._userManager.resetPassword(req.body.user, req.body.key, req.body.password).then(function (success) {
            return res.end(JSON.stringify({
                message: "Your password has been reset",
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    approveActivation(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        that._userManager.approveActivation(req.params.user).then(function () {
            return res.end(JSON.stringify({
                message: "Activation code has been approved",
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    login(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var token = req.body;
        this._userManager.logIn(token.username, token.password, token.rememberMe, req, res).then(function (user) {
            return res.end(JSON.stringify({
                message: (user ? "User is authenticated" : "User is not authenticated"),
                authenticated: (user ? true : false),
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {}),
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    logout(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        this._userManager.logOut(req, res).then(function (result) {
            return res.end(JSON.stringify({
                message: "Successfully logged out",
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    messageWebmaster(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var token = req.body;
        if (!token.message)
            return res.end(JSON.stringify({ message: "Please specify a message to send", error: true }));
        this._userManager.sendAdminEmail(token.message, token.name, token.from).then(function () {
            return res.end(JSON.stringify({ message: "Your message has been sent to the support team", error: false }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({ message: error.message, error: true }));
        });
    }
    /**
    * Attempts to register a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    register(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var token = req.body;
        this._userManager.register(token.username, token.password, token.email, token.captcha, token.challenge, {}, req, res).then(function (user) {
            return res.end(JSON.stringify({
                message: (user ? "Please activate your account with the link sent to your email address" : "User is not authenticated"),
                authenticated: (user ? true : false),
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {}),
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    setData(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var user = req._user.dbEntry;
        var val = req.body && req.body.value;
        if (!val)
            val = {};
        that._userManager.setMeta(user, val).then(function () {
            return res.end(JSON.stringify({
                message: `User's data has been updated`,
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    setVal(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var user = req._user.dbEntry;
        var name = req.params.name;
        that._userManager.setMetaVal(user, name, req.body.value).then(function () {
            return res.end(JSON.stringify({
                message: `Value '${name}' has been updated`,
                error: false
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    getVal(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var user = req._user.dbEntry;
        var name = req.params.name;
        that._userManager.getMetaVal(user, name).then(function (val) {
            return res.end(JSON.stringify(val));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    getData(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var user = req._user.dbEntry;
        var name = req.params.name;
        that._userManager.getMetaData(user).then(function (val) {
            return res.end(JSON.stringify(val));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    removeUser(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var toRemove = req.params.user;
        if (!toRemove)
            return res.end(JSON.stringify({ message: "No user found", error: true }));
        that._userManager.removeUser(toRemove).then(function () {
            var token = {
                error: false,
                message: `User ${toRemove} has been removed`
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    createUser(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var token = req.body;
        // Set default privileges
        token.privileges = token.privileges ? token.privileges : users_1.UserPrivileges.Regular;
        // Not allowed to create super users
        if (token.privileges == users_1.UserPrivileges.SuperAdmin)
            return res.end(JSON.stringify({
                message: "You cannot create a user with super admin permissions",
                error: true
            }));
        that._userManager.createUser(token.username, token.email, token.password, (this._config.ssl ? "https://" : "http://") + this._config.host, token.privileges, token.meta).then(function (user) {
            var token = {
                error: false,
                message: `User ${user.dbEntry.username} has been created`,
                data: user.dbEntry
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
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
    authenticated(req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        this._userManager.loggedIn(req, res).then(function (user) {
            return res.end(JSON.stringify({
                message: (user ? "User is authenticated" : "User is not authenticated"),
                authenticated: (user ? true : false),
                error: false,
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {})
            }));
        }).catch(function (error) {
            winston.error(error.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: error.message,
                authenticated: false,
                error: true
            }));
        });
    }
}
exports.UserController = UserController;
