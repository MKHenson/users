var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Controller_1 = require("./Controller");
var BucketManager_1 = require("../BucketManager");
/**
* Main class to use for managing users
*/
var BucketController = (function (_super) {
    __extends(BucketController, _super);
    /**
    * Creates an instance of the user manager
    * @param {mongodb.Collection} userCollection The mongo collection that stores the users
    * @param {mongodb.Collection} sessionCollection The mongo collection that stores the session data
    * @param {def.IConfig} The config options of this manager
    */
    function BucketController(e, config) {
        _super.call(this);
        this._config = config;
        //// Setup the rest calls
        //var router = express.Router();
        //router.use(bodyParser.urlencoded({ 'extended': true }));
        //router.use(bodyParser.json());
        //router.use(bodyParser.json({ type: 'application/vnd.api+json' }));
        //// Register the path
        //e.use(config.restURL, router);
    }
    /**
    * Called to initialize this controller and its related database objects
    * @returns {Promise<Controller>}
    */
    BucketController.prototype.initialize = function (db) {
        var that = this;
        return new Promise(function (resolve, reject) {
            Promise.all([
                that.createCollection(that._config.bucket.bucketsCollection, db),
                that.createCollection(that._config.bucket.filesCollection, db)
            ]).then(function (collections) {
                // Create the user manager
                that._bucketManager = BucketManager_1.BucketManager.create(collections[0], collections[1], that._config);
                // Initialization is finished
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    };
    return BucketController;
})(Controller_1.Controller);
exports.BucketController = BucketController;
