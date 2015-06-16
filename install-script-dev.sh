#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

echo "Downloading latest version from github dev"

#download latest
wget https://github.com/MKHenson/webinate-users/archive/dev.zip
unzip -o -j "dev.zip" "webinate-users-dev/server/*"

rm "dev.zip"

if [ !-d "config.json" ]; then
	cp "example-config.json" "config.json"
fi

echo "Users successfully installed"
echo "Please run an NPM update and edit the config.json"
exit
} # this ensures the entire script is downloaded #