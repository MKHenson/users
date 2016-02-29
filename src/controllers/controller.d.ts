import * as mongodb from "mongodb";
/**
* Base class for all controllers
*/
export declare class Controller {
    constructor();
    /**
    * All controllers must successfully return a promise for its initialization phase.
    */
    initialize(db: mongodb.Db): Promise<void>;
    /**
    * Ensures the index of a collection
    */
    ensureIndex(collection: mongodb.Collection, name: string): Promise<any>;
    /**
    * Creates a new mongodb collection
    * @param {string} name The name of the collection to create
    * @param {mongodb.Db} db The database to use
    * @param {Promise<mongodb.Collection>}
    */
    createCollection(name: string, db: mongodb.Db): Promise<mongodb.Collection>;
}
