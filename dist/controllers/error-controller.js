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
* Handles express errors
*/
class ErrorController extends controller_1.Controller {
    /**
    * Creates an instance
    */
    constructor(e, config) {
        super();
        // Handle all errors the same way
        e.use(function (err, req, res, next) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    }
    /**
    * All controllers must successfully return a promise for its initialization phase.
    */
    initialize(db) {
        return Promise.resolve(null);
    }
}
exports.ErrorController = ErrorController;
