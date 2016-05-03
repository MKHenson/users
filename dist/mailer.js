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
var google = require("googleapis");
var googleAuth = require("google-auth-library");
var fs = require("fs");
var winston = require("winston");
/**
 * A simple class for sending mail using Google Mail's API
 */
class Mailer {
    /**
     * Creates an instance of the mailer
     */
    constructor(debugMode) {
        this._debugMode = debugMode;
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
    initialize(keyFilePath, apiEmail) {
        var that = this;
        return new Promise(function (resolve, reject) {
            that.gmail = google.gmail('v1');
            that._keyFile = JSON.parse(fs.readFileSync(keyFilePath, "utf8"));
            that._apiEmail = apiEmail;
            // Authorize a client with the loaded credentials
            that.authorize(that._keyFile)
                .then(function (data) {
                winston.info(`Connected to Google Authentication`, { process: process.pid });
                resolve(true);
            })
                .catch(function (err) {
                winston.error(`Could not authorize Google API: ${err.message}`, { process: process.pid });
                resolve(false);
            });
        });
    }
    /**
     * Attempts to authorize the google service account credentials
     * @returns {Promise<GoogleAuth.JWT>}
     */
    authorize(credentials) {
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
    }
    /**
     * Sends an email using Google's Gmail API
     * @param {stirng} to The email address to send the message to
     * @param {stirng} from The email we're sending from
     * @param {stirng} subject The message subject
     * @param {stirng} msg The message to be sent
     * @returns {Promise<boolean>}
     */
    sendMail(to, from, subject, msg) {
        var that = this;
        return new Promise(function (resolve, reject) {
            // Build the message string
            var message = that.buildMessage(to, from, subject, msg);
            if (that._debugMode)
                return resolve(true);
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
    }
    /**
     * Builds a message string in base64 encoding
     * @param {stirng} to The email address to send the message to
     * @param {stirng} from The email we're sending from
     * @param {stirng} subject The message subject
     * @param {stirng} message The message to be sent
     * @returns {string}
     */
    buildMessage(to, from, subject, message) {
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
    }
}
exports.Mailer = Mailer;
