import * as users from "webinate-users";
import * as gcloud from "gcloud";
import * as mongodb from "mongodb";
import * as multiparty from "multiparty";
import express = require("express");
/**
* Class responsible for managing buckets and uploads to Google storage
*/
export declare class BucketManager {
    private static MEMORY_ALLOCATED;
    private static API_CALLS_ALLOCATED;
    private static _singleton;
    private _config;
    private _gcs;
    private _buckets;
    private _files;
    private _stats;
    private _zipper;
    private _unzipper;
    private _deflater;
    constructor(buckets: mongodb.Collection, files: mongodb.Collection, stats: mongodb.Collection, config: users.IConfig);
    /**
    * Fetches all bucket entries from the database
    * @param {string} user [Optional] Specify the user. If none provided, then all buckets are retrieved
    * @param {RegExp} searchTerm [Optional] Specify a search term
    * @returns {Promise<Array<def.IBucketEntry>>}
    */
    getBucketEntries(user?: string, searchTerm?: RegExp): Promise<Array<users.IBucketEntry>>;
    /**
    * Fetches the file count based on the given query
    * @param {IFileEntry} searchQuery The search query to idenfify files
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    numFiles(searchQuery: users.IFileEntry): Promise<number>;
    /**
    * Fetches all file entries by a given query
    * @param {any} searchQuery The search query to idenfify files
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    getFiles(searchQuery: any, startIndex?: number, limit?: number): Promise<Array<users.IFileEntry>>;
    /**
    * Updates all file entries for a given search criteria with custom meta data
    * @param {any} searchQuery The search query to idenfify files
    * @param {any} meta Optional meta data to associate with the files
    * @returns {Promise<boolean>}
    */
    setMeta(searchQuery: any, meta: any): Promise<boolean>;
    /**
    * Fetches all file entries from the database for a given bucket
    * @param {IBucketEntry} bucket Specify the bucket from which he files belong to
    * @param {number} startIndex Specify the start index
    * @param {number} limit Specify the number of files to retrieve
    * @param {RegExp} searchTerm Specify a search term
    * @returns {Promise<Array<def.IFileEntry>>}
    */
    getFilesByBucket(bucket: users.IBucketEntry, startIndex?: number, limit?: number, searchTerm?: RegExp): Promise<Array<users.IFileEntry>>;
    /**
    * Fetches the storage/api data for a given user
    * @param {string} user The user whos data we are fetching
    * @returns {Promise<def.IFileEntry>}
    */
    getUserStats(user?: string): Promise<users.IStorageStats>;
    /**
    * Attempts to create a user usage statistics
    * @param {string} user The user associated with this bucket
    * @returns {Promise<IStorageStats>}
    */
    createUserStats(user: string): Promise<users.IStorageStats>;
    /**
    * Attempts to remove the usage stats of a given user
    * @param {string} user The user associated with this bucket
    * @returns {Promise<number>} A promise of the number of stats removed
    */
    removeUserStats(user: string): Promise<number>;
    /**
    * Attempts to remove all data associated with a user
    * @param {string} user The user we are removing
    * @returns {Promise<any>}
    */
    removeUser(user: string): Promise<any>;
    /**
    * Attempts to create a new user bucket by first creating the storage on the cloud and then updating the internal DB
    * @param {string} name The name of the bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<gcloud.IBucket>}
    */
    createBucket(name: string, user: string): Promise<gcloud.IBucket>;
    /**
    * Attempts to remove buckets of the given search result. This will also update the file and stats collection.
    * @param {any} searchQuery A valid mongodb search query
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    private removeBuckets(searchQuery);
    /**
    * Attempts to remove buckets by id
    * @param {Array<string>} buckets An array of bucket IDs to remove
    * @param {string} user The user to whome these buckets belong
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    removeBucketsByName(buckets: Array<string>, user: string): Promise<Array<string>>;
    /**
    * Attempts to remove a user bucket
    * @param {string} user The user associated with this bucket
    * @returns {Promise<string>} An array of ID's of the buckets removed
    */
    removeBucketsByUser(user: string): Promise<Array<string>>;
    /**
    * Deletes the bucket from storage and updates the databases
    */
    private deleteBucket(bucketEntry);
    /**
    * Deletes the file from storage and updates the databases
    */
    private deleteFile(fileEntry);
    /**
    * Attempts to remove files from the cloud and database by a query
    * @param {any} searchQuery The query we use to select the files
    * @returns {Promise<string>} Returns the file IDs of the files removed
    */
    removeFiles(searchQuery: any): Promise<Array<string>>;
    /**
   * Attempts to remove files from the cloud and database
   * @param {Array<string>} fileIDs The file IDs to remove
   * @param {string} user Optionally pass in the user to refine the search
   * @returns {Promise<string>} Returns the file IDs of the files removed
   */
    removeFilesById(fileIDs: Array<string>, user?: string): Promise<Array<string>>;
    /**
    * Attempts to remove files from the cloud and database that are in a given bucket
    * @param {string} bucket The id or name of the bucket to remove
    * @returns {Promise<string>} Returns the file IDs of the files removed
    */
    removeFilesByBucket(bucket: string): Promise<Array<string>>;
    /**
    * Gets a bucket entry by its name or ID
    * @param {string} bucket The id of the bucket. You can also use the name if you provide the user
    * @param {string} user The username associated with the bucket (Only applicable if bucket is a name and not an ID)
    * @returns {IBucketEntry}
    */
    getIBucket(bucket: string, user?: string): Promise<users.IBucketEntry>;
    /**
    * Checks to see the user's storage limits to see if they are allowed to upload data
    * @param {string} user The username
    * @param {Part} part
    * @returns {Promise<def.IStorageStats>}
    */
    private canUpload(user, part);
    /**
   * Checks to see the user's api limit and make sure they can make calls
   * @param {string} user The username
   * @returns {Promise<boolean>}
   */
    withinAPILimit(user: string): Promise<boolean>;
    /**
    * Adds an API call to a user
    * @param {string} user The username
    * @returns {Promise<boolean>}
    */
    incrementAPI(user: string): Promise<boolean>;
    /**
    * Makes a file publicly available
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    makeFilePublic(file: users.IFileEntry): Promise<users.IFileEntry>;
    /**
    * Makes a file private
    * @param {IFileEntry} file
    * @returns {Promise<IFileEntry>}
    */
    makeFilePrivate(file: users.IFileEntry): Promise<users.IFileEntry>;
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
    private registerFile(fileID, bucket, part, user, isPublic, parentFile);
    private generateRandString(len);
    /**
    * Uploads a part stream as a new user file. This checks permissions, updates the local db and uploads the stream to the bucket
    * @param {Part} part
    * @param {string} bucket The bucket to which we are uploading to
    * @param {string} user The username
    * @param {string} makePublic Makes this uploaded file public to the world
    * @param {string} parentFile [Optional] Set a parent file which when deleted will detelete this upload as well
    * @returns {Promise<any>}
    */
    uploadStream(part: multiparty.Part, bucketEntry: users.IBucketEntry, user: string, makePublic?: boolean, parentFile?: string): Promise<users.IFileEntry>;
    /**
    * Fetches a file by its ID
    * @param {string} fileID The file ID of the file on the bucket
    * @param {string} user Optionally specify the user of the file
    * @param {RegExp} searchTerm Specify a search term
    * @returns {Promise<IFileEntry>}
    */
    getFile(fileID: string, user?: string, searchTerm?: RegExp): Promise<users.IFileEntry>;
    /**
    * Renames a file
    * @param {string} file The file to rename
    * @param {string} name The new name of the file
    * @returns {Promise<IFileEntry>}
    */
    renameFile(file: users.IFileEntry, name: string): Promise<users.IFileEntry>;
    /**
    * Downloads the data from the cloud and sends it to the requester. This checks the request for encoding and
    * sets the appropriate headers if and when supported
    * @param {Request} request The request being made
    * @param {Response} response The response stream to return the data
    * @param {IFileEntry} file The file to download
    */
    downloadFile(request: express.Request, response: express.Response, file: users.IFileEntry): void;
    /**
    * Finds and downloads a file
    * @param {string} fileID The file ID of the file on the bucket
    * @returns {Promise<number>} Returns the number of results affected
    */
    updateStorage(user: string, value: users.IStorageStats): Promise<number>;
    /**
    * Creates the bucket manager singleton
    */
    static create(buckets: mongodb.Collection, files: mongodb.Collection, stats: mongodb.Collection, config: users.IConfig): BucketManager;
    /**
    * Gets the bucket singleton
    */
    static get: BucketManager;
}
