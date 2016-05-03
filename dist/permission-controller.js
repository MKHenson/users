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
var users_1 = require("./users");
/**
* Checks if the request has owner rights (admin/owner). If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function ownerRights(req, res, next) {
    var username = req.params.username || req.params.user;
    requestHasPermission(users_1.UserPrivileges.Admin, req, res, username).then(function (user) {
        next();
    }).catch(function (error) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
            message: error.message,
            error: true
        }));
    });
}
exports.ownerRights = ownerRights;
/**
* Checks if the request has admin rights. If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function adminRights(req, res, next) {
    users_1.UserManager.get.loggedIn(req, res).then(function (user) {
        if (!user)
            return res.end(JSON.stringify({ message: "You must be logged in to make this request", error: true }));
        req._user = user;
        if (user.dbEntry.privileges > users_1.UserPrivileges.Admin)
            return res.end(JSON.stringify({ message: "You don't have permission to make this request", error: true }));
        else
            next();
    });
}
exports.adminRights = adminRights;
/**
* Checks for session data and fetches the user. Does not throw an error if the user is not present.
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function identifyUser(req, res, next) {
    users_1.UserManager.get.loggedIn(req, res).then(function (user) {
        req._user = null;
        next();
    }).catch(function (error) {
        next();
    });
}
exports.identifyUser = identifyUser;
/**
* Checks for session data and fetches the user. Sends back an error if no user present
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function requireUser(req, res, next) {
    users_1.UserManager.get.loggedIn(req, res).then(function (user) {
        if (!user) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
                message: "You must be logged in to make this request",
                error: true
            }));
        }
        req._user = user;
        next();
    }).catch(function (error) {
        next();
    });
}
exports.requireUser = requireUser;
/**
* Checks a user is logged in and has permission
* @param {def.UserPrivileges} level
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {string} existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
* @param {Function} next
*/
function requestHasPermission(level, req, res, existingUser) {
    return __awaiter(this, void 0, Promise, function* () {
        var user = yield users_1.UserManager.get.loggedIn(req, res);
        if (!user)
            throw new Error("You must be logged in to make this request");
        if (existingUser !== undefined) {
            if ((user.dbEntry.email != existingUser && user.dbEntry.username != existingUser) && user.dbEntry.privileges > level)
                throw new Error("You don't have permission to make this request");
        }
        else if (user.dbEntry.privileges > level)
            throw new Error("You don't have permission to make this request");
        req._user = user;
        return true;
    });
}
exports.requestHasPermission = requestHasPermission;
