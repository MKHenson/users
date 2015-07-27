import express = require("express");
import bodyParser = require('body-parser');
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
import * as validator from "validator";
import * as compression from "compression";

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
        router.use(compression());

        router.get("/download/:id", <any>[this.getFile.bind(this)]);
        router.get("/get-files/:user/:bucket", <any>[hasAdminRights, this.getFiles.bind(this)]);
        router.get("/get-stats/:user?", <any>[hasAdminRights, this.getStats.bind(this)]);
        router.get("/get-buckets/:user?", <any>[hasAdminRights, this.getBuckets.bind(this)]);
        router.delete("/remove-buckets/:buckets", <any>[identifyUser, this.removeBuckets.bind(this)]);
        router.delete("/remove-files/:files", <any>[identifyUser, this.removeFiles.bind(this)]);
        router.post("/upload/:bucket", <any>[identifyUser, this.uploadUserFiles.bind(this)]);
        router.post("/create-bucket/:user/:name", <any>[hasAdminRights, this.createBucket.bind(this)]);
        router.post("/create-stats/:target", <any>[hasAdminRights, this.createStats.bind(this)]);
        router.put("/storage-calls/:target/:value", <any>[hasAdminRights, this.verifyTargetValue, this.updateCalls.bind(this)]);
        router.put("/storage-memory/:target/:value", <any>[hasAdminRights, this.verifyTargetValue, this.updateMemory.bind(this)]);
        router.put("/storage-allocated-calls/:target/:value", <any>[hasAdminRights, this.verifyTargetValue, this.updateAllocatedCalls.bind(this)]);
        router.put("/storage-allocated-memory/:target/:value", <any>[hasAdminRights, this.verifyTargetValue, this.updateAllocatedMemory.bind(this)]);
        
        // Register the path
        e.use(`${config.mediaURL}`, router);
    }
    
    /**
   * Makes sure the target user exists and the numeric value specified is valid
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private verifyTargetValue(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        var value = parseInt(req.params.value);

        if (!req.params.target || req.params.target.trim() == "")
        {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a valid user to target", error: true }));
        }
        if (!req.params.value || req.params.value.trim() == "" || isNaN(value))
        {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a valid value", error: true }));
        }

        // Make sure the user exists
        UserManager.get.getUser(req.params.target).then(function (user)
        {
            if (!user)
            {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(<def.IResponse>{ message: `Could not find the user '${req.params.target}'`, error: true }));
            }
            else
            {
                req._target = user;
                next();
            }

        }).catch(function (err)
        {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(<def.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateCalls(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <def.IStorageStats>{ apiCallsUsed: value }).then(function ()
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: `Updated the user API calls to [${value}]`, error: false }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's memory usage
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateMemory(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);        
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <def.IStorageStats>{ memoryUsed: value }).then(function ()
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: `Updated the user memory to [${value}] bytes`, error: false }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's allocated api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateAllocatedCalls(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <def.IStorageStats>{ apiCallsAllocated: value }).then(function ()
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: `Updated the user API calls to [${value}]`, error: false }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's allocated memory
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateAllocatedMemory(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <def.IStorageStats>{ memoryAllocated: value }).then(function ()
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: `Updated the user memory to [${value}] bytes`, error: false }));

        }).catch(function (err: Error)
        {
            return res.end(JSON.stringify(<def.IResponse>{ message: err.toString(), error: true }));
        });
    }

   /**
   * Removes files specified in the URL
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

        if (!req.params.files || req.params.files.trim() == "")
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify the files to remove", error: true }));

        files = req.params.files.split(",");

        manager.removeFilesById(files, req._user.dbEntry.username).then(function (numRemoved)
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
   * Removes buckets specified in the URL
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private removeBuckets(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var buckets: Array<string> = null;

        if (!req.params.buckets || req.params.buckets.trim() == "")
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify the buckets to remove", error: true }));

        buckets = req.params.buckets.split(",");

        manager.removeBucketsByName(buckets, req._user.dbEntry.username).then(function (numRemoved)
        {
            return res.end(JSON.stringify(<def.IRemoveFiles>{
                message: `Removed [${numRemoved.length}] buckets`,
                error: false,
                data: numRemoved
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
   * Fetches the statistic information for the specified user
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private getStats(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;

        manager.getUserStats(req._user.dbEntry.username).then(function (stats)
        {
            return res.end(JSON.stringify(<def.IGetUserStorageData>{
                message: `Successfully retrieved ${req._user.dbEntry.username}'s stats`,
                error: false,
                data: stats
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
   * Attempts to download a file from the server
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private getFile(req: def.AuthRequest, res: express.Response, next: Function): any
    {
        var manager = BucketManager.get;
        var fileID = req.params.id;
        var file: def.IFileEntry = null;
        var cache = this._config.bucket.cacheLifetime;

        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify(<def.IResponse>{ message: `Please specify a file ID`, error: true }));

        
        manager.getFile(fileID).then(function (iFile)
        {
            file = iFile;
            return manager.withinAPILimit(iFile.user);

        }).then(function (valid)
        {
            if (!valid)
                return Promise.reject(new Error("API limit reached"));

            return manager.incrementAPI(file.user);

        }).then(function (data)
        {
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Length', file.size.toString());
            if (cache)
                res.setHeader("Cache-Control", "public, max-age=" + cache);
            var stream = manager.downloadFile(file);
            stream.pipe(res);

        }).catch(function (err)
        {
            return res.status(404).send('File not found');
        })
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
        var numFiles = 0;
        var index = parseInt(req.query.index);
        var limit = parseInt(req.query.limit);
        var bucketEntry: def.IBucketEntry;

        if (!req.params.bucket || req.params.bucket.trim() == "")
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a valid bucket name", error: true }));

        manager.getIBucket(req.params.bucket, req._user.dbEntry.username).then(function(bucket)
        {
            if (!bucket)
                return Promise.reject(new Error(`Could not find the bucket '${req.params.bucket}'`));

            bucketEntry = bucket;
            return manager.numFiles({ bucketId: bucket.identifier });
            
        }).then(function (count)
        {
            numFiles = count;
            return manager.getFilesByBucket(bucketEntry, index, limit);

        }).then(function (files)
        {
            return res.end(JSON.stringify(<def.IGetFiles>{
                message: `Found [${numFiles}] files`,
                error: false,
                data: files,
                count: numFiles
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
        var user = req.params.user;

        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var numBuckets = 1;

        manager.getBucketEntries(user).then(function (buckets)
        {
            return res.end(JSON.stringify(<def.IGetBuckets>{
                message: `Found [${buckets.length}] buckets`,
                error: false,
                data: buckets,
                count: buckets.length
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

    private alphaNumericDashSpace(str: string): boolean
    {
        if (!str.match(/^[0-9A-Z -]+$/i))
            return false;
        else
            return true;
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
        var username: string = req.params.user;
        var bucketName: string = req.params.name;

        if (!username || username.trim() == "")
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a valid username", error: true }));
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please specify a valid name", error: true }));
        if (!this.alphaNumericDashSpace(bucketName))
            return res.end(JSON.stringify(<def.IResponse>{ message: "Please only use safe characters", error: true }));

        UserManager.get.getUser(username).then(function(user)
        {
            if (user)
                return manager.withinAPILimit(username);
            else
                return Promise.reject(new Error(`Could not find a user with the name '${username}'`));

        }).then(function( inLimits )
        {
            if (!inLimits)
                return Promise.reject(new Error(`You have run out of API calls, please contact one of our sales team or upgrade your account.`));

            return manager.createBucket(bucketName, username);

        }).then(function (bucket)
        {
            return res.end(JSON.stringify(<def.IResponse>{
                message: `Bucket '${bucketName}' created`,
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
        var that = this;
        var username = req._user.dbEntry.username;

        // Set the content type
        res.setHeader('Content-Type', 'application/json');

        var bucketName = req.params.bucket;
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify(<def.IUploadResponse>{ message: `Please specify a bucket`, error: true, tokens: [] }));

        manager.getIBucket(bucketName, username).then(function (bucketEntry)
        {
            if (!bucketEntry)
                return res.end(JSON.stringify(<def.IUploadResponse>{ message: `No bucket exists with the name '${bucketName}'`, error: true, tokens: [] }));

            // Parts are emitted when parsing the form
            form.on('part', function (part: multiparty.Part)
            {
                // Create a new upload token
                var newUpload: def.IUploadToken = {
                    file: "",
                    field: (!part.name ? "" : part.name),
                    filename: part.filename,
                    error: false,
                    errorMsg: ""
                }
                
                // This part is a file - so we act on it
                if (!!part.filename)
                {
                    // Add the token to the upload array we are sending back to the user
                    uploadedTokens.push(newUpload);
                    numParts++;

                    if (!that.alphaNumericDashSpace(newUpload.field))
                    {
                        completedParts++;
                        newUpload.error = true;
                        newUpload.errorMsg = "Please use safe characters";
                        part.resume();
                        checkIfComplete();
                    }
                    else
                    {

                        // Upload the file part to the cloud
                        manager.uploadStream(part, bucketEntry, username).then(function (file)
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
                }
                else
                    part.resume();
            });

            // Checks if the connection is closed and all the parts have been uploaded
            var checkIfComplete = function ()
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
                checkIfComplete();
            });

            // Parse req
            form.parse(req);

        }).catch(function (err)
        {
            return res.end(JSON.stringify(<def.IUploadResponse>{ message: err.toString(), error: true, tokens: [] }));
        });
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