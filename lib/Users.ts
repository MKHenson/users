import mongodb = require("mongodb");
import Sessions = require("./Session");
import http = require("http");
import validator = require("validator");
import bcrypt = require("bcrypt-nodejs");
import recaptcha = require("recaptcha-async");
import nodemailer = require('nodemailer');

/*
* An interface to describe the data stored in the database for users
*/
export interface IUserEntry
{
	_id?: mongodb.ObjectID;
	username: string;
	email: string;
	password: string;
	registerKey?: string;
	sessionId?: string;
	lastLoggedIn?: number;
}

/*
* Options for configuring the API
*/
export interface IConfig
{
	/*
	* If set, the session will be restricted to URLs underneath the given path.
	* By default the path is "/", which means that the same sessions will be shared across the entire domain.
	*/
	sessionPath?: string;

	/**  
	* If present, the cookie (and hence the session) will apply to the given domain, including any subdomains.
	* For example, on a request from foo.example.org, if the domain is set to '.example.org', then this session will persist across any subdomain of example.org.
	* By default, the domain is not set, and the session will only be visible to other requests that exactly match the domain.
	*/
	sessionDomain?: string;

	/**
	* A persistent connection is one that will last after the user closes the window and visits the site again (true).
	* A non-persistent that will forget the user once the window is closed (false)
	*/
	sessionPersistent?: boolean;

	/**  
	* Set this to true if you are using SSL
	*/
	secure?: boolean;

	/**
	* The default length of user sessions in seconds
	*/
	sessionLifetime?: number;

	/**
	* The private key to use for Google captcha 
	* Get your key from the captcha admin: https://www.google.com/recaptcha/intro/index.html
	*/
	captchaPrivateKey: string;

	/**
	* The domain or host of the site
	*/
	host: string;

	/**
	* The port number to operate under
	*/
	port: number;

	/**
	* The email of the admin account
	*/
	emailAdmin: string;

	/**
	* The 'from' email when notifying users
	*/
	emailFrom: string;

	/**
	* Email service we are using to send mail. For example 'Gmail'
	*/
	emailService: string;

	/**
	* The email address / username of the service
	*/
	emailServiceUser: string;

	/**
	* The password of the email service
	*/
	emailServicePassword: string;
}

/*
* Class that represents a user and its database entry
*/
export class User
{
	dbEntry: IUserEntry;

	/**
	* Creates a new User instance
	* @param {IUserEntry} dbEntry The data object that represents the user in the DB
	*/
	constructor(dbEntry: IUserEntry)
	{
		this.dbEntry = dbEntry;
	}

	/**
	* Generates the object to be stored in the database
	* @returns {IUserEntry}
	*/
	generateDbEntry(): IUserEntry
	{
		return {
			email: this.dbEntry.email,
			lastLoggedIn: Date.now(),
			password: this.dbEntry.password,
			registerKey: this.generateRegistrationKey(10),
			sessionId: this.dbEntry.sessionId,
			username: this.dbEntry.username
		};
	}

	/**
	* Creates a random string that is assigned to the dbEntry registration key
	* @returns {string}
	*/
	private generateRegistrationKey(length: number = 10): string
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
	private _sessionManager: Sessions.SessionManager;
	private _userCollection: mongodb.Collection;
	private _config: IConfig;
	private _transport: Transport;

