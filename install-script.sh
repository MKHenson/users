#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

# Functiom that prints the latest stable version
nvm_latest_version() {
  echo "v0.0.33"
}

echo "Downloading latest version from github $(nvm_latest_version)"

#download latest
wget https://github.com/MKHenson/webinate-users/archive/master.zip
unzip -o -j "master.zip" "webinate-users-master/server/*"
if [ -d "node_modules" ]; then
	rm node_models -R
fi
rm master.zip

if [ !-d "config.json" ]; then
	cp "example-config.json" "config.json"
fi

echo "Users successfully installed"
echo "Please run an NPM update and edit the config.json"
exit
} # this ensures the entire script is downloaded #