import * as def from "./Definitions";
import * as fs from "fs";
import * as gcloud from "gcloud";
import * as mongodb from "mongodb";

export class BucketManager
{
    private static MEMORY_ALLOCATED: number = 5e+8; //500mb
    private static API_CALLS_ALLOCATED: number = 20000; //20,000

    private static _singleton: BucketManager;
    private _config: def.IConfig;
    private _gcs: gcloud.IGCS;
    private _buckets: mongodb.Collection;
    private _files: mongodb.Collection;

    constructor(buckets: mongodb.Collection, files: mongodb.Collection, config: def.IConfig)
    {
        BucketManager._singleton = this;
        this._gcs = gcloud.storage({ projectId: config.bucket.projectId, keyFilename: config.bucket.keyFile });
        this._buckets = buckets;
        this._files = files;
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
            gcs.createBucket(bucketName, function (err: Error, bucket: gcloud.IBucket)
            {
                if (err)
                    return reject(new Error(`Could not connect to storage system: '${err.message}'`));
                else
                {
                    var newEntry: def.IBucketEntry = {
                        name: bucketName,
                        created: Date.now(),
                        user: user,
                        apiCallsAllocated: BucketManager.API_CALLS_ALLOCATED,
                        memoryAllocated: BucketManager.MEMORY_ALLOCATED,
                        apiCallsUsed: 0,
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
    * @param {def.IUserEntry} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    removeBucket( user : string ): Promise<any>
    {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;

        return new Promise(function (resolve, reject)
        {
            bucketCollection.findOne(<def.IBucketEntry>{ user: user }, function (err, result: def.IBucketEntry)
            {
                if (err)
                    return reject(err);
                else
                {
                    var bucket: gcloud.IBucket = gcs.bucket(result.name);
                    bucket.delete(function (err: Error, apiResponse: any)
                    {
                        if (err)
                            return reject(new Error(`Could not remove bucket from storage system: '${err.message}'`));
                        else
                            return resolve();
                    });
                }
            });
        });
    }

    /**
    * Creates the bucket manager singleton
    */
    static create(buckets: mongodb.Collection, files: mongodb.Collection, config: def.IConfig): BucketManager
    {
        return new BucketManager(buckets, files, config);
    }

    static get get(): BucketManager
    {
        return BucketManager._singleton;
    }
}