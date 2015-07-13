var gcloud = require("gcloud");
/**
* Class responsible for managing buckets and uploads to Google storage
*/
var BucketManager = (function () {
    function BucketManager(buckets, files, stats, config) {
        BucketManager._singleton = this;
        this._gcs = gcloud.storage({ projectId: config.bucket.projectId, keyFilename: config.bucket.keyFile });
        this._buckets = buckets;
        this._files = files;
        this._stats = stats;
    }
    /**
    * Fetches all bucket entries from the database
    * @returns {Promise<Array<def.IBucketEntry>>}
    */
    BucketManager.prototype.getBucketEntries = function () {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        return new Promise(function (resolve, reject) {
            // Save the new entry into the database
            bucketCollection.find({}, function (err, result) {
                if (err)
                    return reject(err);
                else {
                    result.toArray(function (err, buckets) {
                        if (err)
                            return reject(err);
                        return resolve(buckets);
                    });
                }
            });
        });
    };
    /**
    * Fetches all file entries from the database for a given bucket
    * @param {string} bucket [Optional] Specify the bucket from which he files belong to
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    BucketManager.prototype.getFileEntries = function (bucket) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            var searchQuery = {};
            if (bucket)
                searchQuery.bucket = bucket;
            // Save the new entry into the database
            files.find(searchQuery, function (err, result) {
                if (err)
                    return reject(err);
                else {
                    result.toArray(function (err, files) {
                        if (err)
                            return reject(err);
                        return resolve(files);
                    });
                }
            });
        });
    };
    /**
    * Attempts to create a new user bucket by first creating the storage on the cloud and then updating the internal DB
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    BucketManager.prototype.createUserStats = function (user) {
        var that = this;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            var storage = {
                user: user,
                apiCallsAllocated: BucketManager.API_CALLS_ALLOCATED,
                memoryAllocated: BucketManager.MEMORY_ALLOCATED,
                apiCallsUsed: 0,
                memoryUsed: 0
            };
            stats.save(storage, function (err, result) {
                if (err)
                    return reject(err);
                else
                    return resolve(result);
            });
        });
    };
    /**
    * Attempts to create a new user bucket by first creating the storage on the cloud and then updating the internal DB
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    BucketManager.prototype.createUserBucket = function (user) {
        var that = this;
        var gcs = this._gcs;
        var bucketName = "webinate-user-" + Date.now();
        var bucketCollection = this._buckets;
        return new Promise(function (resolve, reject) {
            // Attempt to create a new Google bucket
            gcs.createBucket(bucketName, { location: "EU" }, function (err, bucket) {
                if (err)
                    return reject(new Error("Could not connect to storage system: '" + err.message + "'"));
                else {
                    var newEntry = {
                        name: bucketName,
                        created: Date.now(),
                        user: user,
                        memoryUsed: 0
                    };
                    // Save the new entry into the database
                    bucketCollection.save(newEntry, function (err, result) {
                        if (err)
                            return reject(err);
                        else
                            return resolve(bucket);
                    });
                }
            });
        });
    };
    /**
    * Attempts to remove a user bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    BucketManager.prototype.removeBucket = function (user) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            bucketCollection.findOne({ user: user }, function (err, result) {
                var bucketEntry = result;
                if (err)
                    return reject(err);
                else {
                    var bucket = gcs.bucket(result.identifier);
                    bucket.delete(function (err, apiResponse) {
                        if (err)
                            return reject(new Error("Could not remove bucket from storage system: '" + err.message + "'"));
                        else {
                            // Remove the bucket entry
                            bucketCollection.remove({ user: user }, function (err, result) {
                                // Remove the file entries
                                files.remove({ bucket: bucketEntry.identifier }, function (err, result) {
                                    // Update the stats usage
                                    stats.update({ user: user }, { $inc: { memoryUsed: -bucketEntry.memoryUsed } }, function (err, result) {
                                        return resolve();
                                    });
                                });
                            });
                        }
                    });
                }
            });
        });
    };
    /**
    * Deletes the file from storage and updates the databases
    */
    BucketManager.prototype.deleteFile = function (bucketEntry, fileEntry) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            var bucket = gcs.bucket(bucketEntry.identifier);
            // Get the bucket and delete the file
            bucket.file(fileEntry.identifier).delete(function (err, apiResponse) {
                if (err)
                    return reject(new Error("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'"));
                // Update the bucket data usage
                bucketCollection.update({ name: bucketEntry.identifier }, { $inc: { memoryUsed: fileEntry.size } }, function (err, result) {
                    if (err)
                        return reject("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'");
                    // Remove the file entries
                    files.remove({ _id: fileEntry._id }, function (err, result) {
                        if (err)
                            return reject("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'");
                        // Update the stats usage
                        stats.update({ user: bucketEntry.user }, { $inc: { memoryUsed: bucketEntry.memoryUsed, apiCallsUsed: 1 } }, function (err, result) {
                            if (err)
                                return reject("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'");
                            return resolve(fileEntry);
                        });
                    });
                });
            });
        });
    };
    /**
    * Attempts to remove files from the cloud and database
    * @param {Array<string>} fileNames The files to remove
    * @returns {Promise<string>} Returns the names of the files removed
    */
    BucketManager.prototype.removeFiles = function (fileNames, user) {
        if (fileNames.length == 0)
            return Promise.resolve();
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        var numToRemove = fileNames.length;
        var attempts = 0;
        var filesRemoved = [];
        // Create the search query for each of the files
        var searchQuery = { $or: [] };
        for (var i = 0; i < numToRemove; i++)
            searchQuery.$or.push({ name: fileNames[i] });
        return new Promise(function (resolve, reject) {
            // Get the files
            files.find(searchQuery, function (err, cursor) {
                if (err)
                    return reject(err);
                // For each file entry
                cursor.each(function (err, fileEntry) {
                    that.getIBucket(fileEntry.bucket).then(function (bucketEntry) {
                        return that.deleteFile(bucketEntry, fileEntry);
                    }).then(function (fileEntry) {
                        attempts++;
                        filesRemoved.push(fileEntry.identifier);
                        if (attempts == numToRemove)
                            resolve(filesRemoved);
                    }).catch(function (err) {
                        attempts++;
                        if (attempts == numToRemove)
                            resolve(filesRemoved);
                    });
                });
            });
        });
    };
    /**
    * Gets a bucket entry
    * @param {string} user The username
    * @returns {IBucketEntry}
    */
    BucketManager.prototype.getIBucket = function (user) {
        var that = this;
        var bucketCollection = this._buckets;
        return new Promise(function (resolve, reject) {
            bucketCollection.findOne({ user: user }, function (err, result) {
                if (err)
                    return reject(err);
                else if (!result)
                    return reject(new Error("Could not find bucket for user '" + user + "'"));
                else
                    return resolve(result);
            });
        });
    };
    /**
    * Checks to see the user's storage limits to see if they are allowed to upload data
    * @param {string} user The username
    * @param {Part} part
    * @returns {Promise<boolean>}
    */
    BucketManager.prototype.canUpload = function (user, part) {
        var that = this;
        var bucketCollection = this._buckets;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            stats.findOne({ user: user }, function (err, result) {
                if (err)
                    return reject(err);
                if (result.memoryUsed + part.byteCount < result.memoryAllocated) {
                    if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                        resolve(result);
                    else
                        return reject(new Error("You have reached your API call limit. Please upgrade your plan for more API calls"));
                }
                else
                    return reject(new Error("You do not have enough memory allocated. Please upgrade your account for more memory"));
            });
        });
    };
    /**
    * Registers an uploaded part as a new user file in the local dbs
    * @param {string} filename The name of the file on the bucket
    * @param {string} bucket The name of the bucket this file belongs to
    * @param {multiparty.Part} part
    * @param {string} user The username
    * @returns {Promise<IFileEntry>}
    */
    BucketManager.prototype.registerFile = function (filename, bucket, part, user) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            var entry = {
                user: user,
                name: filename,
                bucket: bucket,
                created: Date.now(),
                numDownloads: 0,
                size: part.byteCount
            };
            files.save(entry, function (err, result) {
                if (err)
                    return reject(new Error("Could not save user file entry: " + err.toString()));
                else
                    resolve(result.ops[0]);
            });
        });
    };
    /**
    * Uploads a part stream as a new user file. This checks permissions, updates the local db and uploads the stream to the bucket
    * @param {Part} part
    * @param {string} user The username
    * @returns {Promise<any>}
    */
    BucketManager.prototype.uploadStream = function (part, user) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var stats = this._stats;
        var storageStats;
        return new Promise(function (resolve, reject) {
            that.canUpload(user, part).then(function (stats) {
                storageStats = stats;
                return that.getIBucket(user);
            }).then(function (bucketEntry) {
                var bucket = that._gcs.bucket(bucketEntry.identifier);
                var filename = Date.now() + "-" + part.filename;
                var file = bucket.file(filename);
                // We look for part errors so that we can cleanup any faults with the upload if it cuts out
                // on the user's side.
                part.on('error', function (err) {
                    // Delete the file on the bucket
                    file.delete(function (bucketErr, apiResponse) {
                        if (bucketErr)
                            return reject(new Error("While uploading a user part an error occurred while cleaning the bucket: " + bucketErr.toString()));
                        else
                            return reject(new Error("Could not upload a user part: " + err.toString()));
                    });
                });
                // Pipe the file to the bucket
                part.pipe(file.createWriteStream()).on("error", function (err) {
                    return reject(new Error("Could not upload the file '" + part.filename + "' to bucket: " + err.toString()));
                }).on('complete', function () {
                    var apiCalls = storageStats.apiCallsUsed + 1;
                    var bucketMemory = bucketEntry.memoryUsed + part.byteCount;
                    var totalMemory = storageStats.memoryUsed + part.byteCount;
                    bucketCollection.update({ name: bucketEntry.identifier }, { $set: { memoryUsed: bucketMemory } }, function (err, result) {
                        stats.update({ user: user }, { $set: { memoryUsed: totalMemory, apiCallsUsed: apiCalls } }, function (err, result) {
                            that.registerFile(filename, bucketEntry.identifier, part, user).then(function (file) {
                                return resolve(file);
                            }).catch(function (err) {
                                return reject(err);
                            });
                        });
                    });
                });
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Finds and downloads a file
    * @param {string} filename The name of the file on the bucket
    * @returns {Promise<fs.ReadStream>}
    */
    BucketManager.prototype.downloadFile = function (filename) {
        var that = this;
        var gcs = this._gcs;
        var buckets = this._buckets;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            files.findOne({ name: filename }, function (err, result) {
                if (err)
                    return reject(err);
                else if (!result)
                    return reject("File '" + filename + "' does not exist");
                else {
                    var iBucket = that._gcs.bucket(result.bucket);
                    var iFile = iBucket.file(name);
                    resolve(iFile.createReadStream());
                }
            });
        });
    };
    /**
    * Creates the bucket manager singleton
    */
    BucketManager.create = function (buckets, files, stats, config) {
        return new BucketManager(buckets, files, stats, config);
    };
    Object.defineProperty(BucketManager, "get", {
        /**
        * Gets the bucket singleton
        */
        get: function () {
            return BucketManager._singleton;
        },
        enumerable: true,
        configurable: true
    });
    BucketManager.MEMORY_ALLOCATED = 5e+8; //500mb
    BucketManager.API_CALLS_ALLOCATED = 20000; //20,000
    return BucketManager;
})();
exports.BucketManager = BucketManager;
