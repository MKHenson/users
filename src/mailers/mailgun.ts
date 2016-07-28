"use strict";

import * as fs from "fs";
import * as winston from "winston";
import * as def from "webinate-users";

/**
 * A simple class for sending mail using Google Mail's API
 */
export class Mailguner implements def.IMailer
{
    private _debugMode: boolean;
    private mailgun : MailGun.Instance;

    /**
     * Creates an instance of the mailer
     */
    constructor( debugMode : boolean )
    {
        this._debugMode = debugMode;
    }

    /**
     * Attempts to initialize the mailer
     * @param {IMailgun} options The mailgun options for this mailer
     * @returns {Promise<boolean>}
     */
    initialize(options: def.IMailgun ): Promise<boolean>
    {
        var that = this;
        return new Promise(function(resolve, reject) {
            that.mailgun = require("mailgun-js")({apiKey: options.apiKey, domain: options.domain});
        });
    }

    /**
     * Sends an email using mailgun
     * @param {stirng} to The email address to send the message to
     * @param {stirng} from The email we're sending from
     * @param {stirng} subject The message subject
     * @param {stirng} msg The message to be sent
     * @returns {Promise<boolean>}
     */
    sendMail( to : string, from : string, subject : string, msg : string ): Promise<boolean>
    {
        var that = this;
        return new Promise(function(resolve, reject) {

            winston.info(`Sending email to: ${to}`, { process: process.pid });

            if ( that._debugMode )
                return resolve(true);

            winston.info(`Sending: ${msg}`, { process: process.pid });

            // Send the message
            that.mailgun.messages().send({ from: from, subject: subject, text: msg, to : to }, function(err, response) {

                if (err) {
                     winston.error(`Could not send email to ${to}: ${err}`, { process: process.pid });
                     return reject(err);
                }

                winston.info(`Email sent ${JSON.stringify(response)} unmodified`, { process: process.pid });
                return resolve(true);
            });
        });
    }
}