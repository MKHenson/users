import * as http from "http";
import * as mongodb from "mongodb";
import {ISessionEntry} from "webinate-users";
import {EventEmitter} from "events"

/*
* Describes the options for the session
*/
export interface ISessionOptions
{
	/*
	* If set, the session will be restricted to URLs underneath the given path.
	* By default the path is "/", which means that the same sessions will be shared across the entire domain.
	*/
	path?: string;

	/**
	* If present, the cookie (and hence the session) will apply to the given domain, including any subdomains.
	* For example, on a request from foo.example.org, if the domain is set to '.example.org', then this session will persist across any subdomain of example.org.
	* By default, the domain is not set, and the session will only be visible to other requests that exactly match the domain.
	*/
	domain?: string;

	/**
	* A persistent connection is one that will last after the user closes the window and visits the site again (true).
	* A non-persistent that will forget the user once the window is closed (false)
	*/
	persistent?: boolean;

	/**
	* If true, the cookie will be encrypted
	*/
	secure?: boolean;

	/**
	* If you wish to create a persistent session (one that will last after the user closes the window and visits the site again) you must specify a lifetime as a number of seconds.
	* Common values are 86400 for one day, and 604800 for one week.
	* The lifetime controls both when the browser's cookie will expire, and when the session object will be freed by the sessions module.
	* By default, the browser cookie will expire when the window is closed, and the session object will be freed 24 hours after the last request is seen.
	*/
	lifetime?: number;
}

/**
* A class that manages session data for active users
*/
export class SessionManager extends EventEmitter
{
	private _dbCollection: mongodb.Collection;
	private _timeout: number;
	private _cleanupProxy: any;
	private _options: ISessionOptions;

	/**
	* Creates an instance of a session manager
	* @param { mongodb.Collection} sessionCollection The mongoDB collection to use for saving sessions
	*/
	constructor(dbCollection: mongodb.Collection, options?: ISessionOptions)
    {
        super();
		this._dbCollection = dbCollection;
		this._cleanupProxy = this.cleanup.bind(this);
		this._timeout = 0;
		this._options = {};
		this._options.path = options.path || "/";
		this._options.domain = options.domain || "";
		this._options.lifetime = options.lifetime || 60 * 30; //30 minutes
		this._options.persistent = options.persistent || true;
		this._options.secure = options.secure || false;
    }

    /**
	* Gets an array of all active sessions
	* @param {number} startIndex
	* @param {number} limit
	*/
    numActiveSessions(startIndex?: number, limit?: number): Promise<number>
    {
        var that = this;
        return new Promise<number>(function (resolve, reject)
        {
            that._dbCollection.count({}, function (error: Error, count: number)
            {
                if (error)
                    return reject(error);

               resolve(count);
            })
        });
    }

	/**
	* Gets an array of all active sessions
	* @param {number} startIndex
	* @param {number} limit
	*/
	getActiveSessions(startIndex?: number, limit: number = -1): Promise<Array<ISessionEntry>>
	{
		var that = this;

        return new Promise<Array<ISessionEntry>>(function (resolve, reject)
		{
			that._dbCollection.find({}).skip(startIndex).limit(limit).toArray().then(function (results: Array<ISessionEntry>) {
				resolve(results);
			}).catch(function(error: Error){
                return reject(error);
            });
		});
	}

