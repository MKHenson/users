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
var serializers_1 = require("../serializers");
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
        var that = this;
        users_1.UserManager.get.getUser(req.params.username).then(function (user) {
            if (!user)
                return serializers_1.okJson({ error: true, message: "No user found" }, res);
            serializers_1.okJson({
                error: false,
                message: `Found ${user.dbEntry.username}`,
                data: user.generateCleanedData(Boolean(req.query.verbose))
            }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
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
            serializers_1.okJson({
                error: false,
                message: `Found ${users.length} users`,
                data: sanitizedData,
                count: totalNumUsers
            }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Gets a list of active sessions. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getSessions(req, res, next) {
        var that = this;
        var numSessions = 1;
        that._userManager.sessionManager.numActiveSessions().then(function (count) {
            numSessions = count;
            return that._userManager.sessionManager.getActiveSessions(parseInt(req.query.index), parseInt(req.query.limit));
        }).then(function (sessions) {
            serializers_1.okJson({
                error: false,
                message: `Found ${sessions.length} active sessions`,
                data: sessions,
                count: numSessions
            }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    deleteSession(req, res, next) {
        var that = this;
        that._userManager.sessionManager.clearSession(req.params.id, req, res).then(function (result) {
            serializers_1.okJson({ error: false, message: `Session ${req.params.id} has been removed` }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
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
        var origin = encodeURIComponent(req.headers["origin"] || req.headers["referer"]);
        this._userManager.resendActivation(req.params.user, origin).then(function (success) {
            serializers_1.okJson({ error: false, message: "An activation link has been sent, please check your email for further instructions" }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    requestPasswordReset(req, res, next) {
        var origin = encodeURIComponent(req.headers["origin"] || req.headers["referer"]);
        this._userManager.requestPasswordReset(req.params.user, origin).then(function (success) {
            serializers_1.okJson({ error: false, message: "Instructions have been sent to your email on how to change your password" }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * resets the password if the user has a valid password token
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    passwordReset(req, res, next) {
        if (!req.body)
            return serializers_1.errJson(new Error("Expecting body content and found none"), res);
        if (!req.body.user)
            return serializers_1.errJson(new Error("Please specify a user"), res);
        if (!req.body.key)
            return serializers_1.errJson(new Error("Please specify a key"), res);
        if (!req.body.password)
            return serializers_1.errJson(new Error("Please specify a password"), res);
        // Check the user's activation and forward them onto the admin message page
        this._userManager.resetPassword(req.body.user, req.body.key, req.body.password).then(function (success) {
            serializers_1.okJson({ error: false, message: "Your password has been reset" }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Approves a user's activation code so they can login without email validation
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    approveActivation(req, res, next) {
        var that = this;
        that._userManager.approveActivation(req.params.user).then(function () {
            serializers_1.okJson({ error: false, message: "Activation code has been approved" }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Attempts to log the user in. Expects the username, password and rememberMe parameters be set.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    login(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var token = req.body;
                var user = yield this._userManager.logIn(token.username, token.password, token.rememberMe, req, res);
                serializers_1.okJson({
                    message: (user ? "User is authenticated" : "User is not authenticated"),
                    authenticated: (user ? true : false),
                    user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {}),
                    error: false
                }, res);
            }
            catch (err) {
                serializers_1.okJson({
                    message: err.message,
                    authenticated: false,
                    error: true
                }, res);
            }
            ;
        });
    }
    /**
    * Attempts to log the user out
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    logout(req, res, next) {
        this._userManager.logOut(req, res).then(function (result) {
            serializers_1.okJson({ error: false, message: "Successfully logged out" }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Attempts to send the webmaster an email message
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    messageWebmaster(req, res, next) {
        var token = req.body;
        if (!token.message)
            return serializers_1.okJson({ error: true, message: "Please specify a message to send" }, res);
        this._userManager.sendAdminEmail(token.message, token.name, token.from).then(function () {
            return serializers_1.okJson({ error: false, message: "Your message has been sent to the support team" }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Attempts to register a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    register(req, res, next) {
        var token = req.body;
        this._userManager.register(token.username, token.password, token.email, token.captcha, token.challenge, {}, req, res).then(function (user) {
            return serializers_1.okJson({
                message: (user ? "Please activate your account with the link sent to your email address" : "User is not authenticated"),
                authenticated: (user ? true : false),
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {}),
                error: false
            }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Sets a user's meta data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    setData(req, res, next) {
        var that = this;
        var user = req._user.dbEntry;
        var val = req.body && req.body.value;
        if (!val)
            val = {};
        that._userManager.setMeta(user, val).then(function () {
            return serializers_1.okJson({ message: `User's data has been updated`, error: false }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Sets a user's meta value
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    setVal(req, res, next) {
        var that = this;
        var user = req._user.dbEntry;
        var name = req.params.name;
        that._userManager.setMetaVal(user, name, req.body.value).then(function () {
            return serializers_1.okJson({ message: `Value '${name}' has been updated`, error: false }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Gets a user's meta value
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getVal(req, res, next) {
        var that = this;
        var user = req._user.dbEntry;
        var name = req.params.name;
        that._userManager.getMetaVal(user, name).then(function (val) {
            return serializers_1.okJson(val, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Gets a user's meta data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getData(req, res, next) {
        var that = this;
        var user = req._user.dbEntry;
        var name = req.params.name;
        that._userManager.getMetaData(user).then(function (val) {
            return serializers_1.okJson(val, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Removes a user from the database
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    removeUser(req, res, next) {
        var that = this;
        var toRemove = req.params.user;
        if (!toRemove)
            return serializers_1.okJson({ message: "No user found", error: true }, res);
        that._userManager.removeUser(toRemove).then(function () {
            return serializers_1.okJson({ message: `User ${toRemove} has been removed`, error: false }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
        });
    }
    /**
    * Allows an admin to create a new user without registration
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    createUser(req, res, next) {
        var that = this;
        var token = req.body;
        // Set default privileges
        token.privileges = token.privileges ? token.privileges : users_1.UserPrivileges.Regular;
        // Not allowed to create super users
        if (token.privileges == users_1.UserPrivileges.SuperAdmin)
            return serializers_1.okJson({ error: true, message: "You cannot create a user with super admin permissions" }, res);
        that._userManager.createUser(token.username, token.email, token.password, (this._config.ssl ? "https://" : "http://") + this._config.host, token.privileges, token.meta).then(function (user) {
            return serializers_1.okJson({
                error: false,
                message: `User ${user.dbEntry.username} has been created`,
                data: user.dbEntry
            }, res);
        }).catch(function (err) {
            return serializers_1.errJson(err, res);
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
        this._userManager.loggedIn(req, res).then(function (user) {
            return serializers_1.okJson({
                message: (user ? "User is authenticated" : "User is not authenticated"),
                authenticated: (user ? true : false),
                error: false,
                user: (user ? user.generateCleanedData(Boolean(req.query.verbose)) : {})
            }, res);
        }).catch(function (error) {
            return serializers_1.okJson({
                message: error.message,
                authenticated: false,
                error: true
            }, res);
        });
    }
}
exports.UserController = UserController;
