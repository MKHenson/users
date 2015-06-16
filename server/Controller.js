var express = require("express");
var bodyParser = require('body-parser');
var entities = require("entities");
var def = require("./Definitions");
var mongodb = require("mongodb");
var Users_1 = require("./Users");
/**
* Main class to use for managing users
*/
var Controller = (function () {
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    function Controller(e, config) {
        this._config = config;
        // Setup the rest calls
        var router = express.Router();
        router.use(bodyParser.urlencoded({ 'extended': true }));
        router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));
        var matches = [];
        for (var i = 0, l = config.approvedDomains.length; i < l; i++)
            matches.push(new RegExp(config.approvedDomains[i]));
        // Approves the valid domains for CORS requests
        router.all("*", function (req, res, next) {
            if (req.headers.origin) {
                for (var m = 0, l = matches.length; m < l; m++)
                    if (req.headers.origin.match(matches[m])) {
                        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
                        res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
                        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, X-Mime-Type, X-File-Name, Cache-Control');
                        res.setHeader("Access-Control-Allow-Credentials", "true");
                        break;
                    }
            }
            else
                console.log(req.headers.origin + " Does not have permission. Add it to the allowed ");
            if (req.method === 'OPTIONS') {
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
    Controller.prototype.initialize = function () {
        var that = this;
        var database;
        var userCollection;
        var sessionCollection;
        return new Promise(function (resolve, reject) {
            // Open the DB
            that.openDB().then(function (db) {
                database = db;
                // Get the users collection
                return that.createCollection(that._config.userCollection, database);
            }).then(function (collection) {
                userCollection = collection;
                // Get the session collection
                return that.createCollection(that._config.sessionCollection, database);
            }).then(function (collection) {
                sessionCollection = collection;
                // Create the user manager
                that._userManager = new Users_1.UserManager(userCollection, sessionCollection, that._config);
                return that._userManager.initialize();
            }).then(function (collection) {
                // Initialization is finished
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Checks a user is logged in and has permission
    * @param {def.UserPrivileges} level
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {string} existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
    * @param {Function} next
    */
    Controller.prototype.requestHasPermission = function (level, req, res, existingUser) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that._userManager.loggedIn(req, res).then(function (user) {
                if (!user)
                    return reject(new Error("You must be logged in to make this request"));
                if (existingUser !== undefined) {
                    if ((user.dbEntry.email != existingUser && user.dbEntry.username != existingUser) && user.dbEntry.privileges > level)
                        return reject(new Error("You don't have permission to make this request"));
                }
                else if (user.dbEntry.privileges > level)
                    return reject(new Error("You don't have permission to make this request"));
                resolve(true);
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
    Controller.prototype.getUser = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        this.requestHasPermission(def.UserPrivileges.Admin, req, res, req.params.username).then(function () {
            return that._userManager.getUser(req.params.username);
        }).then(function (user) {
            if (!user)
                return Promise.reject(new Error("No user found"));
            var token = {
                error: false,
                message: "Found " + user.dbEntry.username,
                data: user.generateCleanedData(Boolean(req.query.verbose))
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
    * Gets a list of users. You can limit the haul by specifying the 'index' and 'limit' query parameters.
    * Also specify the verbose=true parameter in order to get all user data. You can also search with the
    * search query
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    Controller.prototype.getUsers = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var totalNumUsers = 0;
        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user) {
            return that._userManager.numUsers(new RegExp(req.query.search));
        }).then(function (numUsers) {
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
    Controller.prototype.getSessions = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user) {
            return that._userManager.sessionManager.getActiveSessions(parseInt(req.query.index), parseInt(req.query.limit));
        }).then(function (sessions) {
            var token = {
                error: false,
                message: "Found " + sessions.length + " active sessions",
                data: sessions
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
    Controller.prototype.deleteSession = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user) {
            return that._userManager.sessionManager.clearSession(req.params.id, req, res);
        }).then(function (result) {
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
    Controller.prototype.activateAccount = function (req, res, next) {
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
    Controller.prototype.resendActivation = function (req, res, next) {
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
    Controller.prototype.requestPasswordReset = function (req, res, next) {
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
    Controller.prototype.passwordReset = function (req, res, next) {
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
    Controller.prototype.approveActivation = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user) {
            return that._userManager.approveActivation(req.params.user);
        }).then(function () {
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
    Controller.prototype.login = function (req, res, next) {
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
    Controller.prototype.logout = function (req, res, next) {
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
    Controller.prototype.register = function (req, res, next) {
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
    Controller.prototype.removeUser = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var that = this;
        var username = req.params["user"];
        that.requestHasPermission(def.UserPrivileges.Admin, req, res, username).then(function (user) {
            return that._userManager.removeUser(username);
        }).then(function (user) {
            var token = {
                error: false,
                message: "User " + username + " has been removed"
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
    Controller.prototype.createUser = function (req, res, next) {
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
        this.requestHasPermission(def.UserPrivileges.Admin, req, res).then(function (user) {
            return that._userManager.createUser(token.username, token.email, token.password, token.privileges);
        }).then(function (user) {
            var token = {
                error: false,
                message: "User " + user.dbEntry.username + " has been created",
                data: user.dbEntry
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
    * Checks to see if the current session is logged in. If the user is, it will be returned redacted. You can specify the 'verbose' query parameter.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    * @returns {IAuthenticationResponse}
    */
    Controller.prototype.authenticated = function (req, res, next) {
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
    /**
    * Creates a new mongodb collection
    * @param {string} name The name of the collection to create
    * @param {mongodb.Db} db The database to use
    * @param {Promise<mongodb.Collection>}
    */
    Controller.prototype.createCollection = function (name, db) {
        return new Promise(function (resolve, reject) {
            db.createCollection(name, function (err, collection) {
                if (err || !collection)
                    return reject(new Error("Error creating collection: " + err.message));
                else
                    return resolve(collection);
            });
        });
    };
    /**
    * Connects this controller to a mongo database
    * @param {mongodb.ServerOptions} opts Any additional options
    * @returns {Promise<mongodb.Db>}
    */
    Controller.prototype.openDB = function (opts) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var mongoServer = new mongodb.Server(that._config.databaseHost, that._config.databasePort, opts);
            var mongoDB = new mongodb.Db(that._config.databaseName, mongoServer, { w: 1 });
            mongoDB.open(function (err, db) {
                if (err || !db)
                    reject(err);
                else
                    resolve(db);
            });
        });
    };
    return Controller;
})();
exports.default = Controller;
