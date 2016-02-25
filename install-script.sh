#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

# Functiom that prints the latest stable version
version() {
  echo "0.1.45"
}

echo "Downloading latest version from github $(version)"

#download latest
wget https://github.com/MKHenson/webinate-users/archive/v$(version).zip
unzip -o "v$(version).zip" "webinate-users-$(version)/server/*"

# Moves the server folder to the current directory
cp -r webinate-users-$(version)/server/* .

# Remove webinate users temp folder
if [ -d "webinate-users-$(version)" ]; then
	rm webinate-users-$(version) -R
fi

rm "v$(version).zip"

# Copy the example config into config.json as long as it doesnt already exist
if [ ! -f "config.json" ]; then
	cp "example-config.json" "config.json"
fi

echo "Users successfully installed"
echo "Please run an NPM update and edit the config.json"
exit
} # this ensures the entire script is downloaded #