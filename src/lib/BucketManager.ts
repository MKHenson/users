import * as def from "./Definitions";
import * as fs from "fs";
import * as gcloud from "gcloud";
import * as http from "http";
import * as mongodb from "mongodb";
import * as multiparty from "multiparty";
import {User} from "./Users"

/**
* Class responsible for managing buckets and uploads to Google storage
*/
export class BucketManager
{
    private static MEMORY_ALLOCATED: number = 5e+8; //500mb
    private static API_CALLS_ALLOCATED: number = 20000; //20,000

    private static _singleton: BucketManager;
    private _config: def.IConfig;
    private _gcs: gcloud.IGCS;
    private _buckets: mongodb.Collection;
    private _files: mongodb.Collection;
    private _stats: mongodb.Collection;

    constructor(buckets: mongodb.Collection, files: mongodb.Collection, stats: mongodb.Collection, config: def.IConfig)
    {
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
    getBucketEntries(): Promise<Array<def.IBucketEntry>>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;

        return new Promise(function (resolve, reject)
        {
            // Save the new entry into the database
            bucketCollection.find({}, function (err, result)
            {
                if (err)
                    return reject(err);
                else
                {
                    result.toArray(function(err, buckets: Array<def.IBucketEntry>)
                    {
                        if (err)
                            return reject(err);

                        return resolve(buckets);
                    });
                }
            });
        });
    }

    /**
    * Fetches all file entries from the database for a given bucket
    * @param {string} bucket [Optional] Specify the bucket from which he files belong to
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    getFileEntries(bucket? : string): Promise<Array<def.IFileEntry>>
    {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;
        
        return new Promise(function (resolve, reject)
        {
            var searchQuery: def.IFileEntry = {};
            if (bucket)
                searchQuery.bucket = bucket;

            // Save the new entry into the database
            files.find(searchQuery, function (err, result)
            {
                if (err)
                    return reject(err);
                else
                {
                    result.toArray(function (err, files: Array<def.IFileEntry>)
                    {
                        if (err)
                            return reject(err);

                        return resolve(files);
                    });
                }
            });
        });
    }

    /**
    * Attempts to create a new user bucket by first creating the storage on the cloud and then updating the internal DB
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    createUserStats(user: string): Promise<def.IStorageStats>
    {
        var that = this;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            var storage: def.IStorageStats = {
                user: user,
                apiCallsAllocated: BucketManager.API_CALLS_ALLOCATED,
                memoryAllocated: BucketManager.MEMORY_ALLOCATED,
                apiCallsUsed: 0,
                memoryUsed: 0
            }

            stats.save(storage, function (err, result: def.IStorageStats)
            {
                if (err)
                    return reject(err);
                else
                    return resolve(result);
            });
        });
    }

    /**
    * Attempts to create a new user bucket by first creating the storage on the cloud and then updating the internal DB
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    createUserBucket(user: string): Promise<gcloud.IBucket>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketName = `webinate-user-${Date.now()}`;
        var bucketCollection = this._buckets;

        return new Promise(function (resolve, reject)
        {
            // Attempt to create a new Google bucket
            gcs.createBucket(bucketName, <gcloud.IMeta>{ location : "EU" }, function (err: Error, bucket: gcloud.IBucket)
            {
                if (err)
                    return reject(new Error(`Could not connect to storage system: '${err.message}'`));
                else
                {
                    var newEntry: def.IBucketEntry = {
                        name: bucketName,
                        created: Date.now(),
                        user: user,
                        memoryUsed: 0
                    }

                    // Save the new entry into the database
                    bucketCollection.save(newEntry, function (err, result: def.IBucketEntry)
                    {
                        if (err)
                            return reject(err);
                        else
                            return resolve(bucket);
                    });
                }
            });
        });
    }

    /**
    * Attempts to remove a user bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    removeBucket( user : string ): Promise<any>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            bucketCollection.findOne(<def.IBucketEntry>{ user: user }, function (err, result: def.IBucketEntry)
            {
                var bucketEntry: def.IBucketEntry = result;

                if (err)
                    return reject(err);
                else
                {
                    var bucket: gcloud.IBucket = gcs.bucket(result.identifier);
                    bucket.delete(function (err: Error, apiResponse: any)
                    {
                        if (err)
                            return reject(new Error(`Could not remove bucket from storage system: '${err.message}'`));
                        else
                        {
                            // Remove the bucket entry
                            bucketCollection.remove(<def.IBucketEntry>{ user: user }, function (err, result)
                            {
                                // Remove the file entries
                                files.remove(<def.IFileEntry>{ bucket: bucketEntry.identifier }, function (err, result)
                                {
                                    // Update the stats usage
                                    stats.update(<def.IStorageStats>{ user: user }, { $inc: { memoryUsed: -bucketEntry.memoryUsed } }, function(err, result)
                                    {
                                        return resolve();
                                    });
                                });
                            });
                        }
                    });
                }
            });
        });
    }

    /**
    * Deletes the file from storage and updates the databases
    */
    private deleteFile(bucketEntry: def.IBucketEntry, fileEntry: def.IFileEntry): Promise<def.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;

