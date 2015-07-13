import express = require("express");
import bodyParser = require('body-parser');

// NEW ES6 METHOD
import * as http from "http";
import * as entities from "entities";
import * as def from "../Definitions";
import * as mongodb from "mongodb";
import {Session} from "../Session";
import {UserManager, User} from "../Users";
import {hasAdminRights, identifyUser} from "../PermissionController";
import {Controller} from "./Controller"
import {BucketManager} from "../BucketManager";
import * as multiparty from "multiparty";

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
		
        // Setup the rest calls
        var router = express.Router();

        router.get("/get-files/:bucket?", <any>[hasAdminRights, this.getFiles.bind(this)]);
        router.get("/get-buckets", <any>[hasAdminRights, this.getBuckets.bind(this)]);
        router.delete("/remove-files/:files", <any>[identifyUser, this.removeFiles.bind(this)]);
        router.post("/user-upload", <any>[hasAdminRights, this.uploadUserFiles.bind(this)]);
        router.post("/create-bucket/:target", <any>[hasAdminRights, this.createBucket.bind(this)]);
        router.post("/create-stats/:target", <any>[hasAdminRights, this.createStats.bind(this)]);

        // Register the path
        e.use(`${config.mediaURL}`, router);
    }

   /**
   * Fetches all file entries from the database. Optionally specifying the bucket to fetch from.
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private removeFiles(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var files: Array<string> = null;
        if (req.params.files && req.params.files.trim() != "")
            files = req.params.files.split(",");
        else
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify the files to remove", error: true }));

        manager.removeFiles(files, req._user).then(function (numRemoved)
        {
            return res.end(JSON.stringify(<def.IRemoveFiles>{
                message: `Removed [${numRemoved.length}] files`,
                error: false,
                data:numRemoved
            }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: err.toString(),
                error: true
            }));
        });
    }

   /**
   * Fetches all file entries from the database. Optionally specifying the bucket to fetch from.
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private getFiles(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        manager.getFileEntries(req.params.bucket).then(function (files)
        {
            return res.end(JSON.stringify(<def.IGetFiles>{
                message: `Found [${files.length}] files`,
                error: false,
                data: files
            }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: err.toString(),
                error: true
            }));
        });
    }

    /**
	* Fetches all bucket entries from the database
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private getBuckets(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        manager.getBucketEntries().then(function (buckets)
        {
            return res.end(JSON.stringify(<def.IGetBuckets>{
                message: `Found [${buckets.length}] buckets`,
                error: false,
                data: buckets
            }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: err.toString(),
                error: true
            }));
        });
    }

   /**
   * Creates a new user stat entry. This is usually done for you when creating a new user
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private createStats(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        manager.createUserStats(req.params.target).then(function (stats)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: `Stats for the user '${req.params.target}' have been created`,
                error: false
            }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: err.toString(),
                error: true
            }));
        });
    }

    /**
	* Creates a new user bucket based on the target provided
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private createBucket(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        manager.createUserBucket(req.params.target).then(function( bucket )
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: `Bucket '${bucket.name}' created`,
                error: false
            }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: err.toString(),
                error: true
            }));
        });
    }

    /**
	* Attempts to upload a file to the user's bucket
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private uploadUserFiles(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        var form = new multiparty.Form();
        var successfulParts = 0;
        var numParts = 0;
        var completedParts = 0;
        var closed = false;
        var uploadedTokens: Array<def.IUploadToken> = [];
        var manager = BucketManager.get;

        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        
        // Parts are emitted when parsing the form
        form.on('part', function (part: multiparty.Part)
        {
            // Create a new upload token
            var newUpload: def.IUploadToken = {
                file: "",
                field: part.name,
                filename: part.filename,
                error: false,
                errorMsg: ""
            }

            // Add the token to the upload array we are sending back to the user
            uploadedTokens.push(newUpload);

            // This part is a file - so we act on it
            if (!!part.filename)
            {
                numParts++;

                // Upload the file part to the cloud
                manager.uploadStream(part, req._user.dbEntry.username).then(function (file)
                {
                    completedParts++;
                    successfulParts++;
                    newUpload.file = file.identifier;
                    part.resume();
                    checkIfComplete();

                }).catch(function (err: Error)
                {
                    completedParts++;
                    newUpload.error = true;
                    newUpload.errorMsg = err.toString();
                    part.resume();
                    checkIfComplete();

                });
            }
        });

        // Checks if the connection is closed and all the parts have been uploaded
        var checkIfComplete = function()
        {
            if (closed && completedParts == numParts)
            {
                return res.end(JSON.stringify(<def.IUploadResponse>{
                    message: `Upload complete. [${successfulParts}] Files have been saved.`,
                    error: false,
                    tokens: uploadedTokens
                }));
            }
        }

        // Close emitted after form parsed
        form.on('close', function ()
        {
            closed = true;
        });

        // Parse req
        form.parse(req);
    }

    /**
	* Attempts to upload a file to the user's bucket
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private uploadUserData(req: express.Request, res: express.Response, next: Function): any
    {
        var form = new multiparty.Form();
        var count = 0;
        
        // Parts are emitted when parsing the form
        form.on('part', function (part: multiparty.Part)
        {
            // You *must* act on the part by reading it
            // NOTE: if you want to ignore it, just call "part.resume()"
            if (!!part.filename)
            {
                // filename is exists when this is a file
                count++;
                console.log('got field named ' + part.name + ' and got file named ' + part.filename);
                // ignore file's content here
                part.resume();
            } else
            {
                // filename doesn't exist when this is a field and not a file
                console.log('got field named ' + part.name);
                // ignore field's content
                part.resume();
            }

            part.on('error', function (err: Error)
            {
                // decide what to do
                console.log('Error on part event: ' + err);
            });
        });

        form.on('progress', function (bytesReceived: number, bytesExpected: number)
        {
            // decide what to do
            console.log('BytesReceived: ' + bytesReceived, 'BytesExpected: ', bytesExpected);
        });

        form.on('field', function (name: string, value: string)
        {
            // decide what to do
            console.log('Field Name: ' + name + ', Field Value: ' + value);
        });

        // Close emitted after form parsed
        form.on('close', function ()
        {
            console.log('Upload completed!');
            res.end('Received ' + count + ' files');
        });

        // Parse req
        form.parse(req);
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
                that.createCollection(that._config.bucket.filesCollection, db),
                that.createCollection(that._config.bucket.statsCollection, db)

            ]).then(function (collections)
            {
                // Create the user manager
                that._bucketManager = BucketManager.create(collections[0], collections[1], collections[2], that._config);
               
                // Initialization is finished
                resolve();

            }).catch(function (error: Error)
            {
                reject(error);
            })
        });
    }
}