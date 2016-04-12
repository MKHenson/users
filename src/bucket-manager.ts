"use strict";

import * as users from "webinate-users";
import * as fs from "fs";
import * as gcloud from "gcloud";
import * as http from "http";
import * as mongodb from "mongodb";
import * as multiparty from "multiparty";
import {User} from "./users"
import * as zlib from "zlib"
import * as compressible from "compressible"
import express = require("express");
import {CommsController, EventType} from "./controllers/comms-controller";
import * as def from "webinate-users";

/**
* Class responsible for managing buckets and uploads to Google storage
*/
export class BucketManager
{
    private static MEMORY_ALLOCATED: number = 5e+8; //500mb
    private static API_CALLS_ALLOCATED: number = 20000; //20,000

    private static _singleton: BucketManager;
    private _config: users.IConfig;
    private _gcs: gcloud.IGCS;
    private _buckets: mongodb.Collection;
    private _files: mongodb.Collection;
    private _stats: mongodb.Collection;
    private _zipper: zlib.Gzip;
    private _unzipper: zlib.Gunzip;
    private _deflater: zlib.Deflate;

    constructor(buckets: mongodb.Collection, files: mongodb.Collection, stats: mongodb.Collection, config: users.IConfig)
    {
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
    getBucketEntries(user?: string, searchTerm?: RegExp): Promise<Array<users.IBucketEntry>>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;

        return new Promise(function (resolve, reject)
        {
            var search: users.IBucketEntry = {};
            if (user)
                search.user = user;

            if (searchTerm)
                (<any>search).name = searchTerm;

            // Save the new entry into the database
            bucketCollection.find(search).toArray(function(error, buckets: Array<users.IBucketEntry>) {
                return resolve(buckets);
            });
        });
    }

