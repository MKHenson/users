var gcloud = require("gcloud");
var BucketManager = (function () {
    function BucketManager(config) {
        this._gcs = gcloud.storage({ projectId: config.bucket.projectId, keyFilename: config.bucket.keyFile });
    }
    BucketManager.prototype.createUserBucket = function (user) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that._gcs.createBucket("webinate-user.username", function (err, bucket) {
            });
        });
    };
    Object.defineProperty(BucketManager, "get", {
        get: function () {
            return BucketManager._singleton;
        },
        enumerable: true,
        configurable: true
    });
    return BucketManager;
})();
exports.BucketManager = BucketManager;
