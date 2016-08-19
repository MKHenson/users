"use strict";

import express = require("express");
import bodyParser = require('body-parser');
import * as http from "http";
import * as entities from "entities";
import * as users from "webinate-users";
import * as mongodb from "mongodb";
import {Session} from "../session";
import {UserManager, User, UserPrivileges} from "../users";
import {ownerRights, requireUser} from "../permission-controller";
import {Controller} from "./controller"
import {BucketManager} from "../bucket-manager";
import * as multiparty from "multiparty";
import * as validator from "validator";
import * as compression from "compression";
import * as winston from "winston";
import * as gcloud from "gcloud";
import {CommsController} from "../socket-api/comms-controller";
import {ClientInstruction} from "../socket-api/client-instruction";
import {ClientInstructionType} from "../socket-api/socket-event-types";
import * as def from "webinate-users";
import {okJson, errJson} from "../serializers";

/**
* Main class to use for managing users
*/
export class BucketController extends Controller
{
    private _bucketManager: BucketManager;
    private _config: users.IConfig;
    private _allowedFileTypes: Array<string>;

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

        this._allowedFileTypes = ["image/bmp", "image/png", "image/jpeg", "image/jpg", "image/gif", "image/tiff", "text/plain", "text/json", "application/octet-stream"];

        // Setup the rest calls
        var router = express.Router();
        router.use(compression());
        router.use(bodyParser.urlencoded({ 'extended': true }));
        router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));

        router.get("/files/:id/download", <any>[this.getFile.bind(this)]);
        router.get("/users/:user/buckets/:bucket/files", <any>[ownerRights, this.getFiles.bind(this)]);
        router.get("/users/:user/get-stats", <any>[ownerRights, this.getStats.bind(this)]);
        router.get("/users/:user/buckets", <any>[ownerRights, this.getBuckets.bind(this)]);
        router.delete("/buckets/:buckets", <any>[requireUser, this.removeBuckets.bind(this)]);
        router.delete("/files/:files", <any>[requireUser, this.removeFiles.bind(this)]);
        router.post("/buckets/:bucket/upload/:parentFile?", <any>[requireUser, this.uploadUserFiles.bind(this)]);
        router.post("/users/:user/buckets/:name", <any>[ownerRights, this.createBucket.bind(this)]);
        router.post("/create-stats/:target", <any>[ownerRights, this.createStats.bind(this)]);
        router.put("/stats/storage-calls/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateCalls.bind(this)]);
        router.put("/stats/storage-memory/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateMemory.bind(this)]);
        router.put("/stats/storage-allocated-calls/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateAllocatedCalls.bind(this)]);
        router.put("/stats/storage-allocated-memory/:target/:value", <any>[ownerRights, this.verifyTargetValue, this.updateAllocatedMemory.bind(this)]);
        router.put("/files/:file/rename-file", <any>[requireUser, this.renameFile.bind(this)]);
        router.put("/files/:id/make-public", <any>[requireUser, this.makePublic.bind(this)]);
        router.put("/files/:id/make-private", <any>[requireUser, this.makePrivate.bind(this)]);

        // Register the path
        e.use(`${config.apiPrefix}`, router);
    }

    /**
     * Makes sure the target user exists and the numeric value specified is valid
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {Function} next
     */
    private async verifyTargetValue(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            // Set the content type
            var value = parseInt(req.params.value);

            if (!req.params.target || req.params.target.trim() == "")
                throw new Error("Please specify a valid user to target");

            if (!req.params.value || req.params.value.trim() == "" || isNaN(value))
                throw new Error("Please specify a valid value");

            // Make sure the user exists
            var user = await UserManager.get.getUser(req.params.target);

            if (!user)
                throw new Error(`Could not find the user '${req.params.target}'`);

            req._target = user;
            next();

        } catch (err) {
           return errJson( err, res );
        };
    }

    /**
   * Updates the target user's api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async updateCalls(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var value = parseInt(req.params.value);
            var manager = BucketManager.get;
            await manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ apiCallsUsed: value });
            okJson<def.IResponse>( { message: `Updated the user API calls to [${value}]`, error: false }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

    /**
   * Updates the target user's memory usage
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async updateMemory(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var value = parseInt(req.params.value);
            var manager = BucketManager.get;
            await manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ memoryUsed: value });

            okJson<def.IResponse>( { message: `Updated the user memory to [${value}] bytes`, error: false }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

    /**
   * Updates the target user's allocated api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async updateAllocatedCalls(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var value = parseInt(req.params.value);
            var manager = BucketManager.get;
            await manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ apiCallsAllocated: value });
            okJson<def.IResponse>( { message: `Updated the user API calls to [${value}]`, error: false }, res );

        } catch ( err )  {
            return errJson( err, res );
        };
    }

    /**
   * Updates the target user's allocated memory
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async updateAllocatedMemory(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var value = parseInt(req.params.value);
            var manager = BucketManager.get;
            await manager.updateStorage(req._target.dbEntry.username, <users.IStorageStats>{ memoryAllocated: value });
            okJson<def.IResponse>( { message: `Updated the user memory to [${value}] bytes`, error: false }, res );

        } catch ( err ) {
           return errJson( err, res );
        };
    }

   /**
   * Removes files specified in the URL
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async removeFiles(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;
            var files: Array<string> = null;

            if (!req.params.files || req.params.files.trim() == "")
                throw new Error("Please specify the files to remove");

            files = req.params.files.split(",");
            var filesRemoved = await manager.removeFilesByIdentifiers(files, req._user.dbEntry.username);

            okJson<users.IRemoveFiles>({
                message: `Removed [${filesRemoved.length}] files`,
                error: false,
                data:filesRemoved,
                count: filesRemoved.length
            }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

    /**
   * Renames a file
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async renameFile(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;

            if (!req.params.file || req.params.file.trim() == "")
                throw new Error("Please specify the file to rename");
            if (!req.body || !req.body.name || req.body.name.trim() == "")
                throw new Error("Please specify the new name of the file");

            var fileEntry = await manager.getFile(req.params.file, req._user.dbEntry.username);

            if (!fileEntry )
                throw new Error(`Could not find the file '${req.params.file}'`);

            var file = await manager.renameFile(fileEntry, req.body.name);
            okJson<def.IResponse>( { message: `Renamed file to '${req.body.name}'`, error: false }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

   /**
   * Removes buckets specified in the URL
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async removeBuckets(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;
            var buckets: Array<string> = null;

            if (!req.params.buckets || req.params.buckets.trim() == "")
                throw new Error("Please specify the buckets to remove");

            buckets = req.params.buckets.split(",");

            var filesRemoved = await manager.removeBucketsByName(buckets, req._user.dbEntry.username);

            return okJson<users.IRemoveFiles>( {
                message: `Removed [${filesRemoved.length}] buckets`,
                error: false,
                data: filesRemoved,
                count: filesRemoved.length
            }, res );

        } catch (err) {
            return errJson( err, res );
        };
    }

   /**
   * Fetches the statistic information for the specified user
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async getStats(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;
            var stats = await manager.getUserStats(req._user.dbEntry.username);

            return okJson<users.IGetUserStorageData>( {
                message: `Successfully retrieved ${req._user.dbEntry.username}'s stats`,
                error: false,
                data: stats
            }, res );

        } catch( err ) {
           return errJson( err, res );
        };
    }

    /**
   * Attempts to download a file from the server
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async getFile(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;
            var fileID = req.params.id;
            var file: users.IFileEntry = null;
            var cache = this._config.google.bucket.cacheLifetime;

            if (!fileID || fileID.trim() == "")
                throw new Error(`Please specify a file ID`);

            file = await manager.getFile(fileID);
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Length', file.size.toString());
            if (cache)
                res.setHeader("Cache-Control", "public, max-age=" + cache);

            manager.downloadFile(<express.Request><Express.Request>req, res, file);
            manager.incrementAPI(file.user);

        } catch ( err) {
            winston.error(err.toString(), { process: process.pid });
            return res.status(404).send('File not found');
        }
    }

    /**
   * Attempts to make a file public
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async makePublic(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;
            var fileID = req.params.id;
            var cache = this._config.google.bucket.cacheLifetime;

            if (!fileID || fileID.trim() == "")
                throw new Error(`Please specify a file ID`);

            var fileEntry = await manager.getFile(fileID, req._user.dbEntry.username);
            fileEntry = await manager.makeFilePublic(fileEntry);

            okJson<users.IGetFile>( { message: `File is now public`, error: false, data: fileEntry }, res );

        } catch ( err ) {
            return errJson( err, res );
        }
    }

    /**
   * Attempts to make a file private
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async makePrivate(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;
            var fileID = req.params.id;
            var fileEntry: users.IFileEntry = null;
            var cache = this._config.google.bucket.cacheLifetime;

            if (!fileID || fileID.trim() == "")
                throw new Error(`Please specify a file ID`);

            fileEntry = await manager.getFile(fileID, req._user.dbEntry.username);
            fileEntry = await manager.makeFilePrivate(fileEntry)

            okJson<users.IGetFile>( { message: `File is now private`, error: false, data: fileEntry }, res );

        } catch ( err ) {
            return errJson( err, res );
        }
    }

   /**
   * Fetches all file entries from the database. Optionally specifying the bucket to fetch from.
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async getFiles(req: users.AuthRequest, res: express.Response, next: Function)
    {
        var manager = BucketManager.get;

        var index = parseInt(req.query.index);
        var limit = parseInt(req.query.limit);
        var bucketEntry: users.IBucketEntry;
        var searchTerm: RegExp;

        try
        {
            if (!req.params.bucket || req.params.bucket.trim() == "")
                throw new Error("Please specify a valid bucket name");

            // Check for keywords
            if (req.query.search)
                searchTerm = new RegExp(req.query.search, "i");

            bucketEntry = await manager.getIBucket(req.params.bucket, req._user.dbEntry.username);

            if (!bucketEntry)
                throw new Error(`Could not find the bucket '${req.params.bucket}'`);

            var count = await manager.numFiles({ bucketId: bucketEntry.identifier });
            var files = await manager.getFilesByBucket(bucketEntry, index, limit, searchTerm);

            return okJson<users.IGetFiles>( {
                message: `Found [${count}] files`,
                error: false,
                data: files,
                count: count
            }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

    /**
	* Fetches all bucket entries from the database
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private async getBuckets(req: users.AuthRequest, res: express.Response, next: Function)
    {
        var user = req.params.user;
        var manager = BucketManager.get;
        var numBuckets = 1;
        var searchTerm: RegExp;

        try
        {
            // Check for keywords
            if (req.query.search)
                searchTerm = new RegExp(req.query.search, "i");

            var buckets = await manager.getBucketEntries(user, searchTerm);

            return okJson<users.IGetBuckets>({
                message: `Found [${buckets.length}] buckets`,
                error: false,
                data: buckets,
                count: buckets.length
            }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

   /**
   * Creates a new user stat entry. This is usually done for you when creating a new user
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    private async createStats(req: users.AuthRequest, res: express.Response, next: Function)
    {
        try
        {
            var manager = BucketManager.get;
            var stats = await manager.createUserStats(req.params.target);
            okJson<users.IResponse>( { message: `Stats for the user '${req.params.target}' have been created`, error: false }, res );

        } catch ( err ) {
           return errJson( err, res );
        };
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
    private async createBucket(req: users.AuthRequest, res: express.Response, next: Function)
    {
        var manager = BucketManager.get;
        var username: string = req.params.user;
        var bucketName: string = req.params.name;

        try
        {
            if (!username || username.trim() == "")
                throw new Error("Please specify a valid username");
            if (!bucketName || bucketName.trim() == "")
                throw new Error("Please specify a valid name");
            if (!this.alphaNumericDashSpace(bucketName))
                throw new Error("Please only use safe characters");

            var user = await UserManager.get.getUser(username);
            if (!user)
                throw new Error(`Could not find a user with the name '${username}'`);

            var inLimits = await manager.withinAPILimit(username);
            if (!inLimits)
                throw new Error(`You have run out of API calls, please contact one of our sales team or upgrade your account.`);

            var bucket = await manager.createBucket(bucketName, username);
            okJson<users.IResponse>( { message: `Bucket '${bucketName}' created`, error: false }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

    /**
	* Checks if a part is allowed to be uploaded
    * @returns {boolean}
	*/
    private isPartAllowed(part: multiparty.Part): boolean
    {
        if (!part.headers)
            return false;

        if (!part.headers["content-type"])
            return false;

        var type = part.headers["content-type"].toLowerCase();
        var found = false;

        if (type == "text/plain" || type == "application/octet-stream")
            return true;
        else
            return false;
    }

    /**
	* Checks if a file part is allowed to be uploaded
    * @returns {boolean}
	*/
    private isFileTypeAllowed(part: multiparty.Part): boolean
    {
        if (!part.headers)
            return false;

        if (!part.headers["content-type"])
            return false;

        var allowedTypes = this._allowedFileTypes;
        var type = part.headers["content-type"].toLowerCase();
        var found = false;
        for (var i = 0, l = allowedTypes.length; i < l; i++)
            if (allowedTypes[i] == type)
            {
                found = true;
                break;
            }

        if (!found)
            return false;

        return true;
    }



    private uploadMetaPart(part : multiparty.Part): Promise<any>
    {
        var data = '';
        part.setEncoding('utf8');

        return new Promise<any>(function(resolve, reject) {

            part.on('data', function (chunk)
            {
                data += chunk;
            });

            part.on('error', function (err: Error)
            {
                 return reject(new Error("Could not download meta: " + err.toString()));
            });

            part.on('end', function()
            {
                try {
                    return resolve( JSON.parse(data) );
                } catch (err) {
                    return reject(new Error("Meta data is not a valid JSON: " + err.toString()));
                }
            });
        });
    }

    /**
	* Attempts to upload a file to the user's bucket
	* @param {express.Request} req
	* @param {express.Response} res
	* @param {Function} next
	*/
    private uploadUserFiles(req: users.AuthRequest, res: express.Response, next: Function)
    {
        var form = new multiparty.Form({ maxFields: 8, maxFieldsSize: 5 * 1024 * 1024, maxFilesSize: 10 * 1024 * 1024 });
        var numParts = 0;
        var completedParts = 0;
        var closed = false;
        var uploadedTokens: Array<users.IUploadToken> = [];
        var manager = BucketManager.get;
        var that = this;
        var username = req._user.dbEntry.username;
        var parentFile = req.params.parentFile;
        var filesUploaded: Array<UsersInterface.IFileEntry> = [];
        var bucketName = req.params.bucket;
        if (!bucketName || bucketName.trim() == "")
            return okJson<users.IUploadResponse>( { message: `Please specify a bucket`, error: true, tokens: [] }, res );

        manager.getIBucket(bucketName, username).then(function (bucketEntry)
        {
            if (!bucketEntry)
                return okJson<users.IUploadResponse>( { message: `No bucket exists with the name '${bucketName}'`, error: true, tokens: [] }, res );

            var metaJson : any | Error;

            // Parts are emitted when parsing the form
            form.on('part', function (part: multiparty.Part)
            {
                // Create a new upload token
                var createToken = function(): users.IUploadToken {
                    return {
                        file: "",
                        field: (!part.name ? "" : part.name),
                        filename: part.filename,
                        error: false,
                        errorMsg: "",
                        url: ""
                    }
                }

                // Deal with error logic
                var errFunc = function (errMsg : string, uploadToken: users.IUploadToken)
                {
                    if (uploadToken)
                    {
                        uploadToken.error = true;
                        uploadToken.errorMsg = errMsg;
                    }
                    completedParts++;
                    part.resume();
                    checkIfComplete();
                }

                // Deal with file upload logic
                var fileUploaded = function(uploadedFile : users.IFileEntry, uploadToken: users.IUploadToken)
                {
                    filesUploaded.push(uploadedFile);
                    completedParts++;
                    uploadToken.file = uploadedFile.identifier;
                    uploadToken.url = uploadedFile.publicURL;
                    part.resume();
                    checkIfComplete();
                }

                // This part is a file - so we act on it
                if (!!part.filename && that.isFileTypeAllowed(part))
                {
                    // Add the token to the upload array we are sending back to the user
                    var uploadToken = createToken();
                    uploadedTokens.push(uploadToken);
                    numParts++;

                    // Upload the file part to the cloud
                    manager.uploadStream(part, bucketEntry, username, true, parentFile).then(function (file)
                    {
                        fileUploaded(file, uploadToken);

                    }).catch(function(err: Error)
                    {
                        errFunc(err.toString(), uploadToken);
                    });
                }
                // Check if this part is a meta tag
                else if (part.name == "meta")
                {
                    numParts++;

                    that.uploadMetaPart(part).then(function(meta) {

                        metaJson = meta;
                        part.resume();
                        completedParts++;
                        checkIfComplete();

                    }).catch(function(err: Error) {

                        metaJson = err;
                        errFunc(err.toString(), null);
                    })
                }
                // Check if this (non-file) stream is allowed
                else if (that.isPartAllowed(part))
                {
                    // Add the token to the upload array we are sending back to the user
                    var uploadToken = createToken();
                    uploadedTokens.push(uploadToken);
                    numParts++;

                    // Upload the file part to the cloud
                    manager.uploadStream(part, bucketEntry, username, true, parentFile).then(function (file)
                    {
                        fileUploaded(file, uploadToken);

                    }).catch(function (err: Error)
                    {
                        errFunc(err.toString(), uploadToken);
                    });
                }
                else
                    part.resume();
            });

            // Close emitted after form parsed
            form.on('close', function ()
            {
                closed = true;
                checkIfComplete();
            });

            // Checks if the connection is closed and all the parts have been uploaded
            var checkIfComplete = function ()
            {
                if (closed && completedParts == numParts)
                {
                    that.finalizeUploads( metaJson, filesUploaded, username, uploadedTokens ).then(function( token ) {
                        return okJson<users.IUploadResponse>(token, res );
                    });
                }
            }

            // Parse req
            form.parse(<express.Request><Express.Request>req);

        }).catch(function (err)
        {
            return okJson<users.IUploadResponse>( { message: "Could not get bucket: " + err.toString(), error: true, tokens: [] }, res );
        });
    }

    /**
     * After the uploads have been uploaded, we set any meta on the files and send file uploaded events
     * @param {any | Error} meta The optional meta to associate with the uploaded files. The meta can be either a valid JSON or an error. If its
     * an error, then that means the meta could not be parsed
     * @param {Array<users.IFileEntry>} files The uploaded files
     * @param {string} user The user who uploaded the files
     * @param {Array<users.IUploadToken>} tokens The upload tokens to be sent back to the client
     */
    private async finalizeUploads( meta: any | Error, files: Array<users.IFileEntry>, user: string, tokens : Array<users.IUploadToken> ) : Promise<users.IUploadResponse>
    {
        try
        {
            var manager = BucketManager.get;
            var error = false;
            var msg = `Upload complete. [${files.length}] Files have been saved.`;

            // If we have any an error with the meta, then remove all the uploaded files
            if (meta && meta instanceof Error)
            {
                var error = true;
                var fileIds: Array<string> = files.map( file => file.identifier.toString() );
                var filesRemoved = await manager.removeFilesByIdentifiers(fileIds);

                files = [];
                tokens = [];
                msg = meta.toString();
            }
            // If we have any meta, then update the file entries with it
            else if (meta && meta && files.length > 0)
            {
                var query = { $or: [] };
                for (var i = 0, l = files.length; i < l; i++)
                {
                    query.$or.push(<users.IFileEntry>{ _id: new mongodb.ObjectID(files[i]._id) });

                    // Manually add the meta to the files
                    files[i].meta = meta;
                }

                await manager.setMeta(query, meta);
            }

            // Notify the sockets of each file that was uploaded
            for (var i = 0, l = files.length; i < l; i++)
            {
                // Send file added events to sockets
                var token: def.SocketEvents.IFileToken = { username: user, type: ClientInstructionType[ClientInstructionType.FileUploaded], file: files[i] };
                await CommsController.singleton.processClientInstruction(new ClientInstruction(token, null, user))
            }


            // Override the default message if the tokens had an issue
            for (var i = 0, l = tokens.length; i < l; i++)
                if (tokens[i].error)
                {
                    error = true;
                    msg = "There was a problem with your upload. Please check the tokens for more information.";
                    break;
                }

            return <users.IUploadResponse>{ message: msg, error: error, tokens: tokens };

        } catch ( err ) {
            return <users.IUploadResponse>{ message: err.toString(), error: true, tokens: [] };
        };
    }

	/**
	* Called to initialize this controller and its related database objects
    * @returns {Promise<void>}
	*/
    async initialize(db: mongodb.Db): Promise<void>
    {
        var bucketsCollection;
        var filesCollection;
        var statsCollection;

        var collections = await Promise.all([
            this.createCollection(this._config.google.bucket.bucketsCollection, db),
            this.createCollection(this._config.google.bucket.filesCollection, db),
            this.createCollection(this._config.google.bucket.statsCollection, db)

        ]);

        bucketsCollection = collections[0];
        filesCollection = collections[1];
        statsCollection = collections[2];

        await Promise.all([
            this.ensureIndex(bucketsCollection, "name"),
            this.ensureIndex(bucketsCollection, "user"),
            this.ensureIndex(bucketsCollection, "created"),
            this.ensureIndex(bucketsCollection, "memoryUsed"),

            this.ensureIndex(filesCollection, "name"),
            this.ensureIndex(filesCollection, "user"),
            this.ensureIndex(filesCollection, "created"),
            this.ensureIndex(filesCollection, "size"),
            this.ensureIndex(filesCollection, "mimeType"),
            this.ensureIndex(filesCollection, "numDownloads")
        ]);

        // Create the user manager
        this._bucketManager = BucketManager.create(bucketsCollection, filesCollection, statsCollection, this._config);

        // Initialization is finished
        return;
    }
}