"use strict";

import * as mongodb from "mongodb";
import * as http from "http";
import * as validator from "validator";
import * as bcrypt from "bcryptjs";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as winston from "winston";
import * as https from "https";

import {CommsController} from "./socket-api/comms-controller";
import {ClientInstruction} from "./socket-api/client-instruction";
import {ClientInstructionType} from "./socket-api/socket-event-types";
import * as def from "webinate-users";
import {SessionManager, Session} from "./session";
import {BucketManager} from "./bucket-manager";
import {GMailer} from "./mailers/gmail"
import {Mailguner} from "./mailers/mailgun"

/*
* Describes what kind of privileges the user has
*/
export enum UserPrivileges
{
    SuperAdmin = 1,
    Admin = 2,
    Regular = 3
}

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
	* Generates an object that can be sent to clients.
    * @param {boolean} verbose If true, sensitive database data will be sent (things like passwords will still be obscured)
	* @returns {IUserEntry}
	*/
    generateCleanedData(verbose: boolean = false): def.IUserEntry
    {
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
	generateDbEntry(): def.IUserEntry
	{
		return {
			email: this.dbEntry.email,
            lastLoggedIn: Date.now(),
            createdOn: Date.now(),
			password: this.dbEntry.password,
			registerKey: (this.dbEntry.privileges == UserPrivileges.SuperAdmin ? "" : this.generateKey(10) ),
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
	generateKey(length: number = 10): string
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
    private static _singleton: UserManager;

	public sessionManager: SessionManager;
	private _userCollection: mongodb.Collection;
	private _config: def.IConfig;
    private _mailer : def.IMailer;

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
        UserManager._singleton = this;

		// Create the session manager
		this.sessionManager = new SessionManager(sessionCollection, {
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
    async onSessionRemoved(sessionId: string)
    {
        if (!sessionId || sessionId == "")
            return;

        var useEntry: def.IUserEntry = await this._userCollection.find( <def.IUserEntry>{ sessionId: sessionId }).limit(1).next();
        if (useEntry)
        {
            // Send logged out event to socket
            var token: def.SocketEvents.IUserToken = { username: useEntry.username, type: ClientInstructionType[ClientInstructionType.Logout] };
            await CommsController.singleton.processClientInstruction( new ClientInstruction(token, null, useEntry.username));
            winston.info(`User '${useEntry.username}' has logged out`, { process: process.pid });
        }

        return;
    }

	/**
	* Initializes the API
	* @returns {Promise<void>}
	*/
	async initialize(): Promise<void>
	{
		var that = this;
		var config = this._config;

        if (config.mail)
        {
            if (config.mail.type == "gmail")
            {
                this._mailer = new GMailer(config.debugMode);
                this._mailer.initialize( config.mail.options as def.IGMail );
            }
            else if (config.mail.type == "mailgun")
            {
                this._mailer = new Mailguner(config.debugMode);
                this._mailer.initialize( config.mail.options as def.IMailgun );
            }
        }

        if (!this._mailer)
            winston.warn("No mailer has been specified and so the API cannot send emails. Please check your config.")


        // Clear all existing indices and then re-add them
        await this._userCollection.dropIndexes();

        // Make sure the user collection has an index to search the username field
        await this._userCollection.createIndex( <def.IUserEntry>{ username: "text", email: "text" } );

        // See if we have an admin user
        var user = await this.getUser(config.adminUser.username);

        // If no admin user exists, so lets try to create one
        if (!user)
            user = await this.createUser(config.adminUser.username, config.adminUser.email, config.adminUser.password, (config.ssl ? "https://" : "http://") + config.hostName, UserPrivileges.SuperAdmin, {}, true);

        return;
	}

    /**
	* Checks if a Google captcha sent from a user is valid
    * @param {string} captcha The captcha value the user guessed
	* @param {http.ServerRequest} request
	* @returns {Promise<boolean>}
	*/
    private checkCaptcha( captcha: string, request: express.Request ): Promise<boolean>
    {
        var that = this;
        return new Promise<boolean>(function(resolve, reject) {

            var privatekey: string = that._config.captchaPrivateKey;
            https.get("https://www.google.com/recaptcha/api/siteverify?secret=" + privatekey + "&response=" + captcha, function(res) {
                    var data = "";
                    res.on('data', function (chunk) {
                            data += chunk.toString();
                    });
                    res.on('end', function() {
                        try {
                            var parsedData = JSON.parse(data);
                            if (!parsedData.success)
                                return reject( new Error("Your captcha code seems to be wrong. Please try another."));

                            resolve(true);

                        } catch ( e ) {
                            return reject( new Error("There was an error connecting to Google Captcha: " + e.message ));
                        }
                    });
            });

        });
    }

	/**
	* Attempts to register a new user
	* @param {string} username The username of the user
	* @param {string} pass The users secret password
	* @param {string} email The users email address
	* @param {string} captcha The captcha value the user guessed
    * @param {any} meta Any optional data associated with this user
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<User>}
	*/
    async register(username: string = "", pass: string = "", email: string = "", captcha: string = "", meta: any = {}, request?: express.Request, response?: express.Response): Promise<User>
	{
        var origin = encodeURIComponent( request.headers["origin"] || request.headers["referer"] );

        // First check if user exists, make sure the details supplied are ok, then create the new user
        var user: User = await this.getUser(username, email);

        // If we already a user then error out
        if (user)
            throw new Error("That username or email is already in use; please choose another or login.");

        // Validate other data
        if (!pass || pass == "") throw new Error("Password cannot be null or empty");
        if (!email || email == "") throw new Error("Email cannot be null or empty");
        if (!validator.isEmail(email)) throw new Error("Please use a valid email address");
        if (request && (!captcha || captcha == "")) throw new Error("Captcha cannot be null or empty");

        // Check the captcha
        await this.checkCaptcha( captcha, request );

        user = await this.createUser(username, email, pass, origin, UserPrivileges.Regular, meta);
        return user;
	}

	/**
	* Creates the link to send to the user for activation
	* @param {string} user The user we are activating
    * @param {string} origin The origin of where the activation link came from
	* @returns {string}
	*/
	private createActivationLink( user : User, origin : string ): string
	{
        return `${(this._config.ssl ? "https://" : "http://") }${this._config.hostName }:${(this._config.ssl ? this._config.portHTTPS : this._config.portHTTP) }${this._config.apiPrefix}activate-account?key=${user.dbEntry.registerKey}&user=${user.dbEntry.username}&origin=${origin}`;
	}

	/**
	* Creates the link to send to the user for password reset
	* @param {string} username The username of the user
     * @param {string} origin The origin of where the activation link came from
	* @returns {string}
	*/
    private createResetLink(user: User, origin: string): string
    {
        return `${this._config.passwordResetURL}?key=${user.dbEntry.passwordTag}&user=${user.dbEntry.username}&origin=${origin}`;
    }

	/**
	* Approves a user's activation code so they can login without email validation
	* @param {string} username The username or email of the user
	* @returns {Promise<void>}
	*/
	async approveActivation(username: string): Promise<void>
	{
		// Get the user
		var user: User = await this.getUser(username);

        if (!user)
            throw new Error("No user exists with the specified details");

        // Clear the user's activation
        var result = await this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ registerKey: "" } });

        // Send activated event
        var token: def.SocketEvents.IUserToken = { username: username, type: ClientInstructionType[ClientInstructionType.Activated] };
        await CommsController.singleton.processClientInstruction(new ClientInstruction(token, null, username));

        winston.info(`User '${username}' has been activated`, { process: process.pid });
        return;
    }

    /**
	* Attempts to send the an email to the admin user
	* @param {string} message The message body
    * @param {string} name The name of the sender
    * @param {string} from The email of the sender
	* @returns {Promise<boolean>}
	*/
    async sendAdminEmail(message: string, name? : string, from? : string): Promise<any>
    {
        if (!this._mailer)
            throw new Error(`No email account has been setup`);

        try {
            await this._mailer.sendMail( this._config.adminUser.email, this._config.mail.from, `Message from ${( name ? name : "a user" )}`,
                message + "<br /><br />Email: " + (from ? from : "") );
        } catch (err) {
            new Error(`Could not send email to user: ${err.message}`)
        }

        return true;
    }

	/**
	* Attempts to resend the activation link
	* @param {string} username The username of the user
    * @param {string} origin The origin of where the request came from (this is emailed to the user)
	* @returns {Promise<boolean>}
	*/
    async resendActivation(username: string, origin : string): Promise<boolean>
	{
        // Get the user
        var user : User = await this.getUser(username);

        if (!user)
            throw new Error("No user exists with the specified details");

        if (user.dbEntry.registerKey == "")
            throw new Error("Account has already been activated");

        var newKey = user.generateKey();
        user.dbEntry.registerKey = newKey;

        // Update the collection with a new key
        var result = await this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ registerKey: newKey } });

        // Send a message to the user to say they are registered but need to activate their account
        var message: string = "Thank you for registering with Webinate!\nTo activate your account please click the link below:" +
            this.createActivationLink(user, origin) +
            "Thanks\n\n" +
            "The Webinate Team";

        // If no mailer is setup
        if (!this._mailer)
            throw new Error(`No email account has been setup`);

        try {
            // Send mail using the mailer
            await this._mailer.sendMail( user.dbEntry.email, this._config.mail.from, "Activate your account", message );
        } catch (err) {
            new Error(`Could not send email to user: ${err.message}`)
        }

        return true;
    }

    /**
	* Sends the user an email with instructions on how to reset their password
	* @param {string} username The username of the user
    * @param {string} origin The site where the request came from
	* @returns {Promise<boolean>}
	*/
    async requestPasswordReset(username: string, origin: string ): Promise<boolean>
    {
        // Get the user
        var user: User = await this.getUser(username);

        if (!user)
            throw new Error("No user exists with the specified details");

        var newKey = user.generateKey();

        // Password token
        user.dbEntry.passwordTag = newKey;

        // Update the collection with a new key
        var result = await this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ passwordTag: newKey } });

        // Send a message to the user to say they are registered but need to activate their account
        var message: string = "A request has been made to reset your password. To change your password please click the link below:\n\n" +
            this.createResetLink(user, origin) +
            "Thanks\n\n" +
            "The Webinate Team";

        // If no mailer is setup
        if (!this._mailer)
            throw new Error(`No email account has been setup`);

        // Send mail using the mailer
        try {
            await this._mailer.sendMail( user.dbEntry.email, this._config.mail.from, "Reset Password", message );
        }
        catch(err) {
            throw new Error(`Could not send email to user: ${err.message}`)
        }

        return true;
    }

    /**
	* Creates a hashed password
	* @param {string} pass The password to hash
	* @returns {Promise<boolean>}
	*/
    private hashPassword(pass : string): Promise<string>
    {
        return new Promise<string>(function (resolve, reject)
        {
            bcrypt.hash(pass, 8, function (err, encrypted: string)
            {
                if (err)
                    return reject(err)
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
    private comparePassword(pass: string, hash: string): Promise<boolean>
    {
        return new Promise<boolean>(function (resolve, reject)
        {
            bcrypt.compare(pass, hash, function (err, same: boolean)
            {
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
    async resetPassword(username: string, code: string, newPassword: string): Promise<boolean>
    {
        // Get the user
        var user: User = await this.getUser(username);

        // No user - so invalid
        if (!user)
            throw new Error("No user exists with those credentials");

        // If key is the same
        if (user.dbEntry.passwordTag != code)
            throw new Error("Password codes do not match. Please try resetting your password again");

        // Make sure password is valid
        if (newPassword === undefined || newPassword == "" || validator.blacklist(newPassword, "@\'\"{}") != newPassword)
            throw new Error("Please enter a valid password");

        var hashed = await this.hashPassword(newPassword);

        // Update the key to be blank
        var result = await this._userCollection.updateOne(<def.IUserEntry>{ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ passwordTag: "", password: hashed } });

        // All done :)
        return true;
    }

	/**
	* Checks the users activation code to see if its valid
	* @param {string} username The username of the user
	* @returns {Promise<boolean>}
	*/
	async checkActivation( username : string, code : string ): Promise<boolean>
	{
        // Get the user
        var user = await this.getUser(username);

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
        await this._userCollection.updateOne(<def.IUserEntry>{ _id: user.dbEntry._id }, { $set: <def.IUserEntry>{ registerKey: "" } });

        // Send activated event
        var token: def.SocketEvents.IUserToken = { username: username, type: ClientInstructionType[ClientInstructionType.Activated]  };
        await CommsController.singleton.processClientInstruction(new ClientInstruction(token, null, username));

        winston.info(`User '${username}' has been activated`, { process: process.pid });
        return true;
	}

	/**
	* Checks to see if a user is logged in
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @param {Promise<User>} Gets the user or null if the user is not logged in
	*/
	async loggedIn(request: http.ServerRequest, response: http.ServerResponse): Promise<User>
	{
        // If no request or response, then assume its an admin user
        var session = await this.sessionManager.getSession(request, response);
        if (!session)
            return null;

        var useEntry = await this._userCollection.find({ sessionId: session.sessionId }).limit(1).next();
        if (!useEntry)
            return null;
        else
            return new User(useEntry);
	}

	/**
	* Attempts to log the user out
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean>}
	*/
	async logOut(request: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>
	{
        var sessionCleaered = await this.sessionManager.clearSession(null, request, response);
        return sessionCleaered;
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
    async createUser(user: string, email: string, password: string, origin: string, privilege: UserPrivileges = UserPrivileges.Regular, meta: any = {}, allowAdmin: boolean = false ): Promise<User>
	{
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
        if (privilege == UserPrivileges.SuperAdmin && allowAdmin == false )
            throw new Error("You cannot create a super user");

        // Check if the user already exists
        var hashedPsw: string = await this.hashPassword(password);
        var existingUser = await this.getUser(user, email);

        if (existingUser)
            throw new Error(`A user with that name or email already exists`);

        // Create the user
        var newUser : User = new User({
            username: user,
            password: hashedPsw,
            email: email,
            privileges: privilege,
            passwordTag: "",
            meta: meta
        });

        // Update the database
        var insertResult = await this._userCollection.insertOne(newUser.generateDbEntry());

        // Assing the ID and pass the user on
        newUser.dbEntry = insertResult.ops[0];

        // Send a message to the user to say they are registered but need to activate their account
        var message: string = "Thank you for registering with Webinate! To activate your account please click the link below: \n\n" +
            this.createActivationLink(newUser, origin) + "\n\n" +
            "Thanks\n" +
            "The Webinate Team";

        // If no mailer is setup
        if (!this._mailer)
            throw new Error(`No email account has been setup`);

        // Send mail using the mailer
        await this._mailer.sendMail(
            newUser.dbEntry.email,
            this._config.mail.from,
            "Activate your account",
            message
        );

        // All users have default stats created for them
        await BucketManager.get.createUserStats(newUser.dbEntry.username);

        // All users have a bucket created for them
        await BucketManager.get.createBucket(newUser.dbEntry.username + "-bucket", newUser.dbEntry.username);

        return newUser;
	}

	/**
	* Deletes a user from the database
	* @param {string} user The unique username or email of the user to remove
	* @returns {Promise<void>}
	*/
	async removeUser(user: string): Promise<void>
	{
        var username: string = "";
		var userInstance = await this.getUser(user);

        if (!user)
            throw new Error("Could not find any users with those credentials");

        if (userInstance.dbEntry.privileges == UserPrivileges.SuperAdmin)
            throw new Error("You cannot remove a super user");

        username = userInstance.dbEntry.username;

        var numDeleted = await BucketManager.get.removeUser(username);
        var result = await this._userCollection.deleteOne(<def.IUserEntry>{ _id: userInstance.dbEntry._id });

        if (result.deletedCount == 0)
            throw new Error("Could not remove the user from the database");

        // Send event to sockets
        var token: def.SocketEvents.IUserToken = { username: username, type: ClientInstructionType[ClientInstructionType.Removed] };
        CommsController.singleton.processClientInstruction(new ClientInstruction(token, null, username));

        winston.info(`User '${username}' has been removed`, { process: process.pid });

        return;
	}

	/**
	* Gets a user by a username or email
	* @param {string} user The username or email of the user to get
	* @param {string} email [Optional] Do a check if the email exists as well
	* @returns {Promise<User>} Resolves with either a valid user or null if none exists
	*/
	async getUser(user: string, email?: string): Promise<User>
	{
		email = email != undefined ? email : user;

        // Validate user string
        user = validator.trim(user);

        if (!user || user == "")
            throw new Error("Please enter a valid username");

        if (!validator.isAlphanumeric(user) && !validator.isEmail(user))
            throw new Error("Please only use alpha numeric characters for your username");

        var target = [{ email: email }, { username: user }];

        // Search the collection for the user
        var userEntry: def.IUserEntry = await this._userCollection.find({ $or: target }).limit(1).next();
        if (!userEntry)
            return null;
        else
            return new User(userEntry);
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
	async logIn(username: string = "", pass: string = "", rememberMe: boolean = true, request?: http.ServerRequest, response?: http.ServerResponse): Promise<User>
	{
        var loggedOut = await this.logOut(request, response);
        var user: User = await this.getUser(username);

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

        var passworldValid : boolean = await this.comparePassword(pass, user.dbEntry.password);
        if (!passworldValid)
            throw new Error("The username or password is incorrect.");

        // Set the user last login time
        user.dbEntry.lastLoggedIn = Date.now();

        // Update the collection
        var result = await this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { lastLoggedIn: user.dbEntry.lastLoggedIn } });

        if (result.matchedCount === 0)
            throw new Error("Could not find the user in the database, please make sure its setup correctly");

        var session: Session = await this.sessionManager.createSession(!rememberMe, request, response);
        result = await this._userCollection.updateOne({ _id: user.dbEntry._id }, { $set: { sessionId: session.sessionId } });

        if (result.matchedCount === 0)
            throw new Error("Could not find the user in the database, please make sure its setup correctly");

        // Send logged in event to socket
        var token: def.SocketEvents.IUserToken = { username: username, type: ClientInstructionType[ClientInstructionType.Login] };
        await CommsController.singleton.processClientInstruction(new ClientInstruction(token, null, username));
        return user;
	}

	/**
	* Removes a user by his email or username
	* @param {string} username The username or email of the user
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean>} True if the user was in the DB or false if they were not
	*/
	async remove(username: string = "", request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean>
	{
        var user = await this.getUser(username);

		// There was no user
        if (!user)
            return false;

        // Remove the user from the DB
        var result = await this._userCollection.deleteOne({ _id: user.dbEntry._id });
        if (result.deletedCount === 0)
            return false;
        else
            return true;
    }

    /**
	* Sets the meta data associated with the user
	* @param {IUserEntry} user The user
    * @param {any} data The meta data object to set
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean|any>} Returns the data set
	*/
    async setMeta(user: def.IUserEntry, data?: any, request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean|any>
    {
        var that = this;

        // There was no user
        if (!user)
            return false;

        // Remove the user from the DB
        var result = await that._userCollection.updateOne(<def.IUserEntry>{ _id: user._id }, { $set: <def.IUserEntry>{ meta: ( data ? data : {} ) } });
        return data;
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
    async setMetaVal(user: def.IUserEntry, name : string, val: any, request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean|any>
    {
        var that = this;

        // There was no user
        if (!user)
            return false;

        var datum = "meta." + name;
        var updateToken = { $set: {} };
        updateToken.$set[datum] = val;

        // Remove the user from the DB
        var result = await that._userCollection.updateOne(<def.IUserEntry>{ _id: user._id }, updateToken);
        return val;
    }

    /**
	* Gets the value of user's meta by name
	* @param {IUserEntry} user The user
    * @param {any} name The name of the meta to get
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean|any>} The value to get
	*/
    async getMetaVal(user: def.IUserEntry, name: string, request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean|any>
    {
        var that = this;

        // There was no user
        if (!user)
            return false;

        // Remove the user from the DB
        var result: def.IUserEntry = await that._userCollection.find( <def.IUserEntry>{ _id: user._id }).project({ _id: 0, meta: 1 }).limit(1).next();
        return result.meta[name];
    }

    /**
	* Gets the meta data of a user
	* @param {IUserEntry} user The user
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean|any>} The value to get
	*/
    async getMetaData(user: def.IUserEntry, request?: http.ServerRequest, response?: http.ServerResponse): Promise<boolean|any>
    {
        var that = this;

        // There was no user
        if (!user)
            return false;

        // Remove the user from the DB
        var result: def.IUserEntry = await that._userCollection.find(<def.IUserEntry>{ _id: user._id }).project({ _id: 0, meta: 1 }).limit(1).next();
        return result.meta;
    }

    /**
	* Gets the total number of users
    * @param {RegExp} searchPhrases Search phrases
	* @returns {Promise<number>}
	*/
    async numUsers(searchPhrases?: RegExp): Promise<number>
    {
        var that = this;
        var findToken = { $or: [<def.IUserEntry>{ username: <any>searchPhrases }, <def.IUserEntry>{ email: <any>searchPhrases }] };
        var result: number = await that._userCollection.count(findToken);
        return  result;
    }

	/**
	* Prints user objects from the database
	* @param {number} limit The number of users to fetch
	* @param {number} startIndex The starting index from where we are fetching users from
    * @param {RegExp} searchPhrases Search phrases
	* @returns {Promise<Array<User>>}
	*/
    async getUsers(startIndex: number = 0, limit: number = 0, searchPhrases?: RegExp): Promise<Array<User>>
	{
        var findToken = { $or: [<def.IUserEntry>{ username: <any>searchPhrases }, <def.IUserEntry>{ email: <any>searchPhrases }] };
        var results : Array<def.IUserEntry> = await this._userCollection.find(findToken).skip(startIndex).limit(limit).toArray();
        var users: Array<User> = [];
        for (var i = 0, l = results.length; i < l; i++)
            users.push(new User(results[i]));

        return users;
    }

    /**
    * Creates the user manager singlton
    */
    static create(users: mongodb.Collection, sessions: mongodb.Collection, config: def.IConfig): UserManager
    {
        return new UserManager(users, sessions, config);
    }

    /**
    * Gets the user manager singlton
    */
    static get get(): UserManager
    {
        return UserManager._singleton;
    }
}