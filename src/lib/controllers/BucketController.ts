import express = require("express");
import bodyParser = require('body-parser');
import * as http from "http";
import * as entities from "entities";
import * as users from "webinate-users";
import * as mongodb from "mongodb";
import {Session} from "../Session";
import {UserManager, User} from "../Users";
import {ownerRights, identifyUser} from "../PermissionController";
import {Controller} from "./Controller"
import {BucketManager} from "../BucketManager";
import * as multiparty from "multiparty";
import * as validator from "validator";
import * as compression from "compression";
import * as winston from "winston";

import {CommsController, EventType} from "./CommsController";
import * as def from "webinate-users";

/**
* Main class to use for managing users
*/
export class BucketController extends Controller
{
    private _bucketManager: BucketManager;
    private _config: users.IConfig;
    
	/**
	* Creates an instance of the user manager
	* @param {mongodb.Collection} userCollection The mongo collection that stores the users
	* @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
	* @param {def.IConfig} The config options of this manager
	*/
    constructor(e: express.Express, config: users.IConfig)
    {
        super();

        this._config = config;
		
        // Setup the rest calls
        var router = express.Router();
        router.use(compression());
        router.use(bodyParser.urlencoded({ 'extended': true }));
        router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));

        router.get("/download/:id", <any>[this.getFile.bind(this)]);
        
        router.get("/get-files/:user/:bucket", <any>[ownerRights, this.getFiles.bind(this)]);
        router.get("/get-stats/:user?", <any>[ownerRights, this.getStats.bind(this)]);
        router.get("/get-buckets/:user?", <any>[ownerRights, this.getBuckets.bind(this)]);
        router.delete("/remove-buckets/:buckets", <any>[identifyUser, this.removeBuckets.bind(this)]);
        router.delete("/remove-files/:files", <any>[identifyUser, this.removeFiles.bind(this)]);
        router.post("/upload/:bucket", <any>[identifyUser, this.uploadUserFiles.bind(this)]);
        router.post("/create-bucket/:user/:name", <any>[ownerRights, this.createBucket.bind(this)]);
        router.post("/create-stats/:target", <any>[ownerRights, this.createStats.bind(this)]);
        router.put("/storage-calls/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateCalls.bind(this)]);
        router.put("/storage-memory/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateMemory.bind(this)]);
        router.put("/storage-allocated-calls/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateAllocatedCalls.bind(this)]);
        router.put("/storage-allocated-memory/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateAllocatedMemory.bind(this)]);
        router.put("/rename-file/:file", <any>[identifyUser, this.renameFile.bind(this)]);
        router.put("/make-public/:id", <any>[identifyUser, this.makePublic.bind(this)]);
        router.put("/make-private/:id", <any>[identifyUser, this.makePrivate.bind(this)]);

        // Register the path
        e.use(`${config.mediaURL}`, router);
    }
    
    /**
   * Makes sure the target user exists and the numeric value specified is valid
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private verifyTargetValue(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        var value = parseInt(req.params.value);

        if (!req.params.target || req.params.target.trim() == "")
        {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify a valid user to target", error: true }));
        }
        if (!req.params.value || req.params.value.trim() == "" || isNaN(value))
        {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify a valid value", error: true }));
        }

        // Make sure the user exists
        UserManager.get.getUser(req.params.target).then(function (user)
        {
            if (!user)
            {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify(<users.IResponse>{ message: `Could not find the user '${req.params.target}'`, error: true }));
            }
            else
            {
                req._target = user;
                next();
            }

        }).catch(function (err)
        {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(<users.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateCalls(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ apiCallsUsed: value }).then(function ()
        {
            return res.end(JSON.stringify(<users.IResponse>{ message: `Updated the user API calls to [${value}]`, error: false }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's memory usage
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateMemory(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);        
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ memoryUsed: value }).then(function ()
        {
            return res.end(JSON.stringify(<users.IResponse>{ message: `Updated the user memory to [${value}] bytes`, error: false }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's allocated api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateAllocatedCalls(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ apiCallsAllocated: value }).then(function ()
        {
            return res.end(JSON.stringify(<users.IResponse>{ message: `Updated the user API calls to [${value}]`, error: false }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{ message: err.toString(), error: true }));
        });
    }

    /**
   * Updates the target user's allocated memory
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private updateAllocatedMemory(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = BucketManager.get;

        manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ memoryAllocated: value }).then(function ()
        {
            return res.end(JSON.stringify(<users.IResponse>{ message: `Updated the user memory to [${value}] bytes`, error: false }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{ message: err.toString(), error: true }));
        });
    }

   /**
   * Removes files specified in the URL
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private removeFiles(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var files: Array<string> = null;

        if (!req.params.files || req.params.files.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify the files to remove", error: true }));

        files = req.params.files.split(",");

        manager.removeFilesById(files, req._user.dbEntry.username).then(function (numRemoved)
        {
            return res.end(JSON.stringify(<users.IRemoveFiles>{
                message: `Removed [${numRemoved.length}] files`,
                error: false,
                data:numRemoved
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
                message: err.toString(),
                error: true
            }));
        });
    }

    /**
   * Renames a file
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private renameFile(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        
        if (!req.params.file || req.params.file.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify the file to rename", error: true }));
        if (!req.body || !req.body.name || req.body.name.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify the new name of the file", error: true }));

        manager.getFile(req.params.file, req._user.dbEntry.username).then(function(file)
        {
            if (!file)
                return Promise.reject(new Error(`Could not find the file '${req.params.file}'`));
        
            return manager.renameFile(file, req.body.name);

        }).then(function (file)
        {
            return res.end(JSON.stringify(<users.IResponse>{
                message: `Renamed file to '${req.body.name}'`,
                error: false
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
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
    private removeBuckets(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var buckets: Array<string> = null;

        if (!req.params.buckets || req.params.buckets.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify the buckets to remove", error: true }));

        buckets = req.params.buckets.split(",");

        manager.removeBucketsByName(buckets, req._user.dbEntry.username).then(function (numRemoved)
        {
            return res.end(JSON.stringify(<users.IRemoveFiles>{
                message: `Removed [${numRemoved.length}] buckets`,
                error: false,
                data: numRemoved
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
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
    private getStats(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;

        manager.getUserStats(req._user.dbEntry.username).then(function (stats)
        {
            return res.end(JSON.stringify(<users.IGetUserStorageData>{
                message: `Successfully retrieved ${req._user.dbEntry.username}'s stats`,
                error: false,
                data: stats
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
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
    private getFile(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        var manager = BucketManager.get;
        var fileID = req.params.id;
        var file: users.IFileEntry = null;
        var cache = this._config.bucket.cacheLifetime;

        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: `Please specify a file ID`, error: true }));

        
        manager.getFile(fileID).then(function (iFile)
        {
            file = iFile;
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Length', file.size.toString());
            if (cache)
                res.setHeader("Cache-Control", "public, max-age=" + cache);

            manager.downloadFile(<express.Request><Express.Request>req, res, file);
            manager.incrementAPI(file.user);

        }).catch(function (err)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.status(404).send('File not found');
        })
    }

    /**
   * Attempts to make a file public
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private makePublic(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        res.setHeader('Content-Type', 'application/json');

        var manager = BucketManager.get;
        var fileID = req.params.id;
        var file: users.IFileEntry = null;
        var cache = this._config.bucket.cacheLifetime;

        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: `Please specify a file ID`, error: true }));


        manager.getFile(fileID, req._user.dbEntry.username).then(function (iFile)
        {
            return manager.makeFilePublic(iFile)

        }).then(function (iFile)
        {
            return res.end(JSON.stringify(<users.IGetFile>{ message: `File is now public`, error: false, data: iFile }));

        }).catch(function (err)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
                message: err.toString(),
                error: true
            }));
        })
    }

    /**
   * Attempts to make a file private
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private makePrivate(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        res.setHeader('Content-Type', 'application/json');

        var manager = BucketManager.get;
        var fileID = req.params.id;
        var file: users.IFileEntry = null;
        var cache = this._config.bucket.cacheLifetime;

        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: `Please specify a file ID`, error: true }));


        manager.getFile(fileID, req._user.dbEntry.username).then(function (iFile)
        {
            return manager.makeFilePrivate(iFile)

        }).then(function (iFile)
        {
            return res.end(JSON.stringify(<users.IGetFile>{ message: `File is now private`, error: false, data: iFile }));

        }).catch(function (err)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
                message: err.toString(),
                error: true
            }));
        })
    }

   /**
   * Fetches all file entries from the database. Optionally specifying the bucket to fetch from.
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private getFiles(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var numFiles = 0;
        var index = parseInt(req.query.index);
        var limit = parseInt(req.query.limit);
        
        var bucketEntry: users.IBucketEntry;

        if (!req.params.bucket || req.params.bucket.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify a valid bucket name", error: true }));

        var searchTerm: RegExp;

        // Check for keywords
        if (req.query.search)
            searchTerm = new RegExp(req.query.search, "i");
        
        manager.getIBucket(req.params.bucket, req._user.dbEntry.username).then(function(bucket)
        {
            if (!bucket)
                return Promise.reject(new Error(`Could not find the bucket '${req.params.bucket}'`));

            bucketEntry = bucket;
            return manager.numFiles({ bucketId: bucket.identifier });
            
        }).then(function (count)
        {
            numFiles = count;
            return manager.getFilesByBucket(bucketEntry, index, limit, searchTerm);

        }).then(function (files)
        {
            return res.end(JSON.stringify(<users.IGetFiles>{
                message: `Found [${numFiles}] files`,
                error: false,
                data: files,
                count: numFiles
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
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
    private getBuckets(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        var user = req.params.user;

        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var numBuckets = 1;
        var searchTerm: RegExp;

        // Check for keywords
        if (req.query.search)
            searchTerm = new RegExp(req.query.search, "i");

        manager.getBucketEntries(user, searchTerm).then(function (buckets)
        {
            return res.end(JSON.stringify(<users.IGetBuckets>{
                message: `Found [${buckets.length}] buckets`,
                error: false,
                data: buckets,
                count: buckets.length
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
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
    private createStats(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        manager.createUserStats(req.params.target).then(function (stats)
        {
            return res.end(JSON.stringify(<users.IResponse>{
                message: `Stats for the user '${req.params.target}' have been created`,
                error: false
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
                message: err.toString(),
                error: true
            }));
        });
    }

    private alphaNumericDashSpace(str: string): boolean
    {
        if (!str.match(/^[0-9A-Z _\-]+$/i))
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
    private createBucket(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager.get;
        var username: string = req.params.user;
        var bucketName: string = req.params.name;

        if (!username || username.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify a valid username", error: true }));
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please specify a valid name", error: true }));
        if (!this.alphaNumericDashSpace(bucketName))
            return res.end(JSON.stringify(<users.IResponse>{ message: "Please only use safe characters", error: true }));

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
            return res.end(JSON.stringify(<users.IResponse>{
                message: `Bucket '${bucketName}' created`,
                error: false
            }));

        }).catch(function (err: Error)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IResponse>{
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
    private uploadUserFiles(req: users.AuthRequest, res: express.Response, next: Function): any
    {
        var form = new multiparty.Form();
        var successfulParts = 0;
        var numParts = 0;
        var completedParts = 0;
        var closed = false;
        var uploadedTokens: Array<users.IUploadToken> = [];
        var manager = BucketManager.get;
        var that = this;
        var username = req._user.dbEntry.username;
        var filesUploaded: Array<UsersInterface.IFileEntry> = [];

        // Set the content type
        res.setHeader('Content-Type', 'application/json');

        var bucketName = req.params.bucket;
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify(<users.IUploadResponse>{ message: `Please specify a bucket`, error: true, tokens: [] }));

        manager.getIBucket(bucketName, username).then(function (bucketEntry)
        {
            if (!bucketEntry)
                return res.end(JSON.stringify(<users.IUploadResponse>{ message: `No bucket exists with the name '${bucketName}'`, error: true, tokens: [] }));

            // Parts are emitted when parsing the form
            form.on('part', function (part: multiparty.Part)
            {
                // Create a new upload token
                var newUpload: users.IUploadToken = {
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
                    
                    // Upload the file part to the cloud
                    manager.uploadStream(part, bucketEntry, username).then(function (file)
                    {
                        filesUploaded.push(file);
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
                else
                    part.resume();
            });

            // Checks if the connection is closed and all the parts have been uploaded
            var checkIfComplete = function ()
            {
                if (closed && completedParts == numParts)
                {
                    // Send file added events to sockets
                    var fEvent: def.SocketEvents.IFilesAddedEvent = { username: username, eventType: EventType.FilesUploaded, files: filesUploaded };
                    CommsController.singleton.broadcastEvent(fEvent).then(function ()
                    {
                        var error = false;
                        var errorMsg = `Upload complete. [${successfulParts}] Files have been saved.`;
                        for (var i = 0, l = uploadedTokens.length; i < l; i++)
                            if (uploadedTokens[i].error)
                            {
                                error = true;
                                errorMsg = uploadedTokens[i].errorMsg;
                                break;
                            }

                        if (error)
                            winston.error(errorMsg, { process: process.pid });
                        else
                            winston.info(errorMsg, { process: process.pid });

                        return res.end(JSON.stringify(<users.IUploadResponse>{ message: errorMsg, error: error, tokens: uploadedTokens }));
                    });                    
                }
            }

            // Close emitted after form parsed
            form.on('close', function ()
            {
                closed = true;
                checkIfComplete();
            });

            // Parse req
            form.parse(<express.Request><Express.Request>req);

        }).catch(function (err)
        {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify(<users.IUploadResponse>{ message: err.toString(), error: true, tokens: [] }));
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
                winston.error(err.toString(), { process: process.pid });
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
            var bucketsCollection;
            var filesCollection;
            var statsCollection;

            Promise.all([
                that.createCollection(that._config.bucket.bucketsCollection, db),
                that.createCollection(that._config.bucket.filesCollection, db),
                that.createCollection(that._config.bucket.statsCollection, db)

            ]).then(function (collections)
            {
                bucketsCollection = collections[0];
                filesCollection = collections[1];
                statsCollection = collections[2];
                
                return Promise.all([
                    that.ensureIndex(bucketsCollection, "name"),
                    that.ensureIndex(bucketsCollection, "user"),
                    that.ensureIndex(bucketsCollection, "created"),
                    that.ensureIndex(bucketsCollection, "memoryUsed"),

                    that.ensureIndex(filesCollection, "name"),
                    that.ensureIndex(filesCollection, "user"),
                    that.ensureIndex(filesCollection, "created"),
                    that.ensureIndex(filesCollection, "size"),
                    that.ensureIndex(filesCollection, "mimeType"),
                    that.ensureIndex(filesCollection, "numDownloads")
                ]);

            }).then(function ()
            {
                // Create the user manager
                that._bucketManager = BucketManager.create(bucketsCollection, filesCollection, statsCollection, that._config);
               
                // Initialization is finished
                resolve();

            }).catch(function (error: Error)
            {
                reject(error);
            })
        });
    }
}