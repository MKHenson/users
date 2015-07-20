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
    * @param {string} user [Optional] Specify the user. If none provided, then all buckets are retrieved
    * @returns {Promise<Array<def.IBucketEntry>>}
    */
    BucketManager.prototype.getBucketEntries = function (user) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        return new Promise(function (resolve, reject) {
            var search = {};
            if (user)
                search.user = user;
            // Save the new entry into the database
            bucketCollection.find(search, function (err, result) {
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
                searchQuery.$or = [{ bucketName: bucket }, { bucketId: bucket }];
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
    * Fetches the storage/api data for a given user
    * @param {string} user The user whos data we are fetching
    * @returns {Promise<def.IFileEntry>}
    */
    BucketManager.prototype.getUserStats = function (user) {
        var that = this;
        var gcs = this._gcs;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            // Save the new entry into the database
            stats.findOne({ user: user }, function (err, result) {
                if (err)
                    return reject(err);
                if (!result)
                    return reject(new Error("Could not find storage data for the user '" + user + "'"));
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
    * @param {string} name The name of the bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    BucketManager.prototype.createBucket = function (name, user) {
        var that = this;
        var gcs = this._gcs;
        var bucketID = "webinate-bucket-" + Date.now();
        var bucketCollection = this._buckets;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            that.getIBucket(name, user).then(function (bucket) {
                if (bucket)
                    return reject(new Error("A Bucket with the name '" + name + "' has already been registered"));
                // Attempt to create a new Google bucket
                gcs.createBucket(bucketID, { location: "EU" }, function (err, bucket) {
                    if (err)
                        return reject(new Error("Could not connect to storage system: '" + err.message + "'"));
                    else {
                        var newEntry = {
                            name: name,
                            identifier: bucketID,
                            created: Date.now(),
                            user: user,
                            memoryUsed: 0
                        };
                        // Save the new entry into the database
                        bucketCollection.save(newEntry, function (err, result) {
                            if (err)
                                return reject(err);
                            else {
                                // Increments the API calls
                                stats.update({ user: user }, { $inc: { apiCallsUsed: 1 } }, function (err, result) {
                                    return resolve(bucket);
                                });
                            }
                        });
                    }
                });
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Attempts to remove buckets of the given search result. This will also update the file and stats collection.
    * @param {any} searchQuery A valid mongodb search query
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    BucketManager.prototype.removeBuckets = function (searchQuery) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            bucketCollection.find(searchQuery, function (err, cursor) {
                if (err)
                    return reject(err);
                var toRemove = [];
                cursor.toArray(function (err, buckets) {
                    if (err)
                        return reject(err);
                    var attempts = 0;
                    for (var i = 0, l = buckets.length; i < l; i++) {
                        that.deleteBucket(buckets[i]).then(function (bucket) {
                            attempts++;
                            toRemove.push(bucket.identifier);
                            if (attempts == l)
                                resolve(toRemove);
                        }).catch(function (err) {
                            attempts++;
                            if (attempts == l)
                                resolve(toRemove);
                        });
                    }
                    // If no buckets
                    if (buckets.length == 0)
                        resolve(toRemove);
                });
            });
        });
    };
    /**
   * Attempts to remove buckets by id
   * @param {Array<string>} buckets An array of bucket IDs to remove
    * @param {string} user The user to whome these buckets belong
   * @returns {Promise<string>} An array of ID's of the buckets removed
   */
    BucketManager.prototype.removeBucketsByName = function (buckets, user) {
        if (buckets.length == 0)
            return Promise.resolve();
        // Create the search query for each of the files
        var searchQuery = { $or: [], user: user };
        for (var i = 0, l = buckets.length; i < l; i++)
            searchQuery.$or.push({ name: buckets[i] });
        return this.removeBuckets(searchQuery);
    };
    /**
    * Attempts to remove a user bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    BucketManager.prototype.removeBucketsByUser = function (user) {
        return this.removeBuckets({ user: user });
    };
    /**
    * Deletes the bucket from storage and updates the databases
    */
    BucketManager.prototype.deleteBucket = function (bucketEntry) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            that.removeFilesByBucket(bucketEntry.identifier).then(function (files) {
                var bucket = gcs.bucket(bucketEntry.identifier);
                bucket.delete(function (err, apiResponse) {
                    if (err)
                        return reject(new Error("Could not remove bucket from storage system: '" + err.message + "'"));
                    else {
                        // Remove the bucket entry
                        bucketCollection.remove({ _id: bucketEntry._id }, function (err, result) {
                            // Remove the bucket entry
                            stats.update({ user: bucketEntry.user }, { $inc: { apiCallsUsed: 1 } }, function (err, result) {
                                return resolve(bucketEntry);
                            });
                        });
                    }
                });
            }).catch(function (err) {
                return reject("Could not remove the bucket: '" + err.toString() + "'");
            });
        });
    };
    /**
    * Deletes the file from storage and updates the databases
    */
    BucketManager.prototype.deleteFile = function (fileEntry) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            that.getIBucket(fileEntry.bucketId).then(function (bucketEntry) {
                if (!bucketEntry)
                    return reject(new Error("Could not find the bucket '" + fileEntry.bucketName + "'"));
                var bucket = gcs.bucket(bucketEntry.identifier);
                // Get the bucket and delete the file
                bucket.file(fileEntry.identifier).delete(function (err, apiResponse) {
                    if (err)
                        return reject(new Error("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'"));
                    // Update the bucket data usage
                    bucketCollection.update({ identifier: bucketEntry.identifier }, { $inc: { memoryUsed: -fileEntry.size } }, function (err, result) {
                        if (err)
                            return reject("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'");
                        // Remove the file entries
                        files.remove({ _id: fileEntry._id }, function (err, result) {
                            if (err)
                                return reject("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'");
                            // Update the stats usage
                            stats.update({ user: bucketEntry.user }, { $inc: { memoryUsed: -fileEntry.size, apiCallsUsed: 1 } }, function (err, result) {
                                if (err)
                                    return reject("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'");
                                return resolve(fileEntry);
                            });
                        });
                    });
                });
            }).catch(function (err) {
                if (err)
                    return reject(err);
            });
        });
    };
    /**
    * Attempts to remove files from the cloud and database by a query
    * @param {any} searchQuery The query we use to select the files
    * @returns {Promise<string>} Returns the file IDs of the files removed
    */
    BucketManager.prototype.removeFiles = function (searchQuery) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        var attempts = 0;
        var filesRemoved = [];
        return new Promise(function (resolve, reject) {
            // Get the files
            files.find(searchQuery, function (err, cursor) {
                if (err)
                    return reject(err);
                // For each file entry
                cursor.toArray(function (err, fileEntries) {
                    for (var i = 0, l = fileEntries.length; i < l; i++) {
                        that.deleteFile(fileEntries[i]).then(function (fileEntry) {
                            attempts++;
                            filesRemoved.push(fileEntry.identifier);
                            if (attempts == l)
                                resolve(filesRemoved);
                        }).catch(function (err) {
                            attempts++;
                            if (attempts == l)
                                resolve(filesRemoved);
                        });
                    }
                    if (fileEntries.length == 0)
                        return resolve([]);
                });
            });
        });
    };
    /**
   * Attempts to remove files from the cloud and database
   * @param {Array<string>} fileIDs The file IDs to remove
   * @returns {Promise<string>} Returns the file IDs of the files removed
   */
    BucketManager.prototype.removeFilesById = function (fileIDs) {
        if (fileIDs.length == 0)
            return Promise.resolve();
        // Create the search query for each of the files
        var searchQuery = { $or: [] };
        for (var i = 0, l = fileIDs.length; i < l; i++)
            searchQuery.$or.push({ identifier: fileIDs[i] });
        return this.removeFiles(searchQuery);
    };
    /**
    * Attempts to remove files from the cloud and database that are in a given bucket
    * @param {string} bucket The id or name of the bucket to remove
    * @returns {Promise<string>} Returns the file IDs of the files removed
    */
    BucketManager.prototype.removeFilesByBucket = function (bucket) {
        if (!bucket || bucket.trim() == "")
            return Promise.reject(new Error("Please specify a valid bucket"));
        // Create the search query for each of the files
        var searchQuery = { $or: [{ bucketId: bucket }, { bucketName: bucket }] };
        return this.removeFiles(searchQuery);
    };
    /**
    * Gets a bucket entry by its name or ID
    * @param {string} bucket The id of the bucket. You can also use the name if you provide the user
    * @param {string} user The username associated with the bucket (Only applicable if bucket is a name and not an ID)
    * @returns {IBucketEntry}
    */
    BucketManager.prototype.getIBucket = function (bucket, user) {
        var that = this;
        var bucketCollection = this._buckets;
        var searchQuery = {};
        if (user) {
            searchQuery.user = user;
            searchQuery.name = bucket;
        }
        else
            searchQuery.identifier = bucket;
        return new Promise(function (resolve, reject) {
            bucketCollection.findOne(searchQuery, function (err, result) {
                if (err)
                    return reject(err);
                else if (!result)
                    return resolve(null);
                else
                    return resolve(result);
            });
        });
    };
    /**
    * Checks to see the user's storage limits to see if they are allowed to upload data
    * @param {string} user The username
    * @param {Part} part
    * @returns {Promise<def.IStorageStats>}
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
   * Checks to see the user's api limit and make sure they can make calls
   * @param {string} user The username
   * @returns {Promise<boolean>}
   */
    BucketManager.prototype.withinAPILimit = function (user) {
        var that = this;
        var bucketCollection = this._buckets;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            stats.findOne({ user: user }, function (err, result) {
                if (err)
                    return reject(err);
                else if (!result)
                    return reject(new Error("Could not find the user " + user));
                else if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                    resolve(true);
                else
                    return resolve(false);
            });
        });
    };
    /**
    * Registers an uploaded part as a new user file in the local dbs
    * @param {string} fileID The id of the file on the bucket
    * @param {string} bucketID The id of the bucket this file belongs to
    * @param {multiparty.Part} part
    * @param {string} user The username
    * @returns {Promise<IFileEntry>}
    */
    BucketManager.prototype.registerFile = function (fileID, bucket, part, user) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            var entry = {
                user: user,
                identifier: fileID,
                bucketId: bucket.identifier,
                bucketName: bucket.name,
                created: Date.now(),
                numDownloads: 0,
                size: part.byteCount,
                mimeType: part.headers["content-type"]
            };
            files.save(entry, function (err, result) {
                if (err)
                    return reject(new Error("Could not save user file entry: " + err.toString()));
                else
                    resolve(result.ops[0]);
            });
        });
    };
    BucketManager.prototype.generateRandString = function (len) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < len; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    };
    /**
    * Uploads a part stream as a new user file. This checks permissions, updates the local db and uploads the stream to the bucket
    * @param {Part} part
    * @param {string} bucket The bucket to which we are uploading to
    * @param {string} user The username
    * @returns {Promise<any>}
    */
    BucketManager.prototype.uploadStream = function (part, bucketEntry, user) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var statCollection = this._stats;
        var storageStats;
        return new Promise(function (resolve, reject) {
            that.canUpload(user, part).then(function (stats) {
                storageStats = stats;
                var bucket = that._gcs.bucket(bucketEntry.identifier);
                var fileID = that.generateRandString(16);
                var file = bucket.file(fileID);
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
                    bucketCollection.update({ identifier: bucketEntry.identifier }, { $inc: { memoryUsed: part.byteCount } }, function (err, result) {
                        statCollection.update({ user: user }, { $inc: { memoryUsed: part.byteCount, apiCallsUsed: 1 } }, function (err, result) {
                            that.registerFile(fileID, bucketEntry, part, user).then(function (file) {
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
    * Fetches a file by its ID
    * @param {string} fileID The file ID of the file on the bucket
    * @returns {Promise<fs.ReadStream>}
    */
    BucketManager.prototype.getFile = function (fileID) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            files.findOne({ identifier: fileID }, function (err, result) {
                if (err)
                    return reject(err);
                else if (!result)
                    return reject("File '" + fileID + "' does not exist");
                else
                    return resolve(result);
            });
        });
    };
    /**
    * Creates a readstream to download a file
    * @param {IFileEntry} file The file to download
    * @returns {Promise<ReadStream>}
    */
    BucketManager.prototype.downloadFile = function (file) {
        var that = this;
        var gcs = this._gcs;
        var buckets = this._buckets;
        var files = this._files;
        var iBucket = that._gcs.bucket(file.bucketId);
        var iFile = iBucket.file(file.identifier);
        return iFile.createReadStream();
    };
    /**
    * Finds and downloads a file
    * @param {string} fileID The file ID of the file on the bucket
    * @returns {Promise<number>} Returns the number of results affected
    */
    BucketManager.prototype.updateStorage = function (user, value) {
        var that = this;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            stats.update({ user: user }, { $set: value }, function (err, numAffected) {
                if (err)
                    return reject(err);
                else if (numAffected === 0)
                    return reject("Could not find user '" + user + "'");
                else
                    return resolve(numAffected);
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