	/**
	* Clears the users session cookie so that its no longer tracked
	* @param {string} sessionId The session ID to remove, if null then the currently authenticated session will be used
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<boolean>}
	*/
	clearSession(sessionId: string, request: http.ServerRequest, response: http.ServerResponse): Promise<boolean>
	{
		var that = this;

		return new Promise<boolean>((resolve, reject) =>
		{
			// Check if the request has a valid session ID
			var sId: string = sessionId || that.getIDFromRequest(request);

			if (sId != "")
			{
				// We have a session ID, lets try to find it in the DB
				that._dbCollection.find({ sessionId: sId }).limit(1).next().then(function(sessionDB: ISessionEntry) {

                    // Create a new session
                    var session = new Session(sId, that._options);
                    session.expiration = -1;

                    // Adds / updates the DB with the new session
                    that._dbCollection.deleteOne({ sessionId: session.sessionId }).then(function (result: any) {

                        that.emit("sessionRemoved", sId);

                        // Set the session cookie header
                        response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());

                        // Resolve the request
                        resolve(true);

                    }).catch(function(err: Error){
                        reject(err);
                    });

				}).catch(function(err: Error){
                    reject(err);
                });
			}
			else
				resolve(true);
		});
	}

	/**
	* Attempts to get a session from the request object of the client
	* @param {http.ServerRequest} request
	* @param {http.ServerResponse} response
	* @returns {Promise<Session>} Returns a session or null if none can be found
	*/
	getSession(request: http.ServerRequest, response: http.ServerResponse): Promise<Session>
	{
		var that = this;

		return new Promise<Session>( (resolve, reject) =>
		{
			// Check if the request has a valid session ID
			var sessionId: string = that.getIDFromRequest(request);

			if (sessionId != "")
			{
				// We have a session ID, lets try to find it in the DB
				that._dbCollection.find({ sessionId: sessionId }).limit(1).next().then(function(sessionDB: ISessionEntry) {
					// Cant seem to find any session - so create a new one
					if (!sessionDB)
                        resolve(null);
					else
					{
						// Create a new session
						var session = new Session(sessionId, that._options, sessionDB);

						// Adds / updates the DB with the new session
						that._dbCollection.updateOne({ sessionId: session.sessionId }, session.save()).then(function (result) {

                            // make sure a timeout is pending for the expired session reaper
                            if (!that._timeout)
                                that._timeout = setTimeout(that._cleanupProxy, 60000);

                            // Set the session cookie header
                            if (response)
                                response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());

                            // Resolve the request
                            resolve(session);

						}).catch(function(err: Error){
                            return reject(err);
                        });
					}
				}).catch(function(err: Error){
                    reject(err);
                });
			}
			else
				// Resolve with no session data
				resolve(null);
		});
	}

	/**
	* Attempts to create a session from the request object of the client
	* @param {http.ServerRequest} request
	* @returns {Promise<Session>}
	*/
	createSession(request: http.ServerRequest, response?: http.ServerResponse): Promise<Session>
	{
		var that = this;

		return new Promise<Session>(function (resolve, reject)
		{
			var session = new Session(that.createID(), that._options, null);

			// Adds / updates the DB with the new session
			that._dbCollection.insertOne(session.save()).then(function(insertResult) {

                // Set the session cookie header
                response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());

                // Resolve the request
                resolve(session);

			}).catch(function(err: Error){
                reject(err);
            });
		});
	}

	/**
	* Each time a session is created, a timer is started to check all sessions in the DB.
	* Once the lifetime of a session is up its then removed from the DB and we check for any remaining sessions.
	* @param {boolean} force If true, this will force a cleanup instead of waiting on the next timer
	*/
	cleanup(force: boolean = false)
	{
		var that = this;
		var now: number = +new Date;
		var next: number = Infinity;

		this._timeout = 0;

		that._dbCollection.find(function(err: Error, result: mongodb.Cursor)
		{
			// If an error occurs, just try again in 2 minutes
			if (err)
				that._timeout = setTimeout(that._cleanupProxy, 120000);
			else
			{
				result.toArray(function (err: Error, sessions: Array<ISessionEntry>)
				{
					// If an error occurs, just try again in 2 minutes
					if (err)
						that._timeout = setTimeout(that._cleanupProxy, 120000);
					else
					{
                        // Remove query
                        var toRemoveQuery: { $or: Array<ISessionEntry> } = { $or: [] };

						for (var i = 0, l = sessions.length; i < l; i++)
						{
							var expiration: number = parseFloat(sessions[i].expiration.toString());

							// If the session's time is up
                            if (expiration < now || force)
                                toRemoveQuery.$or.push(<ISessionEntry>{ _id: sessions[i]._id, sessionId: sessions[i].sessionId });
							else
								// Session time is not up, but may be the next time target
								next = next < expiration ? next : expiration;
						}

						// Check if we need to remove sessions - if we do, then remove them :)
						if (toRemoveQuery.$or.length > 0)
						{
							that._dbCollection.deleteMany(toRemoveQuery).then( function (result)
                            {
                                for (var i = 0, l = toRemoveQuery.$or.length; i < l; i++)
                                    that.emit("sessionRemoved", toRemoveQuery.$or[i].sessionId );

								if (next < Infinity)
									that._timeout = setTimeout(this._cleanupProxy, next - (+new Date) + 1000);
							});
						}
						else
						{
							if (next < Infinity)
								that._timeout = setTimeout(this._cleanupProxy, next - (+new Date) + 1000);
						}
					}
				});
			}
		});
	}

	/**
	* Looks at the headers from the HTTP request to determine if a session cookie has been asssigned and returns the ID.
	* @param {http.ServerRequest} req
	* @returns {string} The ID of the user session, or an empty string
	*/
	private getIDFromRequest(req: http.ServerRequest): string
	{
		var m: RegExpExecArray;

		// look for an existing SID in the Cookie header for which we have a session
		if (req.headers.cookie && (m = /SID=([^ ,;]*)/.exec(req.headers.cookie)))
			return m[1];
		else
			return "";
	}

	/**
	* Creates a random session ID.
	* The ID is a pseude-random ASCII string which contains at least the specified number of bits of entropy (64 in this case)
	* the return value is a string of length [bits/6] of characters from the base64 alphabet
	* @returns {string} A user session ID
	*/
	private createID(): string
	{
		var bits: number = 64;

		var chars: string, rand: number, i: number, ret : string;
		chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		ret = "";

		// in v8, Math.random() yields 32 pseudo-random bits (in spidermonkey it gives 53)
		while (bits > 0)
		{
			rand = Math.floor(Math.random() * 0x100000000); // 32-bit integer

			// base 64 means 6 bits per character, so we use the top 30 bits from rand to give 30/6=5 characters.
			for (i = 26; i > 0 && bits > 0; i -= 6, bits -= 6)
				ret += chars[0x3F & rand >>> i];
		}

		return ret
	}
}


