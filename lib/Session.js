/**
* A class that manages session data for active users
*/
var SessionManager = (function () {
    /**
    * Creates an instance of a session manager
    * @param { mongodb.Collection} sessionCollection The mongoDB collection to use for saving sessions
    */
    function SessionManager(dbCollection, options) {
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
    SessionManager.prototype.getActiveSessions = function (startIndex, limit) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that._dbCollection.find({}, {}, startIndex, limit, function (error, result) {
                if (error)
                    return reject(error);
                result.toArray(function (error, results) {
                    if (error)
                        return reject(error);
                    resolve(results);
                });
            });
        });
    };
    /**
    * Clears the users session cookie so that its no longer tracked
    * @param {string} sessionId The session ID to remove, if null then the currently authenticated session will be used
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>}
    */
    SessionManager.prototype.clearSession = function (sessionId, request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Check if the request has a valid session ID
            var sId = sessionId || that.getIDFromRequest(request);
            if (sId != "") {
                // We have a session ID, lets try to find it in the DB
                that._dbCollection.findOne({ sessionId: sId }, function (err, sessionDB) {
                    // Cant seem to find any session - so create a new one
                    if (err)
                        reject(err);
                    else {
                        // Create a new session
                        var session = new Session(sId, that._options);
                        session.expiration = -1;
                        // Adds / updates the DB with the new session
                        that._dbCollection.remove({ sessionId: session.sessionId }, function (err, result) {
                            if (err)
                                reject(err);
                            else {
                                // Set the session cookie header
                                response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
                                // Resolve the request
                                resolve(true);
                            }
                        });
                    }
                });
            }
            else
                resolve(true);
        });
    };
    /**
    * Attempts to get a session from the request object of the client
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<Session>} Returns a session or null if none can be found
    */
    SessionManager.prototype.getSession = function (request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Check if the request has a valid session ID
            var sessionId = that.getIDFromRequest(request);
            if (sessionId != "") {
                // We have a session ID, lets try to find it in the DB
                that._dbCollection.findOne({ sessionId: sessionId }, function (err, sessionDB) {
                    // Cant seem to find any session - so create a new one
                    if (err)
                        reject(err);
                    else if (!sessionDB)
                        reject(null);
                    else {
                        // Create a new session
                        var session = new Session(sessionId, that._options, sessionDB);
                        // Adds / updates the DB with the new session
                        that._dbCollection.update({ sessionId: session.sessionId }, session.save(), null, function (err, result) {
                            if (err)
                                reject(err);
                            else {
                                // make sure a timeout is pending for the expired session reaper
                                if (!that._timeout)
                                    that._timeout = setTimeout(that._cleanupProxy, 60000);
                                // Set the session cookie header
                                response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
                                // Resolve the request
                                resolve(session);
                            }
                        });
                    }
                });
            }
            else
                // Resolve with no session data
                resolve(null);
        });
    };
    ///**
    //* Attempts to renew a session, giving it a new expiration time
    //* @param {Session} session
    //* @param {http.ServerRequest} request
    //* @param {http.ServerResponse} response
    //* @returns {Promise<Session>} Returns a session or null if none can be found
    //*/
    //renewSession(session: Session, request: http.ServerRequest, response: http.ServerResponse): Promise<Session>
    //{
    //	var that = this;
    //	return new Promise<Session>((resolve, reject) =>
    //	{
    //		// Adds / updates the DB with the new session
    //		that._dbCollection.update({ sessionId: session.sessionId }, session.save(), null, function (err: Error, result: any)
    //		{
    //			if (err)
    //				reject(err);
    //			else
    //			{
    //				// make sure a timeout is pending for the expired session reaper
    //				if (!that._timeout)
    //					that._timeout = setTimeout(that._cleanupProxy, 60000);
    //				// Set the session cookie header
    //				response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
    //				// Resolve the request
    //				resolve(session);
    //			}
    //		});
    //	});
    //}
    /**
    * Attempts to create a session from the request object of the client
    * @param {http.ServerRequest} request
    * @returns {Promise<Session>}
    */
    SessionManager.prototype.createSession = function (request, response) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var session = new Session(that.createID(), that._options, null);
            // Adds / updates the DB with the new session
            that._dbCollection.insert(session.save(), function (err, result) {
                if (err)
                    reject(err);
                else {
                    // Set the session cookie header
                    response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
                    // Resolve the request
                    resolve(session);
                }
            });
        });
    };
    ///**
    //* Creates or fetches a session object by looking at the headers of a request
    //* @returns {Session}
    //*/
    //lookupOrCreate(request: http.ServerRequest, opts: { sessionID?: string; }, callback: (err: string, session: Session) => void): Promise<Session>
    //{
    //	var that = this;
    //	var session: Session;
    //	var that = this;
    //	opts = opts || {};
    //	return new Promise<Session>(function (resolve, reject)
    //	{
    //		var sessionCreated = function (session: Session, dbEntry?: any)
    //		{
    //			if (!session)
    //				session = new Session(opts.sessionID ? opts.sessionID : that.createID(), opts);
    //			// If it was loaded in the DB, then set its properties from the saved results
    //			if (dbEntry)
    //				session.open(dbEntry);
    //			// Reset the expiration date for the session
    //			session.expiration = (new Date(Date.now() + session.lifetime * 1000)).getTime();
    //			callback(null, session);
    //			if (!session.data)
    //			{
    //				// Adds / updates the DB with the new session
    //				that._dbCollection.remove({ id: session.id }, function (err: Error, result: any)
    //				{
    //					if (err)
    //						colors.log(colors.red(`Could not remove session : '${err}'"`));
    //					else if (result === 0)
    //						colors.log(colors.red(`No Sessions were deleted"`));
    //				});
    //			}
    //			else
    //			{
    //				// Adds / updates the DB with the new session
    //				that._dbCollection.update({ id: session.id }, session.save(), { upsert: true }, function (err: Error, result: any)
    //				{
    //					if (err || !result)
    //						colors.log(colors.red(`Could not save session to the model: '${err}'"`));
    //					else
    //					{
    //						// make sure a timeout is pending for the expired session reaper
    //						if (!that._timeout)
    //							that._timeout = setTimeout(that._cleanupProxy, 60000);
    //					}
    //				});
    //			}
    //		}
    //		// See if the client has a session id - then get the session data stored in the model
    //		var sessionId: string = that.getIDFromRequest(request);
    //		if (sessionId != "")
    //		{
    //			that._dbCollection.find({ id: sessionId }, function (err: Error, result: mongodb.Cursor)
    //			{
    //				// Cant seem to find any session - so create a new one
    //				if (err || !result)
    //					sessionCreated(null);
    //				else
    //				{
    //					result.nextObject(function (err: Error, sessionEntry: any)
    //					{
    //						if (err || !result)
    //							sessionCreated(null);
    //						else
    //							sessionCreated(new Session(sessionId, opts), sessionEntry);
    //					});
    //				}
    //			});
    //		}
    //		else
    //			sessionCreated(null);
    //	});
    //}
    /**
    * Each time a session is created, a timer is started to check all sessions in the DB.
    * Once the lifetime of a session is up its then removed from the DB and we check for any remaining sessions.
    * @param {boolean} force If true, this will force a cleanup instead of waiting on the next timer
    */
    SessionManager.prototype.cleanup = function (force) {
        if (force === void 0) { force = false; }
        var that = this;
        var now = +new Date;
        var next = Infinity;
        this._timeout = 0;
        that._dbCollection.find(function (err, result) {
            // If an error occurs, just try again in 2 minutes
            if (err)
                that._timeout = setTimeout(that._cleanupProxy, 120000);
            else {
                result.toArray(function (err, sessions) {
                    // If an error occurs, just try again in 2 minutes
                    if (err)
                        that._timeout = setTimeout(that._cleanupProxy, 120000);
                    else {
                        // Remove query
                        var toRemoveQuery = { $or: [] };
                        for (var i = 0, l = sessions.length; i < l; i++) {
                            var expiration = parseFloat(sessions[i].expiration.toString());
                            // If the session's time is up
                            if (expiration < now || force)
                                toRemoveQuery.$or.push({ _id: sessions[i]._id });
                            else
                                // Session time is not up, but may be the next time target
                                next = next < expiration ? next : expiration;
                        }
                        // Check if we need to remove sessions - if we do, then remove them :)
                        if (toRemoveQuery.$or.length > 0) {
                            that._dbCollection.remove(toRemoveQuery, function (err, result) {
                                if (next < Infinity)
                                    that._timeout = setTimeout(this._cleanupProxy, next - (+new Date) + 1000);
                            });
                        }
                        else {
                            if (next < Infinity)
                                that._timeout = setTimeout(this._cleanupProxy, next - (+new Date) + 1000);
                        }
                    }
                });
            }
        });
    };
    /**
    * Looks at the headers from the HTTP request to determine if a session cookie has been asssigned and returns the ID.
    * @param {http.ServerRequest} req
    * @returns {string} The ID of the user session, or an empty string
    */
    SessionManager.prototype.getIDFromRequest = function (req) {
        var m;
        // look for an existing SID in the Cookie header for which we have a session
        if (req.headers.cookie && (m = /SID=([^ ,;]*)/.exec(req.headers.cookie)))
            return m[1];
        else
            return "";
    };
    /**
    * Creates a random session ID.
    * The ID is a pseude-random ASCII string which contains at least the specified number of bits of entropy (64 in this case)
    * the return value is a string of length [bits/6] of characters from the base64 alphabet
    * @returns {string} A user session ID
    */
    SessionManager.prototype.createID = function () {
        var bits = 64;
        var chars, rand, i, ret;
        chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        ret = "";
        // in v8, Math.random() yields 32 pseudo-random bits (in spidermonkey it gives 53)
        while (bits > 0) {
            rand = Math.floor(Math.random() * 0x100000000); // 32-bit integer
            // base 64 means 6 bits per character, so we use the top 30 bits from rand to give 30/6=5 characters.
            for (i = 26; i > 0 && bits > 0; i -= 6, bits -= 6)
                ret += chars[0x3F & rand >>> i];
        }
        return ret;
    };
    return SessionManager;
})();
exports.SessionManager = SessionManager;
/**
* A class to represent session data
*/
var Session = (function () {
    /**
    * Creates an instance of the session
    * @param {string} sessionId The ID of the session
    * @param {SessionOptions} options The options associated with this session
    * @param {ISessionEntry} data The data of the session in the database
    */
    function Session(sessionId, options, data) {
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
    Session.prototype.open = function (data) {
        this.sessionId = data.sessionId;
        this.data = data.data;
        this.expiration = data.expiration;
    };
    /**
    * Creates an object that represents this session to be saved in the database
    * @returns {ISessionEntry}
    */
    Session.prototype.save = function () {
        var data = {};
        data.sessionId = this.sessionId;
        data.data = this.data;
        data.expiration = (new Date(Date.now() + this.options.lifetime * 1000)).getTime();
        return data;
    };
    /**
    * This method returns the value to send in the Set-Cookie header which you should send with every request that goes back to the browser, e.g.
    * response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
    */
    Session.prototype.getSetCookieHeaderValue = function () {
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
    };
    /**
    * Converts from milliseconds to string, since the epoch to Cookie 'expires' format which is Wdy, DD-Mon-YYYY HH:MM:SS GMT
    */
    Session.prototype.dateCookieString = function (ms) {
        var d, wdy, mon;
        d = new Date(ms);
        wdy = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return wdy[d.getUTCDay()] + ', ' + this.pad(d.getUTCDate()) + '-' + mon[d.getUTCMonth()] + '-' + d.getUTCFullYear()
            + ' ' + this.pad(d.getUTCHours()) + ':' + this.pad(d.getUTCMinutes()) + ':' + this.pad(d.getUTCSeconds()) + ' GMT';
    };
    /**
    * Pads a string with 0's
    */
    Session.prototype.pad = function (n) {
        return n > 9 ? '' + n : '0' + n;
    };
    return Session;
})();
exports.Session = Session;
