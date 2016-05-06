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
var gcloud = require("gcloud");
var zlib = require("zlib");
var compressible = require("compressible");
var comms_controller_1 = require("./controllers/comms-controller");
var socket_event_types_1 = require("./socket-event-types");
/**
* Class responsible for managing buckets and uploads to Google storage
*/
class BucketManager {
    constructor(buckets, files, stats, config) {
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
    getBucketEntries(user, searchTerm) {
        return __awaiter(this, void 0, Promise, function* () {
            var gcs = this._gcs;
            var bucketCollection = this._buckets;
            var search = {};
            if (user)
                search.user = user;
            if (searchTerm)
                search.name = searchTerm;
            // Save the new entry into the database
            var buckets = yield bucketCollection.find(search).toArray();
            return buckets;
        });
    }
    /**
    * Fetches the file count based on the given query
    * @param {IFileEntry} searchQuery The search query to idenfify files
    * @returns {Promise<number>}
    */
    numFiles(searchQuery) {
        return __awaiter(this, void 0, Promise, function* () {
            var filesCollection = this._files;
            var count = yield filesCollection.count(searchQuery);
            return count;
        });
    }
    /**
    * Fetches all file entries by a given query
    * @param {any} searchQuery The search query to idenfify files
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    getFiles(searchQuery, startIndex, limit = -1) {
        return __awaiter(this, void 0, Promise, function* () {
            var gcs = this._gcs;
            var filesCollection = this._files;
            // Save the new entry into the database
            var files = yield filesCollection.find(searchQuery).skip(startIndex).limit(limit).toArray();
            return files;
        });
    }
    /**
     * Updates all file entries for a given search criteria with custom meta data
     * @param {any} searchQuery The search query to idenfify files
     * @param {any} meta Optional meta data to associate with the files
     * @returns {Promise<boolean>}
     */
    setMeta(searchQuery, meta) {
        return __awaiter(this, void 0, Promise, function* () {
            var filesCollection = this._files;
            // Save the new entry into the database
            var updateResult = yield filesCollection.updateMany(searchQuery, { $set: { meta: meta } });
            return true;
        });
    }
    /**
    * Fetches all file entries from the database for a given bucket
    * @param {IBucketEntry} bucket Specify the bucket from which he files belong to
    * @param {number} startIndex Specify the start index
    * @param {number} limit Specify the number of files to retrieve
    * @param {RegExp} searchTerm Specify a search term
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    getFilesByBucket(bucket, startIndex, limit, searchTerm) {
        var searchQuery = { bucketId: bucket.identifier };
        if (searchTerm)
            searchQuery.name = searchTerm;
        return this.getFiles(searchQuery, startIndex, limit);
    }
    /**
    * Fetches the storage/api data for a given user
    * @param {string} user The user whos data we are fetching
    * @returns {Promise<def.IStorageStats>}
    */
    getUserStats(user) {
        return __awaiter(this, void 0, Promise, function* () {
            var gcs = this._gcs;
            var stats = this._stats;
            // Save the new entry into the database
            var result = yield stats.find({ user: user }).limit(1).next();
            if (!result)
                throw new Error(`Could not find storage data for the user '${user}'`);
            return result;
        });
    }
    /**
    * Attempts to create a user usage statistics
    * @param {string} user The user associated with this bucket
    * @returns {Promise<IStorageStats>}
    */
    createUserStats(user) {
        return __awaiter(this, void 0, Promise, function* () {
            var stats = this._stats;
            var storage = {
                user: user,
                apiCallsAllocated: BucketManager.API_CALLS_ALLOCATED,
                memoryAllocated: BucketManager.MEMORY_ALLOCATED,
                apiCallsUsed: 0,
                memoryUsed: 0
            };
            var insertResult = yield stats.insertOne(storage);
            return insertResult.ops[0];
        });
    }
    /**
    * Attempts to remove the usage stats of a given user
    * @param {string} user The user associated with this bucket
    * @returns {Promise<number>} A promise of the number of stats removed
    */
    removeUserStats(user) {
        return __awaiter(this, void 0, Promise, function* () {
            var stats = this._stats;
            var deleteResult = yield stats.deleteOne({ user: user });
            return deleteResult.deletedCount;
        });
    }
    /**
    * Attempts to remove all data associated with a user
    * @param {string} user The user we are removing
    * @returns {Promise<void>}
    */
    removeUser(user) {
        return __awaiter(this, void 0, Promise, function* () {
            var stats = this._stats;
            var result = yield this.removeBucketsByUser(user);
            var data = yield this.removeUserStats(user);
            return;
        });
    }
    /**
    * Attempts to create a new google storage bucket
    * @param {string} bucketID The id of the bucket entry
    * @returns {Promise<gcloud.IBucket>}
    */
    createGBucket(bucketID) {
        var gcs = this._gcs;
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
        return new Promise(function (resolve, reject) {
            // Attempt to create a new Google bucket
            gcs.createBucket(bucketID, cors, function (err, bucket) {
                if (err)
                    return reject(new Error(`Could not create a new bucket: '${err.message}'`));
                resolve(bucket);
            });
        });
    }
    /**
    * Attempts to create a new user bucket by first creating the storage on the cloud and then updating the internal DB
    * @param {string} name The name of the bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    createBucket(name, user) {
        return __awaiter(this, void 0, Promise, function* () {
            var bucketID = `webinate-bucket-${this.generateRandString(8).toLowerCase()}`;
            var bucketCollection = this._buckets;
            var stats = this._stats;
            // Get the entry
            var bucketEntry = yield this.getIBucket(name, user);
            // Make sure no bucket already exists with that name
            if (bucketEntry)
                throw new Error(`A Bucket with the name '${name}' has already been registered`);
            // Attempt to create a new Google bucket
            var gBucket = yield this.createGBucket(bucketID);
            // Create the new bucket
            bucketEntry = {
                name: name,
                identifier: bucketID,
                created: Date.now(),
                user: user,
                memoryUsed: 0
            };
            // Save the new entry into the database
            var insertResult = yield bucketCollection.insertOne(bucketEntry);
            bucketEntry = insertResult.ops[0];
            // Increments the API calls
            var updateResult = yield stats.updateOne({ user: user }, { $inc: { apiCallsUsed: 1 } });
            // Send bucket added events to sockets
            var fEvent = { eventType: socket_event_types_1.EventType.BucketUploaded, bucket: bucketEntry, username: user, error: undefined };
            yield comms_controller_1.CommsController.singleton.broadcastEventToAll(fEvent);
            return gBucket;
        });
    }
    /**
    * Attempts to remove buckets of the given search result. This will also update the file and stats collection.
    * @param {any} searchQuery A valid mongodb search query
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    removeBuckets(searchQuery) {
        return __awaiter(this, void 0, Promise, function* () {
            var bucketCollection = this._buckets;
            var files = this._files;
            var stats = this._stats;
            var toRemove = [];
            // Get all the buckets
            var buckets = yield bucketCollection.find(searchQuery).toArray();
            // Now delete each one
            try {
                for (var i = 0, l = buckets.length; i < l; i++) {
                    var bucket = yield this.deleteBucket(buckets[i]);
                    toRemove.push(bucket.identifier);
                }
                // Return an array of all the bucket ids that were removed
                return toRemove;
            }
            catch (err) {
                // If there is an error throw with a bit more info
                throw new Error(`Could not delete bucket: ${err.message}`);
            }
            ;
        });
    }
    /**
    * Attempts to remove buckets by id
    * @param {Array<string>} buckets An array of bucket IDs to remove
    * @param {string} user The user to whome these buckets belong
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    removeBucketsByName(buckets, user) {
        if (buckets.length == 0)
            return Promise.resolve([]);
        // Create the search query for each of the files
        var searchQuery = { $or: [], user: user };
        for (var i = 0, l = buckets.length; i < l; i++)
            searchQuery.$or.push({ name: buckets[i] });
        return this.removeBuckets(searchQuery);
    }
    /**
    * Attempts to remove a user bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    removeBucketsByUser(user) {
        return this.removeBuckets({ user: user });
    }
    deleteGBucket(bucketId) {
        var gcs = this._gcs;
        // Now remove the bucket itself
        var bucket = gcs.bucket(bucketId);
        return new Promise(function (resolve, reject) {
            bucket.delete(function (err, apiResponse) {
                // If there is an error then return - but not if the file is not found. More than likely
                // it was removed by an admin
                if (err && err.code != 404)
                    return reject(new Error(`Could not remove bucket from storage system: '${err.message}'`));
                else
                    return resolve();
            });
        });
    }
    /**
    * Deletes the bucket from storage and updates the databases
    */
    deleteBucket(bucketEntry) {
        return __awaiter(this, void 0, Promise, function* () {
            var bucketCollection = this._buckets;
            var stats = this._stats;
            try {
                // First remove all bucket files
                var files = yield this.removeFilesByBucket(bucketEntry.identifier);
            }
            catch (err) {
                throw new Error(`Could not remove the bucket: '${err.toString()}'`);
            }
            yield this.deleteGBucket(bucketEntry.identifier);
            // Remove the bucket entry
            var deleteResult = yield bucketCollection.deleteOne({ _id: bucketEntry._id });
            var result = yield stats.updateOne({ user: bucketEntry.user }, { $inc: { apiCallsUsed: 1 } });
            // Send events to sockets
            var fEvent = { eventType: socket_event_types_1.EventType.BucketRemoved, bucket: bucketEntry, error: undefined };
            yield comms_controller_1.CommsController.singleton.broadcastEventToAll(fEvent);
            return bucketEntry;
        });
    }
    /**
    * Deletes a file from google storage
    * @param {string} bucketId
    * @param {string} fileId
    */
    deleteGFile(bucketId, fileId) {
        var gcs = this._gcs;
        var bucket = gcs.bucket(bucketId);
        return new Promise(function (resolve, reject) {
            // Get the bucket and delete the file
            bucket.file(fileId).delete(function (err, apiResponse) {
                // If there is an error then return - but not if the file is not found. More than likely
                // it was removed by an admin
                if (err && err.code != 404)
                    return reject(new Error(`Could not remove file '${fileId}' from storage system: '${err.toString()}'`));
                resolve();
            });
        });
    }
    /**
    * Deletes the file from storage and updates the databases
    * @param {users.IFileEntry} fileEntry
    */
    deleteFile(fileEntry) {
        return __awaiter(this, void 0, Promise, function* () {
            var bucketCollection = this._buckets;
            var files = this._files;
            var stats = this._stats;
            var bucketEntry = yield this.getIBucket(fileEntry.bucketId);
            if (!bucketEntry)
                throw new Error(`Could not find the bucket '${fileEntry.bucketName}'`);
            // Get the bucket and delete the file
            yield this.deleteGFile(bucketEntry.identifier, fileEntry.identifier);
            // Update the bucket data usage
            yield bucketCollection.updateOne({ identifier: bucketEntry.identifier }, { $inc: { memoryUsed: -fileEntry.size } });
            yield files.deleteOne({ _id: fileEntry._id });
            yield stats.updateOne({ user: bucketEntry.user }, { $inc: { memoryUsed: -fileEntry.size, apiCallsUsed: 1 } });
            // Update any listeners on the sockets
            var fEvent = { eventType: socket_event_types_1.EventType.FileRemoved, file: fileEntry, error: undefined };
            yield comms_controller_1.CommsController.singleton.broadcastEventToAll(fEvent);
            return fileEntry;
        });
    }
    /**
     * Attempts to remove files from the cloud and database by a query
     * @param {any} searchQuery The query we use to select the files
     * @returns {Promise<string>} Returns the file IDs of the files removed
     */
    removeFiles(searchQuery) {
        return __awaiter(this, void 0, Promise, function* () {
            var gcs = this._gcs;
            var bucketCollection = this._buckets;
            var files = this._files;
            var stats = this._stats;
            var filesRemoved = [];
            // Get the files
            var fileEntries = yield files.find(searchQuery).toArray();
            var error = null;
            for (var i = 0, l = fileEntries.length; i < l; i++) {
                var fileEntry = yield this.deleteFile(fileEntries[i]);
                filesRemoved.push(fileEntry._id);
            }
            return filesRemoved;
        });
    }
    /**
   * Attempts to remove files from the cloud and database
   * @param {Array<string>} fileIDs The file IDs to remove
   * @param {string} user Optionally pass in the user to refine the search
   * @returns {Promise<string>} Returns the file IDs of the files removed
   */
    removeFilesByIdentifiers(fileIDs, user) {
        if (fileIDs.length == 0)
            return Promise.resolve([]);
        // Create the search query for each of the files
        var searchQuery = { $or: [] };
        for (var i = 0, l = fileIDs.length; i < l; i++)
            searchQuery.$or.push({ identifier: fileIDs[i] }, { parentFile: fileIDs[i] });
        if (user)
            searchQuery.user = user;
        return this.removeFiles(searchQuery);
    }
    /**
    * Attempts to remove files from the cloud and database that are in a given bucket
    * @param {string} bucket The id or name of the bucket to remove
    * @returns {Promise<string>} Returns the file IDs of the files removed
    */
    removeFilesByBucket(bucket) {
        if (!bucket || bucket.trim() == "")
            return Promise.reject(new Error("Please specify a valid bucket"));
        // Create the search query for each of the files
        var searchQuery = { $or: [{ bucketId: bucket }, { bucketName: bucket }] };
        return this.removeFiles(searchQuery);
    }
    /**
    * Gets a bucket entry by its name or ID
    * @param {string} bucket The id of the bucket. You can also use the name if you provide the user
    * @param {string} user The username associated with the bucket (Only applicable if bucket is a name and not an ID)
    * @returns {IBucketEntry}
    */
    getIBucket(bucket, user) {
        return __awaiter(this, void 0, Promise, function* () {
            var bucketCollection = this._buckets;
            var searchQuery = {};
            if (user) {
                searchQuery.user = user;
                searchQuery.name = bucket;
            }
            else
                searchQuery.identifier = bucket;
            var result = yield bucketCollection.find(searchQuery).limit(1).next();
            if (!result)
                return null;
            else
                return result;
        });
    }
    /**
    * Checks to see the user's storage limits to see if they are allowed to upload data
    * @param {string} user The username
    * @param {Part} part
    * @returns {Promise<def.IStorageStats>}
    */
    canUpload(user, part) {
        return __awaiter(this, void 0, Promise, function* () {
            var bucketCollection = this._buckets;
            var stats = this._stats;
            var result = yield stats.find({ user: user }).limit(1).next();
            if (result.memoryUsed + part.byteCount < result.memoryAllocated) {
                if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                    return result;
                else
                    throw new Error("You have reached your API call limit. Please upgrade your plan for more API calls");
            }
            else
                throw new Error("You do not have enough memory allocated. Please upgrade your account for more memory");
        });
    }
    /**
     * Checks to see the user's api limit and make sure they can make calls
     * @param {string} user The username
     * @returns {Promise<boolean>}
     */
    withinAPILimit(user) {
        return __awaiter(this, void 0, Promise, function* () {
            var stats = this._stats;
            var result = yield stats.find({ user: user }).limit(1).next();
            if (!result)
                throw new Error(`Could not find the user ${user}`);
            else if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                return true;
            else
                return false;
        });
    }
    /**
    * Adds an API call to a user
    * @param {string} user The username
    * @returns {Promise<boolean>}
    */
    incrementAPI(user) {
        return __awaiter(this, void 0, Promise, function* () {
            var stats = this._stats;
            yield stats.updateOne({ user: user }, { $inc: { apiCallsUsed: 1 } });
            return true;
        });
    }
    /**
    * Makes a google file publicly or private
    * @param {string} bucketId
    * @param {string} fileId
    * @param {boolean}
    * @returns {Promise<void>}
    */
    makeGFilePublic(bucketId, fileId, val) {
        var bucket = this._gcs.bucket(bucketId);
        var rawFile = bucket.file(fileId);
        return new Promise(function (resolve, reject) {
            if (val) {
                rawFile.makePublic(function (err, api) {
                    if (err)
                        return reject(err);
                    resolve();
                });
            }
            else {
                rawFile.makePrivate(function (err, api) {
                    if (err)
                        return reject(err);
                    resolve();
                });
            }
        });
    }
    /**
    * Makes a file publicly available
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    makeFilePublic(file) {
        return __awaiter(this, void 0, Promise, function* () {
            var val = yield this.withinAPILimit(file.user);
            if (!val)
                throw new Error("You do not have enough API calls left to make this request");
            yield this.incrementAPI(file.user);
            yield this.makeGFilePublic(file.bucketId, file.identifier, true);
            yield this._files.updateOne({ bucketId: file.bucketId, identifier: file.identifier }, { $set: { isPublic: true } });
            return file;
        });
    }
    /**
    * Makes a file private
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    makeFilePrivate(file) {
        return __awaiter(this, void 0, Promise, function* () {
            var val = yield this.withinAPILimit(file.user);
            if (!val)
                throw new Error("You do not have enough API calls left to make this request");
            yield this.incrementAPI(file.user);
            yield this.makeGFilePublic(file.bucketId, file.identifier, false);
            yield this._files.updateOne({ bucketId: file.bucketId, identifier: file.identifier }, { $set: { isPublic: true } });
            return file;
        });
    }
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
    registerFile(fileID, bucket, part, user, isPublic, parentFile) {
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
                publicURL: `https://storage.googleapis.com/${bucket.identifier}/${fileID}`,
                mimeType: part.headers["content-type"]
            };
            files.insertOne(entry).then(function (insertResult) {
                return resolve(insertResult.ops[0]);
            }).catch(function (err) {
                return reject(new Error(`Could not save user file entry: ${err.toString()}`));
            });
        });
    }
    generateRandString(len) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < len; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }
    /**
    * Uploads a part stream as a new user file. This checks permissions, updates the local db and uploads the stream to the bucket
    * @param {Part} part
    * @param {string} bucket The bucket to which we are uploading to
    * @param {string} user The username
    * @param {string} makePublic Makes this uploaded file public to the world
    * @param {string} parentFile [Optional] Set a parent file which when deleted will detelete this upload as well
    * @returns {Promise<any>}
    */
    uploadStream(part, bucketEntry, user, makePublic = true, parentFile) {
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
                            return reject(new Error(`While uploading a user part an error occurred while cleaning the bucket: ${bucketErr.toString()}`));
                        else
                            return reject(new Error(`Could not upload a user part: ${err.toString()}`));
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
                    return reject(new Error(`Could not upload the file '${part.filename}' to bucket: ${err.toString()}`));
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
    }
    /**
    * Fetches a file by its ID
    * @param {string} fileID The file ID of the file on the bucket
    * @param {string} user Optionally specify the user of the file
    * @param {RegExp} searchTerm Specify a search term
    * @returns {Promise<IFileEntry>}
    */
    getFile(fileID, user, searchTerm) {
        return __awaiter(this, void 0, Promise, function* () {
            var that = this;
            var gcs = this._gcs;
            var files = this._files;
            var searchQuery = { identifier: fileID };
            if (user)
                searchQuery.user = user;
            if (searchTerm)
                searchQuery.name = searchTerm;
            var result = yield files.find(searchQuery).limit(1).next();
            if (!result)
                throw new Error(`File '${fileID}' does not exist`);
            else
                return result;
        });
    }
    /**
    * Renames a file
    * @param {string} file The file to rename
    * @param {string} name The new name of the file
    * @returns {Promise<IFileEntry>}
    */
    renameFile(file, name) {
        return __awaiter(this, void 0, Promise, function* () {
            var files = this._files;
            yield this.incrementAPI(file.user);
            var result = yield files.updateOne({ _id: file._id }, { $set: { name: name } });
            return file;
        });
    }
    /**
    * Downloads the data from the cloud and sends it to the requester. This checks the request for encoding and
    * sets the appropriate headers if and when supported
    * @param {Request} request The request being made
    * @param {Response} response The response stream to return the data
    * @param {IFileEntry} file The file to download
    */
    downloadFile(request, response, file) {
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
    }
    /**
    * Finds and downloads a file
    * @param {string} fileID The file ID of the file on the bucket
    * @returns {Promise<number>} Returns the number of results affected
    */
    updateStorage(user, value) {
        return __awaiter(this, void 0, Promise, function* () {
            var stats = this._stats;
            var updateResult = yield stats.updateOne({ user: user }, { $set: value });
            if (updateResult.matchedCount === 0)
                throw new Error(`Could not find user '${user}'`);
            else
                return updateResult.modifiedCount;
        });
    }
    /**
    * Creates the bucket manager singleton
    */
    static create(buckets, files, stats, config) {
        return new BucketManager(buckets, files, stats, config);
    }
    /**
    * Gets the bucket singleton
    */
    static get get() {
        return BucketManager._singleton;
    }
}
BucketManager.MEMORY_ALLOCATED = 5e+8; //500mb
BucketManager.API_CALLS_ALLOCATED = 20000; //20,000
exports.BucketManager = BucketManager;
