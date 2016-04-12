"use strict";
/**
* Base class for all controllers
*/
var Controller = (function () {
    function Controller() {
    }
    /**
    * All controllers must successfully return a promise for its initialization phase.
    */
    Controller.prototype.initialize = function (db) {
        return null;
    };
    /**
    * Ensures the index of a collection
    */
    Controller.prototype.ensureIndex = function (collection, name) {
        return new Promise(function (resolve, reject) {
            collection.createIndex(name, function (err, indexName) {
                if (err)
                    return reject(err);
                else
                    return resolve();
            });
        });
    };
    /**
    * Creates a new mongodb collection
    * @param {string} name The name of the collection to create
    * @param {mongodb.Db} db The database to use
    * @param {Promise<mongodb.Collection>}
    */
    Controller.prototype.createCollection = function (name, db) {
        return new Promise(function (resolve, reject) {
            db.createCollection(name, function (err, collection) {
                if (err || !collection)
                    return reject(new Error("Error creating collection: " + err.message));
                else
                    return resolve(collection);
            });
        });
    };
    return Controller;
})();
exports.Controller = Controller;
