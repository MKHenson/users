var def = require("./Definitions");
var Users_1 = require("./Users");
/**
* Checks if the request has admin rights. If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function hasAdminRights(req, res, next) {
    var username = req.params.username || req.params.user;
    requestHasPermission(def.UserPrivileges.Admin, req, res, username).then(function (user) {
        next();
    }).catch(function (error) {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({
            message: error.message,
            error: true
        }));
    });
}
exports.hasAdminRights = hasAdminRights;
/**
* Checks for session data and fetches the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function identifyUser(req, res, next) {
    Users_1.UserManager.get.loggedIn(req, res).then(function (user) {
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
exports.identifyUser = identifyUser;
/**
* Checks a user is logged in and has permission
* @param {def.UserPrivileges} level
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {string} existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
* @param {Function} next
*/
function requestHasPermission(level, req, res, existingUser) {
    return new Promise(function (resolve, reject) {
        Users_1.UserManager.get.loggedIn(req, res).then(function (user) {
            if (!user)
                return reject(new Error("You must be logged in to make this request"));
            if (existingUser !== undefined) {
                if ((user.dbEntry.email != existingUser && user.dbEntry.username != existingUser) && user.dbEntry.privileges > level)
                    return reject(new Error("You don't have permission to make this request"));
            }
            else if (user.dbEntry.privileges > level)
                return reject(new Error("You don't have permission to make this request"));
            req._user = user;
            resolve(true);
        });
    });
}
exports.requestHasPermission = requestHasPermission;
