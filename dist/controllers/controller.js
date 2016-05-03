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
/**
* Base class for all controllers
*/
class Controller {
    constructor() {
    }
    /**
    * All controllers must successfully return a promise for its initialization phase.
    */
    initialize(db) {
        return null;
    }
    /**
    * Ensures the index of a collection
    */
    ensureIndex(collection, name) {
        return new Promise(function (resolve, reject) {
            collection.createIndex(name, function (err, indexName) {
                if (err)
                    return reject(err);
                else
                    return resolve();
            });
        });
    }
    /**
    * Creates a new mongodb collection
    * @param {string} name The name of the collection to create
    * @param {mongodb.Db} db The database to use
    * @param {Promise<mongodb.Collection>}
    */
    createCollection(name, db) {
        return new Promise(function (resolve, reject) {
            db.createCollection(name, function (err, collection) {
                if (err || !collection)
                    return reject(new Error("Error creating collection: " + err.message));
                else
                    return resolve(collection);
            });
        });
    }
}
exports.Controller = Controller;
