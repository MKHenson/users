import express = require("express");
import bodyParser = require('body-parser');

// NEW ES6 METHOD
import * as http from "http";
import * as entities from "entities";
import * as def from "../Definitions";
import * as mongodb from "mongodb";
import {Session} from "../Session";
import {UserManager, User} from "../Users";
import {hasAdminRights} from "../PermissionController";
import {Controller} from "./Controller"
import {BucketManager} from "../BucketManager";

/**
* Main class to use for managing users
*/
export class BucketController extends Controller
{
    private _bucketManager: BucketManager;
    private _config: def.IConfig;
    

	/**
	* Creates an instance of the user manager
	* @param {mongodb.Collection} userCollection The mongo collection that stores the users
	* @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
	* @param {def.IConfig} The config options of this manager
	*/
    constructor(e: express.Express, config: def.IConfig)
    {
        super();

        this._config = config;
		
        //// Setup the rest calls
        //var router = express.Router();
        //router.use(bodyParser.urlencoded({ 'extended': true }));
        //router.use(bodyParser.json());
        //router.use(bodyParser.json({ type: 'application/vnd.api+json' }));
		
        //// Register the path
        //e.use(config.restURL, router);
    }

    

	/**
	* Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
	*/
    initialize(db: mongodb.Db): Promise<void>
    {
        var that = this;

        return new Promise<void>(function (resolve, reject)
        {
            Promise.all([
                that.createCollection(that._config.bucket.bucketsCollection, db),
                that.createCollection(that._config.bucket.filesCollection, db)

            ]).then(function (collections)
            {
                // Create the user manager
                that._bucketManager = BucketManager.create(collections[0], collections[1], that._config);
               
                // Initialization is finished
                resolve();

            }).catch(function (error: Error)
            {
                reject(error);
            })
        });
    }
}