/**
* A class to represent session data
*/
export class Session
{
	_id: mongodb.ObjectID;

	/*
	* The unique ID of the session
	*/
	sessionId: string;

	/*
	* Any custom data associated with the session
	*/
	data: any;

	/**
	* The specific time when this session will expire
	*/
	expiration: number;

	/**
	* The options of this session system
	*/
	options: ISessionOptions;

	/**
	* Creates an instance of the session
	* @param {string} sessionId The ID of the session
	* @param {SessionOptions} options The options associated with this session
	* @param {ISessionEntry} data The data of the session in the database
	*/
	constructor(sessionId: string, options: ISessionOptions, data?: ISessionEntry)
	{
		this.sessionId = sessionId;
		this.data = data || {};
		this.options = options;
		this.expiration = (new Date(Date.now() + options.lifetime * 1000)).getTime();

		if (data)
			this.open(data);
	}

	/**
	* Fills in the data of this session from the data saved in the database
	* @param {ISessionEntry} data The data fetched from the database
	*/
	open(data: ISessionEntry)
	{
		this.sessionId = data.sessionId;
		this.data = data.data;
		this.expiration = data.expiration;
	}

	/**
	* Creates an object that represents this session to be saved in the database
	* @returns {ISessionEntry}
	*/
	save(): ISessionEntry
	{
		var data: any = {};
		data.sessionId = this.sessionId;
		data.data = this.data;
		data.expiration = (new Date(Date.now() + this.options.lifetime * 1000)).getTime();
		return data;
	}

	/**
	* This method returns the value to send in the Set-Cookie header which you should send with every request that goes back to the browser, e.g.
	* response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
	*/
	getSetCookieHeaderValue()
	{
		var parts;
		parts = ['SID=' + this.sessionId];

		if (this.options.path)
			parts.push('path=' + this.options.path);

		if (this.options.domain)
			parts.push('domain=' + this.options.domain);

		if (this.options.persistent)
			parts.push('expires=' + this.dateCookieString(this.expiration));

		if (this.options.secure)
			parts.push("secure");

		return parts.join('; ');
	}

	/**
	* Converts from milliseconds to string, since the epoch to Cookie 'expires' format which is Wdy, DD-Mon-YYYY HH:MM:SS GMT
	*/
	private dateCookieString(ms: number): string
	{
		var d, wdy, mon
		d = new Date(ms)
		wdy = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
		mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
		return wdy[d.getUTCDay()] + ', ' + this.pad(d.getUTCDate()) + '-' + mon[d.getUTCMonth()] + '-' + d.getUTCFullYear()
			+ ' ' + this.pad(d.getUTCHours()) + ':' + this.pad(d.getUTCMinutes()) + ':' + this.pad(d.getUTCSeconds()) + ' GMT';
	}

	/**
	* Pads a string with 0's
	*/
	private pad(n: number): string
	{
		return n > 9 ? '' + n : '0' + n;
	}
}