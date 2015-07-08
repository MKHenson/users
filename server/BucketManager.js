var gcloud = require("gcloud");
var BucketManager = (function () {
    function BucketManager(buckets, files, config) {
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
    BucketManager.prototype.createUserBucket = function (user) {
        var that = this;
        var gcs = this._gcs;
        var bucketName = "webinate-user-" + Date.now();
        var bucketCollection = this._buckets;
        return new Promise(function (resolve, reject) {
            // Attempt to create a new Google bucket
            gcs.createBucket(bucketName, function (err, bucket) {
                if (err)
                    return reject(new Error("Could not connect to storage system: '" + err.message + "'"));
                else {
                    var newEntry = {
                        name: bucketName,
                        created: Date.now(),
                        user: user,
                        apiCallsAllocated: BucketManager.API_CALLS_ALLOCATED,
                        memoryAllocated: BucketManager.MEMORY_ALLOCATED,
                        apiCallsUsed: 0,
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
    * @param {def.IUserEntry} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    BucketManager.prototype.removeBucket = function (user) {
        var that = this;
        var gcs = this._gcs;
        var bucketCollection = this._buckets;
        return new Promise(function (resolve, reject) {
            bucketCollection.findOne({ user: user }, function (err, result) {
                if (err)
                    return reject(err);
                else {
                    var bucket = gcs.bucket(result.name);
                    bucket.delete(function (err, apiResponse) {
                        if (err)
                            return reject(new Error("Could not remove bucket from storage system: '" + err.message + "'"));
                        else
                            return resolve();
                    });
                }
            });
        });
    };
    /**
    * Creates the bucket manager singleton
    */
    BucketManager.create = function (buckets, files, config) {
        return new BucketManager(buckets, files, config);
    };
    Object.defineProperty(BucketManager, "get", {
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
