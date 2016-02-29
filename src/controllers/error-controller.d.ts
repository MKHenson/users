import * as mongodb from "mongodb";
import * as def from "webinate-users";
import { Controller } from "./controller";
import express = require("express");
/**
* Handles express errors
*/
export declare class ErrorController extends Controller {
    /**
    * Creates an instance
    */
    constructor(e: express.Express, config: def.IConfig);
    /**
    * All controllers must successfully return a promise for its initialization phase.
    */
    initialize(db: mongodb.Db): Promise<void>;
}
