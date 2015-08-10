var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Controller_1 = require("./Controller");
var express = require("express");
/**
* Checks all incomming requests to see if they are CORS approved
*/
var CORSController = (function (_super) {
    __extends(CORSController, _super);
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    function CORSController(e, config) {
        _super.call(this);
        // Create the router
        var router = express.Router();
        var matches = [];
        for (var i = 0, l = config.approvedDomains.length; i < l; i++)
            matches.push(new RegExp(config.approvedDomains[i]));
        // Approves the valid domains for CORS requests
        e.use(function (req, res, next) {
            if (req.headers.origin) {
                for (var m = 0, l = matches.length; m < l; m++)
                    if (req.headers.origin.match(matches[m])) {
                        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
                        res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
                        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, X-Mime-Type, X-File-Name, Cache-Control');
                        res.setHeader("Access-Control-Allow-Credentials", "true");
                        break;
                    }
            }
            else if (req.headers.origin)
                console.log(req.headers.origin + " Does not have permission. Add it to the allowed ");
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
    CORSController.prototype.initialize = function (db) {
        return Promise.resolve();
    };
    return CORSController;
})(Controller_1.Controller);
exports.CORSController = CORSController;
