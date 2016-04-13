"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var express = require("express");
var bodyParser = require('body-parser');
var mongodb = require("mongodb");
var users_1 = require("../users");
var permission_controller_1 = require("../permission-controller");
var controller_1 = require("./controller");
var bucket_manager_1 = require("../bucket-manager");
var multiparty = require("multiparty");
var compression = require("compression");
var winston = require("winston");
var comms_controller_1 = require("./comms-controller");
/**
* Main class to use for managing users
*/
var BucketController = (function (_super) {
    __extends(BucketController, _super);
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    function BucketController(e, config) {
        _super.call(this);
        this._config = config;
        this._allowedFileTypes = ["image/bmp", "image/png", "image/jpeg", "image/jpg", "image/gif", "image/tiff", "text/plain", "text/json", "application/octet-stream"];
        // Setup the rest calls
        var router = express.Router();
        router.use(compression());
        router.use(bodyParser.urlencoded({ 'extended': true }));
        router.use(bodyParser.json());
        router.use(bodyParser.json({ type: 'application/vnd.api+json' }));
        router.get("/files/:id/download", [this.getFile.bind(this)]);
        router.get("/users/:user/buckets/:bucket/files", [permission_controller_1.ownerRights, this.getFiles.bind(this)]);
        router.get("/users/:user/get-stats", [permission_controller_1.ownerRights, this.getStats.bind(this)]);
        router.get("/users/:user/buckets", [permission_controller_1.ownerRights, this.getBuckets.bind(this)]);
        router.delete("/buckets/:buckets", [permission_controller_1.requireUser, this.removeBuckets.bind(this)]);
        router.delete("/files/:files", [permission_controller_1.requireUser, this.removeFiles.bind(this)]);
        router.post("/buckets/:bucket/upload/:parentFile?", [permission_controller_1.requireUser, this.uploadUserFiles.bind(this)]);
        router.post("/users/:user/buckets/:name", [permission_controller_1.ownerRights, this.createBucket.bind(this)]);
        router.post("/create-stats/:target", [permission_controller_1.ownerRights, this.createStats.bind(this)]);
        router.put("/stats/storage-calls/:target/:value", [permission_controller_1.ownerRights, this.verifyTargetValue, this.updateCalls.bind(this)]);
        router.put("/stats/storage-memory/:target/:value", [permission_controller_1.ownerRights, this.verifyTargetValue, this.updateMemory.bind(this)]);
        router.put("/stats/storage-allocated-calls/:target/:value", [permission_controller_1.ownerRights, this.verifyTargetValue, this.updateAllocatedCalls.bind(this)]);
        router.put("/stats/storage-allocated-memory/:target/:value", [permission_controller_1.ownerRights, this.verifyTargetValue, this.updateAllocatedMemory.bind(this)]);
        router.put("/files/:file/rename-file", [permission_controller_1.requireUser, this.renameFile.bind(this)]);
        router.put("/files/:id/make-public", [permission_controller_1.requireUser, this.makePublic.bind(this)]);
        router.put("/files/:id/make-private", [permission_controller_1.requireUser, this.makePrivate.bind(this)]);
        // Register the path
        e.use("" + config.apiPrefix, router);
    }
    /**
   * Makes sure the target user exists and the numeric value specified is valid
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.verifyTargetValue = function (req, res, next) {
        // Set the content type
        var value = parseInt(req.params.value);
        if (!req.params.target || req.params.target.trim() == "") {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ message: "Please specify a valid user to target", error: true }));
        }
        if (!req.params.value || req.params.value.trim() == "" || isNaN(value)) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ message: "Please specify a valid value", error: true }));
        }
        // Make sure the user exists
        users_1.UserManager.get.getUser(req.params.target).then(function (user) {
            if (!user) {
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ message: "Could not find the user '" + req.params.target + "'", error: true }));
            }
            else {
                req._target = user;
                next();
            }
        }).catch(function (err) {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    };
    /**
   * Updates the target user's api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.updateCalls = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = bucket_manager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { apiCallsUsed: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user API calls to [" + value + "]", error: false }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    };
    /**
   * Updates the target user's memory usage
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.updateMemory = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = bucket_manager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { memoryUsed: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user memory to [" + value + "] bytes", error: false }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    };
    /**
   * Updates the target user's allocated api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.updateAllocatedCalls = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = bucket_manager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { apiCallsAllocated: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user API calls to [" + value + "]", error: false }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    };
    /**
   * Updates the target user's allocated memory
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.updateAllocatedMemory = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var value = parseInt(req.params.value);
        var manager = bucket_manager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { memoryAllocated: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user memory to [" + value + "] bytes", error: false }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({ message: err.toString(), error: true }));
        });
    };
    /**
    * Removes files specified in the URL
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.removeFiles = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        var files = null;
        if (!req.params.files || req.params.files.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify the files to remove", error: true }));
        files = req.params.files.split(",");
        manager.removeFilesById(files, req._user.dbEntry.username).then(function (numRemoved) {
            return res.end(JSON.stringify({
                message: "Removed [" + numRemoved.length + "] files",
                error: false,
                data: numRemoved
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
   * Renames a file
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.renameFile = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        if (!req.params.file || req.params.file.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify the file to rename", error: true }));
        if (!req.body || !req.body.name || req.body.name.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify the new name of the file", error: true }));
        manager.getFile(req.params.file, req._user.dbEntry.username).then(function (file) {
            if (!file)
                return Promise.reject(new Error("Could not find the file '" + req.params.file + "'"));
            return manager.renameFile(file, req.body.name);
        }).then(function (file) {
            return res.end(JSON.stringify({
                message: "Renamed file to '" + req.body.name + "'",
                error: false
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
    * Removes buckets specified in the URL
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.removeBuckets = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        var buckets = null;
        if (!req.params.buckets || req.params.buckets.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify the buckets to remove", error: true }));
        buckets = req.params.buckets.split(",");
        manager.removeBucketsByName(buckets, req._user.dbEntry.username).then(function (numRemoved) {
            return res.end(JSON.stringify({
                message: "Removed [" + numRemoved.length + "] buckets",
                error: false,
                data: numRemoved
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
    * Fetches the statistic information for the specified user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.getStats = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        manager.getUserStats(req._user.dbEntry.username).then(function (stats) {
            return res.end(JSON.stringify({
                message: "Successfully retrieved " + req._user.dbEntry.username + "'s stats",
                error: false,
                data: stats
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
   * Attempts to download a file from the server
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.getFile = function (req, res, next) {
        var manager = bucket_manager_1.BucketManager.get;
        var fileID = req.params.id;
        var file = null;
        var cache = this._config.google.bucket.cacheLifetime;
        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a file ID", error: true }));
        manager.getFile(fileID).then(function (iFile) {
            file = iFile;
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Length', file.size.toString());
            if (cache)
                res.setHeader("Cache-Control", "public, max-age=" + cache);
            manager.downloadFile(req, res, file);
            manager.incrementAPI(file.user);
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.status(404).send('File not found');
        });
    };
    /**
   * Attempts to make a file public
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.makePublic = function (req, res, next) {
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        var fileID = req.params.id;
        var file = null;
        var cache = this._config.google.bucket.cacheLifetime;
        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a file ID", error: true }));
        manager.getFile(fileID, req._user.dbEntry.username).then(function (iFile) {
            return manager.makeFilePublic(iFile);
        }).then(function (iFile) {
            return res.end(JSON.stringify({ message: "File is now public", error: false, data: iFile }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
   * Attempts to make a file private
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    BucketController.prototype.makePrivate = function (req, res, next) {
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        var fileID = req.params.id;
        var file = null;
        var cache = this._config.google.bucket.cacheLifetime;
        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a file ID", error: true }));
        manager.getFile(fileID, req._user.dbEntry.username).then(function (iFile) {
            return manager.makeFilePrivate(iFile);
        }).then(function (iFile) {
            return res.end(JSON.stringify({ message: "File is now private", error: false, data: iFile }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
    * Fetches all file entries from the database. Optionally specifying the bucket to fetch from.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.getFiles = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        var numFiles = 0;
        var index = parseInt(req.query.index);
        var limit = parseInt(req.query.limit);
        var bucketEntry;
        if (!req.params.bucket || req.params.bucket.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a valid bucket name", error: true }));
        var searchTerm;
        // Check for keywords
        if (req.query.search)
            searchTerm = new RegExp(req.query.search, "i");
        manager.getIBucket(req.params.bucket, req._user.dbEntry.username).then(function (bucket) {
            if (!bucket)
                return Promise.reject(new Error("Could not find the bucket '" + req.params.bucket + "'"));
            bucketEntry = bucket;
            return manager.numFiles({ bucketId: bucket.identifier });
        }).then(function (count) {
            numFiles = count;
            return manager.getFilesByBucket(bucketEntry, index, limit, searchTerm);
        }).then(function (files) {
            return res.end(JSON.stringify({
                message: "Found [" + numFiles + "] files",
                error: false,
                data: files,
                count: numFiles
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
    * Fetches all bucket entries from the database
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.getBuckets = function (req, res, next) {
        var user = req.params.user;
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        var numBuckets = 1;
        var searchTerm;
        // Check for keywords
        if (req.query.search)
            searchTerm = new RegExp(req.query.search, "i");
        manager.getBucketEntries(user, searchTerm).then(function (buckets) {
            return res.end(JSON.stringify({
                message: "Found [" + buckets.length + "] buckets",
                error: false,
                data: buckets,
                count: buckets.length
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
    * Creates a new user stat entry. This is usually done for you when creating a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.createStats = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        manager.createUserStats(req.params.target).then(function (stats) {
            return res.end(JSON.stringify({
                message: "Stats for the user '" + req.params.target + "' have been created",
                error: false
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    BucketController.prototype.alphaNumericDashSpace = function (str) {
        if (!str.match(/^[0-9A-Z _\-]+$/i))
            return false;
        else
            return true;
    };
    /**
    * Creates a new user bucket based on the target provided
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.createBucket = function (req, res, next) {
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = bucket_manager_1.BucketManager.get;
        var username = req.params.user;
        var bucketName = req.params.name;
        if (!username || username.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a valid username", error: true }));
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a valid name", error: true }));
        if (!this.alphaNumericDashSpace(bucketName))
            return res.end(JSON.stringify({ message: "Please only use safe characters", error: true }));
        users_1.UserManager.get.getUser(username).then(function (user) {
            if (user)
                return manager.withinAPILimit(username);
            else
                return Promise.reject(new Error("Could not find a user with the name '" + username + "'"));
        }).then(function (inLimits) {
            if (!inLimits)
                return Promise.reject(new Error("You have run out of API calls, please contact one of our sales team or upgrade your account."));
            return manager.createBucket(bucketName, username);
        }).then(function (bucket) {
            return res.end(JSON.stringify({
                message: "Bucket '" + bucketName + "' created",
                error: false
            }));
        }).catch(function (err) {
            winston.error(err.toString(), { process: process.pid });
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
    * Checks if a part is allowed to be uploaded
    * @returns {boolean}
    */
    BucketController.prototype.isPartAllowed = function (part) {
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
    };
    /**
    * Checks if a file part is allowed to be uploaded
    * @returns {boolean}
    */
    BucketController.prototype.isFileTypeAllowed = function (part) {
        if (!part.headers)
            return false;
        if (!part.headers["content-type"])
            return false;
        var allowedTypes = this._allowedFileTypes;
        var type = part.headers["content-type"].toLowerCase();
        var found = false;
        for (var i = 0, l = allowedTypes.length; i < l; i++)
            if (allowedTypes[i] == type) {
                found = true;
                break;
            }
        if (!found)
            return false;
        return true;
    };
    /**
    * Attempts to upload a file to the user's bucket
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.uploadUserFiles = function (req, res, next) {
        var form = new multiparty.Form({ maxFields: 8, maxFieldsSize: 5 * 1024 * 1024, maxFilesSize: 10 * 1024 * 1024 });
        var successfulParts = 0;
        var numParts = 0;
        var completedParts = 0;
        var closed = false;
        var uploadedTokens = [];
        var manager = bucket_manager_1.BucketManager.get;
        var that = this;
        var username = req._user.dbEntry.username;
        var parentFile = req.params.parentFile;
        var filesUploaded = [];
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var bucketName = req.params.bucket;
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a bucket", error: true, tokens: [] }));
        manager.getIBucket(bucketName, username).then(function (bucketEntry) {
            if (!bucketEntry) {
                winston.error("No bucket exists with the name '" + bucketName + "'", { process: process.pid });
                return res.end(JSON.stringify({ message: "No bucket exists with the name '" + bucketName + "'", error: true, tokens: [] }));
            }
            var metaJson;
            // Parts are emitted when parsing the form
            form.on('part', function (part) {
                // Create a new upload token
                var newUpload = {
                    file: "",
                    field: (!part.name ? "" : part.name),
                    filename: part.filename,
                    error: false,
                    errorMsg: "",
                    url: ""
                };
                // Deal with error logic
                var errFunc = function (errMsg) {
                    completedParts++;
                    newUpload.error = true;
                    newUpload.errorMsg = errMsg;
                    part.resume();
                    checkIfComplete();
                };
                // This part is a file - so we act on it
                if (!!part.filename) {
                    // Is file type allowed
                    if (!that.isFileTypeAllowed(part)) {
                        numParts++;
                        uploadedTokens.push(newUpload);
                        errFunc("Please only use approved file types '" + that._allowedFileTypes.join(", ") + "'");
                        return;
                    }
                    // Add the token to the upload array we are sending back to the user
                    uploadedTokens.push(newUpload);
                    numParts++;
                    // Upload the file part to the cloud
                    manager.uploadStream(part, bucketEntry, username, true, parentFile).then(function (file) {
                        filesUploaded.push(file);
                        completedParts++;
                        successfulParts++;
                        newUpload.file = file.identifier;
                        newUpload.url = file.publicURL;
                        part.resume();
                        checkIfComplete();
                    }).catch(function (err) {
                        errFunc(err.toString());
                    });
                }
                else if (part.name == "meta") {
                    numParts++;
                    var metaString = '';
                    uploadedTokens.push(newUpload);
                    part.setEncoding('utf8');
                    part.on('data', function (chunk) { metaString += chunk; });
                    part.on('error', function (err) {
                        metaJson = null;
                        errFunc("Could not download meta: " + err.toString());
                    });
                    part.on('end', function () {
                        try {
                            metaJson = JSON.parse(metaString);
                        }
                        catch (err) {
                            metaJson = null;
                            newUpload.error = true;
                            newUpload.errorMsg = "Meta data is not a valid JSON: " + err.toString();
                        }
                        part.resume();
                        completedParts++;
                        checkIfComplete();
                    });
                }
                else if (that.isPartAllowed(part)) {
                    // Add the token to the upload array we are sending back to the user
                    uploadedTokens.push(newUpload);
                    numParts++;
                    // Upload the file part to the cloud
                    manager.uploadStream(part, bucketEntry, username, true, parentFile).then(function (file) {
                        filesUploaded.push(file);
                        completedParts++;
                        successfulParts++;
                        newUpload.file = file.identifier;
                        newUpload.url = file.publicURL;
                        part.resume();
                        checkIfComplete();
                    }).catch(function (err) {
                        errFunc(err.toString());
                    });
                }
                else
                    part.resume();
            });
            // Checks if the connection is closed and all the parts have been uploaded
            var checkIfComplete = function () {
                if (closed && completedParts == numParts) {
                    var promise;
                    // If we have any meta, then update the file entries with it
                    if (metaJson && filesUploaded.length > 0) {
                        var query = { $or: [] };
                        for (var i = 0, l = filesUploaded.length; i < l; i++) {
                            query.$or.push({ _id: new mongodb.ObjectID(filesUploaded[i]._id) });
                            // Manually add the meta to the files
                            filesUploaded[i].meta = metaJson;
                        }
                        promise = manager.setMeta(query, metaJson);
                    }
                    else
                        promise = Promise.resolve(true);
                    // Once meta is updated
                    promise.then(function () {
                        var promise;
                        if (filesUploaded.length > 0) {
                            // Send file added events to sockets
                            var fEvent = { username: username, eventType: comms_controller_1.EventType.FilesUploaded, files: filesUploaded };
                            promise = comms_controller_1.CommsController.singleton.broadcastEvent(fEvent);
                        }
                        else
                            promise = Promise.resolve(true);
                        return promise;
                    }).then(function (val) {
                        var error = false;
                        var msg = "Upload complete. [" + successfulParts + "] Files have been saved.";
                        for (var i = 0, l = uploadedTokens.length; i < l; i++)
                            if (uploadedTokens[i].error) {
                                error = true;
                                msg = uploadedTokens[i].errorMsg;
                                break;
                            }
                        if (error)
                            winston.error(msg, { process: process.pid });
                        else
                            winston.info(msg, { process: process.pid });
                        return res.end(JSON.stringify({ message: msg, error: error, tokens: uploadedTokens }));
                    }).catch(function (err) {
                        // Something happened while updating the meta
                        winston.error("Could not update file meta: " + err.toString(), { process: process.pid });
                        return res.end(JSON.stringify({ message: "Could not update files meta: " + err.toString(), error: true, tokens: [] }));
                    });
                }
            };
            // Close emitted after form parsed
            form.on('close', function () {
                closed = true;
                checkIfComplete();
            });
            // Parse req
            form.parse(req);
        }).catch(function (err) {
            winston.error("Could not get bucket: " + err.toString(), { process: process.pid });
            return res.end(JSON.stringify({ message: "Could not get bucket: " + err.toString(), error: true, tokens: [] }));
        });
    };
    /**
    * Attempts to upload a file to the user's bucket
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.uploadUserData = function (req, res, next) {
        var form = new multiparty.Form();
        var count = 0;
        // Parts are emitted when parsing the form
        form.on('part', function (part) {
            // You *must* act on the part by reading it
            // NOTE: if you want to ignore it, just call "part.resume()"
            if (!!part.filename) {
                // filename is exists when this is a file
                count++;
                console.log('got field named ' + part.name + ' and got file named ' + part.filename);
                // ignore file's content here
                part.resume();
            }
            else {
                // filename doesn't exist when this is a field and not a file
                console.log('got field named ' + part.name);
                // ignore field's content
                part.resume();
            }
            part.on('error', function (err) {
                // decide what to do
                winston.error(err.toString(), { process: process.pid });
            });
        });
        form.on('progress', function (bytesReceived, bytesExpected) {
            // decide what to do
            console.log('BytesReceived: ' + bytesReceived, 'BytesExpected: ', bytesExpected);
        });
        form.on('field', function (name, value) {
            // decide what to do
            console.log('Field Name: ' + name + ', Field Value: ' + value);
        });
        // Close emitted after form parsed
        form.on('close', function () {
            console.log('Upload completed!');
            res.end('Received ' + count + ' files');
        });
        // Parse req
        form.parse(req);
    };
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    BucketController.prototype.initialize = function (db) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var bucketsCollection;
            var filesCollection;
            var statsCollection;
            Promise.all([
                that.createCollection(that._config.google.bucket.bucketsCollection, db),
                that.createCollection(that._config.google.bucket.filesCollection, db),
                that.createCollection(that._config.google.bucket.statsCollection, db)
            ]).then(function (collections) {
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
            }).then(function () {
                // Create the user manager
                that._bucketManager = bucket_manager_1.BucketManager.create(bucketsCollection, filesCollection, statsCollection, that._config);
                // Initialization is finished
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    return BucketController;
})(controller_1.Controller);
exports.BucketController = BucketController;
