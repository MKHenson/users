import * as mongodb from "mongodb";
import * as http from "http";
import * as def from "webinate-users";
import {Controller} from "./controller"
import express = require("express");

/**
* Handles express errors
*/
export class ErrorController extends Controller
{
    /**
	* Creates an instance
	*/
    constructor(e: express.Express, config: def.IConfig)
    {
        super();

        // Handle all errors the same way
        e.use(function (err: Error, req: express.Request, res: express.Response, next: Function)
        {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(<def.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
    * All controllers must successfully return a promise for its initialization phase.
    */
    initialize(db: mongodb.Db): Promise<void>
    {
        return Promise.resolve<any>();
    }
}