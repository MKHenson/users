var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var express = require("express");
var PermissionController_1 = require("../PermissionController");
var Controller_1 = require("./Controller");
var BucketManager_1 = require("../BucketManager");
var multiparty = require("multiparty");
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
        router.get("/get-files/:bucket?", [PermissionController_1.hasAdminRights, this.getFiles.bind(this)]);
        router.get("/get-buckets", [PermissionController_1.hasAdminRights, this.getBuckets.bind(this)]);
        router.post("/user-upload", [PermissionController_1.hasAdminRights, this.uploadUserFiles.bind(this)]);
        router.post("/create-bucket/:target", [PermissionController_1.hasAdminRights, this.createBucket.bind(this)]);
        router.post("/create-stats/:target", [PermissionController_1.hasAdminRights, this.createStats.bind(this)]);
        // Register the path
        e.use("" + config.mediaURL, router);
    }
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
        manager.getFileEntries(req.params.bucket).then(function (files) {
            return res.end(JSON.stringify({
                message: "Found [" + files.length + "] files",
                error: false,
                data: files
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
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        var manager = BucketManager_1.BucketManager.get;
        manager.getBucketEntries().then(function (buckets) {
            return res.end(JSON.stringify({
                message: "Found [" + buckets.length + "] buckets",
                error: false,
                data: buckets
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
        manager.createUserBucket(req.params.target).then(function (bucket) {
            return res.end(JSON.stringify({
                message: "Bucket '" + bucket.name + "' created",
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
        // Set the content type
        res.setHeader('Content-Type', 'application/json');
        // Parts are emitted when parsing the form
        form.on('part', function (part) {
            // Create a new upload token
            var newUpload = {
                file: "",
                field: part.name,
                filename: part.filename,
                error: false,
                errorMsg: ""
            };
            // Add the token to the upload array we are sending back to the user
            uploadedTokens.push(newUpload);
            // This part is a file - so we act on it
            if (!!part.filename) {
                numParts++;
                // Upload the file part to the cloud
                manager.uploadStream(part, req._user.dbEntry.username).then(function (file) {
                    completedParts++;
                    successfulParts++;
                    newUpload.file = file.name;
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
        });
        // Parse req
        form.parse(req);
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
            Promise.all([
                that.createCollection(that._config.bucket.bucketsCollection, db),
                that.createCollection(that._config.bucket.filesCollection, db),
                that.createCollection(that._config.bucket.statsCollection, db)
            ]).then(function (collections) {
                // Create the user manager
                that._bucketManager = BucketManager_1.BucketManager.create(collections[0], collections[1], collections[2], that._config);
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
