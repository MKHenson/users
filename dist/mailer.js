var google = require("googleapis");
var googleAuth = require("google-auth-library");
var fs = require("fs");
var winston = require("winston");
/**
 * A simple class for sending mail using Google Mail's API
 */
var Mailer = (function () {
    /**
     * Creates an instance of the mailer
     */
    function Mailer() {
        this._scopes = [
            'https://mail.google.com/',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.send'
        ];
    }
    /**
     * Attempts to initialize the mailer
     * @param {string} keyFilePath The path to the Google API key file
     * @param {string} apiEmail The email address of the authorized email using the Gmail API
     * @returns {Promise<boolean>}
     */
    Mailer.prototype.initialize = function (keyFilePath, apiEmail) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.gmail = google.gmail('v1');
            that._keyFile = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
            that._apiEmail = apiEmail;
            // Authorize a client with the loaded credentials
            that.authorize(that._keyFile)
                .then(function (data) {
                winston.info("Connected to Google Authentication", { process: process.pid });
                resolve(true);
            })
                .catch(function (err) {
                winston.error("Could not authorize Google API: " + err.message, { process: process.pid });
                resolve(false);
            });
        });
    };
    /**
     * Attempts to authorize the google service account credentials
     * @returns {Promise<GoogleAuth.JWT>}
     */
    Mailer.prototype.authorize = function (credentials) {
        var that = this;
        return new Promise(function (resolve, reject) {
            var auth = new googleAuth();
            var jwt = new auth.JWT(credentials.client_email, null, credentials.private_key, that._scopes, that._apiEmail);
            jwt.authorize(function (err, result) {
                if (err)
                    return reject(err);
                that._authorizer = jwt;
                resolve(jwt);
            });
        });
    };
    /**
     * Sends an email using Google's Gmail API
     * @param {stirng} to The email address to send the message to
     * @param {stirng} from The email we're sending from
     * @param {stirng} subject The message subject
     * @param {stirng} message The message to be sent
     * @returns {Promise<boolean>}
     */
    Mailer.prototype.sendMail = function (to, from, subject, message) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Build the message string
            var message = that.buildMessage(to, from, subject, message);
            // Send the message
            that.gmail.users.messages.send({
                auth: that._authorizer,
                userId: 'me',
                resource: { raw: message }
            }, function (err, response) {
                if (err)
                    return reject(err);
                resolve(true);
            });
        });
    };
    /**
     * Builds a message string in base64 encoding
     * @param {stirng} to The email address to send the message to
     * @param {stirng} from The email we're sending from
     * @param {stirng} subject The message subject
     * @param {stirng} message The message to be sent
     * @returns {string}
     */
    Mailer.prototype.buildMessage = function (to, from, subject, message) {
        var str = ["Content-Type: text/plain; charset=\"UTF-8\"\n",
            "MIME-Version: 1.0\n",
            "Content-Transfer-Encoding: 7bit\n",
            "to: ", to, "\n",
            "from: ", from, "\n",
            "subject: ", subject, "\n\n",
            message
        ].join('');
        // Encode the mail into base 64
        var encodedMail = new Buffer(str).toString("base64").replace(/\+/g, '-').replace(/\//g, '_');
        return encodedMail;
    };
    return Mailer;
})();
exports.Mailer = Mailer;