    /**
    * Fetches the file count based on the given query
    * @param {IFileEntry} searchQuery The search query to idenfify files
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    numFiles(searchQuery: users.IFileEntry): Promise<number>
    {
        var files = this._files;
        return new Promise(function (resolve, reject)
        {
            // Save the new entry into the database
            files.count(searchQuery, function (err, count)
            {
                if (err)
                    return reject(err);

                return resolve(count);
            });
        });
    }

    /**
    * Fetches all file entries by a given query
    * @param {any} searchQuery The search query to idenfify files
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    getFiles(searchQuery: any, startIndex?: number, limit: number = -1): Promise<Array<users.IFileEntry>>
    {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;

        return new Promise(function (resolve, reject)
        {
            // Save the new entry into the database
            files.find(searchQuery).skip(startIndex).limit(limit).toArray(function(err, files: Array<users.IFileEntry>){
                return resolve(files);
            });
        });
    }

   /**
   * Updates all file entries for a given search criteria with custom meta data
   * @param {any} searchQuery The search query to idenfify files
   * @param {any} meta Optional meta data to associate with the files
   * @returns {Promise<boolean>}
   */
    setMeta(searchQuery: any, meta: any): Promise<boolean>
    {
        var files = this._files;
        return new Promise <boolean>(function (resolve, reject)
        {
            // Save the new entry into the database
            files.updateMany(searchQuery, { $set: <users.IFileEntry>{ meta : meta } }).then(function(updateResult) {
                return resolve(true);
            }).catch(function(err: Error) {
                return reject(err);
            });
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
    getFilesByBucket(bucket: users.IBucketEntry, startIndex?: number, limit?: number, searchTerm?: RegExp): Promise<Array<users.IFileEntry>>
    {
        var searchQuery: users.IFileEntry = { bucketId: bucket.identifier };

        if (searchTerm)
            (<any>searchQuery).name = searchTerm;

        return this.getFiles(searchQuery, startIndex, limit);
    }

    /**
    * Fetches the storage/api data for a given user
    * @param {string} user The user whos data we are fetching
    * @returns {Promise<def.IStorageStats>}
    */
    getUserStats(user?: string): Promise<users.IStorageStats>
    {
        var that = this;
        var gcs = this._gcs;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            // Save the new entry into the database
            stats.find(<users.IStorageStats>{ user: user }).limit(1).next().then(function(result)
            {
                if (!result)
                    return reject(new Error(`Could not find storage data for the user '${user}'`));
                else
                    return resolve(result);
            });
        });
    }

    /**
    * Attempts to create a user usage statistics
    * @param {string} user The user associated with this bucket
    * @returns {Promise<IStorageStats>}
    */
    createUserStats(user: string): Promise<users.IStorageStats>
    {
        var that = this;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            var storage: users.IStorageStats = {
                user: user,
                apiCallsAllocated: BucketManager.API_CALLS_ALLOCATED,
                memoryAllocated: BucketManager.MEMORY_ALLOCATED,
                apiCallsUsed: 0,
                memoryUsed: 0
            }

            stats.insertOne(storage).then(function(insertResult) {
                return resolve(insertResult.ops[0]);
            }).catch(function(err){
                return reject(err);
            });
        });
    }

    /**
    * Attempts to remove the usage stats of a given user
    * @param {string} user The user associated with this bucket
    * @returns {Promise<number>} A promise of the number of stats removed
    */
    removeUserStats(user: string): Promise<number>
    {
        var that = this;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            stats.deleteOne(<users.IStorageStats>{ user: user }).then(function(deleteResult){
                return resolve(deleteResult.deletedCount);
            }).catch(function(err){
                return reject(err);
            });
        });
    }

    /**
    * Attempts to remove all data associated with a user
    * @param {string} user The user we are removing
    * @returns {Promise<any>}
    */
    removeUser(user: string): Promise<any>
    {
        var that = this;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            that.removeBucketsByUser(user).then(function(result)
            {
                return that.removeUserStats(user);

            }).then(function(data)
            {
                return resolve();

            }).catch(function (err)
            {
                return reject(err);
            });
        });
    }

    /**
    * Attempts to create a new user bucket by first creating the storage on the cloud and then updating the internal DB
    * @param {string} name The name of the bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    createBucket(name: string, user: string): Promise<gcloud.IBucket>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketID = `webinate-bucket-${that.generateRandString(8).toLowerCase()}`;
        var bucketCollection = this._buckets;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            that.getIBucket(name, user).then(function (bucket)
            {
                if (bucket)
                    return reject(new Error(`A Bucket with the name '${name}' has already been registered`));

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
                                "content-type", "authorization", "content-length", "x-requested-with","x-mime-type", "x-file-name", "cache-control"
                            ],
                            "maxAgeSeconds": 1
                        }
                    ]
                }

                // Attempt to create a new Google bucket
                gcs.createBucket(bucketID, cors, function (err: Error, bucket: gcloud.IBucket)
                {
                    if (err)
                        return reject(new Error(`Could not create a new bucket: '${err.message}'`));
                    else
                    {
                        var newEntry: users.IBucketEntry = {
                            name: name,
                            identifier: bucketID,
                            created: Date.now(),
                            user: user,
                            memoryUsed: 0
                        }

                        // Save the new entry into the database
                        bucketCollection.insertOne(newEntry).then(function(insertResult) {

                            // Increments the API calls
                            return stats.updateOne(<users.IStorageStats>{ user: user }, { $inc: <users.IStorageStats>{ apiCallsUsed: 1 } });

                        }).then( function (updateResult) {

                            // Send bucket added events to sockets
                            var fEvent: def.SocketEvents.IBucketAddedEvent = { eventType: EventType.BucketUploaded, bucket: bucket, username: user };
                            return CommsController.singleton.broadcastEvent(fEvent);

                        }).then(function() {
                           return resolve(bucket);
                        }).catch(function(err){
                            return reject(err);
                        });
                    }
                });

            }).catch(function (err)
            {
                return reject(err);
            });
        });
    }

   /**
   * Attempts to remove buckets of the given search result. This will also update the file and stats collection.
   * @param {any} searchQuery A valid mongodb search query
   * @returns {Promise<string>} An array of ID's of the buckets removed
   */
    private removeBuckets(searchQuery): Promise<Array<string>>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            bucketCollection.find(searchQuery).toArray().then( function(buckets: Array<users.IBucketEntry>) {

                var toRemove = [];

                var attempts = 0;
                var error: Error = null;

                for (var i = 0, l = buckets.length; i < l; i++)
                {
                    that.deleteBucket(buckets[i]).then(function (bucket)
                    {
                        attempts++;
                        toRemove.push(bucket.identifier);
                        if (attempts == l)
                        {
                            // Send events to sockets
                            var fEvent: def.SocketEvents.IBucketRemovedEvent = { eventType: EventType.BucketRemoved, bucket: bucket };
                            CommsController.singleton.broadcastEvent(fEvent).then(function ()
                            {
                                resolve(toRemove);
                            });
                        }

                    }).catch(function (err : Error)
                    {
                        if (err)
                            error = err;

                        attempts++;
                        if (attempts == l)
                            reject(new Error(`Could not delete bucket: ${error.message}`));
                    });
                }

                // If no buckets
                if (buckets.length == 0)
                    resolve(toRemove);

            }).catch(function(err) {

                return reject(err);
            })
        });
    }

    /**
    * Attempts to remove buckets by id
    * @param {Array<string>} buckets An array of bucket IDs to remove
    * @param {string} user The user to whome these buckets belong
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    removeBucketsByName(buckets: Array<string>, user : string ): Promise<Array<string>>
    {
        if (buckets.length == 0)
            return Promise.resolve([]);

        // Create the search query for each of the files
        var searchQuery = { $or: [], user: user };
        for (var i = 0, l = buckets.length; i < l; i++)
            searchQuery.$or.push(<users.IBucketEntry>{ name: buckets[i] });

        return this.removeBuckets(searchQuery);
    }

    /**
    * Attempts to remove a user bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    removeBucketsByUser( user : string ): Promise<Array<string>>
    {
        return this.removeBuckets(<users.IBucketEntry>{ user: user });
    }

    /**
    * Deletes the bucket from storage and updates the databases
    */
    private deleteBucket(bucketEntry: users.IBucketEntry): Promise<users.IBucketEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;

        return new Promise<users.IBucketEntry>(function (resolve, reject)
        {
            // First remove all bucket files
            that.removeFilesByBucket(bucketEntry.identifier).then(function (files)
            {
                // Now remove the bucket itself
                var bucket: gcloud.IBucket = gcs.bucket(bucketEntry.identifier);
                bucket.delete(function (err: Error, apiResponse: any)
                {
                    // If there is an error then return - but not if the file is not found. More than likely
                    // it was removed by an admin
                    if (err && (<any>err).code != 404)
                        return reject(new Error(`Could not remove bucket from storage system: '${err.message}'`));
                    else
                    {
                        // Remove the bucket entry
                        bucketCollection.deleteOne(<users.IBucketEntry>{ _id: bucketEntry._id }).then(function(deleteResult) {
                            return stats.updateOne(<users.IStorageStats>{ user: bucketEntry.user }, { $inc: <users.IStorageStats>{ apiCallsUsed : 1 } });
                        }).then(function (result) {
                            return resolve(bucketEntry);
                        }).catch(function(err){
                            return reject(err);
                        });
                    }
                });

            }).catch(function (err)
            {
                return reject(`Could not remove the bucket: '${err.toString()}'`);
            })
        });
    }

    /**
    * Deletes the file from storage and updates the databases
    */
    private deleteFile(fileEntry: users.IFileEntry): Promise<users.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            that.getIBucket(fileEntry.bucketId).then(function (bucketEntry)
            {
                if (!bucketEntry)
                    return reject(new Error(`Could not find the bucket '${fileEntry.bucketName}'`));

                var bucket: gcloud.IBucket = gcs.bucket(bucketEntry.identifier);

                // Get the bucket and delete the file
                bucket.file(fileEntry.identifier).delete(function (err, apiResponse)
                {
                    // If there is an error then return - but not if the file is not found. More than likely
                    // it was removed by an admin
                    if (err && (<any>err).code != 404)
                        return reject(new Error(`Could not remove file '${fileEntry.identifier}' from storage system: '${err.toString() }'`));

                    // Update the bucket data usage
                    bucketCollection.updateOne(<users.IBucketEntry>{ identifier: bucketEntry.identifier }, { $inc: <users.IBucketEntry>{ memoryUsed: -fileEntry.size } }).then(function(result) {
                        return files.deleteOne(<users.IFileEntry>{ _id: fileEntry._id });
                    }).then(function (result) {
                        return stats.updateOne(<users.IStorageStats>{ user: bucketEntry.user }, { $inc: <users.IStorageStats>{ memoryUsed: -fileEntry.size, apiCallsUsed: 1 } });
                    }).then( function(result) {
                        return resolve(fileEntry);
                    }).catch(function(err){
                        return reject(`Could not remove file '${fileEntry.identifier}' from storage system: '${err.toString() }'`);
                    });
                });

            }).catch(function (err)
            {
                if (err)
                    return reject(err);
            })
        });
    }

   /**
   * Attempts to remove files from the cloud and database by a query
   * @param {any} searchQuery The query we use to select the files
   * @returns {Promise<string>} Returns the file IDs of the files removed
   */
    removeFiles(searchQuery: any ): Promise<Array<string>>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        var attempts: number = 0;
        var filesRemoved: Array<users.IFileEntry> = [];

        return new Promise(function (resolve, reject)
        {
            // Get the files
            files.find(searchQuery).toArray().then(function(fileEntries: Array<users.IFileEntry>){

                var error: Error = null;

                for (var i = 0, l = fileEntries.length; i < l; i++)
                {
                    that.deleteFile(fileEntries[i]).then(function(fileEntry)
                    {
                        attempts++;
                        filesRemoved.push(fileEntry);

                        if (attempts == l)
                        {
                            // Update any listeners on the sockets
                            var fEvent: def.SocketEvents.IFilesRemovedEvent = { eventType: EventType.FilesRemoved, files: filesRemoved };
                            CommsController.singleton.broadcastEvent(fEvent).then(function ()
                            {
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

            }).catch( function(err) {

                if (err)
                    return reject(err);
            });
        });
    }

    /**
   * Attempts to remove files from the cloud and database
   * @param {Array<string>} fileIDs The file IDs to remove
   * @param {string} user Optionally pass in the user to refine the search
   * @returns {Promise<string>} Returns the file IDs of the files removed
   */
    removeFilesById(fileIDs: Array<string>, user? : string): Promise<Array<string>>
    {
        if (fileIDs.length == 0)
            return Promise.resolve([]);

        // Create the search query for each of the files
        var searchQuery = { $or: [] };
        for (var i = 0, l = fileIDs.length; i < l; i++)
            searchQuery.$or.push(<users.IFileEntry>{ identifier: fileIDs[i] }, <users.IFileEntry>{ parentFile: fileIDs[i] });

        if (user)
            (<users.IFileEntry>searchQuery).user = user;

        return this.removeFiles(searchQuery);
    }

    /**
    * Attempts to remove files from the cloud and database that are in a given bucket
    * @param {string} bucket The id or name of the bucket to remove
    * @returns {Promise<string>} Returns the file IDs of the files removed
    */
    removeFilesByBucket(bucket: string): Promise<Array<string>|Error>
    {
        if (!bucket || bucket.trim() == "")
            return Promise.reject( new Error("Please specify a valid bucket"));

        // Create the search query for each of the files
        var searchQuery = { $or: <Array<users.IFileEntry>>[{ bucketId: bucket }, { bucketName: bucket }] };
        return this.removeFiles(searchQuery);
    }

    /**
    * Gets a bucket entry by its name or ID
    * @param {string} bucket The id of the bucket. You can also use the name if you provide the user
    * @param {string} user The username associated with the bucket (Only applicable if bucket is a name and not an ID)
    * @returns {IBucketEntry}
    */
    getIBucket(bucket: string, user?: string): Promise<users.IBucketEntry>
    {
        var that = this;
        var bucketCollection = this._buckets;
        var searchQuery: users.IBucketEntry = {};

        if (user)
        {
            searchQuery.user = user;
            searchQuery.name = bucket;
        }
        else
            searchQuery.identifier = bucket;

        return new Promise<users.IBucketEntry>(function (resolve, reject)
        {
            bucketCollection.find(searchQuery).limit(1).next().then( function( result: users.IBucketEntry) {
                if (!result)
                    return resolve(null);
                else
                    return resolve(result);
            }).catch(function (err){
                return reject(err);
            });
        });
    }

    /**
    * Checks to see the user's storage limits to see if they are allowed to upload data
    * @param {string} user The username
    * @param {Part} part
    * @returns {Promise<def.IStorageStats>}
    */
    private canUpload(user: string, part: multiparty.Part): Promise<users.IStorageStats>
    {
        var that = this;
        var bucketCollection = this._buckets;
        var stats = this._stats;

        return new Promise<users.IStorageStats>(function (resolve, reject)
        {
            stats.find(<users.IStorageStats>{ user: user }).limit(1).next().then( function(result: users.IStorageStats ) {

                if (result.memoryUsed + part.byteCount < result.memoryAllocated)
                {
                    if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                        resolve(result);
                    else
                        return reject(new Error("You have reached your API call limit. Please upgrade your plan for more API calls"));
                }
                else
                    return reject(new Error("You do not have enough memory allocated. Please upgrade your account for more memory"));

            }).catch(function(err){
                 return reject(err);
            });
        })
    }

    /**
   * Checks to see the user's api limit and make sure they can make calls
   * @param {string} user The username
   * @returns {Promise<boolean>}
   */
    withinAPILimit(user: string): Promise<boolean>
    {
        var that = this;
        var stats = this._stats;

        return new Promise<users.IStorageStats>(function (resolve, reject)
        {
            stats.find(<users.IStorageStats>{ user: user }).limit(1).next().then( function (result: users.IStorageStats) {
                if (!result)
                    return reject(new Error(`Could not find the user ${user}`));
                else if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                    resolve(true);
                else
                    return resolve(false);

            }).catch(function(err){
                return reject(err);
            });
        })
    }

    /**
    * Adds an API call to a user
    * @param {string} user The username
    * @returns {Promise<boolean>}
    */
    incrementAPI(user: string): Promise<boolean>
    {
        var that = this;
        var stats = this._stats;

        return new Promise<users.IStorageStats>(function (resolve, reject)
        {
            stats.updateOne(<users.IStorageStats>{ user: user }, { $inc: <users.IStorageStats>{ apiCallsUsed : 1 } }).then( function (updateResult) {
                resolve(true);
            }).catch(function(err){
                return reject(err);
            });
        })
    }

    /**
    * Makes a file publicly available
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    makeFilePublic(file: users.IFileEntry): Promise<users.IFileEntry>
    {
        var that = this;
        return new Promise<users.IFileEntry>(function (resolve, reject)
        {
            that.withinAPILimit(file.user).then(function (val) : Promise<Error|boolean> {

                if (!val)
                    return Promise.reject(new Error("You do not have enough API calls left to make this request"));

                return that.incrementAPI(file.user);

            }).then(function() {

                var bucket = that._gcs.bucket(file.bucketId);
                var rawFile = bucket.file(file.identifier);
                rawFile.makePublic(function (err, api)
                {
                    if (err)
                        return reject(err);

                    that._files.updateOne(<users.IFileEntry>{ bucketId: file.bucketId, identifier: file.identifier }, { $set: <users.IFileEntry>{ isPublic: true } }).then( function(updateResult) {
                        resolve(file);
                    }).catch(function(err){
                        return reject(err);
                    });
                });

            }).catch(function (err) {
                return reject(new err);
            });

        });
    }

    /**
    * Makes a file private
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    makeFilePrivate(file: users.IFileEntry): Promise<users.IFileEntry>
    {
        var that = this;
        return new Promise<users.IFileEntry>(function (resolve, reject)
        {
            that.withinAPILimit(file.user).then(function (val) : Promise<Error | boolean>
            {
                if (!val)
                    return Promise.reject( new Error("You do not have enough API calls left to make this request"));

                return that.incrementAPI(file.user);

            }).then(function ()
            {
                var bucket = that._gcs.bucket(file.bucketId);
                var rawFile = bucket.file(file.identifier);
                rawFile.makePrivate({ strict: true }, function (err)
                {
                    if (err)
                        return reject(err);

                    that._files.updateOne(<users.IFileEntry>{ bucketId: file.bucketId, identifier: file.identifier }, { $set: <users.IFileEntry>{ isPublic: false } }).then( function(result) {
                        return resolve(file);
                    }).catch(function(err){
                        return reject(err);
                    });
                });

            }).catch(function (err)
            {
                return reject(new err);
            });

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
    private registerFile(fileID: string, bucket: users.IBucketEntry, part: multiparty.Part, user: string, isPublic: boolean, parentFile: string): Promise<users.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;

        return new Promise<users.IFileEntry>(function (resolve, reject)
        {
            var entry: users.IFileEntry = {
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

            files.insertOne(entry).then(function(insertResult ) {
                return resolve(insertResult.ops[0]);
            }).catch(function(err){
                return reject(new Error(`Could not save user file entry: ${err.toString() }`));
            });
        });
    }

    private generateRandString(len: number) : string
    {
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
    uploadStream(part: multiparty.Part, bucketEntry: users.IBucketEntry, user: string, makePublic: boolean = true, parentFile? : string ): Promise<users.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var statCollection = this._stats;
        var storageStats: users.IStorageStats;

        return new Promise<users.IFileEntry>(function (resolve, reject)
        {
            that.canUpload(user, part).then(function(stats)
            {
                storageStats = stats;
                var bucket = that._gcs.bucket(bucketEntry.identifier);
                var fileID = that.generateRandString(16);
                var rawFile = bucket.file(fileID);

                // We look for part errors so that we can cleanup any faults with the upload if it cuts out
                // on the user's side.
                part.on('error', function (err: Error)
                {
                    // Delete the file on the bucket
                    rawFile.delete(function (bucketErr, apiResponse)
                    {
                        if (bucketErr)
                            return reject(new Error(`While uploading a user part an error occurred while cleaning the bucket: ${bucketErr.toString() }`))
                        else
                            return reject(new Error(`Could not upload a user part: ${err.toString() }`))
                    });
                });

                var stream: fs.WriteStream;

                // Check if the stream content type is something that can be compressed - if so, then compress it before sending it to
                // Google and set the content encoding
                if (compressible(part.headers["content-type"]))
                    stream = part.pipe(that._zipper).pipe(rawFile.createWriteStream(<any>{ metadata: { contentEncoding: 'gzip', contentType: part.headers["content-type"], metadata: { encoded: true } } }));
                else
                    stream = part.pipe(rawFile.createWriteStream(<any>{ metadata: { contentType: part.headers["content-type"] } }));

                // Pipe the file to the bucket
                stream.on("error", function (err: Error)
                {
                    return reject(new Error(`Could not upload the file '${part.filename}' to bucket: ${err.toString() }`))

                }).on('finish', function ()
                {
                    bucketCollection.updateOne(<users.IBucketEntry>{ identifier: bucketEntry.identifier }, { $inc: <users.IBucketEntry>{ memoryUsed: part.byteCount } }).then( function(updateResult) {
                        return statCollection.updateOne(<users.IStorageStats>{ user: user }, { $inc: <users.IStorageStats>{ memoryUsed: part.byteCount, apiCallsUsed: 1 } });
                    }).then( function(updateResult) {
                        return that.registerFile(fileID, bucketEntry, part, user, makePublic, parentFile)
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

                    }).catch(function (err: Error) {
                        return reject(err);
                    });
                });

            }).catch(function (err: Error)
            {
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
    getFile(fileID: string, user?: string, searchTerm?: RegExp ): Promise<users.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;

        return new Promise<users.IFileEntry>(function (resolve, reject)
        {
            var searchQuery: users.IFileEntry = { identifier: fileID };
            if (user)
                searchQuery.user = user;

            if (searchTerm)
                (<any>searchQuery).name = searchTerm;

            files.find(searchQuery).limit(1).next().then( function (result: users.IFileEntry)
            {
                if (!result)
                    return reject(`File '${fileID}' does not exist`);
                else
                    return resolve(result);

            }).catch(function(err){
                return reject(err);
            });
        });
    }

    /**
    * Renames a file
    * @param {string} file The file to rename
    * @param {string} name The new name of the file
    * @returns {Promise<IFileEntry>}
    */
    renameFile(file: users.IFileEntry, name: string): Promise<users.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;

        return new Promise<users.IFileEntry>(function (resolve, reject)
        {
            that.incrementAPI(file.user).then(function()
            {
                files.updateOne(<users.IFileEntry>{ _id: file._id }, { $set: <users.IFileEntry>{ name : name } }).then( function(result) {
                    resolve(file);
                }).catch(function(err){
                    reject(err);
                });
            })
        });
    }

    /**
    * Downloads the data from the cloud and sends it to the requester. This checks the request for encoding and
    * sets the appropriate headers if and when supported
    * @param {Request} request The request being made
    * @param {Response} response The response stream to return the data
    * @param {IFileEntry} file The file to download
    */
    downloadFile(request: express.Request, response: express.Response, file: users.IFileEntry)
    {
        var that = this;
        var gcs = this._gcs;
        var buckets = this._buckets;
        var files = this._files;
        var iBucket = that._gcs.bucket(file.bucketId);
        var iFile = iBucket.file(file.identifier);

        iFile.getMetadata(function(err, meta)
        {
            if (err)
                return response.status(500).send(err.toString());

            // Get the client encoding support - if any
            var acceptEncoding = request.headers['accept-encoding'];
            if (!acceptEncoding)
                acceptEncoding = '';

            var stream: fs.ReadStream = iFile.createReadStream();
            var encoded = false;
            if (meta.metadata)
                encoded = meta.metadata.encoded;

            // Request is expecting a deflate
            if (acceptEncoding.match(/\bgzip\b/))
            {
                // If already gzipped and expeting gzip
                if (encoded)
                {
                    // Simply return the raw pipe
                    response.setHeader('content-encoding', 'gzip');
                    stream.pipe(response);
                }
                else
                    stream.pipe(response);
            }
            else if (acceptEncoding.match(/\bdeflate\b/))
            {
                response.setHeader('content-encoding', 'deflate');

                // If its encoded - then its encoded in gzip and needs to be
                if (encoded)
                    stream.pipe(that._unzipper).pipe(that._deflater).pipe(response);
                else
                    stream.pipe(that._deflater).pipe(response);
            }
            else
            {
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
    updateStorage(user: string, value: users.IStorageStats): Promise<number>
    {
        var that = this;
        var stats = this._stats;

        return new Promise<number>(function (resolve, reject)
        {
            stats.updateOne(<users.IStorageStats>{ user: user }, { $set: value }).then(function(updateResult) {

                if (updateResult.matchedCount === 0)
                    return reject(`Could not find user '${user}'`);
                else
                    return resolve(updateResult.modifiedCount);

            }).catch(function(err){
                return reject(err);
            });
        });
    }

    /**
    * Creates the bucket manager singleton
    */
    static create(buckets: mongodb.Collection, files: mongodb.Collection, stats: mongodb.Collection, config: users.IConfig): BucketManager
    {
        return new BucketManager(buckets, files, stats, config);
    }

    /**
    * Gets the bucket singleton
    */
    static get get(): BucketManager
    {
        return BucketManager._singleton;
    }
}