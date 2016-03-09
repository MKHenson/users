/// <reference path="./references.d.ts" />
var gcloud = require("gcloud");
var zlib = require("zlib");
var compressible = require("compressible");
var comms_controller_1 = require("./controllers/comms-controller");
/**
* Class responsible for managing buckets and uploads to Google storage
*/
var BucketManager = (function () {
    function BucketManager(buckets, files, stats, config) {
        BucketManager._singleton = this;
        this._gcs = gcloud.storage({ projectId: config.google.bucket.projectId, keyFilename: config.google.keyFile });
        this._buckets = buckets;
        this._files = files;
        this._stats = stats;
        this._zipper = zlib.createGzip();
        this._unzipper = zlib.createGunzip();
        this._deflater = zlib.createDeflate();
    }
    /**
    * Fetches all bucket entries from the database
    * @param {string} user [Optional] Specify the user. If none provided, then all buckets are retrieved
    * @param {RegExp} searchTerm [Optional] Specify a search term
    * @returns {Promise<Array<def.IBucketEntry>>}
    */
    BucketManager.prototype.getBucketEntries = function (user, searchTerm) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        return new Promise(function (resolve, reject) {
            var search = {};
            if (user)
                search.user = user;
            if (searchTerm)
                search.name = searchTerm;
            // Save the new entry into the database
            bucketCollection.find(search).toArray(function (error, buckets) {
                return resolve(buckets);
            });
        });
    };
    /**
    * Fetches the file count based on the given query
    * @param {IFileEntry} searchQuery The search query to idenfify files
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    BucketManager.prototype.numFiles = function (searchQuery) {
        var files = this._files;
        return new Promise(function (resolve, reject) {
            // Save the new entry into the database
            files.count(searchQuery, function (err, count) {
                if (err)
                    return reject(err);
                return resolve(count);
            });
        });
    };
    /**
    * Fetches all file entries by a given query
    * @param {any} searchQuery The search query to idenfify files
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    BucketManager.prototype.getFiles = function (searchQuery, startIndex, limit) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            // Save the new entry into the database
            files.find(searchQuery).skip(startIndex).limit(limit).toArray(function (err, files) {
                return resolve(files);
            });
        });
    };
    /**
    * Updates all file entries for a given search criteria with custom meta data
    * @param {any} searchQuery The search query to idenfify files
    * @param {any} meta Optional meta data to associate with the files
    * @returns {Promise<boolean>}
    */
    BucketManager.prototype.setMeta = function (searchQuery, meta) {
        var files = this._files;
        return new Promise(function (resolve, reject) {
            // Save the new entry into the database
            files.updateMany(searchQuery, { $set: { meta: meta } }).then(function (updateResult) {
                return resolve(true);
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Fetches all file entries from the database for a given bucket
    * @param {IBucketEntry} bucket Specify the bucket from which he files belong to
    * @param {number} startIndex Specify the start index
    * @param {number} limit Specify the number of files to retrieve
    * @param {RegExp} searchTerm Specify a search term
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    BucketManager.prototype.getFilesByBucket = function (bucket, startIndex, limit, searchTerm) {
        var searchQuery = { bucketId: bucket.identifier };
        if (searchTerm)
            searchQuery.name = searchTerm;
        return this.getFiles(searchQuery, startIndex, limit);
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
            stats.find({ user: user }).limit(1).next(function (result) {
                if (!result)
                    return reject(new Error("Could not find storage data for the user '" + user + "'"));
                else
                    return resolve(result);
            });
        });
    };
    /**
    * Attempts to create a user usage statistics
    * @param {string} user The user associated with this bucket
    * @returns {Promise<IStorageStats>}
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
            stats.insertOne(storage).then(function (result) {
                return resolve(result);
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Attempts to remove the usage stats of a given user
    * @param {string} user The user associated with this bucket
    * @returns {Promise<number>} A promise of the number of stats removed
    */
    BucketManager.prototype.removeUserStats = function (user) {
        var that = this;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            stats.deleteOne({ user: user }).then(function (deleteResult) {
                return resolve(deleteResult.deletedCount);
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Attempts to remove all data associated with a user
    * @param {string} user The user we are removing
    * @returns {Promise<any>}
    */
    BucketManager.prototype.removeUser = function (user) {
        var that = this;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            that.removeBucketsByUser(user).then(function (result) {
                return that.removeUserStats(user);
            }).then(function (data) {
                return resolve();
            }).catch(function (err) {
                return reject(err);
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
        var bucketID = "webinate-bucket-" + that.generateRandString(8).toLowerCase();
        var bucketCollection = this._buckets;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            that.getIBucket(name, user).then(function (bucket) {
                if (bucket)
                    return reject(new Error("A Bucket with the name '" + name + "' has already been registered"));
                var cors = {
                    location: "EU",
                    cors: [
                        {
                            "origin": [
                                //"webinate.net", "webinate-test.net"
                                "*"
                            ],
                            "method": [
                                "GET", "OPTIONS"
                            ],
                            "responseHeader": [
                                "content-type", "authorization", "content-length", "x-requested-with", "x-mime-type", "x-file-name", "cache-control"
                            ],
                            "maxAgeSeconds": 1
                        }
                    ]
                };
                // Attempt to create a new Google bucket
                gcs.createBucket(bucketID, cors, function (err, bucket) {
                    if (err)
                        return reject(new Error("Could not create a new bucket: '" + err.message + "'"));
                    else {
                        var newEntry = {
                            name: name,
                            identifier: bucketID,
                            created: Date.now(),
                            user: user,
                            memoryUsed: 0
                        };
                        // Save the new entry into the database
                        bucketCollection.insertOne(newEntry).then(function (result) {
                            // Increments the API calls
                            return stats.updateOne({ user: user }, { $inc: { apiCallsUsed: 1 } });
                        }).then(function (updateResult) {
                            // Send bucket added events to sockets
                            var fEvent = { eventType: comms_controller_1.EventType.BucketUploaded, bucket: bucket, username: user };
                            return comms_controller_1.CommsController.singleton.broadcastEvent(fEvent);
                        }).then(function () {
                            return resolve(bucket);
                        }).catch(function (err) {
                            return reject(err);
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
            bucketCollection.find(searchQuery).toArray().then(function (buckets) {
                var toRemove = [];
                var attempts = 0;
                var error = null;
                for (var i = 0, l = buckets.length; i < l; i++) {
                    that.deleteBucket(buckets[i]).then(function (bucket) {
                        attempts++;
                        toRemove.push(bucket.identifier);
                        if (attempts == l) {
                            // Send events to sockets
                            var fEvent = { eventType: comms_controller_1.EventType.BucketRemoved, bucket: bucket };
                            comms_controller_1.CommsController.singleton.broadcastEvent(fEvent).then(function () {
                                resolve(toRemove);
                            });
                        }
                    }).catch(function (err) {
                        if (err)
                            error = err;
                        attempts++;
                        if (attempts == l)
                            reject(new Error("Could not delete bucket: " + error.message));
                    });
                }
                // If no buckets
                if (buckets.length == 0)
                    resolve(toRemove);
            }).catch(function (err) {
                return reject(err);
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
            // First remove all bucket files
            that.removeFilesByBucket(bucketEntry.identifier).then(function (files) {
                // Now remove the bucket itself
                var bucket = gcs.bucket(bucketEntry.identifier);
                bucket.delete(function (err, apiResponse) {
                    // If there is an error then return - but not if the file is not found. More than likely
                    // it was removed by an admin
                    if (err && err.code != 404)
                        return reject(new Error("Could not remove bucket from storage system: '" + err.message + "'"));
                    else {
                        // Remove the bucket entry
                        bucketCollection.deleteOne({ _id: bucketEntry._id }).then(function (deleteResult) {
                            return stats.updateOne({ user: bucketEntry.user }, { $inc: { apiCallsUsed: 1 } });
                        }).then(function (result) {
                            return resolve(bucketEntry);
                        }).catch(function (err) {
                            return reject(err);
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
                    // If there is an error then return - but not if the file is not found. More than likely
                    // it was removed by an admin
                    if (err && err.code != 404)
                        return reject(new Error("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'"));
                    // Update the bucket data usage
                    bucketCollection.updateOne({ identifier: bucketEntry.identifier }, { $inc: { memoryUsed: -fileEntry.size } }).then(function (result) {
                        return files.deleteOne({ _id: fileEntry._id });
                    }).then(function (result) {
                        return stats.updateOne({ user: bucketEntry.user }, { $inc: { memoryUsed: -fileEntry.size, apiCallsUsed: 1 } });
                    }).then(function (result) {
                        return resolve(fileEntry);
                    }).catch(function (err) {
                        return reject("Could not remove file '" + fileEntry.identifier + "' from storage system: '" + err.toString() + "'");
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
            files.find(searchQuery).toArray().then(function (fileEntries) {
                var error = null;
                for (var i = 0, l = fileEntries.length; i < l; i++) {
                    that.deleteFile(fileEntries[i]).then(function (fileEntry) {
                        attempts++;
                        filesRemoved.push(fileEntry);
                        if (attempts == l) {
                            // Update any listeners on the sockets
                            var fEvent = { eventType: comms_controller_1.EventType.FilesRemoved, files: filesRemoved };
                            comms_controller_1.CommsController.singleton.broadcastEvent(fEvent).then(function () {
                                resolve(filesRemoved);
                            });
                        }
                    }).catch(function (err) {
                        if (err)
                            error = err;
                        attempts++;
                        if (attempts == l)
                            reject(error);
                    });
                }
                if (fileEntries.length == 0)
                    return resolve([]);
            }).catch(function (err) {
                if (err)
                    return reject(err);
            });
        });
    };
    /**
   * Attempts to remove files from the cloud and database
   * @param {Array<string>} fileIDs The file IDs to remove
   * @param {string} user Optionally pass in the user to refine the search
   * @returns {Promise<string>} Returns the file IDs of the files removed
   */
    BucketManager.prototype.removeFilesById = function (fileIDs, user) {
        if (fileIDs.length == 0)
            return Promise.resolve();
        // Create the search query for each of the files
        var searchQuery = { $or: [] };
        for (var i = 0, l = fileIDs.length; i < l; i++)
            searchQuery.$or.push({ identifier: fileIDs[i] }, { parentFile: fileIDs[i] });
        if (user)
            searchQuery.user = user;
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
            bucketCollection.find(searchQuery).limit(1).next().then(function (result) {
                if (!result)
                    return resolve(null);
                else
                    return resolve(result);
            }).catch(function (err) {
                return reject(err);
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
            stats.find({ user: user }).limit(1).next().then(function (result) {
                if (result.memoryUsed + part.byteCount < result.memoryAllocated) {
                    if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                        resolve(result);
                    else
                        return reject(new Error("You have reached your API call limit. Please upgrade your plan for more API calls"));
                }
                else
                    return reject(new Error("You do not have enough memory allocated. Please upgrade your account for more memory"));
            }).catch(function (err) {
                return reject(err);
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
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            stats.find({ user: user }).limit(1).next().then(function (result) {
                if (!result)
                    return reject(new Error("Could not find the user " + user));
                else if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                    resolve(true);
                else
                    return resolve(false);
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Adds an API call to a user
    * @param {string} user The username
    * @returns {Promise<boolean>}
    */
    BucketManager.prototype.incrementAPI = function (user) {
        var that = this;
        var stats = this._stats;
        return new Promise(function (resolve, reject) {
            stats.updateOne({ user: user }, { $inc: { apiCallsUsed: 1 } }).then(function (updateResult) {
                resolve(true);
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Makes a file publicly available
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    BucketManager.prototype.makeFilePublic = function (file) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.withinAPILimit(file.user).then(function (val) {
                if (!val)
                    return Promise.reject(new Error("You do not have enough API calls left to make this request"));
                return that.incrementAPI(file.user);
            }).then(function () {
                var bucket = that._gcs.bucket(file.bucketId);
                var rawFile = bucket.file(file.identifier);
                rawFile.makePublic(function (err, api) {
                    if (err)
                        return reject(err);
                    that._files.updateOne({ bucketId: file.bucketId, identifier: file.identifier }, { $set: { isPublic: true } }).then(function (updateResult) {
                        resolve(file);
                    }).catch(function (err) {
                        return reject(err);
                    });
                });
            }).catch(function (err) {
                return reject(new err);
            });
        });
    };
    /**
    * Makes a file private
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    BucketManager.prototype.makeFilePrivate = function (file) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.withinAPILimit(file.user).then(function (val) {
                if (!val)
                    return Promise.reject(new Error("You do not have enough API calls left to make this request"));
                return that.incrementAPI(file.user);
            }).then(function () {
                var bucket = that._gcs.bucket(file.bucketId);
                var rawFile = bucket.file(file.identifier);
                rawFile.makePrivate({ strict: true }, function (err) {
                    if (err)
                        return reject(err);
                    that._files.updateOne({ bucketId: file.bucketId, identifier: file.identifier }, { $set: { isPublic: false } }).then(function (result) {
                        return resolve(file);
                    }).catch(function (err) {
                        return reject(err);
                    });
                });
            }).catch(function (err) {
                return reject(new err);
            });
        });
    };
    /**
    * Registers an uploaded part as a new user file in the local dbs
    * @param {string} fileID The id of the file on the bucket
    * @param {string} bucketID The id of the bucket this file belongs to
    * @param {multiparty.Part} part
    * @param {string} user The username
    * @param {boolean} isPublic IF true, the file will be set as public
    * @param {string} parentFile Sets an optional parent file - if the parent is removed, then so is this one
    * @returns {Promise<IFileEntry>}
    */
    BucketManager.prototype.registerFile = function (fileID, bucket, part, user, isPublic, parentFile) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            var entry = {
                name: part.name,
                user: user,
                identifier: fileID,
                bucketId: bucket.identifier,
                bucketName: bucket.name,
                parentFile: (parentFile ? parentFile : null),
                created: Date.now(),
                numDownloads: 0,
                size: part.byteCount,
                isPublic: isPublic,
                publicURL: "https://storage.googleapis.com/" + bucket.identifier + "/" + fileID,
                mimeType: part.headers["content-type"]
            };
            files.insertOne(entry).then(function (result) {
                return resolve(result.ops[0]);
            }).catch(function (err) {
                return reject(new Error("Could not save user file entry: " + err.toString()));
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
    * @param {string} makePublic Makes this uploaded file public to the world
    * @param {string} parentFile [Optional] Set a parent file which when deleted will detelete this upload as well
    * @returns {Promise<any>}
    */
    BucketManager.prototype.uploadStream = function (part, bucketEntry, user, makePublic, parentFile) {
        if (makePublic === void 0) { makePublic = true; }
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
                var rawFile = bucket.file(fileID);
                // We look for part errors so that we can cleanup any faults with the upload if it cuts out
                // on the user's side.
                part.on('error', function (err) {
                    // Delete the file on the bucket
                    rawFile.delete(function (bucketErr, apiResponse) {
                        if (bucketErr)
                            return reject(new Error("While uploading a user part an error occurred while cleaning the bucket: " + bucketErr.toString()));
                        else
                            return reject(new Error("Could not upload a user part: " + err.toString()));
                    });
                });
                var stream;
                // Check if the stream content type is something that can be compressed - if so, then compress it before sending it to
                // Google and set the content encoding
                if (compressible(part.headers["content-type"]))
                    stream = part.pipe(that._zipper).pipe(rawFile.createWriteStream({ metadata: { contentEncoding: 'gzip', contentType: part.headers["content-type"], metadata: { encoded: true } } }));
                else
                    stream = part.pipe(rawFile.createWriteStream({ metadata: { contentType: part.headers["content-type"] } }));
                // Pipe the file to the bucket
                stream.on("error", function (err) {
                    return reject(new Error("Could not upload the file '" + part.filename + "' to bucket: " + err.toString()));
                }).on('finish', function () {
                    bucketCollection.updateOne({ identifier: bucketEntry.identifier }, { $inc: { memoryUsed: part.byteCount } }).then(function (updateResult) {
                        return statCollection.updateOne({ user: user }, { $inc: { memoryUsed: part.byteCount, apiCallsUsed: 1 } });
                    }).then(function (updateResult) {
                        return that.registerFile(fileID, bucketEntry, part, user, makePublic, parentFile);
                    }).then(function (file) {
                        if (makePublic) {
                            rawFile.makePublic(function (err, api) {
                                if (err)
                                    return reject(err);
                                else
                                    return resolve(file);
                            });
                        }
                        else
                            return resolve(file);
                    }).catch(function (err) {
                        return reject(err);
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
    * @param {string} user Optionally specify the user of the file
    * @param {RegExp} searchTerm Specify a search term
    * @returns {Promise<IFileEntry>}
    */
    BucketManager.prototype.getFile = function (fileID, user, searchTerm) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            var searchQuery = { identifier: fileID };
            if (user)
                searchQuery.user = user;
            if (searchTerm)
                searchQuery.name = searchTerm;
            files.find(searchQuery).limit(1).next().then(function (result) {
                if (!result)
                    return reject("File '" + fileID + "' does not exist");
                else
                    return resolve(result);
            }).catch(function (err) {
                return reject(err);
            });
        });
    };
    /**
    * Renames a file
    * @param {string} file The file to rename
    * @param {string} name The new name of the file
    * @returns {Promise<IFileEntry>}
    */
    BucketManager.prototype.renameFile = function (file, name) {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        return new Promise(function (resolve, reject) {
            that.incrementAPI(file.user).then(function () {
                files.updateOne({ _id: file._id }, { $set: { name: name } }).then(function (result) {
                    resolve(file);
                }).catch(function (err) {
                    reject(err);
                });
            });
        });
    };
    /**
    * Downloads the data from the cloud and sends it to the requester. This checks the request for encoding and
    * sets the appropriate headers if and when supported
    * @param {Request} request The request being made
    * @param {Response} response The response stream to return the data
    * @param {IFileEntry} file The file to download
    */
    BucketManager.prototype.downloadFile = function (request, response, file) {
        var that = this;
        var gcs = this._gcs;
        var buckets = this._buckets;
        var files = this._files;
        var iBucket = that._gcs.bucket(file.bucketId);
        var iFile = iBucket.file(file.identifier);
        iFile.getMetadata(function (err, meta) {
            if (err)
                return response.status(500).send(err.toString());
            // Get the client encoding support - if any
            var acceptEncoding = request.headers['accept-encoding'];
            if (!acceptEncoding)
                acceptEncoding = '';
            var stream = iFile.createReadStream();
            var encoded = false;
            if (meta.metadata)
                encoded = meta.metadata.encoded;
            // Request is expecting a deflate
            if (acceptEncoding.match(/\bgzip\b/)) {
                // If already gzipped and expeting gzip
                if (encoded) {
                    // Simply return the raw pipe
                    response.setHeader('content-encoding', 'gzip');
                    stream.pipe(response);
                }
                else
                    stream.pipe(response);
            }
            else if (acceptEncoding.match(/\bdeflate\b/)) {
                response.setHeader('content-encoding', 'deflate');
                // If its encoded - then its encoded in gzip and needs to be
                if (encoded)
                    stream.pipe(that._unzipper).pipe(that._deflater).pipe(response);
                else
                    stream.pipe(that._deflater).pipe(response);
            }
            else {
                // No encoding supported
                // Unzip GZIP and send raw if already compressed
                if (encoded)
                    stream.pipe(that._unzipper).pipe(response);
                else
                    stream.pipe(response);
            }
        });
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
            stats.updateOne({ user: user }, { $set: value }).then(function (updateResult) {
                if (updateResult.matchedCount === 0)
                    return reject("Could not find user '" + user + "'");
                else
                    return resolve(updateResult.modifiedCount);
            }).catch(function (err) {
                return reject(err);
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
