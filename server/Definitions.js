/*
* Describes what kind of privileges the user has
*/
(function (UserPrivileges) {
    UserPrivileges[UserPrivileges["SuperAdmin"] = 1] = "SuperAdmin";
    UserPrivileges[UserPrivileges["Admin"] = 2] = "Admin";
    UserPrivileges[UserPrivileges["Regular"] = 3] = "Regular";
})(exports.UserPrivileges || (exports.UserPrivileges = {}));
var UserPrivileges = exports.UserPrivileges;
