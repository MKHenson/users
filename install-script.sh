#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

# Functiom that prints the latest stable version
version() {
  echo "0.0.40"
}

echo "Downloading latest version from github $(version)"

#download latest
wget https://github.com/MKHenson/webinate-users/archive/v$(version).zip
unzip -o -j "v$(version).zip" "webinate-users-$(version)/server/*"

rm "v$(version).zip"

if [ ! -d "config.json" ]; then
	cp "example-config.json" "config.json"
fi

echo "Users successfully installed"
echo "Please run an NPM update and edit the config.json"
exit
} # this ensures the entire script is downloaded #