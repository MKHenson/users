"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, Promise, generator) {
    return new Promise(function (resolve, reject) {
        generator = generator.call(thisArg, _arguments);
        function cast(value) { return value instanceof Promise && value.constructor === Promise ? value : new Promise(function (resolve) { resolve(value); }); }
        function onfulfill(value) { try { step("next", value); } catch (e) { reject(e); } }
        function onreject(value) { try { step("throw", value); } catch (e) { reject(e); } }
        function step(verb, value) {
            var result = generator[verb](value);
            result.done ? resolve(result.value) : cast(result.value).then(onfulfill, onreject);
        }
        step("next", void 0);
    });
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
var socket_event_types_1 = require("../socket-event-types");
var serializers_1 = require("../serializers");
/**
* Main class to use for managing users
*/
class BucketController extends controller_1.Controller {
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    constructor(e, config) {
        super();
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
        e.use(`${config.apiPrefix}`, router);
    }
    /**
     * Makes sure the target user exists and the numeric value specified is valid
     * @param {express.Request} req
     * @param {express.Response} res
     * @param {Function} next
     */
    verifyTargetValue(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                // Set the content type
                var value = parseInt(req.params.value);
                if (!req.params.target || req.params.target.trim() == "")
                    throw new Error("Please specify a valid user to target");
                if (!req.params.value || req.params.value.trim() == "" || isNaN(value))
                    throw new Error("Please specify a valid value");
                // Make sure the user exists
                var user = yield users_1.UserManager.get.getUser(req.params.target);
                if (!user)
                    throw new Error(`Could not find the user '${req.params.target}'`);
                req._target = user;
                next();
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
   * Updates the target user's api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    updateCalls(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var value = parseInt(req.params.value);
                var manager = bucket_manager_1.BucketManager.get;
                yield manager.updateStorage(req._target.dbEntry.username, { apiCallsUsed: value });
                serializers_1.okJson({ message: `Updated the user API calls to [${value}]`, error: false }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
   * Updates the target user's memory usage
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    updateMemory(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var value = parseInt(req.params.value);
                var manager = bucket_manager_1.BucketManager.get;
                yield manager.updateStorage(req._target.dbEntry.username, { memoryUsed: value });
                serializers_1.okJson({ message: `Updated the user memory to [${value}] bytes`, error: false }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
   * Updates the target user's allocated api calls
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    updateAllocatedCalls(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var value = parseInt(req.params.value);
                var manager = bucket_manager_1.BucketManager.get;
                yield manager.updateStorage(req._target.dbEntry.username, { apiCallsAllocated: value });
                serializers_1.okJson({ message: `Updated the user API calls to [${value}]`, error: false }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
   * Updates the target user's allocated memory
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    updateAllocatedMemory(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var value = parseInt(req.params.value);
                var manager = bucket_manager_1.BucketManager.get;
                yield manager.updateStorage(req._target.dbEntry.username, { memoryAllocated: value });
                serializers_1.okJson({ message: `Updated the user memory to [${value}] bytes`, error: false }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
    * Removes files specified in the URL
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    removeFiles(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                var files = null;
                if (!req.params.files || req.params.files.trim() == "")
                    throw new Error("Please specify the files to remove");
                files = req.params.files.split(",");
                var filesRemoved = yield manager.removeFilesById(files, req._user.dbEntry.username);
                serializers_1.okJson({
                    message: `Removed [${filesRemoved.length}] files`,
                    error: false,
                    data: filesRemoved,
                    count: filesRemoved.length
                }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
   * Renames a file
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    renameFile(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                if (!req.params.file || req.params.file.trim() == "")
                    throw new Error("Please specify the file to rename");
                if (!req.body || !req.body.name || req.body.name.trim() == "")
                    throw new Error("Please specify the new name of the file");
                var fileEntry = yield manager.getFile(req.params.file, req._user.dbEntry.username);
                if (!fileEntry)
                    throw new Error(`Could not find the file '${req.params.file}'`);
                var file = yield manager.renameFile(fileEntry, req.body.name);
                serializers_1.okJson({ message: `Renamed file to '${req.body.name}'`, error: false }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
    * Removes buckets specified in the URL
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    removeBuckets(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                var buckets = null;
                if (!req.params.buckets || req.params.buckets.trim() == "")
                    throw new Error("Please specify the buckets to remove");
                buckets = req.params.buckets.split(",");
                var filesRemoved = yield manager.removeBucketsByName(buckets, req._user.dbEntry.username);
                return serializers_1.okJson({
                    message: `Removed [${filesRemoved.length}] buckets`,
                    error: false,
                    data: filesRemoved,
                    count: filesRemoved.length
                }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
    * Fetches the statistic information for the specified user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getStats(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                var stats = yield manager.getUserStats(req._user.dbEntry.username);
                return serializers_1.okJson({
                    message: `Successfully retrieved ${req._user.dbEntry.username}'s stats`,
                    error: false,
                    data: stats
                }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
   * Attempts to download a file from the server
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    getFile(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                var fileID = req.params.id;
                var file = null;
                var cache = this._config.google.bucket.cacheLifetime;
                if (!fileID || fileID.trim() == "")
                    throw new Error(`Please specify a file ID`);
                file = yield manager.getFile(fileID);
                res.setHeader('Content-Type', file.mimeType);
                res.setHeader('Content-Length', file.size.toString());
                if (cache)
                    res.setHeader("Cache-Control", "public, max-age=" + cache);
                manager.downloadFile(req, res, file);
                manager.incrementAPI(file.user);
            }
            catch (err) {
                winston.error(err.toString(), { process: process.pid });
                return res.status(404).send('File not found');
            }
        });
    }
    /**
   * Attempts to make a file public
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    makePublic(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                var fileID = req.params.id;
                var cache = this._config.google.bucket.cacheLifetime;
                if (!fileID || fileID.trim() == "")
                    throw new Error(`Please specify a file ID`);
                var fileEntry = yield manager.getFile(fileID, req._user.dbEntry.username);
                fileEntry = yield manager.makeFilePublic(fileEntry);
                serializers_1.okJson({ message: `File is now public`, error: false, data: fileEntry }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
        });
    }
    /**
   * Attempts to make a file private
   * @param {express.Request} req
   * @param {express.Response} res
   * @param {Function} next
   */
    makePrivate(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                var fileID = req.params.id;
                var fileEntry = null;
                var cache = this._config.google.bucket.cacheLifetime;
                if (!fileID || fileID.trim() == "")
                    throw new Error(`Please specify a file ID`);
                fileEntry = yield manager.getFile(fileID, req._user.dbEntry.username);
                fileEntry = yield manager.makeFilePrivate(fileEntry);
                serializers_1.okJson({ message: `File is now private`, error: false, data: fileEntry }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
        });
    }
    /**
    * Fetches all file entries from the database. Optionally specifying the bucket to fetch from.
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getFiles(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            var manager = bucket_manager_1.BucketManager.get;
            var index = parseInt(req.query.index);
            var limit = parseInt(req.query.limit);
            var bucketEntry;
            var searchTerm;
            try {
                if (!req.params.bucket || req.params.bucket.trim() == "")
                    throw new Error("Please specify a valid bucket name");
                // Check for keywords
                if (req.query.search)
                    searchTerm = new RegExp(req.query.search, "i");
                bucketEntry = yield manager.getIBucket(req.params.bucket, req._user.dbEntry.username);
                if (!bucketEntry)
                    throw new Error(`Could not find the bucket '${req.params.bucket}'`);
                var count = yield manager.numFiles({ bucketId: bucketEntry.identifier });
                var files = yield manager.getFilesByBucket(bucketEntry, index, limit, searchTerm);
                return serializers_1.okJson({
                    message: `Found [${count}] files`,
                    error: false,
                    data: files,
                    count: count
                }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
    * Fetches all bucket entries from the database
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    getBuckets(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            var user = req.params.user;
            var manager = bucket_manager_1.BucketManager.get;
            var numBuckets = 1;
            var searchTerm;
            try {
                // Check for keywords
                if (req.query.search)
                    searchTerm = new RegExp(req.query.search, "i");
                var buckets = yield manager.getBucketEntries(user, searchTerm);
                return serializers_1.okJson({
                    message: `Found [${buckets.length}] buckets`,
                    error: false,
                    data: buckets,
                    count: buckets.length
                }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
    * Creates a new user stat entry. This is usually done for you when creating a new user
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    createStats(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                var stats = yield manager.createUserStats(req.params.target);
                serializers_1.okJson({ message: `Stats for the user '${req.params.target}' have been created`, error: false }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    alphaNumericDashSpace(str) {
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
    createBucket(req, res, next) {
        return __awaiter(this, void 0, Promise, function* () {
            var manager = bucket_manager_1.BucketManager.get;
            var username = req.params.user;
            var bucketName = req.params.name;
            try {
                if (!username || username.trim() == "")
                    throw new Error("Please specify a valid username");
                if (!bucketName || bucketName.trim() == "")
                    throw new Error("Please specify a valid name");
                if (!this.alphaNumericDashSpace(bucketName))
                    throw new Error("Please only use safe characters");
                var user = yield users_1.UserManager.get.getUser(username);
                if (!user)
                    throw new Error(`Could not find a user with the name '${username}'`);
                var inLimits = yield manager.withinAPILimit(username);
                if (!inLimits)
                    throw new Error(`You have run out of API calls, please contact one of our sales team or upgrade your account.`);
                var bucket = yield manager.createBucket(bucketName, username);
                serializers_1.okJson({ message: `Bucket '${bucketName}' created`, error: false }, res);
            }
            catch (err) {
                return serializers_1.errJson(err, res);
            }
            ;
        });
    }
    /**
    * Checks if a part is allowed to be uploaded
    * @returns {boolean}
    */
    isPartAllowed(part) {
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
    isFileTypeAllowed(part) {
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
    }
    /**
    * Attempts to upload a file to the user's bucket
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    uploadUserFiles(req, res, next) {
        var form = new multiparty.Form({ maxFields: 8, maxFieldsSize: 5 * 1024 * 1024, maxFilesSize: 10 * 1024 * 1024 });
        var numParts = 0;
        var completedParts = 0;
        var closed = false;
        var uploadedTokens = [];
        var manager = bucket_manager_1.BucketManager.get;
        var that = this;
        var username = req._user.dbEntry.username;
        var parentFile = req.params.parentFile;
        var filesUploaded = [];
        var bucketName = req.params.bucket;
        if (!bucketName || bucketName.trim() == "")
            return serializers_1.okJson({ message: `Please specify a bucket`, error: true, tokens: [] }, res);
        manager.getIBucket(bucketName, username).then(function (bucketEntry) {
            if (!bucketEntry)
                return serializers_1.okJson({ message: `No bucket exists with the name '${bucketName}'`, error: true, tokens: [] }, res);
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
                        errFunc(`Please only use approved file types '${that._allowedFileTypes.join(", ")}'`);
                        return;
                    }
                    // Add the token to the upload array we are sending back to the user
                    uploadedTokens.push(newUpload);
                    numParts++;
                    // Upload the file part to the cloud
                    manager.uploadStream(part, bucketEntry, username, true, parentFile).then(function (file) {
                        filesUploaded.push(file);
                        completedParts++;
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
            // Close emitted after form parsed
            form.on('close', function () {
                closed = true;
                checkIfComplete();
            });
            // Checks if the connection is closed and all the parts have been uploaded
            var checkIfComplete = function () {
                if (closed && completedParts == numParts) {
                    that.finalizeUploads(metaJson, filesUploaded, username, uploadedTokens).then(function (token) {
                        return serializers_1.okJson(token, res);
                    });
                }
            };
            // Parse req
            form.parse(req);
        }).catch(function (err) {
            return serializers_1.okJson({ message: "Could not get bucket: " + err.toString(), error: true, tokens: [] }, res);
        });
    }
    /**
     * After the uploads have been uploaded, we set any meta on the files and send file uploaded events
     * @param {any} meta The optional meta to associate with the uploaded files
     * @param {Array<users.IFileEntry>} files The uploaded files
     * @param {string} user The user who uploaded the files
     * @param {Array<users.IUploadToken>} tokens The upload tokens to be sent back to the client
     */
    finalizeUploads(meta, files, user, tokens) {
        return __awaiter(this, void 0, Promise, function* () {
            try {
                var manager = bucket_manager_1.BucketManager.get;
                // If we have any meta, then update the file entries with it
                if (meta && files.length > 0) {
                    var query = { $or: [] };
                    for (var i = 0, l = files.length; i < l; i++) {
                        query.$or.push({ _id: new mongodb.ObjectID(files[i]._id) });
                        // Manually add the meta to the files
                        files[i].meta = meta;
                    }
                    yield manager.setMeta(query, meta);
                }
                for (var i = 0, l = files.length; i < l; i++) {
                    // Send file added events to sockets
                    var fEvent = { username: user, eventType: socket_event_types_1.EventType.FileUploaded, file: files[i], error: undefined };
                    yield comms_controller_1.CommsController.singleton.broadcastEventToAll(fEvent);
                }
                var error = false;
                var msg = `Upload complete. [${files.length}] Files have been saved.`;
                for (var i = 0, l = tokens.length; i < l; i++)
                    if (tokens[i].error) {
                        error = true;
                        msg = tokens[i].errorMsg;
                        break;
                    }
                // The response error and message
                var msg = `Upload complete. [${files.length}] Files have been saved.`;
                return { message: msg, error: error, tokens: tokens };
            }
            catch (err) {
                return { message: err.toString(), error: true, tokens: [] };
            }
            ;
        });
    }
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<void>}
    */
    initialize(db) {
        return __awaiter(this, void 0, Promise, function* () {
            var bucketsCollection;
            var filesCollection;
            var statsCollection;
            var collections = yield Promise.all([
                this.createCollection(this._config.google.bucket.bucketsCollection, db),
                this.createCollection(this._config.google.bucket.filesCollection, db),
                this.createCollection(this._config.google.bucket.statsCollection, db)
            ]);
            bucketsCollection = collections[0];
            filesCollection = collections[1];
            statsCollection = collections[2];
            yield Promise.all([
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
            this._bucketManager = bucket_manager_1.BucketManager.create(bucketsCollection, filesCollection, statsCollection, this._config);
            // Initialization is finished
            return;
        });
    }
}
exports.BucketController = BucketController;