        return new Promise(function (resolve, reject)
        {
            var bucket: gcloud.IBucket = gcs.bucket(bucketEntry.identifier);

            // Get the bucket and delete the file
            bucket.file(fileEntry.identifier).delete(function (err, apiResponse)
            {
                if (err)
                    return reject(new Error(`Could not remove file '${fileEntry.identifier}' from storage system: '${err.toString()}'`));
                                   
                // Update the bucket data usage
                bucketCollection.update(<def.IBucketEntry>{ name: bucketEntry.identifier }, { $inc: <def.IBucketEntry>{ memoryUsed: fileEntry.size } }, function (err, result)
                {
                    if (err)
                        return reject(`Could not remove file '${fileEntry.identifier}' from storage system: '${err.toString() }'`);

                    // Remove the file entries
                    files.remove(<def.IFileEntry>{ _id: fileEntry._id }, function (err, result)
                    {
                        if (err)
                            return reject(`Could not remove file '${fileEntry.identifier}' from storage system: '${err.toString() }'`);

                        // Update the stats usage
                        stats.update(<def.IStorageStats>{ user: bucketEntry.user }, { $inc: <def.IStorageStats>{ memoryUsed: bucketEntry.memoryUsed, apiCallsUsed: 1 } }, function (err, result)
                        {
                            if (err)
                                return reject(`Could not remove file '${fileEntry.identifier}' from storage system: '${err.toString() }'`);

                            return resolve(fileEntry);
                        });
                    });
                });
            });
        });
    }

   /**
   * Attempts to remove files from the cloud and database
   * @param {Array<string>} fileNames The files to remove
   * @returns {Promise<string>} Returns the names of the files removed
   */
    removeFiles(fileNames: Array<string>, user: User ): Promise<Array<string>>
    {
        if (fileNames.length == 0)
            return Promise.resolve();

        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var files = this._files;
        var stats = this._stats;
        var numToRemove = fileNames.length;
        var attempts: number = 0;
        var filesRemoved: Array<string> = [];

        // Create the search query for each of the files
        var searchQuery = { $or: [] };
        for (var i = 0; i < numToRemove; i++)
            searchQuery.$or.push(<def.IFileEntry>{ name : fileNames[i] });

        return new Promise(function (resolve, reject)
        {
            // Get the files
            files.find(searchQuery, function (err, cursor)
            {
                if (err)
                    return reject(err);
                
                // For each file entry
                cursor.each(function (err, fileEntry: def.IFileEntry)
                {
                    that.getIBucket(fileEntry.bucket).then(function (bucketEntry)
                    {
                        return that.deleteFile(bucketEntry, fileEntry);

                    }).then(function (fileEntry)
                    {
                        attempts++;
                        filesRemoved.push(fileEntry.identifier);

                        if (attempts == numToRemove)
                            resolve(filesRemoved);

                    }).catch(function (err)
                    {
                        attempts++;

                        if (attempts == numToRemove)
                            resolve(filesRemoved);
                    });
                });
            });
        });
    }

    /**
    * Gets a bucket entry
    * @param {string} user The username
    * @returns {IBucketEntry}
    */
    private getIBucket(user: string): Promise<def.IBucketEntry>
    {
        var that = this;
        var bucketCollection = this._buckets;

        return new Promise<def.IBucketEntry>(function (resolve, reject)
        {
            bucketCollection.findOne(<def.IBucketEntry>{ user: user }, function (err, result: def.IBucketEntry)
            {
                if (err)
                    return reject(err);
                else if (!result)
                    return reject(new Error(`Could not find bucket for user '${user}'`));
                else
                    return resolve(result);
            });
        });
    }
    
    /**
    * Checks to see the user's storage limits to see if they are allowed to upload data
    * @param {string} user The username
    * @param {Part} part 
    * @returns {Promise<boolean>}
    */
    private canUpload(user: string, part: multiparty.Part): Promise<def.IStorageStats>
    {
        var that = this;
        var bucketCollection = this._buckets;
        var stats = this._stats;

        return new Promise<def.IStorageStats>(function (resolve, reject)
        {
            stats.findOne(<def.IStorageStats>{ user: user }, function (err, result: def.IStorageStats )
            {
                if (err)
                    return reject(err);

                if (result.memoryUsed + part.byteCount < result.memoryAllocated)
                {
                    if (result.apiCallsUsed + 1 < result.apiCallsAllocated)
                        resolve(result);
                    else
                        return reject(new Error("You have reached your API call limit. Please upgrade your plan for more API calls"));
                }
                else
                    return reject(new Error("You do not have enough memory allocated. Please upgrade your account for more memory"));
            });
        })
    }

    /**
    * Registers an uploaded part as a new user file in the local dbs
    * @param {string} filename The name of the file on the bucket
    * @param {string} bucket The name of the bucket this file belongs to
    * @param {multiparty.Part} part
    * @param {string} user The username
    * @returns {Promise<IFileEntry>}
    */
    private registerFile(filename: string, bucket: string, part: multiparty.Part, user: string): Promise<def.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var files = this._files;

        return new Promise<def.IFileEntry>(function (resolve, reject)
        {
            var entry: def.IFileEntry = {
                user: user,
                name: filename,
                bucket: bucket,
                created: Date.now(),
                numDownloads: 0,
                size: part.byteCount
            };

            files.save(entry, function (err: Error, result: any)
            {
                if (err)
                    return reject(new Error(`Could not save user file entry: ${err.toString() }`));
                else
                    resolve(result.ops[0]);
            });
        });
    }

    /**
    * Uploads a part stream as a new user file. This checks permissions, updates the local db and uploads the stream to the bucket
    * @param {Part} part
    * @param {string} user The username
    * @returns {Promise<any>}
    */
    uploadStream(part: multiparty.Part, user: string): Promise<def.IFileEntry>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        var stats = this._stats;
        var storageStats: def.IStorageStats;

        return new Promise<def.IFileEntry>(function (resolve, reject)
        {
            that.canUpload(user, part).then(function(stats)
            {
                storageStats = stats;
                return that.getIBucket(user);

            }).then(function (bucketEntry: def.IBucketEntry)
            {
                var bucket = that._gcs.bucket(bucketEntry.identifier);
                var filename = Date.now() + "-" + part.filename;
                var file = bucket.file(filename);

                // We look for part errors so that we can cleanup any faults with the upload if it cuts out
                // on the user's side.
                part.on('error', function (err: Error)
                {
                    // Delete the file on the bucket
                    file.delete(function (bucketErr, apiResponse)
                    {
                        if (bucketErr)
                            return reject(new Error(`While uploading a user part an error occurred while cleaning the bucket: ${bucketErr.toString() }`))
                        else
                            return reject(new Error(`Could not upload a user part: ${err.toString() }`))
                    });
                });

                // Pipe the file to the bucket
                part.pipe(file.createWriteStream()).on("error", function (err: Error)
                {
                    return reject(new Error(`Could not upload the file '${part.filename}' to bucket: ${err.toString() }`))

                }).on('complete', function ()
                {
                    var apiCalls = storageStats.apiCallsUsed + 1;
                    var bucketMemory = bucketEntry.memoryUsed + part.byteCount;
                    var totalMemory = storageStats.memoryUsed + part.byteCount;

                    bucketCollection.update(<def.IBucketEntry>{ name: bucketEntry.identifier }, { $set: <def.IBucketEntry>{ memoryUsed: bucketMemory } }, function (err, result)
                    {
                        stats.update(<def.IStorageStats>{ user: user }, { $set: <def.IStorageStats>{ memoryUsed: totalMemory, apiCallsUsed: apiCalls } }, function (err, result)
                        {
                            that.registerFile(filename, bucketEntry.identifier, part, user).then(function (file)
                            {
                                return resolve(file);

                            }).catch(function (err: Error)
                            {
                                return reject(err);
                            });
                        });
                    });
                });

            }).catch(function (err: Error)
            {
                return reject(err);
            });
        });        
    }

    /**
    * Finds and downloads a file
    * @param {string} filename The name of the file on the bucket
    * @returns {Promise<fs.ReadStream>}
    */
    downloadFile(filename: string): Promise<fs.ReadStream>
    {
        var that = this;
        var gcs = this._gcs;
        var buckets = this._buckets;
        var files = this._files;

        return new Promise<fs.ReadStream>(function (resolve, reject)
        {
            files.findOne(<def.IFileEntry>{ name: filename }, function (err, result: def.IFileEntry)
            {
                if (err)
                    return reject(err);
                else if (!result)
                    return reject(`File '${filename}' does not exist`);
                else
                {
                    var iBucket = that._gcs.bucket(result.bucket);
                    var iFile = iBucket.file(name);
                    resolve(iFile.createReadStream());
                }
            });
        });
    }

    /**
    * Creates the bucket manager singleton
    */
    static create(buckets: mongodb.Collection, files: mongodb.Collection, stats: mongodb.Collection, config: def.IConfig): BucketManager
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