import * as mongodb from "mongodb";
import * as http from "http";
import * as validator from "validator";
import * as bcrypt from "bcrypt-nodejs";
import * as recaptcha from "recaptcha-async";
import * as nodemailer from "nodemailer";
import * as bodyParser from "body-parser";

import * as def from "./Definitions";
import {SessionManager, Session} from "./Session";

/*
* Class that represents a user and its database entry
*/
export class User
{
	dbEntry: def.IUserEntry;

	/**
	* Creates a new User instance
	* @param {IUserEntry} dbEntry The data object that represents the user in the DB
	*/
	constructor(dbEntry: def.IUserEntry)
	{
		this.dbEntry = dbEntry;
	}

	/**
	* Generates the object to be stored in the database
	* @returns {IUserEntry}
	*/
	generateDbEntry(): def.IUserEntry
	{
		return {
			email: this.dbEntry.email,
			lastLoggedIn: Date.now(),
			password: this.dbEntry.password,
			registerKey: (this.dbEntry.privileges == def.UserPrivileges.SuperAdmin ? "" : this.generateRegistrationKey(10) ),
			sessionId: this.dbEntry.sessionId,
			username: this.dbEntry.username,
			privileges: this.dbEntry.privileges
		};
	}

	/**
	* Creates a random string that is assigned to the dbEntry registration key
	* @param {number} length The length of the password
	* @returns {string}
	*/
	generateRegistrationKey(length: number = 10): string
	{
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

		for (var i = 0; i < length; i++)
			text += possible.charAt(Math.floor(Math.random() * possible.length));

		return text;
	}
}

/**
* Main class to use for managing users
*/
export class UserManager
{
	public sessionManager: SessionManager;
	private _userCollection: mongodb.Collection;
	private _config: def.IConfig;
	private _transport: Transport;

