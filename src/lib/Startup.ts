import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as express from "express";
import * as morgan from "morgan";
import * as methodOverride from "method-override";

import {IConfig} from "./Definitions";
import * as winston from "winston";
import Controller from "./Controller";
import * as yargs from "yargs";

var arguments = yargs.argv;

// Saves logs to file
if (arguments.logFile && arguments.logFile.trim() != "")
    winston.add(winston.transports.File, { filename: arguments.logFile, maxsize: 50000000, maxFiles: 1, tailable: true });

// If no logging - remove all transports
if (arguments.logging && arguments.logging.toLowerCase().trim() == "false")
{
    winston.remove(winston.transports.File);
    winston.remove(winston.transports.Console);
}

// Create the express app
var app = express();

// Make sure the argument is there
if (!arguments.config || arguments.config.trim() == "")
{
    winston.error("Error! No config file specified. Please start Users with the config file in the command line. Eg: node users.js --config=\"./config.js\"", { process: process.pid });
    process.exit();
}

// Make sure the file exists
if (!fs.existsSync(arguments.config))
{
    winston.error(`Could not locate the config file at '${arguments.config}'`, { process: process.pid });
    process.exit();
}

// Load the file
var jsonConfig = fs.readFileSync(arguments.config, "utf8")

try
{
    // Parse the config
    console.log(`Parsing file config...`);
    var config: IConfig = JSON.parse(jsonConfig);

    // Start the config
    console.log(`Adding controllers...`);
    var ctrl = new Controller(app, config);
    ctrl.initialize().then(function ()
    {
        // Use middlewares
        app.use(morgan('dev'));
        app.use(methodOverride());
        
        // Start node server.js 
        var httpServer = http.createServer(app);
        httpServer.listen(config.portHTTP);
        winston.info(`Listening on HTTP port ${config.portHTTP}`, { process: process.pid });

        // If we use SSL then start listening for that as well
        if (config.ssl)
        {
            if (config.sslIntermediate != "" && !fs.existsSync(config.sslIntermediate))
            {
                winston.error(`Could not find sslIntermediate: '${config.sslIntermediate}'`, { process: process.pid });
                process.exit();
            }

            if (config.sslCert != "" && !fs.existsSync(config.sslCert))
            {
                winston.error(`Could not find sslIntermediate: '${config.sslCert}'`, { process: process.pid });
                process.exit();
            }

            if (config.sslRoot != "" && !fs.existsSync(config.sslRoot))
            {
                winston.error(`Could not find sslIntermediate: '${config.sslRoot}'`, { process: process.pid });
                process.exit();
            }

            if (config.sslKey != "" && !fs.existsSync(config.sslKey))
            {
                winston.error(`Could not find sslIntermediate: '${config.sslKey}'`, { process: process.pid });
                process.exit();
            }

            var caChain = [fs.readFileSync(config.sslIntermediate), fs.readFileSync(config.sslRoot)];
            var privkey = config.sslKey ? fs.readFileSync(config.sslKey) : null;
            var theCert = config.sslCert ? fs.readFileSync(config.sslCert) : null;
            var port = config.portHTTPS ? config.portHTTPS : 443;

            winston.info(`Attempting to start SSL server...`, { process: process.pid });

            var httpsServer = https.createServer({ key: privkey, cert: theCert, passphrase: config.sslPassPhrase, ca: caChain }, app);
            httpsServer.listen(port);

            winston.info(`Listening on HTTPS port ${port}`, { process: process.pid });
        }

        // Done!
        winston.info("Users is up and running!", { process: process.pid });

    }).catch(function (error: Error)
    {
        winston.error(`There was an error initializing the controller '${error.message}'`, { process: process.pid }, function ()
        {
            process.exit();
        });
    });
}
catch (exp)
{
    winston.error(`There was an error parsing the config file '${exp.toString() }'`, { process: process.pid }, function ()
    {
        process.exit();
    });
}