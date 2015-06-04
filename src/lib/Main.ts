﻿import * as http from "http";
import * as https from "https";
import * as fs from "fs";
import * as express from "express";
import * as morgan from "morgan";
import * as methodOverride from "method-override";

import {IConfig} from "./Definitions";
import * as colors from "webinate-colors";
import Controller from "./Controller";

// Create the express app
var app = express();

// Make sure the argument is there
if (process.argv.length < 3)
{
	colors.log(colors.red("Error! No config file specified. Please start Users with the config file in the command line. Eg: node users.js ./config.js"));
	process.exit();
}

// Make sure the file exists
if (!fs.existsSync(process.argv[2]))
{
	colors.log(colors.red(`Could not locate the config file at '${process.argv[2]}'`));
	process.exit();
}

// Load the file
var jsonConfig = fs.readFileSync(process.argv[2], "utf8")

try
{
	// Parse the config
	console.log(`Parsing file config...`);
	var config: IConfig = JSON.parse(jsonConfig);

	// Start the config
	console.log(`Adding controllers...`);
	var ctrl = new Controller(app, config);
	ctrl.initialize().then(function()
	{
		// Use middlewares
		app.use(morgan('dev'));
		app.use(methodOverride());
        
		// Start node server.js 
		var httpServer = http.createServer(app);
		httpServer.listen(config.portHTTP);
		console.log(`Listening on HTTP port ${config.portHTTP}`);

		// If we use SSL then start listening for that as well
		if (config.ssl)
		{
			console.log(`Attempting to start SSL server...`);
			var httpsServer = https.createServer({ key: config.sslKey, cert: config.sslCert, passphrase: config.sslPassPhrase, ca: config.sslCA }, app);
			httpsServer.listen(config.portHTTPS ? config.portHTTPS : 443);
			console.log(`Listening on HTTPS port ${config.portHTTPS}`);
		}

		// Done!
		colors.log(colors.green("Users is up and running!"));

	}).catch(function(error: Error)
	{
		colors.log(colors.red(`There was an error initializing the controller '${error.message}'`));
		process.exit();
	});
}
catch (exp)
{
	colors.log(colors.red(`There was an error parsing the config file '${exp.toString() }'`));
	process.exit();
}