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
var controller_1 = require("./controller");
/**
* Checks all incomming requests to see if they are CORS approved
*/
class CORSController extends controller_1.Controller {
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    constructor(e, config) {
        super();
        var matches = [];
        for (var i = 0, l = config.approvedDomains.length; i < l; i++)
            matches.push(new RegExp(config.approvedDomains[i]));
        // Approves the valid domains for CORS requests
        e.use(function (req, res, next) {
            if (req.headers.origin) {
                var matched = false;
                for (var m = 0, l = matches.length; m < l; m++)
                    if (req.headers.origin.match(matches[m])) {
                        matched = true;
                        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
                        res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
                        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, X-Mime-Type, X-File-Name, Cache-Control');
                        res.setHeader("Access-Control-Allow-Credentials", "true");
                        break;
                    }
                if (!matched)
                    console.log(`${req.headers.origin} Does not have permission. Add it to the allowed `);
            }
            if (req.method === 'OPTIONS') {
                res.status(200);
                res.end();
            }
            else
                next();
        });
    }
    /**
     * All controllers must successfully return a promise for its initialization phase.
     */
    initialize(db) {
        return Promise.resolve(null);
    }
}
exports.CORSController = CORSController;
