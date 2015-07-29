#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

echo "Downloading latest version from github dev"

#download latest
wget https://github.com/MKHenson/webinate-users/archive/dev.zip
unzip -o "dev.zip" "webinate-users-dev/server/*"

# Moves the server folder to the current directory
cp -r webinate-users-dev/server/* .

# Remove modepress folder
if [ -d "webinate-users-dev" ]; then
	rm webinate-users-dev -R
fi

rm "dev.zip"

# Copy the example config into config.json as long as it doesnt already exist
if [ ! -f "config.json" ]; then
	cp "example-config.json" "config.json"
fi

echo "Users successfully installed"
echo "Please run an NPM update and edit the config.json"
exit
} # this ensures the entire script is downloaded #