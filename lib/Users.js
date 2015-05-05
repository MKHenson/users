var Sessions = require("./Session");
var validator = require("validator");
var bcrypt = require("bcrypt-nodejs");
var recaptcha = require("recaptcha-async");
var nodemailer = require('nodemailer');
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
    * Generates the object to be stored in the database
    * @returns {IUserEntry}
    */
    User.prototype.generateDbEntry = function () {
        return {
            email: this.dbEntry.email,
            lastLoggedIn: Date.now(),
            password: this.dbEntry.password,
            registerKey: this.generateRegistrationKey(10),
            sessionId: this.dbEntry.sessionId,
            username: this.dbEntry.username
        };
    };
    /**
    * Creates a random string that is assigned to the dbEntry registration key
    * @param {number} length The length of the password
    * @returns {string}
    */
    User.prototype.generateRegistrationKey = function (length) {
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
        this._sessionManager = new Sessions.SessionManager(sessionCollection, {
            domain: config.sessionDomain,
            lifetime: config.sessionLifetime,
            path: config.sessionPath,
            persistent: config.sessionPersistent,
            secure: config.secure
        });
    }
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
        // First check if user exists, make sure the details supplied are ok, then create the new user
        return that.getUser(username).then(function (user) {
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
                        return reject(new Error("Your captcha code seems to be wrong. Please try another."));
                    var user = new User({
                        username: username,
                        password: bcrypt.hashSync(pass),
                        email: email
                    });
                    // Return the user
                    return resolve(user);
                });
                // Check for valid captcha
                captchaChecker.checkAnswer(privatekey, remoteIP, captchaChallenge, captcha);
            });
        }).then(function (user) {
            // New user is created, now lets save it in the database
            return new Promise(function (resolve, reject) {
                that._userCollection.insert(user.generateDbEntry(), function (error, result) {
                    if (error)
                        return reject(error);
                    // Assing the ID and pass the user on
                    user.dbEntry = result.ops[0];
                    // Return the user
                    return resolve(user);
                });
            });
        }).then(function (user) {
            // Send a message to the user to say they are registered but need to activate their account
            var message = "Thank you for registering with Webinate!\n\t\t\t\tTo activate your account please click the link below:\n\t\t\t\t\n\t\t\t\t" + that.createActivationLink(user) + "\n\t\t\t\t\n\t\t\t\tThanks\n\t\t\t\tThe Webinate Team";
            // Setup e-mail data with unicode symbols
            var mailOptions = {
                from: that._config.emailFrom,
                to: user.dbEntry.email,
                subject: "Activate your account",
                text: message,
                html: message.replace(/(?:\r\n|\r|\n)/g, '<br />')
            };
            // Send mail
            return new Promise(function (resolve, reject) {
                that._transport.sendMail(mailOptions, function (error, info) {
                    if (error)
                        reject(new Error("Could not send email to user: " + error.message));
                    return resolve(user);
                });
            });
        }).catch(function (error) {
            return Promise.reject(error);
        });
    };
    /**
    * Creates the link to send to the user for activation
    * @param {string} username The username of the user
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.createActivationLink = function (user) {
        return "" + (this._config.secure ? "https://" : "http://") + this._config.host + ":" + this._config.port + "/" + this._config.activationURL + "?key=" + user.dbEntry.registerKey + "&user=" + user.dbEntry.username;
    };
    /**
    * Attempts to resend the activation link
    * @param {string} username The username of the user
    * @returns {Promise<boolean>}
    */
    UserManager.prototype.resendActivation = function (username) {
        var that = this;
        // First check if user exists, make sure the details supplied are ok, then create the new user
        return that.getUser(username).then(function (user) {
            // If we already a user then error out
            if (!user)
                throw new Error("No user exists with the specified details");
            return new Promise(function (resolve, reject) {
                var newKey = user.generateRegistrationKey();
                that._userCollection.update({ _id: user.dbEntry._id }, { registerKey: newKey }, function (error, result) {
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
            });
        }).catch(function (error) {
            return Promise.reject(error);
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
                that._userCollection.update({ _id: user.dbEntry._id }, { registerKey: "" }, function (error, result) {
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
        return captchaChecker.getCaptchaHtml(this._config.captchaPublicKey, "", this._config.secure);
    };
    /**
    * Checks to see if a user is logged in
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @param {Promise<User>} Gets the user or null if the user is not logged in
    */
    UserManager.prototype.loggedIn = function (request, response) {
        var that = this;
        // If no request or response, then assume its an admin user
        return this._sessionManager.getSession(request, response).then(function (session) {
            if (!session)
                return Promise.resolve(null);
            that._userCollection.findOne({ sessionId: session.sessionId }, function (error, useEntry) {
                if (error)
                    throw error;
                else if (!useEntry)
                    return Promise.resolve(null);
                else
                    return Promise.resolve(new User(useEntry));
            });
        }).catch(function (error) {
            return Promise.reject(error);
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
            that._sessionManager.clearSession(request, response).then(function (cleared) {
                resolve(cleared);
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    /**
    * Gets a user by a username or email
    * @param {user : string} user The username or email of the user to get
    * @returns {Promise<User>}
    */
    UserManager.prototype.getUser = function (user) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Validate user string
            user = validator.trim(user);
            if (!user || user == "")
                return reject(new Error("Please enter a valid username"));
            if (!validator.isAlphanumeric(user) && !validator.isEmail(user))
                return reject(new Error("Please only use alpha numeric characters for your username"));
            var target = [{ email: user }, { username: user }];
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
                that._userCollection.update({ _id: user.dbEntry._id }, { lastLoggedIn: user.dbEntry.lastLoggedIn }, function (error, result) {
                    if (error)
                        return reject(error);
                    if (result.result.n === 0)
                        return reject(new Error("Could not find the user in the database, please make sure its setup correctly"));
                    if (!rememberMe)
                        return resolve(user);
                    else {
                        that._sessionManager.createSession(request, response).then(function (session) {
                            // Search the collection for the user
                            that._userCollection.update({ _id: user.dbEntry._id }, { sessionId: session.sessionId }, function (error, result) {
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
    * Prints user objects from the database
    * @param {number} limit The number of users to fetch
    * @param {number} startIndex The starting index from where we are fetching users from
    * @returns {Promise<Array<User>>}
    */
    UserManager.prototype.getUsers = function (startIndex, limit) {
        if (startIndex === void 0) { startIndex = 0; }
        if (limit === void 0) { limit = 0; }
        var that = this;
        return new Promise(function (resolve, reject) {
            that._userCollection.find({}, {}, startIndex, limit, function (error, result) {
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
