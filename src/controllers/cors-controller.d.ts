import * as mongodb from "mongodb";
import { IConfig } from "webinate-users";
import { Controller } from "./controller";
import express = require("express");
/**
* Checks all incomming requests to see if they are CORS approved
*/
export declare class CORSController extends Controller {
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    constructor(e: express.Express, config: IConfig);
    /**
     * All controllers must successfully return a promise for its initialization phase.
     */
    initialize(db: mongodb.Db): Promise<void>;
}
