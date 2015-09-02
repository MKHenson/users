var def = require("webinate-users");
var Users_1 = require("./Users");
exports.secret = { key: "" };
/**
* Checks if the request has owner rights (admin/owner). If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function ownerRights(req, res, next) {
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
exports.ownerRights = ownerRights;
/**
* Checks if the request has admin rights. If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
function adminRights(req, res, next) {
    Users_1.UserManager.get.loggedIn(req, res).then(function (user) {
        if (!user)
            return res.end(JSON.stringify({ message: "You must be logged in to make this request", error: true }));
        req._user = user;
        // Allow certain user requests that have the secret key
        var secretKey = (req.body ? req.body.secret : null);
        if (secretKey && secretKey == exports.secret.key)
            next();
        else if (user.dbEntry.privileges > def.UserPrivileges.Admin)
            return res.end(JSON.stringify({ message: "You don't have permission to make this request", error: true }));
        else
            next();
    });
}
exports.adminRights = adminRights;
/**
* Checks for session data and fetches the user. Sends back an error if no user present
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
