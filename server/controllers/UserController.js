var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var express = require("express");
var bodyParser = require('body-parser');
var entities = require("entities");
var def = require("../Definitions");
var Users_1 = require("../Users");
var PermissionController_1 = require("../PermissionController");
var Controller_1 = require("./Controller");
var BucketManager_1 = require("../BucketManager");
var compression = require("compression");
/**
* Main class to use for managing users
*/
var UserController = (function (_super) {
    __extends(UserController, _super);
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    function UserController(e, config) {
        _super.call(this);
        this._config = config;
        // Setup the rest calls
        var router = express.Router();
        router.use(compression());
        router.use(bodyParser.urlencoded({ 'extended': true }));
        router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));
        router.get("/users/:username", [PermissionController_1.hasAdminRights, this.getUser.bind(this)]);
        router.get("/users", [PermissionController_1.hasAdminRights, this.getUsers.bind(this)]);
        router.get("/who-am-i", this.authenticated.bind(this));
        router.get("/authenticated", this.authenticated.bind(this));
        router.get("/sessions", [PermissionController_1.hasAdminRights, this.getSessions.bind(this)]);
        router.get("/logout", this.logout.bind(this));
        router.get("/resend-activation/:user", this.resendActivation.bind(this));
        router.get("/activate-account", this.activateAccount.bind(this));
        router.get("/request-password-reset/:user", this.requestPasswordReset.bind(this));
        router.get("/password-reset", this.passwordReset.bind(this));
        router.delete("/sessions/:id", [PermissionController_1.hasAdminRights, this.deleteSession.bind(this)]);
        router.delete("/remove-user/:user", [PermissionController_1.hasAdminRights, this.removeUser.bind(this)]);
        router.post("/login", this.login.bind(this));
        router.post("/register", this.register.bind(this));
        router.post("/create-user", [PermissionController_1.hasAdminRights, this.createUser.bind(this)]);
        router.put("/approve-activation/:user", [PermissionController_1.hasAdminRights, this.approveActivation.bind(this)]);
        // Register the path
        e.use(config.restURL, router);
    }
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    UserController.prototype.initialize = function (db) {
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
                that._userManager = Users_1.UserManager.create(userCollection, sessionCollection, that._config);
                that._userManager.initialize().then(function () {
                    // Initialization is finished
                    resolve();
                });
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Gets a specific user by username or email - the "username" parameter must be set. The user data will be obscured unless the verbose parameter
    * is specified. Specify the verbose=true parameter in order to get all user data
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.getUser = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        Users_1.UserManager.get.getUser(req.params.username).then(function (user) {
            if (!user)
                return res.end(JSON.stringify({ message: "No user found", error: true }));
            var token = {
                error: false,
                message: "Found " + user.dbEntry.username,
                data: user.generateCleanedData(Boolean(req.query.verbose))
            };
            return res.end(JSON.stringify(token));
        }).catch(function (err) {
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    };
    /**
    * Gets a list of users. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * Also specify the verbose=true parameter in order to get all user data. You can also search with the
    * search query
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.getUsers = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var totalNumUsers = 0;
        that._userManager.numUsers(new RegExp(req.query.search)).then(function (numUsers) {
            totalNumUsers = numUsers;
            return that._userManager.getUsers(parseInt(req.query.index), parseInt(req.query.limit), new RegExp(req.query.search));
        })
            .then(function (users) {
            var sanitizedData = [];
            for (var i = 0, l = users.length; i < l; i++)
                sanitizedData.push(users[i].generateCleanedData(Boolean(req.query.verbose)));
            var token = {
                error: false,
                message: "Found " + users.length + " users",
                data: sanitizedData,
                count: totalNumUsers
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Gets a list of active sessions. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.getSessions = function (req, res, next) {
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
                message: "Found " + sessions.length + " active sessions",
                data: sessions,
                count: numSessions
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.deleteSession = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        that._userManager.sessionManager.clearSession(req.params.id, req, res).then(function (result) {
            var token = {
                error: false,
                message: "Session " + req.params.id + " has been removed",
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Activates the user's account
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.activateAccount = function (req, res, next) {
        var redirectURL = this._config.accountRedirectURL;
        // Check the user's activation and forward them onto the admin message page
        this._userManager.checkActivation(req.query.user, req.query.key).then(function (success) {
            res.writeHead(302, { 'Location': redirectURL + "?message=" + entities.encodeHTML("Your account has been activated!") + "&status=success" });
            res.end();
        }).catch(function (error) {
            res.writeHead(302, { 'Location': redirectURL + "?message=" + entities.encodeHTML(error.message) + "&status=error" });
            res.end();
        });
    };
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.resendActivation = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        this._userManager.resendActivation(req.params.user).then(function (success) {
            return res.end(JSON.stringify({
                message: "An activation link has been sent, please check your email for further instructions",
                error: false
            }));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Resends the activation link to the user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.requestPasswordReset = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        this._userManager.requestPasswordReset(req.params.user).then(function (success) {
            return res.end(JSON.stringify({
                message: "Instructions have been sent to your email on how to change your password",
                error: false
            }));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * resets the password if the user has a valid password token
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.passwordReset = function (req, res, next) {
        var redirectURL = this._config.passwordRedirectURL;
        // Check the user's activation and forward them onto the admin message page
        this._userManager.resetPassword(req.query.user, req.query.key, req.query.password).then(function (success) {
            res.writeHead(302, { 'Location': redirectURL + "?message=" + entities.encodeHTML("Your password has been reset!") + "&status=success" });
            res.end();
        }).catch(function (error) {
            res.writeHead(302, { 'Location': redirectURL + "?message=" + entities.encodeHTML(error.message) + "&status=error" });
            res.end();
        });
    };
    /**
    * Approves a user's activation code so they can login without email validation
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.approveActivation = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        that._userManager.approveActivation(req.params.user).then(function () {
            return res.end(JSON.stringify({
                message: "Activation code has been approved",
                error: false
            }));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Attempts to log the user in. Expects the username, password and rememberMe parameters be set.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.login = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var token = req.body;
        this._userManager.logIn(token.username, token.password, token.rememberMe, req, res).then(function (user) {
            return res.end(JSON.stringify({
                message: (user ? "User is authenticated" : "User is not authenticated"),
                authenticated: (user ? true : false),
                error: false
            }));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                authenticated: false,
                error: true
            }));
        });
    };
    /**
    * Attempts to log the user out
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.logout = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        this._userManager.logOut(req, res).then(function (result) {
            return res.end(JSON.stringify({
                message: "Successfully logged out",
                error: false
            }));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Attempts to register a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.register = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var token = req.body;
        this._userManager.register(token.username, token.password, token.email, token.captcha, token.challenge, req, res).then(function (user) {
            return res.end(JSON.stringify({
                message: (user ? "Please activate your account with the link sent to your email address" : "User is not authenticated"),
                authenticated: (user ? true : false),
                error: false
            }));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                authenticated: false,
                error: true
            }));
        });
    };
    /**
    * Removes a user from the database
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.removeUser = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var toRemove = req.params.user;
        if (!toRemove)
            return res.end(JSON.stringify({ message: "No user found", error: true }));
        that._userManager.removeUser(toRemove).then(function () {
            return BucketManager_1.BucketManager.get.removeBucketsByUser(toRemove);
        }).then(function () {
            var token = {
                error: false,
                message: "User " + toRemove + " has been removed"
            };
            return res.end(JSON.stringify(token));
        }).catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Allows an admin to create a new user without registration
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    UserController.prototype.createUser = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var token = req.body;
        // Not allowed to create super users
        if (token.privileges == def.UserPrivileges.SuperAdmin)
            return res.end(JSON.stringify({
                message: "You cannot create a user with super admin permissions",
                error: true
            }));
        that._userManager.createUser(token.username, token.email, token.password, token.privileges).then(function (user) {
            var token = {
                error: false,
                message: "User " + user.dbEntry.username + " has been created",
                data: user.dbEntry
            };
            return res.end(JSON.stringify(token));
        })
            .catch(function (error) {
            return res.end(JSON.stringify({
                message: error.message,
                error: true
            }));
        });
    };
    /**
    * Checks to see if the current session is logged in. If the user is, it will be returned redacted. You can specify the 'verbose' query parameter.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    * @returns {IAuthenticationResponse}
    */
    UserController.prototype.authenticated = function (req, res, next) {
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
            return res.end(JSON.stringify({
                message: error.message,
                authenticated: false,
                error: true
            }));
        });
    };
    return UserController;
})(Controller_1.Controller);
exports.UserController = UserController;
