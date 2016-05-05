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
var winston = require("winston");
/**
 * Helper function to return a status 200 json object of type T
 */
function okJson(data, res) {
    if (data.error)
        winston.error(data.message, { process: process.pid });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
}
exports.okJson = okJson;
/**
 * Helper function to return a status 200 json object of type T
 */
function errJson(err, res) {
    winston.error(err.message, { process: process.pid });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: true, message: err.message }));
}
exports.errJson = errJson;
