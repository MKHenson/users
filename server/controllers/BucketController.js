var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var express = require("express");
var Users_1 = require("../Users");
var PermissionController_1 = require("../PermissionController");
var Controller_1 = require("./Controller");
var BucketManager_1 = require("../BucketManager");
var multiparty = require("multiparty");
var compression = require("compression");
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
        // Setup the rest calls
        var router = express.Router();
        router.use(compression());
        router.get("/download/:id", [this.getFile.bind(this)]);
        router.get("/get-files/:user/:bucket", [PermissionController_1.hasAdminRights, this.getFiles.bind(this)]);
        router.get("/get-stats/:user?", [PermissionController_1.hasAdminRights, this.getStats.bind(this)]);
        router.get("/get-buckets/:user?", [PermissionController_1.hasAdminRights, this.getBuckets.bind(this)]);
        router.delete("/remove-buckets/:buckets", [PermissionController_1.identifyUser, this.removeBuckets.bind(this)]);
        router.delete("/remove-files/:files", [PermissionController_1.identifyUser, this.removeFiles.bind(this)]);
        router.post("/upload/:bucket", [PermissionController_1.identifyUser, this.uploadUserFiles.bind(this)]);
        router.post("/create-bucket/:user/:name", [PermissionController_1.hasAdminRights, this.createBucket.bind(this)]);
        router.post("/create-stats/:target", [PermissionController_1.hasAdminRights, this.createStats.bind(this)]);
        router.put("/storage-calls/:target/:value", [PermissionController_1.hasAdminRights, this.verifyTargetValue, this.updateCalls.bind(this)]);
        router.put("/storage-memory/:target/:value", [PermissionController_1.hasAdminRights, this.verifyTargetValue, this.updateMemory.bind(this)]);
        router.put("/storage-allocated-calls/:target/:value", [PermissionController_1.hasAdminRights, this.verifyTargetValue, this.updateAllocatedCalls.bind(this)]);
        router.put("/storage-allocated-memory/:target/:value", [PermissionController_1.hasAdminRights, this.verifyTargetValue, this.updateAllocatedMemory.bind(this)]);
        // Register the path
        e.use("" + config.mediaURL, router);
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
        Users_1.UserManager.get.getUser(req.params.target).then(function (user) {
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
        var manager = BucketManager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { apiCallsUsed: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user API calls to [" + value + "]", error: false }));
        }).catch(function (err) {
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
        var manager = BucketManager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { memoryUsed: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user memory to [" + value + "] bytes", error: false }));
        }).catch(function (err) {
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
        var manager = BucketManager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { apiCallsAllocated: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user API calls to [" + value + "]", error: false }));
        }).catch(function (err) {
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
        var manager = BucketManager_1.BucketManager.get;
        manager.updateStorage(req._target.dbEntry.username, { memoryAllocated: value }).then(function () {
            return res.end(JSON.stringify({ message: "Updated the user memory to [" + value + "] bytes", error: false }));
        }).catch(function (err) {
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
        var manager = BucketManager_1.BucketManager.get;
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
        var manager = BucketManager_1.BucketManager.get;
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
        var manager = BucketManager_1.BucketManager.get;
        manager.getUserStats(req._user.dbEntry.username).then(function (stats) {
            return res.end(JSON.stringify({
                message: "Successfully retrieved " + req._user.dbEntry.username + "'s stats",
                error: false,
                data: stats
            }));
        }).catch(function (err) {
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
        var manager = BucketManager_1.BucketManager.get;
        var fileID = req.params.id;
        var file = null;
        var cache = this._config.bucket.cacheLifetime;
        if (!fileID || fileID.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a file ID", error: true }));
        manager.getFile(fileID).then(function (iFile) {
            file = iFile;
            return manager.withinAPILimit(iFile.user);
        }).then(function (valid) {
            if (!valid)
                return Promise.reject(new Error("API limit reached"));
            return manager.incrementAPI(file.user);
        }).then(function (data) {
            res.setHeader('Content-Type', file.mimeType);
            res.setHeader('Content-Length', file.size.toString());
            if (cache)
                res.setHeader("Cache-Control", "public, max-age=" + cache);
            manager.downloadFile(req, res, file);
        }).catch(function (err) {
            return res.status(404).send('File not found');
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
        var manager = BucketManager_1.BucketManager.get;
        var numFiles = 0;
        var index = parseInt(req.query.index);
        var limit = parseInt(req.query.limit);
        var bucketEntry;
        if (!req.params.bucket || req.params.bucket.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a valid bucket name", error: true }));
        manager.getIBucket(req.params.bucket, req._user.dbEntry.username).then(function (bucket) {
            if (!bucket)
                return Promise.reject(new Error("Could not find the bucket '" + req.params.bucket + "'"));
            bucketEntry = bucket;
            return manager.numFiles({ bucketId: bucket.identifier });
        }).then(function (count) {
            numFiles = count;
            return manager.getFilesByBucket(bucketEntry, index, limit);
        }).then(function (files) {
            return res.end(JSON.stringify({
                message: "Found [" + numFiles + "] files",
                error: false,
                data: files,
                count: numFiles
            }));
        }).catch(function (err) {
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
        var manager = BucketManager_1.BucketManager.get;
        var numBuckets = 1;
        manager.getBucketEntries(user).then(function (buckets) {
            return res.end(JSON.stringify({
                message: "Found [" + buckets.length + "] buckets",
                error: false,
                data: buckets,
                count: buckets.length
            }));
        }).catch(function (err) {
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
        var manager = BucketManager_1.BucketManager.get;
        manager.createUserStats(req.params.target).then(function (stats) {
            return res.end(JSON.stringify({
                message: "Stats for the user '" + req.params.target + "' have been created",
                error: false
            }));
        }).catch(function (err) {
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    BucketController.prototype.alphaNumericDashSpace = function (str) {
        if (!str.match(/^[0-9A-Z -]+$/i))
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
        var manager = BucketManager_1.BucketManager.get;
        var username = req.params.user;
        var bucketName = req.params.name;
        if (!username || username.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a valid username", error: true }));
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a valid name", error: true }));
        if (!this.alphaNumericDashSpace(bucketName))
            return res.end(JSON.stringify({ message: "Please only use safe characters", error: true }));
        Users_1.UserManager.get.getUser(username).then(function (user) {
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
            return res.end(JSON.stringify({
                message: err.toString(),
                error: true
            }));
        });
    };
    /**
    * Attempts to upload a file to the user's bucket
    * @param {express.Request} req
    * @param {express.Response} res
    * @param {Function} next
    */
    BucketController.prototype.uploadUserFiles = function (req, res, next) {
        var form = new multiparty.Form();
        var successfulParts = 0;
        var numParts = 0;
        var completedParts = 0;
        var closed = false;
        var uploadedTokens = [];
        var manager = BucketManager_1.BucketManager.get;
        var that = this;
        var username = req._user.dbEntry.username;
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var bucketName = req.params.bucket;
        if (!bucketName || bucketName.trim() == "")
            return res.end(JSON.stringify({ message: "Please specify a bucket", error: true, tokens: [] }));
        manager.getIBucket(bucketName, username).then(function (bucketEntry) {
            if (!bucketEntry)
                return res.end(JSON.stringify({ message: "No bucket exists with the name '" + bucketName + "'", error: true, tokens: [] }));
            // Parts are emitted when parsing the form
            form.on('part', function (part) {
                // Create a new upload token
                var newUpload = {
                    file: "",
                    field: (!part.name ? "" : part.name),
                    filename: part.filename,
                    error: false,
                    errorMsg: ""
                };
                // This part is a file - so we act on it
                if (!!part.filename) {
                    // Add the token to the upload array we are sending back to the user
                    uploadedTokens.push(newUpload);
                    numParts++;
                    if (!that.alphaNumericDashSpace(newUpload.field)) {
                        completedParts++;
                        newUpload.error = true;
                        newUpload.errorMsg = "Please use safe characters";
                        part.resume();
                        checkIfComplete();
                    }
                    else {
                        // Upload the file part to the cloud
                        manager.uploadStream(part, bucketEntry, username).then(function (file) {
                            completedParts++;
                            successfulParts++;
                            newUpload.file = file.identifier;
                            part.resume();
                            checkIfComplete();
                        }).catch(function (err) {
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
            var checkIfComplete = function () {
                if (closed && completedParts == numParts) {
                    return res.end(JSON.stringify({
                        message: "Upload complete. [" + successfulParts + "] Files have been saved.",
                        error: false,
                        tokens: uploadedTokens
                    }));
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
            return res.end(JSON.stringify({ message: err.toString(), error: true, tokens: [] }));
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
                console.log('Error on part event: ' + err);
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
                that.createCollection(that._config.bucket.bucketsCollection, db),
                that.createCollection(that._config.bucket.filesCollection, db),
                that.createCollection(that._config.bucket.statsCollection, db)
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
                that._bucketManager = BucketManager_1.BucketManager.create(bucketsCollection, filesCollection, statsCollection, that._config);
                // Initialization is finished
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    return BucketController;
})(Controller_1.Controller);
exports.BucketController = BucketController;
