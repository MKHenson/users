"use strict";
var validator = require("validator");
var bcrypt = require("bcryptjs");
var recaptcha = require("recaptcha-async");
var winston = require("winston");
var comms_controller_1 = require("./controllers/comms-controller");
var socket_event_types_1 = require("./socket-event-types");
var session_1 = require("./session");
var bucket_manager_1 = require("./bucket-manager");
var mailer_1 = require("./mailer");
/*
* Describes what kind of privileges the user has
*/
(function (UserPrivileges) {
    UserPrivileges[UserPrivileges["SuperAdmin"] = 1] = "SuperAdmin";
    UserPrivileges[UserPrivileges["Admin"] = 2] = "Admin";
    UserPrivileges[UserPrivileges["Regular"] = 3] = "Regular";
})(exports.UserPrivileges || (exports.UserPrivileges = {}));
var UserPrivileges = exports.UserPrivileges;
/*
* Class that represents a user and its database entry
*/
var User = (function () {
    /**
    * Creates a new User instance
    * @param {IUserEntry} dbEntry The data object that represents the user in the DB
    */
    function User(dbEntry) {
        this.dbEntry = dbEntry;
    }
    /**
    * Generates an object that can be sent to clients.
    * @param {boolean} verbose If true, sensitive database data will be sent (things like passwords will still be obscured)
    * @returns {IUserEntry}
    */
    User.prototype.generateCleanedData = function (verbose) {
        if (verbose === void 0) { verbose = false; }
        if (!this.dbEntry.passwordTag)
            this.dbEntry.passwordTag = "";
        if (!this.dbEntry.sessionId)
            this.dbEntry.sessionId = "";
        if (verbose)
            return {
                _id: this.dbEntry._id,
                email: this.dbEntry.email,
                lastLoggedIn: this.dbEntry.lastLoggedIn,
                createdOn: this.dbEntry.createdOn,
                password: this.dbEntry.password,
                registerKey: this.dbEntry.registerKey,
                sessionId: this.dbEntry.sessionId,
                username: this.dbEntry.username,
                privileges: this.dbEntry.privileges,
                passwordTag: this.dbEntry.passwordTag,
                meta: this.dbEntry.meta
            };
        else
            return {
                _id: this.dbEntry._id,
                lastLoggedIn: this.dbEntry.lastLoggedIn,
                createdOn: this.dbEntry.createdOn,
                username: this.dbEntry.username,
                privileges: this.dbEntry.privileges
            };
    };
    /**
    * Generates the object to be stored in the database
    * @returns {IUserEntry}
    */
    User.prototype.generateDbEntry = function () {
        return {
            email: this.dbEntry.email,
            lastLoggedIn: Date.now(),
            createdOn: Date.now(),
            password: this.dbEntry.password,
            registerKey: (this.dbEntry.privileges == UserPrivileges.SuperAdmin ? "" : this.generateKey(10)),
            sessionId: this.dbEntry.sessionId,
            username: this.dbEntry.username,
            privileges: this.dbEntry.privileges,
            passwordTag: this.dbEntry.passwordTag,
            meta: this.dbEntry.meta
        };
    };
    /**
    * Creates a random string that is assigned to the dbEntry registration key
    * @param {number} length The length of the password
    * @returns {string}
    */
    User.prototype.generateKey = function (length) {
        if (length === void 0) { length = 10; }
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < length; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    };
    return User;
})();
exports.User = User;
/**
* Main class to use for managing users
*/
var UserManager = (function () {
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {IConfig} The config options of this manager
    */
    function UserManager(userCollection, sessionCollection, config) {
        this._userCollection = userCollection;
        this._config = config;
        UserManager._singleton = this;
        // Create the session manager
        this.sessionManager = new session_1.SessionManager(sessionCollection, {
            domain: config.sessionDomain,
            lifetime: config.sessionLifetime,
            path: config.sessionPath,
            persistent: config.sessionPersistent,
            secure: config.ssl
        });
        this.sessionManager.on("sessionRemoved", this.onSessionRemoved.bind(this));
    }
    /**
    * Called whenever a session is removed from the database
    * @returns {Promise<void>}
    */
    UserManager.prototype.onSessionRemoved = function (sessionId) {
        if (!sessionId || sessionId == "")
            return;
        this._userCollection.find({ sessionId: sessionId }).limit(1).next().then(function (useEntry) {
            if (useEntry) {
                // Send logged in event to socket
                var sEvent = { username: useEntry.username, eventType: socket_event_types_1.EventType.Logout, error: undefined };
                comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent).then(function () {
                    winston.info("User '" + useEntry.username + "' has logged out", { process: process.pid });
                });
            }
        });
    };
    /**
    * Initializes the API
    * @returns {Promise<void>}
    */
    UserManager.prototype.initialize = function () {
        var that = this;
        var config = this._config;
        if (that._config.google.bucket && that._config.google.keyFile) {
            that._mailer = new mailer_1.Mailer(that._config.debugMode);
            that._mailer.initialize(that._config.google.keyFile, that._config.google.mail.apiEmail);
        }
        return new Promise(function (resolve, reject) {
            // Clear all existing indices and then re-add them
            that._userCollection.dropIndexes().then(function () {
                // Make sure the user collection has an index to search the username field
                return that._userCollection.createIndex({ username: "text", email: "text" });
            }).then(function () {
                // See if we have an admin user
                return that.getUser(config.adminUser.username);
            }).then(function (user) {
                // No admin user exists, so lets try to create one
                if (!user)
                    return that.createUser(config.adminUser.username, config.adminUser.email, config.adminUser.password, (config.ssl ? "https://" : "http://") + config.host, UserPrivileges.SuperAdmin, {}, true);
                else
                    // Admin user already exists
                    return user;
            }).then(function (newUser) {
                resolve();
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Attempts to register a new user
    * @param {string} username The username of the user
    * @param {string} pass The users secret password
    * @param {string} email The users email address
    * @param {string} captcha The captcha value the user guessed
    * @param {string} captchaChallenge The captcha challenge
    * @param {any} meta Any optional data associated with this user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<User>}
    */
    UserManager.prototype.register = function (username, pass, email, captcha, captchaChallenge, meta, request, response) {
        if (username === void 0) { username = ""; }
        if (pass === void 0) { pass = ""; }
        if (email === void 0) { email = ""; }
        if (captcha === void 0) { captcha = ""; }
        if (captchaChallenge === void 0) { captchaChallenge = ""; }
        if (meta === void 0) { meta = {}; }
        var that = this;
        var origin = encodeURIComponent(request.headers["origin"] || request.headers["referer"]);
        return new Promise(function (resolve, reject) {
            // First check if user exists, make sure the details supplied are ok, then create the new user
            that.getUser(username, email).then(function (user) {
                // If we already a user then error out
                if (user)
                    throw new Error("That username or email is already in use; please choose another or login.");
                // Validate other data
                if (!pass || pass == "")
                    throw new Error("Password cannot be null or empty");
                if (!email || email == "")
                    throw new Error("Email cannot be null or empty");
                if (!validator.isEmail(email))
                    throw new Error("Please use a valid email address");
                if (request && (!captcha || captcha == ""))
                    throw new Error("Captcha cannot be null or empty");
                if (request && (!captchaChallenge || captchaChallenge == ""))
                    throw new Error("Captcha challenge cannot be null or empty");
                // Check captcha details
                return new Promise(function (resolve, reject) {
                    // Create the captcha checker
                    var remoteIP = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
                    var privatekey = that._config.captchaPrivateKey;
                    var captchaChecker = new recaptcha.reCaptcha();
                    var newUser = null;
                    captchaChecker.on("data", function (captchaResult) {
                        if (!captchaResult.is_valid)
                            return reject(new Error("Your captcha code seems to be wrong. Please try another."));
                        that.createUser(username, email, pass, origin, UserPrivileges.Regular, meta).then(function (user) {
                            newUser = user;
                            return resolve(newUser);
                        }).catch(function (err) {
                            return reject(err);
                        });
                    });
                    // Check for valid captcha
                    captchaChecker.checkAnswer(privatekey, remoteIP, captchaChallenge, captcha);
                });
            }).then(function (user) {
                return resolve(user);
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Creates the link to send to the user for activation
    * @param {string} user The user we are activating
    * @param {string} origin The origin of where the activation link came from
    * @returns {string}
    */
    UserManager.prototype.createActivationLink = function (user, origin) {
        return "" + (this._config.ssl ? "https://" : "http://") + this._config.host + ":" + (this._config.ssl ? this._config.portHTTPS : this._config.portHTTP) + this._config.apiPrefix + "activate-account?key=" + user.dbEntry.registerKey + "&user=" + user.dbEntry.username + "&origin=" + origin;
    };
    /**
    * Creates the link to send to the user for password reset
    * @param {string} username The username of the user
     * @param {string} origin The origin of where the activation link came from
    * @returns {string}
    */
    UserManager.prototype.createResetLink = function (user, origin) {
        return this._config.passwordResetURL + "?key=" + user.dbEntry.passwordTag + "&user=" + user.dbEntry.username + "&origin=" + origin;
    };
    /**
    * Approves a user's activation code so they can login without email validation
    * @param {string} username The username or email of the user
    * @returns {Promise<void>}
    */
    UserManager.prototype.approveActivation = function (username) {
        var that = this;
        // Get the user
        return that.getUser(username).then(function (user) {
            if (!user)
                return Promise.reject(new Error("No user exists with the specified details"));
            return new Promise(function (resolve, reject) {
                // Clear the user's activation
                that._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { registerKey: "" } }).then(function (result) {
                    // Send activated event
                    var sEvent = { username: username, eventType: socket_event_types_1.EventType.Activated, error: undefined };
                    return comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent);
                }).then(function () {
                    winston.info("User '" + username + "' has been activated", { process: process.pid });
                    return resolve();
                }).catch(function (error) {
                    return reject(error);
                });
            });
        });
    };
    /**
    * Attempts to send the an email to the admin user
    * @param {string} message The message body
    * @param {string} name The name of the sender
    * @param {string} from The email of the sender
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.sendAdminEmail = function (message, name, from) {
        var that = this;
        return new Promise(function (resolve, reject) {
            if (!that._mailer)
                reject(new Error("No email account has been setup"));
            that._mailer.sendMail(that._config.adminUser.email, that._config.google.mail.from, "Message from " + (name ? name : "a user"), message + "<br /><br />Email: " + (from ? from : "")).then(function () {
                return resolve(true);
            }).catch(function (err) {
                return reject(new Error("Could not send email to user: " + err.message));
            });
        });
    };
    /**
    * Attempts to resend the activation link
    * @param {string} username The username of the user
    * @param {string} origin The origin of where the request came from (this is emailed to the user)
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.resendActivation = function (username, origin) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Get the user
            that.getUser(username).then(function (user) {
                if (!user)
                    throw new Error("No user exists with the specified details");
                if (user.dbEntry.registerKey == "")
                    throw new Error("Account has already been activated");
                var newKey = user.generateKey();
                user.dbEntry.registerKey = newKey;
                // Update the collection with a new key
                that._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { registerKey: newKey } }).then(function (result) {
                    // Send a message to the user to say they are registered but need to activate their account
                    var message = "Thank you for registering with Webinate!\n\t\t\t\t\tTo activate your account please click the link below:\n\n\t\t\t\t\t" + that.createActivationLink(user, origin) + "\n\n\t\t\t\t\tThanks\n\t\t\t\t\tThe Webinate Team";
                    // If no mailer is setup
                    if (!that._mailer)
                        reject(new Error("No email account has been setup"));
                    // Send mail using the mailer
                    that._mailer.sendMail(user.dbEntry.email, that._config.google.mail.from, "Activate your account", message).then(function () {
                        return resolve(true);
                    }).catch(function (err) {
                        reject(new Error("Could not send email to user: " + err.message));
                    });
                }).catch(function (error) {
                    return reject(error);
                });
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Sends the user an email with instructions on how to reset their password
    * @param {string} username The username of the user
    * @param {string} origin The site where the request came from
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.requestPasswordReset = function (username, origin) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Get the user
            that.getUser(username).then(function (user) {
                if (!user)
                    throw new Error("No user exists with the specified details");
                var newKey = user.generateKey();
                // Password token
                user.dbEntry.passwordTag = newKey;
                // Update the collection with a new key
                that._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { passwordTag: newKey } }).then(function (result) {
                    // Send a message to the user to say they are registered but need to activate their account
                    var message = "A request has been made to reset your password.\n\t\t\t\t\tTo change your password please click the link below:\n\n\t\t\t\t\t" + that.createResetLink(user, origin) + "\n\n\t\t\t\t\tThanks\n\t\t\t\t\tThe Webinate Team";
                    // If no mailer is setup
                    if (!that._mailer)
                        reject(new Error("No email account has been setup"));
                    // Send mail using the mailer
                    that._mailer.sendMail(user.dbEntry.email, that._config.google.mail.from, "Reset Password", message).then(function () {
                        return resolve(true);
                    }).catch(function (err) {
                        reject(new Error("Could not send email to user: " + err.message));
                    });
                }).catch(function (error) {
                    return reject(error);
                });
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Creates a hashed password
    * @param {string} pass The password to hash
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.hashPassword = function (pass) {
        return new Promise(function (resolve, reject) {
            bcrypt.hash(pass, 8, function (err, encrypted) {
                if (err)
                    return reject(err);
                else
                    return resolve(encrypted);
            });
        });
    };
    /**
    * Compares a password to the stored hash in the database
    * @param {string} pass The password to test
    * @param {string} hash The hash stored in the DB
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.comparePassword = function (pass, hash) {
        return new Promise(function (resolve, reject) {
            bcrypt.compare(pass, hash, function (err, same) {
                if (err)
                    return reject(err);
                else
                    return resolve(same);
            });
        });
    };
    /**
    * Attempts to reset a user's password.
    * @param {string} username The username of the user
    * @param {string} code The password code
    * @param {string} newPassword The new password
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.resetPassword = function (username, code, newPassword) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var user;
            // Get the user
            that.getUser(username).then(function (selectedUser) {
                user = selectedUser;
                // No user - so invalid
                if (!user)
                    return Promise.reject(new Error("No user exists with those credentials"));
                // If key is the same
                if (user.dbEntry.passwordTag != code)
                    return Promise.reject(new Error("Password codes do not match. Please try resetting your password again"));
                // Make sure password is valid
                if (newPassword === undefined || newPassword == "" || validator.blacklist(newPassword, "@\'\"{}") != newPassword)
                    return Promise.reject(new Error("Please enter a valid password"));
                return that.hashPassword(newPassword);
            }).then(function (hashed) {
                // Update the key to be blank
                return that._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { passwordTag: "", password: hashed } });
            }).then(function (result) {
                // All done :)
                resolve(true);
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Checks the users activation code to see if its valid
    * @param {string} username The username of the user
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.checkActivation = function (username, code) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Get the user
            that.getUser(username).then(function (user) {
                // No user - so invalid
                if (!user)
                    return reject(new Error("No user exists with those credentials"));
                // If key is already blank - then its good to go
                if (user.dbEntry.registerKey == "")
                    return resolve(true);
                // Check key
                if (user.dbEntry.registerKey != code)
                    return reject(new Error("Activation key is not valid. Please try send another."));
                // Update the key to be blank
                that._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { registerKey: "" } }).then(function (result) {
                    // Send activated event
                    var sEvent = { username: username, eventType: socket_event_types_1.EventType.Activated, error: undefined };
                    return comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent);
                }).then(function () {
                    winston.info("User '" + username + "' has been activated", { process: process.pid });
                    return resolve(true);
                }).catch(function (err) {
                    return reject(err);
                });
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Creates the script tag for the Google captcha API
    * @param {string}
    */
    UserManager.prototype.getCaptchaHTML = function () {
        var captchaChecker = new recaptcha.reCaptcha();
        return captchaChecker.getCaptchaHtml(this._config.captchaPublicKey, "", this._config.ssl);
    };
    /**
    * Checks to see if a user is logged in
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @param {Promise<User>} Gets the user or null if the user is not logged in
    */
    UserManager.prototype.loggedIn = function (request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // If no request or response, then assume its an admin user
            that.sessionManager.getSession(request, response).then(function (session) {
                if (!session)
                    return resolve(null);
                return that._userCollection.find({ sessionId: session.sessionId }).limit(1).next();
            }).then(function (useEntry) {
                if (!useEntry)
                    return resolve(null);
                else
                    return resolve(new User(useEntry));
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Attempts to log the user out
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.logOut = function (request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.sessionManager.clearSession(null, request, response).then(function (cleared) {
                resolve(cleared);
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Creates a new user
    * @param {string} user The unique username
    * @param {string} email The unique email
    * @param {string} password The password for the user
    * @param {string} origin The origin of where the request came from (this is emailed to the user)
    * @param {UserPrivileges} privilege The type of privileges the user has. Defaults to regular
    * @param {any} meta Any optional data associated with this user
    * @param {boolean} allowAdmin Should this be allowed to create a super user
    * @returns {Promise<User>}
    */
    UserManager.prototype.createUser = function (user, email, password, origin, privilege, meta, allowAdmin) {
        if (privilege === void 0) { privilege = UserPrivileges.Regular; }
        if (meta === void 0) { meta = {}; }
        if (allowAdmin === void 0) { allowAdmin = false; }
        var that = this;
        return new Promise(function (resolve, reject) {
            // Basic checks
            if (!user || validator.trim(user) == "")
                return reject(new Error("Username cannot be empty"));
            if (!validator.isAlphanumeric(user))
                return reject(new Error("Username must be alphanumeric"));
            if (!email || validator.trim(email) == "")
                return reject(new Error("Email cannot be empty"));
            if (!validator.isEmail(email))
                return reject(new Error("Email must be valid"));
            if (!password || validator.trim(password) == "")
                return reject(new Error("Password cannot be empty"));
            if (privilege > 3)
                return reject(new Error("Privilege type is unrecognised"));
            if (privilege == UserPrivileges.SuperAdmin && allowAdmin == false)
                return reject(new Error("You cannot create a super user"));
            var hashedPsw;
            var newUser;
            // Check if the user already exists
            that.hashPassword(password).then(function (hashedPassword) {
                hashedPsw = hashedPassword;
                return that.getUser(user, email);
            }).then(function (existingUser) {
                if (existingUser)
                    return Promise.reject(new Error("A user with that name or email already exists"));
                // Create the user
                newUser = new User({
                    username: user,
                    password: hashedPsw,
                    email: email,
                    privileges: privilege,
                    passwordTag: "",
                    meta: meta
                });
                // Update the database
                return that._userCollection.insertOne(newUser.generateDbEntry());
            }).then(function (insertResult) {
                // Assing the ID and pass the user on
                newUser.dbEntry = insertResult.ops[0];
                // Send a message to the user to say they are registered but need to activate their account
                var message = "Thank you for registering with Webinate!\n                To activate your account please click the link below:\n\n                " + that.createActivationLink(newUser, origin) + "\n\n                Thanks\n                The Webinate Team";
                // If no mailer is setup
                if (!that._mailer)
                    return Promise.reject(new Error("No email account has been setup"));
                // Send mail using the mailer
                return that._mailer.sendMail(newUser.dbEntry.email, that._config.google.mail.from, "Activate your account", message);
            }).then(function () {
                // All users have default stats created for them
                return bucket_manager_1.BucketManager.get.createUserStats(newUser.dbEntry.username);
            }).then(function () {
                // All users have a bucket created for them
                return bucket_manager_1.BucketManager.get.createBucket(newUser.dbEntry.username + "-bucket", newUser.dbEntry.username);
            }).then(function () {
                return resolve(newUser);
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Deletes a user from the database
    * @param {string} user The unique username or email of the user to remove
    * @returns {Promise<void>}
    */
    UserManager.prototype.removeUser = function (user) {
        var that = this;
        var username = "";
        return new Promise(function (resolve, reject) {
            var existingUser;
            that.getUser(user).then(function (user) {
                existingUser = user;
                if (!user)
                    return Promise.reject(new Error("Could not find any users with those credentials"));
                if (user.dbEntry.privileges == UserPrivileges.SuperAdmin)
                    return Promise.reject(new Error("You cannot remove a super user"));
                username = user.dbEntry.username;
                return bucket_manager_1.BucketManager.get.removeUser(user.dbEntry.username);
            }).then(function (numDeleted) {
                return that._userCollection.deleteOne({ _id: existingUser.dbEntry._id });
            }).then(function (result) {
                if (result.result.n == 0)
                    return reject(new Error("Could not remove the user from the database"));
                // Send event to sockets
                var sEvent = { username: username, eventType: socket_event_types_1.EventType.Removed, error: undefined };
                comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent).then(function () {
                    winston.info("User '" + username + "' has been removed", { process: process.pid });
                });
                return resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Gets a user by a username or email
    * @param {string} user The username or email of the user to get
    * @param {string} email [Optional] Do a check if the email exists as well
    * @returns {Promise<User>} Resolves with either a valid user or null if none exists
    */
    UserManager.prototype.getUser = function (user, email) {
        var that = this;
        email = email != undefined ? email : user;
        return new Promise(function (resolve, reject) {
            // Validate user string
            user = validator.trim(user);
            if (!user || user == "")
                return reject(new Error("Please enter a valid username"));
            if (!validator.isAlphanumeric(user) && !validator.isEmail(user))
                return reject(new Error("Please only use alpha numeric characters for your username"));
            var target = [{ email: email }, { username: user }];
            // Search the collection for the user
            that._userCollection.find({ $or: target }).limit(1).next().then(function (userEntry) {
                if (!userEntry)
                    return resolve(null);
                else
                    return resolve(new User(userEntry));
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Attempts to log a user in
    * @param {string} username The username or email of the user
    * @param {string} pass The password of the user
    * @param {boolean} rememberMe True if the cookie persistence is required
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<User>}
    */
    UserManager.prototype.logIn = function (username, pass, rememberMe, request, response) {
        if (username === void 0) { username = ""; }
        if (pass === void 0) { pass = ""; }
        if (rememberMe === void 0) { rememberMe = true; }
        var that = this;
        return new Promise(function (resolve, reject) {
            var user;
            that.logOut(request, response).then(function (success) {
                return that.getUser(username);
            }).then(function (selectedUser) {
                user = selectedUser;
                // If no user - then reject
                if (!user)
                    return Promise.reject(new Error("The username or password is incorrect."));
                // Validate password
                pass = validator.trim(pass);
                if (!pass || pass == "")
                    return Promise.reject(new Error("Please enter a valid password"));
                // Check if the registration key has been removed yet
                if (user.dbEntry.registerKey != "")
                    return Promise.reject(new Error("Please authorise your account by clicking on the link that was sent to your email"));
                return that.comparePassword(pass, user.dbEntry.password);
            }).then(function (same) {
                // Check the password
                if (!same)
                    return Promise.reject(new Error("The username or password is incorrect."));
                // Set the user last login time
                user.dbEntry.lastLoggedIn = Date.now();
                // Update the collection
                return that._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { lastLoggedIn: user.dbEntry.lastLoggedIn } });
            }).then(function (result) {
                if (result.matchedCount === 0)
                    return Promise.reject(new Error("Could not find the user in the database, please make sure its setup correctly"));
                if (!rememberMe)
                    return resolve(user);
                that.sessionManager.createSession(request, response).then(function (session) {
                    // Search the collection for the user
                    if (session instanceof session_1.Session)
                        return that._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { sessionId: session.sessionId } });
                }).then(function (result) {
                    if (result.matchedCount === 0)
                        return Promise.reject(new Error("Could not find the user in the database, please make sure its setup correctly"));
                    // Send logged in event to socket
                    var sEvent = { username: username, eventType: socket_event_types_1.EventType.Login, error: undefined };
                    return comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent);
                }).then(function () {
                    return resolve(user);
                }).catch(function (err) {
                    return reject(err);
                });
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Removes a user by his email or username
    * @param {string} username The username or email of the user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>} True if the user was in the DB or false if they were not
    */
    UserManager.prototype.remove = function (username, request, response) {
        if (username === void 0) { username = ""; }
        var that = this;
        return that.getUser(username).then(function (user) {
            return new Promise(function (resolve, reject) {
                // There was no user
                if (!user)
                    return resolve(false);
                // Remove the user from the DB
                that._userCollection.deleteOne({ _id: user.dbEntry._id }).then(function (result) {
                    if (result.result.n === 0)
                        return resolve(false);
                    else
                        return resolve(true);
                }).catch(function (error) {
                    return reject(error);
                });
            });
        });
    };
    /**
    * Sets the meta data associated with the user
    * @param {IUserEntry} user The user
    * @param {any} data The meta data object to set
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>} Returns the data set
    */
    UserManager.prototype.setMeta = function (user, data, request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // There was no user
            if (!user)
                return reject(false);
            // Remove the user from the DB
            that._userCollection.updateOne({ _id: user._id }, { $set: { meta: (data ? data : {}) } }).then(function (result) {
                return resolve(data);
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Sets a meta value on the user. This updates the user's meta value by name
    * @param {IUserEntry} user The user
    * @param {any} name The name of the meta to set
    * @param {any} data The value of the meta to set
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<any>} Returns the value of the set
    */
    UserManager.prototype.setMetaVal = function (user, name, val, request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // There was no user
            if (!user)
                return resolve(false);
            var datum = "meta." + name;
            var updateToken = { $set: {} };
            updateToken.$set[datum] = val;
            // Remove the user from the DB
            that._userCollection.updateOne({ _id: user._id }, updateToken).then(function (result) {
                return resolve(val);
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Gets the value of user's meta by name
    * @param {IUserEntry} user The user
    * @param {any} name The name of the meta to get
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<any>} The value to get
    */
    UserManager.prototype.getMetaVal = function (user, name, request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // There was no user
            if (!user)
                return resolve(false);
            // Remove the user from the DB
            that._userCollection.find({ _id: user._id }).project({ _id: 0, meta: 1 }).limit(1).next().then(function (result) {
                return resolve(result.meta[name]);
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Gets the meta data of a user
    * @param {IUserEntry} user The user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<any>} The value to get
    */
    UserManager.prototype.getMetaData = function (user, request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // There was no user
            if (!user)
                return resolve(false);
            // Remove the user from the DB
            that._userCollection.find({ _id: user._id }).project({ _id: 0, meta: 1 }).limit(1).next().then(function (result) {
                return resolve(result.meta);
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Gets the total number of users
    * @param {RegExp} searchPhrases Search phrases
    * @returns {Promise<number>}
    */
    UserManager.prototype.numUsers = function (searchPhrases) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var findToken = { $or: [{ username: searchPhrases }, { email: searchPhrases }] };
            that._userCollection.count(findToken, function (error, result) {
                if (error)
                    return reject(error);
                resolve(result);
            });
        });
    };
    /**
    * Prints user objects from the database
    * @param {number} limit The number of users to fetch
    * @param {number} startIndex The starting index from where we are fetching users from
    * @param {RegExp} searchPhrases Search phrases
    * @returns {Promise<Array<User>>}
    */
    UserManager.prototype.getUsers = function (startIndex, limit, searchPhrases) {
        if (startIndex === void 0) { startIndex = 0; }
        if (limit === void 0) { limit = 0; }
        var that = this;
        return new Promise(function (resolve, reject) {
            var findToken = { $or: [{ username: searchPhrases }, { email: searchPhrases }] };
            that._userCollection.find(findToken).skip(startIndex).limit(limit).toArray().then(function (results) {
                var users = [];
                for (var i = 0, l = results.length; i < l; i++)
                    users.push(new User(results[i]));
                resolve(users);
            }).catch(function (error) {
                return reject(error);
            });
        });
    };
    /**
    * Creates the user manager singlton
    */
    UserManager.create = function (users, sessions, config) {
        return new UserManager(users, sessions, config);
    };
    Object.defineProperty(UserManager, "get", {
        /**
        * Gets the user manager singlton
        */
        get: function () {
            return UserManager._singleton;
        },
        enumerable: true,
        configurable: true
    });
    return UserManager;
})();
exports.UserManager = UserManager;