	/**
	* Creates an instance of the user manager
	* @param {mongodb.Collection} userCollection The mongo collection that stores the users
	* @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
	* @param {IConfig} The config options of this manager
	*/
	constructor(userCollection: mongodb.Collection, sessionCollection: mongodb.Collection, config: IConfig)
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
		this._sessionManager = new Sessions.SessionManager(sessionCollection,
			{
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
	* @returns {ErrorController} [Optional]
	*/
	register(username: string = "", pass: string = "", email: string = "", captcha: string = "", captchaChallenge: string = "", request?: http.ServerRequest, response?: http.ServerResponse): Promise<User>
	{
		var that = this;

		// First check if user exists, make sure the details supplied are ok, then create the new user
		return that.getUser(username).then(function(user: User)
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
			return new Promise<User>(function(resolve, reject)
			{
				// Create the captcha checker
				var remoteIP: string = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
				var privatekey: string = that._config.captchaPrivateKey;
				var captchaChecker = new recaptcha.reCaptcha();
				captchaChecker.on("data", function(captchaResult)
				{
					if (!captchaResult.is_valid)
						return reject(new Error("Your captcha code seems to be wrong. Please try another."));

					var user: User = new User({
						username: username,
						password: bcrypt.hashSync(pass),
						email: email
					});
					
					// Return the user
					return user;
				});

				// Check for valid captcha
				captchaChecker.checkAnswer(privatekey, remoteIP, captchaChallenge, captcha);
			});
		
		
		}).then(function (user)
		{
			// New user is created, now lets save it in the database
			return new Promise<User>(function(resolve, reject)
			{
				that._userCollection.insert(user.generateDbEntry(), function (error: Error, result: IUserEntry)
				{
					if (error) return reject(error);

					// Assing the ID and pass the user on
					user.dbEntry._id = result._id;
					return user;
				});
			});

		}).then(function (user)
		{
			// Send a message to the user to say they are registered but need to activate their account
			var message: string = `Thank you for registering with Webinate!
				To activate your account please click the link below:
				
				${( that._config.secure ? "https://" : "http://" )}${that._config.host}:${that._config.port}/user/activate-account?key=:${user.dbEntry.registerKey}&user=:${user.dbEntry.username}
				
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
				if (error) throw new Error(`Could not send email to user: ${error.message}`);
				return Promise.resolve(user);
			});

		}).catch(function (error: Error)
		{
			return Promise.reject(error);
		});
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

		// If no request or response, then assume its an admin user
		return this._sessionManager.getSession(request, response).then(function (session)
		{
			if (!session) return Promise.resolve(null);

			that._userCollection.findOne({ sessionId: session.sessionId }, function( error : Error, useEntry: IUserEntry)
			{
				if (error) throw error;
				else if (!useEntry)
					return Promise.resolve(null);
				else
					return Promise.resolve(new User(useEntry));
			});

		}).catch(function (error: Error)
		{
			return Promise.reject(error);
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
			that._sessionManager.clearSession(request, response).then(function (cleared)
			{
				resolve(cleared);

			}).catch(function (error: Error)
			{
				reject(error);
			});
		});
	}

	/**
	* Gets a user by a username or email
	* @param {user : string} user The username or email of the user to get
	* @returns {Promise<User>}
	*/
	getUser(user: string): Promise<User>
	{
		var that = this;
		
		return new Promise<User>(function( resolve, reject)
		{
			// Validate user string
			user = validator.trim(user);
			if (!user || user == "") return reject(new Error("Please enter a valid username"));
			if (!validator.isAlphanumeric(user) && !validator.isEmail(user)) return reject(new Error("Please only use alpha numeric characters for your username"));

			var target = [{ email: user }, { username: user }];
			
			// Search the collection for the user
			that._userCollection.findOne({ $or: target }, function (error: Error, userEntry: IUserEntry)
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
				if (user.dbEntry.registerKey != "")
					return reject(new Error("Please authorise your account by clicking on the link that was sent to your email"));
				
				// Check the password
				if (!bcrypt.compareSync(pass, user.dbEntry.password))
					return reject(new Error("The username or password is incorrect."));

				// Set the user last login time
				user.dbEntry.lastLoggedIn = Date.now();

				// Update the collection
				that._userCollection.update({ _id: user.dbEntry._id }, { lastLoggedIn: user.dbEntry.lastLoggedIn }, function (error: Error, result: any)
				{
					if (error) return reject(error);
					if (result === 0) return reject(new Error("Could not find the user in the database, please make sure its setup correctly"));

					if (!rememberMe)
						return resolve(user);
					else
					{
						that._sessionManager.createSession(request, response).then(function (session: Sessions.Session)
						{
							// Search the collection for the user
							that._userCollection.update({ _id: user.dbEntry._id }, { sessionId: session.sessionId }, function (error: Error, result: any)
							{
								if (error) return reject(error);
								if (result === 0) return reject(new Error("Could not find the user in the database, please make sure its setup correctly"));
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
				that._userCollection.remove({ _id: user.dbEntry._id }, function (error: Error, result: any)
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

				result.toArray(function (err: any, results: Array<IUserEntry>)
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