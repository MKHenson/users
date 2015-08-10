var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Controller_1 = require("./Controller");
/**
* Handles express errors
*/
var ErrorController = (function (_super) {
    __extends(ErrorController, _super);
    /**
    * Creates an instance
    */
    function ErrorController(e, config) {
        _super.call(this);
        // Handle all errors the same way
        e.use(function (err, req, res, next) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    }
    /**
    * All controllers must successfully return a promise for its initialization phase.
    */
    ErrorController.prototype.initialize = function (db) {
        return Promise.resolve();
    };
    return ErrorController;
})(Controller_1.Controller);
exports.ErrorController = ErrorController;
