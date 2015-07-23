First install unitjs

	npm install unit.js

Make sure mocha is installed globally

	npm install -g mocha
	
Ensure that the server is running and a config.json file is located in the server folder (this is read in and the credentials are used)

Then run the tests

	mocha tests.js -R spec