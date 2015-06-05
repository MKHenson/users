var http = require("http");
var https = require("https");
var fs = require("fs");
var express = require("express");
var morgan = require("morgan");
var methodOverride = require("method-override");
var colors = require("webinate-colors");
var Controller_1 = require("./Controller");
// Create the express app
var app = express();
// Make sure the argument is there
if (process.argv.length < 3) {
    colors.log(colors.red("Error! No config file specified. Please start Users with the config file in the command line. Eg: node users.js ./config.js"));
    process.exit();
}
// Make sure the file exists
if (!fs.existsSync(process.argv[2])) {
    colors.log(colors.red("Could not locate the config file at '" + process.argv[2] + "'"));
    process.exit();
}
// Load the file
var jsonConfig = fs.readFileSync(process.argv[2], "utf8");
try {
    // Parse the config
    console.log("Parsing file config...");
    var config = JSON.parse(jsonConfig);
    // Start the config
    console.log("Adding controllers...");
    var ctrl = new Controller_1.default(app, config);
    ctrl.initialize().then(function () {
        // Use middlewares
        app.use(morgan('dev'));
        app.use(methodOverride());
        // Start node server.js 
        var httpServer = http.createServer(app);
        httpServer.listen(config.portHTTP);
        console.log("Listening on HTTP port " + config.portHTTP);
        // If we use SSL then start listening for that as well
        if (config.ssl) {
            if (config.sslIntermediate != "" && !fs.existsSync(config.sslIntermediate)) {
                colors.log(colors.red("Could not find sslIntermediate: '" + config.sslIntermediate + "'"));
                process.exit();
            }
            if (config.sslCert != "" && !fs.existsSync(config.sslCert)) {
                colors.log(colors.red("Could not find sslIntermediate: '" + config.sslCert + "'"));
                process.exit();
            }
            if (config.sslRoot != "" && !fs.existsSync(config.sslRoot)) {
                colors.log(colors.red("Could not find sslIntermediate: '" + config.sslRoot + "'"));
                process.exit();
            }
            if (config.sslKey != "" && !fs.existsSync(config.sslKey)) {
                colors.log(colors.red("Could not find sslIntermediate: '" + config.sslKey + "'"));
                process.exit();
            }
            var caChain = [fs.readFileSync(config.sslIntermediate), fs.readFileSync(config.sslRoot)];
            var privkey = config.sslKey ? fs.readFileSync(config.sslKey) : null;
            var theCert = config.sslCert ? fs.readFileSync(config.sslCert) : null;
            var port = config.portHTTPS ? config.portHTTPS : 443;
            console.log("Attempting to start SSL server...");
            var httpsServer = https.createServer({ key: privkey, cert: theCert, passphrase: config.sslPassPhrase, ca: caChain }, app);
            httpsServer.listen(port);
            console.log("Listening on HTTPS port " + port);
        }
        // Done!
        colors.log(colors.green("Users is up and running!"));
    }).catch(function (error) {
        colors.log(colors.red("There was an error initializing the controller '" + error.message + "'"));
        process.exit();
    });
}
catch (exp) {
    colors.log(colors.red("There was an error parsing the config file '" + exp.toString() + "'"));
    process.exit();
}