	/**
	* Creates an instance of the user manager
	* @param {mongodb.Collection} userCollection The mongo collection that stores the users
	* @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
	* @param {IConfig} The config options of this manager
	*/
	constructor(userCollection: mongodb.Collection, sessionCollection: mongodb.Collection, config: def.IConfig)
	{
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
		this.sessionManager = new SessionManager(sessionCollection,
			{
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
	initialize(): Promise<void>
	{
		var that = this;
		var config = this._config;

		return new Promise<void>(function( resolve, reject )
		{
			that.getUser(config.adminUser.username).then(function(user)
			{
				// Admin user already exists
				if (!user) return Promise.reject(new Error());

				resolve();
				
			}).catch(function(error: Error)
			{
				// No admin user exists, so lets try to create one
				that.createUser(config.adminUser.username, config.adminUser.email, config.adminUser.password, def.UserPrivileges.SuperAdmin ).then(function (newUser)
				{
					resolve();

				}).catch(function (error)
				{
					reject(error);
				});
			})
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
	register(username: string = "", pass: string = "", email: string = "", captcha: string = "", captchaChallenge: string = "", request?: http.ServerRequest, response?: http.ServerResponse): Promise<User>
	{
        var that = this;

        return new Promise<User>(function (resolve, reject)
        {
            // First check if user exists, make sure the details supplied are ok, then create the new user
            that.getUser(username, email).then(function (user: User)
            {
                // If we already a user then error out
                if (user) throw new Error("That username or email is already in use; please choose another or login.");

                // Validate other data
                if (!pass || pass == "") throw new Error("Password cannot be null or empty");
                if (!email || email == "") throw new Error("Email cannot be null or empty");
                if (!validator.isEmail(email)) throw new Error("Please use a valid email address");
                if (request && (!captcha || captcha == "")) throw new Error("Captcha cannot be null or empty");
                if (request && (!captchaChallenge || captchaChallenge == "")) throw new Error("Captcha challenge cannot be null or empty");
			
                // Check captcha details
                return new Promise<User>(function (resolve, reject)
                {
                    // Create the captcha checker
                    var remoteIP: string = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
                    var privatekey: string = that._config.captchaPrivateKey;
                    var captchaChecker = new recaptcha.reCaptcha();
                    captchaChecker.on("data", function (captchaResult)
                    {
                        if (!captchaResult.is_valid)
                            throw new Error("Your captcha code seems to be wrong. Please try another.");

                        return resolve(that.createUser(username, email, pass));
                    });

                    // Check for valid captcha
                    captchaChecker.checkAnswer(privatekey, remoteIP, captchaChallenge, captcha);
                });

            }).then(function (user)
            {
                // Send a message to the user to say they are registered but need to activate their account
                var message: string = `Thank you for registering with Webinate!
				To activate your account please click the link below:

				${that.createActivationLink(user) }

				Thanks
				The Webinate Team`;

                // Setup e-mail data with unicode symbols
                var mailOptions: MailComposer = {
                    from: that._config.emailFrom,
                    to: user.dbEntry.email,
                    subject: "Activate your account",
                    text: message,
                    html: message.replace(/(?:\r\n|\r|\n)/g, '<br />')
                };

                // Send mail
                that._transport.sendMail(mailOptions, function (error: Error, info: any)
                {
                    if (error)
                        reject(new Error(`Could not send email to user: ${error.message}`));

                    return resolve(user);
                });

            }).catch(function (error: Error)
            {
                return Promise.reject(error);
            });
        });
	}

	/** 
	* Creates the link to send to the user for activation
	* @param {string} username The username of the user
	* @returns {Promise<boolean>}
	*/
	private createActivationLink( user : User ): string
	{
		return `${(this._config.ssl ? "https://" : "http://") }${this._config.host }:${(this._config.ssl ? this._config.portHTTPS : this._config.portHTTP)}${this._config.restURL}/activate-account?key=${user.dbEntry.registerKey}&user=${user.dbEntry.username}`;
	}

	/** 
	* Approves a user's activation code so they can login without email validation
	* @param {string} username The username or email of the user
	* @returns {Promise<void>}
	*/
	approveActivation(username: string): Promise<void>
	{
		var that = this;

		// Get the user
		return that.getUser(username).then(function (user: User)
		{
			if (!user)
				return Promise.reject(new Error("No user exists with the specified details"));
			
			return new Promise<void>(function (resolve, reject)
			{
				// Clear the user's activation
				that._userCollection.update({ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ registerKey: "" } }, function (error: Error, result: mongodb.WriteResult<any>)
				{
					if (error)
						return reject(error);

					return resolve();
				});
			});
		});
	}


	/** 
	* Attempts to resend the activation link
	* @param {string} username The username of the user
	* @returns {Promise<boolean>}
	*/
    resendActivation(username: string): Promise<boolean>
	{
        var that = this;

        return new Promise<boolean>(function (resolve, reject) 
        {
            // Get the user
            that.getUser(username).then(function (user: User) 
            {
                if (!user)
                   throw new Error("No user exists with the specified details");

                if (user.dbEntry.registerKey == "")
                    throw new Error("Account has already been activated");

                var newKey = user.generateRegistrationKey();
                user.dbEntry.registerKey = newKey;

                // Update the collection with a new key
                that._userCollection.update({ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ registerKey: newKey } }, function (error: Error, result: mongodb.WriteResult<any>)
                {
                    if (error)
                        return reject(error);

                    // Send a message to the user to say they are registered but need to activate their account
                    var message: string = `Thank you for registering with Webinate!
					To activate your account please click the link below:

					${that.createActivationLink(user) }

					Thanks
					The Webinate Team`;

                    // Setup e-mail data with unicode symbols
                    var mailOptions: MailComposer = {
                        from: that._config.emailFrom,
                        to: user.dbEntry.email,
                        subject: "Activate your account",
                        text: message,
                        html: message.replace(/(?:\r\n|\r|\n)/g, '<br />')
                    };

                    that._transport.sendMail(mailOptions, function (error: Error, info: any) {
                        if (error)
                            reject(new Error(`Could not send email to user: ${error.message}`));

                        return resolve(true);
                    });
                });

            }).catch(function (error: Error) {

                reject(error);

            });
        });
	}

	/** 
	* Checks the users activation code to see if its valid
	* @param {string} username The username of the user
	* @returns {Promise<boolean>}
	*/
	checkActivation( username : string, code : string ): Promise<boolean>
	{
		var that = this;
		return new Promise<boolean>(function( resolve, reject )
		{
			// Get the user
			that.getUser(username).then(function(user)
			{
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
				that._userCollection.update(<def.IUserEntry>{ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ registerKey: "" } }, function (error: Error, result: mongodb.WriteResult<def.IUserEntry>)
				{
					if (error)
						return reject(error);

					// All done :)
					resolve(true);
				});

			}).catch(function (error: Error)
			{
				reject(error);
			});
		});
	}

	/**
	* Creates the script tag for the Google captcha API
	* @param {string}
	*/
	getCaptchaHTML(): string
	{
		var captchaChecker = new recaptcha.reCaptcha();
		return captchaChecker.getCaptchaHtml(this._config.captchaPublicKey, "", this._config.ssl);
	}

	/**
	* Checks to see if a user is logged in
	* @param {http.ServerRequest} request 
	* @param {http.ServerResponse} response
	* @param {Promise<User>} Gets the user or null if the user is not logged in
	*/
	loggedIn(request: http.ServerRequest, response: http.ServerResponse): Promise<User>
	{
		var that = this;

		return new Promise<User>(function (resolve, reject)
		{
			// If no request or response, then assume its an admin user
			that.sessionManager.getSession(request, response).then(function (session)
			{
				if (!session) return resolve(null);

				that._userCollection.findOne({ sessionId: session.sessionId }, function (error: Error, useEntry: def.IUserEntry)
				{
					if (error)
						return reject(error);
					else if (!useEntry)
						return resolve(null);
					else
						return resolve(new User(useEntry));
				});

			}).catch(function (error: Error)
			{
				return reject(error);
			});
		});
	}

	/**
	* Attempts to log the user out
	* @param {http.ServerRequest} request 
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean>}
	*/
	logOut(request: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>
	{
		var that = this;
		return new Promise<boolean>(function (resolve, reject)
		{
			that.sessionManager.clearSession(null, request, response).then(function (cleared)
			{
				resolve(cleared);

			}).catch(function (error: Error)
			{
				reject(error);
			});
		});
	}
	
	/**
	* Creates a new user
	* @param {string} user The unique username
	* @param {string} email The unique email
	* @param {string} password The password for the user
	* @param {UserPrivileges} privilege The type of privileges the user has. Defaults to regular
	* @returns {Promise<User>}
	*/
	createUser(user: string, email: string, password: string, privilege: def.UserPrivileges = def.UserPrivileges.Regular): Promise<User>
	{
		var that = this;
		
		return new Promise<User>(function (resolve, reject)
		{
			// Basic checks
			if (!user || validator.trim(user) == "") return reject(new Error("Username cannot be empty"));
			if (!validator.isAlphanumeric(user)) return reject(new Error("Username must be alphanumeric"));
			if (!email || validator.trim(email) == "") return reject(new Error("Email cannot be empty"));
			if (!validator.isEmail(email)) return reject(new Error("Email must be valid"));
			if (!password || validator.trim(password) == "") return reject(new Error("Password cannot be empty"));
			if (privilege > 3) return reject(new Error("Privilege type is unrecognised"));

			// Check if the user already exists
			that.getUser(user, email).then(function (existingUser)
			{
				if (existingUser)
					return reject(new Error(`A user with that name or email already exists`));

				return Promise.reject(new Error());

			}).catch(function (error: Error)
			{
				// Create the user
				var newUser: User = new User({
					username: user,
					password: bcrypt.hashSync(password),
					email: email,
					privileges: privilege
				});

				// Update the database
				that._userCollection.insert(newUser.generateDbEntry(), function (error: Error, result: mongodb.WriteResult<def.IUserEntry>)
				{
					if (error)
						return reject(error);

					// Assing the ID and pass the user on
					newUser.dbEntry = result.ops[0];
					
					// Return the user
					return resolve(newUser);
				});
			});
		});
	}

	/**
	* Deletes a user from the database
	* @param {string} user The unique username or email of the user to remove
	* @returns {Promise<void>}
	*/
	removeUser(user: string): Promise<void>
	{
		var that = this;

		return new Promise<void>(function (resolve, reject)
		{
			that.getUser(user).then(function (existingUser)
			{
				if (!existingUser)
					return resolve();

				that._userCollection.remove(<def.IUserEntry>{ _id: existingUser.dbEntry._id }, function(error: Error, result: mongodb.WriteResult<def.IUserEntry>)
				{
					if (error)
						return reject(error);

					if (result.result.n == 0)
						return reject(new Error("Could not remove the user from the database"));

					return resolve();
				});

			}).catch(function (error: Error)
			{
				reject(error);
			});
		});
	}


	/**
	* Gets a user by a username or email
	* @param {string} user The username or email of the user to get
	* @param {string} email [Optional] Do a check if the email exists as well
	* @returns {Promise<User>} Resolves with either a valid user or null if none exists
	*/
	getUser(user: string, email?: string): Promise<User>
	{
		var that = this;

		email = email != undefined ? email : user;
		
		return new Promise<User>(function( resolve, reject)
		{
			// Validate user string
			user = validator.trim(user);
			if (!user || user == "") return reject(new Error("Please enter a valid username"));
			if (!validator.isAlphanumeric(user) && !validator.isEmail(user)) return reject(new Error("Please only use alpha numeric characters for your username"));

			var target = [{ email: email }, { username: user }];
			
			// Search the collection for the user
			that._userCollection.findOne({ $or: target }, function (error: Error, userEntry: def.IUserEntry)
			{
				if (error) return reject(error);
				else if (!userEntry) return resolve(null);
				else return resolve(new User(userEntry));
			});
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
	logIn(username: string = "", pass: string = "", rememberMe: boolean = true, request?: http.ServerRequest, response?: http.ServerResponse): Promise<User>
	{
		var that = this;

		return that.logOut(request, response).then(function(success: boolean)
		{
			return that.getUser(username);

		}).then(function(user)
		{
			return new Promise<User>(function (resolve, reject)
			{
				// If no user - then reject
				if (!user) return reject(new Error("The username or password is incorrect."));

				// Validate password				
				pass = validator.trim(pass);
				if (!pass || pass == "") return reject(new Error("Please enter a valid password"));
				
				// Check if the registration key has been removed yet
				if (user.dbEntry.registerKey != "" )
					return reject(new Error("Please authorise your account by clicking on the link that was sent to your email"));
				
				// Check the password
				if (!bcrypt.compareSync(pass, user.dbEntry.password))
					return reject(new Error("The username or password is incorrect."));

				// Set the user last login time
				user.dbEntry.lastLoggedIn = Date.now();

				// Update the collection
				that._userCollection.update({ _id: user.dbEntry._id }, { $set: { lastLoggedIn: user.dbEntry.lastLoggedIn } }, function (error: Error, result: mongodb.WriteResult<def.IUserEntry>)
				{
					if (error) return reject(error);
					if (result.result.n === 0) return reject(new Error("Could not find the user in the database, please make sure its setup correctly"));

					if (!rememberMe)
						return resolve(user);
					else
					{
						that.sessionManager.createSession(request, response).then(function (session: Session)
						{
							// Search the collection for the user
							that._userCollection.update({ _id: user.dbEntry._id }, { $set: { sessionId: session.sessionId } }, function (error: Error, result: mongodb.WriteResult<def.IUserEntry> )
							{
								if (error) return reject(error);
								if (result.result.n === 0) return reject(new Error("Could not find the user in the database, please make sure its setup correctly"));
								return resolve(user);
							});

						}).catch(function (error: Error)
						{
							return reject(error);
						});
					}
				});
			});
		});
	}

	/**
	* Removes a user by his email or username
	* @param {string} username The username or email of the user
	* @param {http.ServerRequest} request 
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean>} True if the user was in the DB or false if they were not
	*/
	remove(username: string = "", request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>
	{
		var that = this;

		return that.getUser(username).then(function(user)
		{
			return new Promise<boolean>(function (resolve, reject)
			{
				// There was no user
				if (!user) return resolve(false);

				// Remove the user from the DB
				that._userCollection.remove({ _id: user.dbEntry._id }, function (error: Error, result: mongodb.WriteResult<def.IUserEntry>)
				{
					if (error) return reject(error);
					else if (result.result.n === 0) return resolve(false);
					else return resolve(true);
				});
			});
		});
    }

	/** 
	* Prints user objects from the database
	* @param {number} limit The number of users to fetch
	* @param {number} startIndex The starting index from where we are fetching users from
	* @returns {Promise<Array<User>>}
	*/
	getUsers(startIndex: number = 0, limit: number = 0): Promise<Array<User>>
	{
		var that = this;
		return new Promise < Array < User >>( function( resolve, reject )
		{
			that._userCollection.find({}, {}, startIndex, limit, function (error: Error, result: mongodb.Cursor)
			{
				if (error) return reject(error);

				result.toArray(function (err: any, results: Array<def.IUserEntry>)
				{
					var users: Array<User> = [];
					for (var i = 0, l = results.length; i < l; i++)
						users.push(new User(results[i]));

					resolve(users);
				});
			});
		});
	}
}