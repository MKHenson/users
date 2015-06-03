var mongodb = require("mongodb");
var validator = require("validator");
var bcrypt = require("bcrypt-nodejs");
var recaptcha = require("recaptcha-async");
var nodemailer = require("nodemailer");
var def = require("./Definitions");
var Session_1 = require("./Session");
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
    * @param {boolean} showPrivate If true, sensitive database data will be sent (things like passwords will still be safe - but hashed)
    * @returns {IUserEntry}
    */
    User.prototype.generateCleanedData = function (showPrivate) {
        if (showPrivate === void 0) { showPrivate = false; }
        if (!this.dbEntry.passwordTag)
            this.dbEntry.passwordTag = "";
        if (!this.dbEntry.sessionId)
            this.dbEntry.sessionId = "";
        return {
            _id: (showPrivate ? this.dbEntry._id : new mongodb.ObjectID("000000000000000000000000")),
            email: this.dbEntry.email,
            lastLoggedIn: this.dbEntry.lastLoggedIn,
            password: showPrivate ? this.dbEntry.password : new Array(this.dbEntry.password.length).join("*"),
            registerKey: showPrivate ? this.dbEntry.registerKey : new Array(this.dbEntry.registerKey.length).join("*"),
            sessionId: showPrivate ? this.dbEntry.sessionId : new Array(this.dbEntry.sessionId.length).join("*"),
            username: this.dbEntry.username,
            privileges: this.dbEntry.privileges,
            passwordTag: (showPrivate ? this.dbEntry.passwordTag : new Array(this.dbEntry.passwordTag.length).join("*")),
            data: this.dbEntry.data
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
            password: this.dbEntry.password,
            registerKey: (this.dbEntry.privileges == def.UserPrivileges.SuperAdmin ? "" : this.generateKey(10)),
            sessionId: this.dbEntry.sessionId,
            username: this.dbEntry.username,
            privileges: this.dbEntry.privileges,
            passwordTag: this.dbEntry.passwordTag,
            data: this.dbEntry.data
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
        // Create the transport object which will be sending the emails
        if (config.emailService != "" && config.emailServiceUser != "" && config.emailServicePassword != "")
            this._transport = nodemailer.createTransport({
                service: config.emailService,
                auth: {
                    user: config.emailServiceUser,
                    pass: config.emailServicePassword
                }
            });
        // Create the session manager
        this.sessionManager = new Session_1.SessionManager(sessionCollection, {
            domain: config.sessionDomain,
            lifetime: config.sessionLifetime,
            path: config.sessionPath,
            persistent: config.sessionPersistent,
            secure: config.ssl
        });
    }
    /**
    * Initializes the API
    * @returns {Promise<void>}
    */
    UserManager.prototype.initialize = function () {
        var that = this;
        var config = this._config;
        return new Promise(function (resolve, reject) {
            // Make sure the user collection has an index to search the username field
            that._userCollection.ensureIndex({ username: "text", email: "text" }, function (error, indexName) {
                if (error)
                    return reject(error);
                that.getUser(config.adminUser.username).then(function (user) {
                    // Admin user already exists
                    if (!user)
                        return Promise.reject(new Error());
                    resolve();
                }).catch(function (error) {
                    // No admin user exists, so lets try to create one
                    that.createUser(config.adminUser.username, config.adminUser.email, config.adminUser.password, def.UserPrivileges.SuperAdmin).then(function (newUser) {
                        resolve();
                    }).catch(function (error) {
                        reject(error);
                    });
                });
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
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<User>}
    */
    UserManager.prototype.register = function (username, pass, email, captcha, captchaChallenge, request, response) {
        if (username === void 0) { username = ""; }
        if (pass === void 0) { pass = ""; }
        if (email === void 0) { email = ""; }
        if (captcha === void 0) { captcha = ""; }
        if (captchaChallenge === void 0) { captchaChallenge = ""; }
        var that = this;
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
                    captchaChecker.on("data", function (captchaResult) {
                        if (!captchaResult.is_valid)
                            throw new Error("Your captcha code seems to be wrong. Please try another.");
                        return resolve(that.createUser(username, email, pass));
                    });
                    // Check for valid captcha
                    captchaChecker.checkAnswer(privatekey, remoteIP, captchaChallenge, captcha);
                });
            }).then(function (user) {
                resolve(user);
            }).catch(function (error) {
                return Promise.reject(error);
            });
        });
    };
    /**
    * Creates the link to send to the user for activation
    * @param {string} username The username of the user
    * @returns {string}
    */
    UserManager.prototype.createActivationLink = function (user) {
        return "" + (this._config.ssl ? "https://" : "http://") + this._config.host + ":" + (this._config.ssl ? this._config.portHTTPS : this._config.portHTTP) + this._config.restURL + "/activate-account?key=" + user.dbEntry.registerKey + "&user=" + user.dbEntry.username;
    };
    /**
    * Creates the link to send to the user for password reset
    * @param {string} username The username of the user
    * @returns {string}
    */
    UserManager.prototype.createResetLink = function (user) {
        return this._config.passwordResetURL + "?key=" + user.dbEntry.passwordTag + "&user=" + user.dbEntry.username;
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
                that._userCollection.update({ _id: user.dbEntry._id }, { $set: { registerKey: "" } }, function (error, result) {
                    if (error)
                        return reject(error);
                    return resolve();
                });
            });
        });
    };
    /**
    * Attempts to resend the activation link
    * @param {string} username The username of the user
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.resendActivation = function (username) {
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
                that._userCollection.update({ _id: user.dbEntry._id }, { $set: { registerKey: newKey } }, function (error, result) {
                    if (error)
                        return reject(error);
                    // Send a message to the user to say they are registered but need to activate their account
                    var message = "Thank you for registering with Webinate!\n\t\t\t\t\tTo activate your account please click the link below:\n\n\t\t\t\t\t" + that.createActivationLink(user) + "\n\n\t\t\t\t\tThanks\n\t\t\t\t\tThe Webinate Team";
                    // Setup e-mail data with unicode symbols
                    var mailOptions = {
                        from: that._config.emailFrom,
                        to: user.dbEntry.email,
                        subject: "Activate your account",
                        text: message,
                        html: message.replace(/(?:\r\n|\r|\n)/g, '<br />')
                    };
                    that._transport.sendMail(mailOptions, function (error, info) {
                        if (error)
                            reject(new Error("Could not send email to user: " + error.message));
                        return resolve(true);
                    });
                });
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Sends the user an email with instructions on how to reset their password
    * @param {string} username The username of the user
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.requestPasswordReset = function (username) {
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
                that._userCollection.update({ _id: user.dbEntry._id }, { $set: { passwordTag: newKey } }, function (error, result) {
                    if (error)
                        return reject(error);
                    // Send a message to the user to say they are registered but need to activate their account
                    var message = "A request has been made to reset your password.\n\t\t\t\t\tTo change your password please click the link below:\n\n\t\t\t\t\t" + that.createResetLink(user) + "\n\n\t\t\t\t\tThanks\n\t\t\t\t\tThe Webinate Team";
                    // Setup e-mail data with unicode symbols
                    var mailOptions = {
                        from: that._config.emailFrom,
                        to: user.dbEntry.email,
                        subject: "Reset Password",
                        text: message,
                        html: message.replace(/(?:\r\n|\r|\n)/g, '<br />')
                    };
                    that._transport.sendMail(mailOptions, function (error, info) {
                        if (error)
                            reject(new Error("Could not send email to user: " + error.message));
                        return resolve(true);
                    });
                });
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Checks the users activation code to see if its valid
    * @param {string} username The username of the user
    * @param {string} code The password code
    * @param {string} newPassword The new password
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.resetPassword = function (username, code, newPassword) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Get the user
            that.getUser(username).then(function (user) {
                // No user - so invalid
                if (!user)
                    return reject(new Error("No user exists with those credentials"));
                // If key is the same
                if (user.dbEntry.passwordTag != code)
                    return reject(new Error("Password codes do not match. Please try resetting your password again"));
                // Make sure password is valid
                if (newPassword === undefined || newPassword == "" || validator.blacklist(newPassword, "@\'\"{}") != newPassword)
                    return reject(new Error("Please enter a valid password"));
                // Update the key to be blank
                that._userCollection.update({ _id: user.dbEntry._id }, { $set: { passwordTag: "", password: bcrypt.hashSync(newPassword) } }, function (error, result) {
                    if (error)
                        return reject(error);
                    // All done :)
                    resolve(true);
                });
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
                that._userCollection.update({ _id: user.dbEntry._id }, { $set: { registerKey: "" } }, function (error, result) {
                    if (error)
                        return reject(error);
                    // All done :)
                    resolve(true);
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
                that._userCollection.findOne({ sessionId: session.sessionId }, function (error, useEntry) {
                    if (error)
                        return reject(error);
                    else if (!useEntry)
                        return resolve(null);
                    else
                        return resolve(new User(useEntry));
                });
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
    * @param {UserPrivileges} privilege The type of privileges the user has. Defaults to regular
    * @returns {Promise<User>}
    */
    UserManager.prototype.createUser = function (user, email, password, privilege) {
        if (privilege === void 0) { privilege = def.UserPrivileges.Regular; }
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
            // Check if the user already exists
            that.getUser(user, email).then(function (existingUser) {
                if (existingUser)
                    return reject(new Error("A user with that name or email already exists"));
                return Promise.reject(new Error());
            }).catch(function (error) {
                // Create the user
                var newUser = new User({
                    username: user,
                    password: bcrypt.hashSync(password),
                    email: email,
                    privileges: privilege,
                    passwordTag: "",
                    data: {}
                });
                // Update the database
                that._userCollection.insert(newUser.generateDbEntry(), function (error, result) {
                    if (error)
                        return reject(error);
                    // Assing the ID and pass the user on
                    newUser.dbEntry = result.ops[0];
                    // Send a message to the user to say they are registered but need to activate their account
                    var message = "Thank you for registering with Webinate!\n                    To activate your account please click the link below:\n\n                    " + that.createActivationLink(newUser) + "\n\n                    Thanks\n                    The Webinate Team";
                    // Setup e-mail data with unicode symbols
                    var mailOptions = {
                        from: that._config.emailFrom,
                        to: newUser.dbEntry.email,
                        subject: "Activate your account",
                        text: message,
                        html: message.replace(/(?:\r\n|\r|\n)/g, '<br />')
                    };
                    // Send mail
                    that._transport.sendMail(mailOptions, function (error, info) {
                        if (error)
                            return reject(new Error("Could not send email to user: " + error.message));
                        return resolve(newUser);
                    });
                });
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
        return new Promise(function (resolve, reject) {
            that.getUser(user).then(function (existingUser) {
                if (!existingUser)
                    return resolve();
                if (existingUser.dbEntry.privileges == def.UserPrivileges.SuperAdmin)
                    return reject(new Error("You cannot remove a super user"));
                that._userCollection.remove({ _id: existingUser.dbEntry._id }, function (error, result) {
                    if (error)
                        return reject(error);
                    if (result.result.n == 0)
                        return reject(new Error("Could not remove the user from the database"));
                    return resolve();
                });
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
            that._userCollection.findOne({ $or: target }, function (error, userEntry) {
                if (error)
                    return reject(error);
                else if (!userEntry)
                    return resolve(null);
                else
                    return resolve(new User(userEntry));
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
        return that.logOut(request, response).then(function (success) {
            return that.getUser(username);
        }).then(function (user) {
            return new Promise(function (resolve, reject) {
                // If no user - then reject
                if (!user)
                    return reject(new Error("The username or password is incorrect."));
                // Validate password				
                pass = validator.trim(pass);
                if (!pass || pass == "")
                    return reject(new Error("Please enter a valid password"));
                // Check if the registration key has been removed yet
                if (user.dbEntry.registerKey != "")
                    return reject(new Error("Please authorise your account by clicking on the link that was sent to your email"));
                // Check the password
                if (!bcrypt.compareSync(pass, user.dbEntry.password))
                    return reject(new Error("The username or password is incorrect."));
                // Set the user last login time
                user.dbEntry.lastLoggedIn = Date.now();
                // Update the collection
                that._userCollection.update({ _id: user.dbEntry._id }, { $set: { lastLoggedIn: user.dbEntry.lastLoggedIn } }, function (error, result) {
                    if (error)
                        return reject(error);
                    if (result.result.n === 0)
                        return reject(new Error("Could not find the user in the database, please make sure its setup correctly"));
                    if (!rememberMe)
                        return resolve(user);
                    else {
                        that.sessionManager.createSession(request, response).then(function (session) {
                            // Search the collection for the user
                            that._userCollection.update({ _id: user.dbEntry._id }, { $set: { sessionId: session.sessionId } }, function (error, result) {
                                if (error)
                                    return reject(error);
                                if (result.result.n === 0)
                                    return reject(new Error("Could not find the user in the database, please make sure its setup correctly"));
                                return resolve(user);
                            });
                        }).catch(function (error) {
                            return reject(error);
                        });
                    }
                });
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
                that._userCollection.remove({ _id: user.dbEntry._id }, function (error, result) {
                    if (error)
                        return reject(error);
                    else if (result.result.n === 0)
                        return resolve(false);
                    else
                        return resolve(true);
                });
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
            that._userCollection.find(findToken, {}, startIndex, limit, function (error, result) {
                if (error)
                    return reject(error);
                result.toArray(function (err, results) {
                    var users = [];
                    for (var i = 0, l = results.length; i < l; i++)
                        users.push(new User(results[i]));
                    resolve(users);
                });
            });
        });
    };
    return UserManager;
})();
exports.UserManager = UserManager;
