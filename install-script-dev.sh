#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

echo "Downloading latest version from github dev"

#download latest
wget https://github.com/MKHenson/users/archive/dev.zip
unzip -o "dev.zip" "users-dev/dist/*"

# Moves the dist folder to the current directory
cp -r users-dev/dist/* .

# Remove modepress folder
if [ -d "users-dev" ]; then
	rm users-dev -R
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