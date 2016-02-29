import express = require("express");
import * as users from "webinate-users";
import * as mongodb from "mongodb";
import { Controller } from "./controller";
/**
* Main class to use for managing users
*/
export declare class BucketController extends Controller {
    private _bucketManager;
    private _config;
    private _allowedFileTypes;
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    constructor(e: express.Express, config: users.IConfig);
    /**
   * Makes sure the target user exists and the numeric value specified is valid
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private verifyTargetValue(req, res, next);
    /**
   * Updates the target user's api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateCalls(req, res, next);
    /**
   * Updates the target user's memory usage
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateMemory(req, res, next);
    /**
   * Updates the target user's allocated api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateAllocatedCalls(req, res, next);
    /**
   * Updates the target user's allocated memory
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateAllocatedMemory(req, res, next);
    /**
    * Removes files specified in the URL
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private removeFiles(req, res, next);
    /**
   * Renames a file
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private renameFile(req, res, next);
    /**
    * Removes buckets specified in the URL
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private removeBuckets(req, res, next);
    /**
    * Fetches the statistic information for the specified user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getStats(req, res, next);
    /**
   * Attempts to download a file from the server
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private getFile(req, res, next);
    /**
   * Attempts to make a file public
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private makePublic(req, res, next);
    /**
   * Attempts to make a file private
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private makePrivate(req, res, next);
    /**
    * Fetches all file entries from the database. Optionally specifying the bucket to fetch from.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getFiles(req, res, next);
    /**
    * Fetches all bucket entries from the database
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private getBuckets(req, res, next);
    /**
    * Creates a new user stat entry. This is usually done for you when creating a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private createStats(req, res, next);
    private alphaNumericDashSpace(str);
    /**
    * Creates a new user bucket based on the target provided
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private createBucket(req, res, next);
    /**
    * Checks if a part is allowed to be uploaded
    * @returns {boolean}
    */
    private isPartAllowed(part);
    /**
    * Checks if a file part is allowed to be uploaded
    * @returns {boolean}
    */
    private isFileTypeAllowed(part);
    /**
    * Attempts to upload a file to the user's bucket
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private uploadUserFiles(req, res, next);
    /**
    * Attempts to upload a file to the user's bucket
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    private uploadUserData(req, res, next);
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    initialize(db: mongodb.Db): Promise<void>;
}
