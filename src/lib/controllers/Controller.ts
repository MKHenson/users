import * as mongodb from "mongodb";

/**
* Base class for all controllers
*/
export class Controller
{
    constructor()
    {
    }

    /**
    * All controllers must successfully return a promise for its initialization phase. 
    */
    initialize(db: mongodb.Db): Promise<void>
    {
        return null;
    }

    /**
    * Creates a new mongodb collection
    * @param {string} name The name of the collection to create
    * @param {mongodb.Db} db The database to use
    * @param {Promise<mongodb.Collection>}
    */
    createCollection(name: string, db: mongodb.Db): Promise<mongodb.Collection>
    {
        return new Promise<mongodb.Collection>(function (resolve, reject)
        {
            db.createCollection(name, function (err: Error, collection: mongodb.Collection) 
            {
                if (err || !collection)
                    return reject(new Error("Error creating collection: " + err.message));
                else
                    return resolve(collection);
            });
        });
    }
}

