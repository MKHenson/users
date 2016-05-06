#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

# Functiom that prints the latest stable version
version() {
  echo "0.3.0"
}

echo "Downloading latest version from github $(version)"

#download latest
wget https://github.com/MKHenson/users/archive/v$(version).zip
unzip -o "v$(version).zip" "users-$(version)/dist/*"

# Moves the dist folder to the current directory
cp -r users-$(version)/dist/* .

# Remove users temp folder
if [ -d "users-$(version)" ]; then
	rm users-$(version) -R
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