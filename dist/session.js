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
var events_1 = require("events");
/**
* A class that manages session data for active users
*/
class SessionManager extends events_1.EventEmitter {
    /**
    * Creates an instance of a session manager
    * @param { mongodb.Collection} sessionCollection The mongoDB collection to use for saving sessions
    */
    constructor(dbCollection, options) {
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
    numActiveSessions(startIndex, limit) {
        return __awaiter(this, void 0, Promise, function* () {
            var result = yield this._dbCollection.count({});
            return result;
        });
    }
    /**
    * Gets an array of all active sessions
    * @param {number} startIndex
    * @param {number} limit
    */
    getActiveSessions(startIndex, limit = -1) {
        return __awaiter(this, void 0, Promise, function* () {
            var results = yield this._dbCollection.find({}).skip(startIndex).limit(limit).toArray();
            return results;
        });
    }
    /**
    * Clears the users session cookie so that its no longer tracked
    * @param {string} sessionId The session ID to remove, if null then the currently authenticated session will be used
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<boolean>}
    */
    clearSession(sessionId, request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            // Check if the request has a valid session ID
            var sId = sessionId || this.getIDFromRequest(request);
            if (sId != "") {
                // We have a session ID, lets try to find it in the DB
                var sessionDB = yield this._dbCollection.find({ sessionId: sId }).limit(1).next();
                // Create a new session
                var session = new Session(sId, this._options);
                session.expiration = -1;
                // Adds / updates the DB with the new session
                var result = yield this._dbCollection.deleteOne({ sessionId: session.sessionId });
                this.emit("sessionRemoved", sId);
                // Set the session cookie header
                response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
                // Resolve the request
                return true;
            }
            else
                return true;
        });
    }
    /**
    * Attempts to get a session from the request object of the client
    * @param {http.ServerRequest} request
    * @param {http.ServerResponse} response
    * @returns {Promise<Session>} Returns a session or null if none can be found
    */
    getSession(request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            // Check if the request has a valid session ID
            var sessionId = this.getIDFromRequest(request);
            if (sessionId != "") {
                // We have a session ID, lets try to find it in the DB
                var sessionDB = yield this._dbCollection.find({ sessionId: sessionId }).limit(1).next();
                // Cant seem to find any session - so create a new one
                if (!sessionDB)
                    return null;
                // Create a new session
                var session = new Session(sessionId, this._options, sessionDB);
                // Adds / updates the DB with the new session
                var result = yield this._dbCollection.updateOne({ sessionId: session.sessionId }, session.save());
                // make sure a timeout is pending for the expired session reaper
                if (!this._timeout)
                    this._timeout = setTimeout(this._cleanupProxy, 60000);
                // Set the session cookie header
                if (response)
                    response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
                // Resolve the request
                return session;
            }
            else
                // Resolve with no session data
                return null;
        });
    }
    /**
    * Attempts to create a session from the request object of the client
    * @param {http.ServerRequest} request
    * @returns {Promise<Session>}
    */
    createSession(request, response) {
        return __awaiter(this, void 0, Promise, function* () {
            var session = new Session(this.createID(), this._options, null);
            // Adds / updates the DB with the new session
            var insertResult = yield this._dbCollection.insertOne(session.save());
            // Set the session cookie header
            response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
            // Resolve the request
            return session;
        });
    }
    /**
    * Each time a session is created, a timer is started to check all sessions in the DB.
    * Once the lifetime of a session is up its then removed from the DB and we check for any remaining sessions.
    * @param {boolean} force If true, this will force a cleanup instead of waiting on the next timer
    */
    cleanup(force = false) {
        return __awaiter(this, void 0, Promise, function* () {
            var now = +new Date;
            var next = Infinity;
            this._timeout = 0;
            try {
                // TODO: We need to replace the findToken with one where mongo looks at the conditions
                var findToken = {};
                var sessions = yield this._dbCollection.find(findToken).toArray();
                // Remove query
                var toRemoveQuery = { $or: [] };
                for (var i = 0, l = sessions.length; i < l; i++) {
                    var expiration = parseFloat(sessions[i].expiration.toString());
                    // If the session's time is up
                    if (expiration < now || force)
                        toRemoveQuery.$or.push({ _id: sessions[i]._id, sessionId: sessions[i].sessionId });
                    else
                        // Session time is not up, but may be the next time target
                        next = next < expiration ? next : expiration;
                }
                // Check if we need to remove sessions - if we do, then remove them :)
                if (toRemoveQuery.$or.length > 0) {
                    var result = yield this._dbCollection.deleteMany(toRemoveQuery);
                    for (var i = 0, l = toRemoveQuery.$or.length; i < l; i++)
                        this.emit("sessionRemoved", toRemoveQuery.$or[i].sessionId);
                    if (next < Infinity)
                        this._timeout = setTimeout(this._cleanupProxy, next - (+new Date) + 1000);
                }
                else {
                    if (next < Infinity)
                        this._timeout = setTimeout(this._cleanupProxy, next - (+new Date) + 1000);
                }
            }
            catch (err) {
                // If an error occurs, just try again in 2 minutes
                this._timeout = setTimeout(this._cleanupProxy, 120000);
            }
        });
    }
    /**
    * Looks at the headers from the HTTP request to determine if a session cookie has been asssigned and returns the ID.
    * @param {http.ServerRequest} req
    * @returns {string} The ID of the user session, or an empty string
    */
    getIDFromRequest(req) {
        var m;
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
    createID() {
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
    }
}
exports.SessionManager = SessionManager;
/**
* A class to represent session data
*/
class Session {
    /**
    * Creates an instance of the session
    * @param {string} sessionId The ID of the session
    * @param {SessionOptions} options The options associated with this session
    * @param {ISessionEntry} data The data of the session in the database
    */
    constructor(sessionId, options, data) {
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
    open(data) {
        this.sessionId = data.sessionId;
        this.data = data.data;
        this.expiration = data.expiration;
    }
    /**
    * Creates an object that represents this session to be saved in the database
    * @returns {ISessionEntry}
    */
    save() {
        var data = {};
        data.sessionId = this.sessionId;
        data.data = this.data;
        data.expiration = (new Date(Date.now() + this.options.lifetime * 1000)).getTime();
        return data;
    }
    /**
    * This method returns the value to send in the Set-Cookie header which you should send with every request that goes back to the browser, e.g.
    * response.setHeader('Set-Cookie', session.getSetCookieHeaderValue());
    */
    getSetCookieHeaderValue() {
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
    dateCookieString(ms) {
        var d, wdy, mon;
        d = new Date(ms);
        wdy = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return wdy[d.getUTCDay()] + ', ' + this.pad(d.getUTCDate()) + '-' + mon[d.getUTCMonth()] + '-' + d.getUTCFullYear()
            + ' ' + this.pad(d.getUTCHours()) + ':' + this.pad(d.getUTCMinutes()) + ':' + this.pad(d.getUTCSeconds()) + ' GMT';
    }
    /**
    * Pads a string with 0's
    */
    pad(n) {
        return n > 9 ? '' + n : '0' + n;
    }
}
exports.Session = Session;
