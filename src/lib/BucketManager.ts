import * as def from "./Definitions";
import * as fs from "fs";
import * as gcloud from "gcloud";

export class BucketManager
{
    private static _singleton: BucketManager;
    private _config: def.IConfig;
    private _gcs: gcloud.IGCS;

    constructor(config: def.IConfig)
    {
        this._gcs = gcloud.storage({ projectId: config.bucket.projectId, keyFilename: config.bucket.keyFile });
    }

    createUserBucket(user: def.IUserEntry): Promise<gcloud.IBucket>
    {
        var that = this;
        return new Promise<gcloud.IBucket>(function (resolve, reject)
        {
            that._gcs.createBucket(`webinate-user.username`, function (err: Error, bucket: gcloud.IBucket)
            {
            });
        });
    }

    static get get(): BucketManager
    {
        return BucketManager._singleton;
    }
}