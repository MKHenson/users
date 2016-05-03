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
class User {
    /**
    * Creates a new User instance
    * @param {IUserEntry} dbEntry The data object that represents the user in the DB
    */
    constructor(dbEntry) {
        this.dbEntry = dbEntry;
    }
    /**
    * Generates an object that can be sent to clients.
    * @param {boolean} verbose If true, sensitive database data will be sent (things like passwords will still be obscured)
    * @returns {IUserEntry}
    */
    generateCleanedData(verbose = false) {
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
    }
    /**
    * Generates the object to be stored in the database
    * @returns {IUserEntry}
    */
    generateDbEntry() {
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
    }
    /**
    * Creates a random string that is assigned to the dbEntry registration key
    * @param {number} length The length of the password
    * @returns {string}
    */
    generateKey(length = 10) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < length; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
}
exports.User = User;
/**
* Main class to use for managing users
*/
class UserManager {
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {IConfig} The config options of this manager
    */
    constructor(userCollection, sessionCollection, config) {
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
    onSessionRemoved(sessionId) {
        return __awaiter(this, void 0, Promise, function* () {
            if (!sessionId || sessionId == "")
                return;
            var useEntry = yield this._userCollection.find({ sessionId: sessionId }).limit(1).next();
            if (useEntry) {
                // Send logged in event to socket
                var sEvent = { username: useEntry.username, eventType: socket_event_types_1.EventType.Logout, error: undefined };
                yield comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent);
                winston.info(`User '${useEntry.username}' has logged out`, { process: process.pid });
            }
            return;
        });
    }
    /**
    * Initializes the API
    * @returns {Promise<void>}
    */
    initialize() {
        return __awaiter(this, void 0, Promise, function* () {
            var that = this;
            var config = this._config;
            if (config.google.bucket && config.google.keyFile) {
                this._mailer = new mailer_1.Mailer(config.debugMode);
                this._mailer.initialize(config.google.keyFile, config.google.mail.apiEmail);
            }
            // Clear all existing indices and then re-add them
            yield this._userCollection.dropIndexes();
            // Make sure the user collection has an index to search the username field
            yield this._userCollection.createIndex({ username: "text", email: "text" });
            // See if we have an admin user
            var user = yield this.getUser(config.adminUser.username);
            // If no admin user exists, so lets try to create one
            if (!user)
                user = yield this.createUser(config.adminUser.username, config.adminUser.email, config.adminUser.password, (config.ssl ? "https://" : "http://") + config.host, UserPrivileges.SuperAdmin, {}, true);
            return;
        });
    }
    /**
    * Checks if a Google captcha sent from a user is valid
    * @param {string} captchaChallenge The captcha challenge
    * @param {string} captcha The captcha value the user guessed
    * @param {http.ServerRequest} request
    * @returns {Promise<boolean>}
    */
    checkCaptcha(captchaChallenge, captcha, request) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Create the captcha checker
            var remoteIP = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
            var privatekey = that._config.captchaPrivateKey;
            var captchaChecker = new recaptcha.reCaptcha();
            captchaChecker.on("data", function (captchaResult) {
                if (!captchaResult.is_valid)
                    return reject(new Error("Your captcha code seems to be wrong. Please try another."));
                resolve(true);
            });
            // Check for valid captcha
            captchaChecker.checkAnswer(privatekey, remoteIP, captchaChallenge, captcha);
        });
    }
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
    register(username = "", pass = "", email = "", captcha = "", captchaChallenge = "", meta = {}, request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var origin = encodeURIComponent(request.headers["origin"] || request.headers["referer"]);
            // First check if user exists, make sure the details supplied are ok, then create the new user
            var user = yield this.getUser(username, email);
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
            // Check the captcha
            yield this.checkCaptcha(captchaChallenge, captcha, request);
            user = yield this.createUser(username, email, pass, origin, UserPrivileges.Regular, meta);
            return user;
        });
    }
    /**
    * Creates the link to send to the user for activation
    * @param {string} user The user we are activating
    * @param {string} origin The origin of where the activation link came from
    * @returns {string}
    */
    createActivationLink(user, origin) {
        return `${(this._config.ssl ? "https://" : "http://")}${this._config.host}:${(this._config.ssl ? this._config.portHTTPS : this._config.portHTTP)}${this._config.apiPrefix}activate-account?key=${user.dbEntry.registerKey}&user=${user.dbEntry.username}&origin=${origin}`;
    }
    /**
    * Creates the link to send to the user for password reset
    * @param {string} username The username of the user
     * @param {string} origin The origin of where the activation link came from
    * @returns {string}
    */
    createResetLink(user, origin) {
        return `${this._config.passwordResetURL}?key=${user.dbEntry.passwordTag}&user=${user.dbEntry.username}&origin=${origin}`;
    }
    /**
    * Approves a user's activation code so they can login without email validation
    * @param {string} username The username or email of the user
    * @returns {Promise<void>}
    */
    approveActivation(username) {
        return __awaiter(this, void 0, Promise, function* () {
            // Get the user
            var user = yield this.getUser(username);
            if (!user)
                throw new Error("No user exists with the specified details");
            // Clear the user's activation
            var result = yield this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { registerKey: "" } });
            // Send activated event
            var sEvent = { username: username, eventType: socket_event_types_1.EventType.Activated, error: undefined };
            yield comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent);
            winston.info(`User '${username}' has been activated`, { process: process.pid });
            return;
        });
    }
    /**
    * Attempts to send the an email to the admin user
    * @param {string} message The message body
    * @param {string} name The name of the sender
    * @param {string} from The email of the sender
    * @returns {Promise<boolean>}
    */
    sendAdminEmail(message, name, from) {
        return __awaiter(this, void 0, Promise, function* () {
            if (!this._mailer)
                throw new Error(`No email account has been setup`);
            try {
                yield this._mailer.sendMail(this._config.adminUser.email, this._config.google.mail.from, `Message from ${(name ? name : "a user")}`, message + "<br /><br />Email: " + (from ? from : ""));
            }
            catch (err) {
                new Error(`Could not send email to user: ${err.message}`);
            }
            return true;
        });
    }
    /**
    * Attempts to resend the activation link
    * @param {string} username The username of the user
    * @param {string} origin The origin of where the request came from (this is emailed to the user)
    * @returns {Promise<boolean>}
    */
    resendActivation(username, origin) {
        return __awaiter(this, void 0, Promise, function* () {
            // Get the user
            var user = yield this.getUser(username);
            if (!user)
                throw new Error("No user exists with the specified details");
            if (user.dbEntry.registerKey == "")
                throw new Error("Account has already been activated");
            var newKey = user.generateKey();
            user.dbEntry.registerKey = newKey;
            // Update the collection with a new key
            var result = yield this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { registerKey: newKey } });
            // Send a message to the user to say they are registered but need to activate their account
            var message = "Thank you for registering with Webinate!\nTo activate your account please click the link below:" +
                this.createActivationLink(user, origin) +
                "Thanks\n\n" +
                "The Webinate Team";
            // If no mailer is setup
            if (!this._mailer)
                throw new Error(`No email account has been setup`);
            try {
                // Send mail using the mailer
                yield this._mailer.sendMail(user.dbEntry.email, this._config.google.mail.from, "Activate your account", message);
            }
            catch (err) {
                new Error(`Could not send email to user: ${err.message}`);
            }
            return true;
        });
    }
    /**
    * Sends the user an email with instructions on how to reset their password
    * @param {string} username The username of the user
    * @param {string} origin The site where the request came from
    * @returns {Promise<boolean>}
    */
    requestPasswordReset(username, origin) {
        return __awaiter(this, void 0, Promise, function* () {
            // Get the user
            var user = yield this.getUser(username);
            if (!user)
                throw new Error("No user exists with the specified details");
            var newKey = user.generateKey();
            // Password token
            user.dbEntry.passwordTag = newKey;
            // Update the collection with a new key
            var result = yield this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { passwordTag: newKey } });
            // Send a message to the user to say they are registered but need to activate their account
            var message = "A request has been made to reset your password. To change your password please click the link below:\n\n" +
                this.createResetLink(user, origin) +
                "Thanks\n\n" +
                "The Webinate Team";
            // If no mailer is setup
            if (!this._mailer)
                throw new Error(`No email account has been setup`);
            // Send mail using the mailer
            try {
                yield this._mailer.sendMail(user.dbEntry.email, this._config.google.mail.from, "Reset Password", message);
            }
            catch (err) {
                throw new Error(`Could not send email to user: ${err.message}`);
            }
            return true;
        });
    }
    /**
    * Creates a hashed password
    * @param {string} pass The password to hash
    * @returns {Promise<boolean>}
    */
    hashPassword(pass) {
        return new Promise(function (resolve, reject) {
            bcrypt.hash(pass, 8, function (err, encrypted) {
                if (err)
                    return reject(err);
                else
                    return resolve(encrypted);
            });
        });
    }
    /**
    * Compares a password to the stored hash in the database
    * @param {string} pass The password to test
    * @param {string} hash The hash stored in the DB
    * @returns {Promise<boolean>}
    */
    comparePassword(pass, hash) {
        return new Promise(function (resolve, reject) {
            bcrypt.compare(pass, hash, function (err, same) {
                if (err)
                    return reject(err);
                else
                    return resolve(same);
            });
        });
    }
    /**
    * Attempts to reset a user's password.
    * @param {string} username The username of the user
    * @param {string} code The password code
    * @param {string} newPassword The new password
    * @returns {Promise<boolean>}
    */
    resetPassword(username, code, newPassword) {
        return __awaiter(this, void 0, Promise, function* () {
            // Get the user
            var user = yield this.getUser(username);
            // No user - so invalid
            if (!user)
                throw new Error("No user exists with those credentials");
            // If key is the same
            if (user.dbEntry.passwordTag != code)
                throw new Error("Password codes do not match. Please try resetting your password again");
            // Make sure password is valid
            if (newPassword === undefined || newPassword == "" || validator.blacklist(newPassword, "@\'\"{}") != newPassword)
                throw new Error("Please enter a valid password");
            var hashed = yield this.hashPassword(newPassword);
            // Update the key to be blank
            var result = yield this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { passwordTag: "", password: hashed } });
            // All done :)
            return true;
        });
    }
    /**
    * Checks the users activation code to see if its valid
    * @param {string} username The username of the user
    * @returns {Promise<boolean>}
    */
    checkActivation(username, code) {
        return __awaiter(this, void 0, Promise, function* () {
            // Get the user
            var user = yield this.getUser(username);
            // No user - so invalid
            if (!user)
                throw new Error("No user exists with those credentials");
            // If key is already blank - then its good to go
            if (user.dbEntry.registerKey == "")
                return true;
            // Check key
            if (user.dbEntry.registerKey != code)
                throw new Error("Activation key is not valid. Please try send another.");
            // Update the key to be blank
            yield this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { registerKey: "" } });
            // Send activated event
            var sEvent = { username: username, eventType: socket_event_types_1.EventType.Activated, error: undefined };
            yield comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent);
            winston.info(`User '${username}' has been activated`, { process: process.pid });
            return true;
        });
    }
    /**
    * Creates the script tag for the Google captcha API
    * @param {string}
    */
    getCaptchaHTML() {
        var captchaChecker = new recaptcha.reCaptcha();
        return captchaChecker.getCaptchaHtml(this._config.captchaPublicKey, "", this._config.ssl);
    }
    /**
    * Checks to see if a user is logged in
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @param {Promise<User>} Gets the user or null if the user is not logged in
    */
    loggedIn(request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            // If no request or response, then assume its an admin user
            var session = yield this.sessionManager.getSession(request, response);
            if (!session)
                return null;
            var useEntry = yield this._userCollection.find({ sessionId: session.sessionId }).limit(1).next();
            if (!useEntry)
                return null;
            else
                return new User(useEntry);
        });
    }
    /**
    * Attempts to log the user out
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>}
    */
    logOut(request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var sessionCleaered = yield this.sessionManager.clearSession(null, request, response);
            return sessionCleaered;
        });
    }
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
    createUser(user, email, password, origin, privilege = UserPrivileges.Regular, meta = {}, allowAdmin = false) {
        return __awaiter(this, void 0, Promise, function* () {
            // Basic checks
            if (!user || validator.trim(user) == "")
                throw new Error("Username cannot be empty");
            if (!validator.isAlphanumeric(user))
                throw new Error("Username must be alphanumeric");
            if (!email || validator.trim(email) == "")
                throw new Error("Email cannot be empty");
            if (!validator.isEmail(email))
                throw new Error("Email must be valid");
            if (!password || validator.trim(password) == "")
                throw new Error("Password cannot be empty");
            if (privilege > 3)
                throw new Error("Privilege type is unrecognised");
            if (privilege == UserPrivileges.SuperAdmin && allowAdmin == false)
                throw new Error("You cannot create a super user");
            // Check if the user already exists
            var hashedPsw = yield this.hashPassword(password);
            var existingUser = yield this.getUser(user, email);
            if (existingUser)
                throw new Error(`A user with that name or email already exists`);
            // Create the user
            var newUser = new User({
                username: user,
                password: hashedPsw,
                email: email,
                privileges: privilege,
                passwordTag: "",
                meta: meta
            });
            // Update the database
            var insertResult = yield this._userCollection.insertOne(newUser.generateDbEntry());
            // Assing the ID and pass the user on
            newUser.dbEntry = insertResult.ops[0];
            // Send a message to the user to say they are registered but need to activate their account
            var message = "Thank you for registering with Webinate! To activate your account please click the link below: \n\n" +
                this.createActivationLink(newUser, origin) + "\n\n" +
                "Thanks\n" +
                "The Webinate Team";
            // If no mailer is setup
            if (!this._mailer)
                throw new Error(`No email account has been setup`);
            // Send mail using the mailer
            yield this._mailer.sendMail(newUser.dbEntry.email, this._config.google.mail.from, "Activate your account", message);
            // All users have default stats created for them
            yield bucket_manager_1.BucketManager.get.createUserStats(newUser.dbEntry.username);
            // All users have a bucket created for them
            yield bucket_manager_1.BucketManager.get.createBucket(newUser.dbEntry.username + "-bucket", newUser.dbEntry.username);
            return newUser;
        });
    }
    /**
    * Deletes a user from the database
    * @param {string} user The unique username or email of the user to remove
    * @returns {Promise<void>}
    */
    removeUser(user) {
        return __awaiter(this, void 0, Promise, function* () {
            var username = "";
            var userInstance = yield this.getUser(user);
            if (!user)
                throw new Error("Could not find any users with those credentials");
            if (userInstance.dbEntry.privileges == UserPrivileges.SuperAdmin)
                throw new Error("You cannot remove a super user");
            username = userInstance.dbEntry.username;
            var numDeleted = yield bucket_manager_1.BucketManager.get.removeUser(username);
            var result = yield this._userCollection.deleteOne({ _id: userInstance.dbEntry._id });
            if (result.deletedCount == 0)
                throw new Error("Could not remove the user from the database");
            // Send event to sockets
            var sEvent = { username: username, eventType: socket_event_types_1.EventType.Removed, error: undefined };
            comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent).then(function () {
                winston.info(`User '${username}' has been removed`, { process: process.pid });
            });
            return;
        });
    }
    /**
    * Gets a user by a username or email
    * @param {string} user The username or email of the user to get
    * @param {string} email [Optional] Do a check if the email exists as well
    * @returns {Promise<User>} Resolves with either a valid user or null if none exists
    */
    getUser(user, email) {
        return __awaiter(this, void 0, Promise, function* () {
            email = email != undefined ? email : user;
            // Validate user string
            user = validator.trim(user);
            if (!user || user == "")
                throw new Error("Please enter a valid username");
            if (!validator.isAlphanumeric(user) && !validator.isEmail(user))
                throw new Error("Please only use alpha numeric characters for your username");
            var target = [{ email: email }, { username: user }];
            // Search the collection for the user
            var userEntry = yield this._userCollection.find({ $or: target }).limit(1).next();
            if (!userEntry)
                return null;
            else
                return new User(userEntry);
        });
    }
    /**
    * Attempts to log a user in
    * @param {string} username The username or email of the user
    * @param {string} pass The password of the user
    * @param {boolean} rememberMe True if the cookie persistence is required
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<User>}
    */
    logIn(username = "", pass = "", rememberMe = true, request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var loggedOut = yield this.logOut(request, response);
            var user = yield this.getUser(username);
            // If no user - then reject
            if (!user)
                throw new Error("The username or password is incorrect.");
            // Validate password
            pass = validator.trim(pass);
            if (!pass || pass == "")
                throw new Error("Please enter a valid password");
            // Check if the registration key has been removed yet
            if (user.dbEntry.registerKey != "")
                throw new Error("Please authorise your account by clicking on the link that was sent to your email");
            var passworldValid = yield this.comparePassword(pass, user.dbEntry.password);
            if (!passworldValid)
                throw new Error("The username or password is incorrect.");
            // Set the user last login time
            user.dbEntry.lastLoggedIn = Date.now();
            // Update the collection
            var result = yield this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { lastLoggedIn: user.dbEntry.lastLoggedIn } });
            if (result.matchedCount === 0)
                throw new Error("Could not find the user in the database, please make sure its setup correctly");
            if (!rememberMe)
                return user;
            var session = yield this.sessionManager.createSession(request, response);
            result = yield this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { sessionId: session.sessionId } });
            if (result.matchedCount === 0)
                throw new Error("Could not find the user in the database, please make sure its setup correctly");
            // Send logged in event to socket
            var sEvent = { username: username, eventType: socket_event_types_1.EventType.Login, error: undefined };
            yield comms_controller_1.CommsController.singleton.broadcastEventToAll(sEvent);
            return user;
        });
    }
    /**
    * Removes a user by his email or username
    * @param {string} username The username or email of the user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>} True if the user was in the DB or false if they were not
    */
    remove(username = "", request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var user = yield this.getUser(username);
            // There was no user
            if (!user)
                return false;
            // Remove the user from the DB
            var result = yield this._userCollection.deleteOne({ _id: user.dbEntry._id });
            if (result.deletedCount === 0)
                return false;
            else
                return true;
        });
    }
    /**
    * Sets the meta data associated with the user
    * @param {IUserEntry} user The user
    * @param {any} data The meta data object to set
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean|any>} Returns the data set
    */
    setMeta(user, data, request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var that = this;
            // There was no user
            if (!user)
                return false;
            // Remove the user from the DB
            var result = yield that._userCollection.updateOne({ _id: user._id }, { $set: { meta: (data ? data : {}) } });
            return data;
        });
    }
    /**
    * Sets a meta value on the user. This updates the user's meta value by name
    * @param {IUserEntry} user The user
    * @param {any} name The name of the meta to set
    * @param {any} data The value of the meta to set
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean|any>} Returns the value of the set
    */
    setMetaVal(user, name, val, request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var that = this;
            // There was no user
            if (!user)
                return false;
            var datum = "meta." + name;
            var updateToken = { $set: {} };
            updateToken.$set[datum] = val;
            // Remove the user from the DB
            var result = yield that._userCollection.updateOne({ _id: user._id }, updateToken);
            return val;
        });
    }
    /**
    * Gets the value of user's meta by name
    * @param {IUserEntry} user The user
    * @param {any} name The name of the meta to get
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean|any>} The value to get
    */
    getMetaVal(user, name, request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var that = this;
            // There was no user
            if (!user)
                return false;
            // Remove the user from the DB
            var result = yield that._userCollection.find({ _id: user._id }).project({ _id: 0, meta: 1 }).limit(1).next();
            return result.meta[name];
        });
    }
    /**
    * Gets the meta data of a user
    * @param {IUserEntry} user The user
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean|any>} The value to get
    */
    getMetaData(user, request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var that = this;
            // There was no user
            if (!user)
                return false;
            // Remove the user from the DB
            var result = yield that._userCollection.find({ _id: user._id }).project({ _id: 0, meta: 1 }).limit(1).next();
            return result.meta;
        });
    }
    /**
    * Gets the total number of users
    * @param {RegExp} searchPhrases Search phrases
    * @returns {Promise<number>}
    */
    numUsers(searchPhrases) {
        return __awaiter(this, void 0, Promise, function* () {
            var that = this;
            var findToken = { $or: [{ username: searchPhrases }, { email: searchPhrases }] };
            var result = yield that._userCollection.count(findToken);
            return result;
        });
    }
    /**
    * Prints user objects from the database
    * @param {number} limit The number of users to fetch
    * @param {number} startIndex The starting index from where we are fetching users from
    * @param {RegExp} searchPhrases Search phrases
    * @returns {Promise<Array<User>>}
    */
    getUsers(startIndex = 0, limit = 0, searchPhrases) {
        return __awaiter(this, void 0, Promise, function* () {
            var findToken = { $or: [{ username: searchPhrases }, { email: searchPhrases }] };
            var results = yield this._userCollection.find(findToken).skip(startIndex).limit(limit).toArray();
            var users = [];
            for (var i = 0, l = results.length; i < l; i++)
                users.push(new User(results[i]));
            return users;
        });
    }
    /**
    * Creates the user manager singlton
    */
    static create(users, sessions, config) {
        return new UserManager(users, sessions, config);
    }
    /**
    * Gets the user manager singlton
    */
    static get get() {
        return UserManager._singleton;
    }
}
exports.UserManager = UserManager;
