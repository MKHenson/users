#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

echo "Downloading latest version from github dev"

#download latest
wget https://github.com/MKHenson/users/archive/dev.zip
unzip -o "dev.zip" "users-dev/*"

# Moves the dist folder to the current directory
cp -r users-dev/* .

# Remove modepress folder
if [ -d "users-dev" ]; then
	rm users-dev -R
fi

rm "dev.zip"

echo "Users successfully downloaded"
exit
} # this ensures the entire script is downloaded #