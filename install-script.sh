#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

# Functiom that prints the latest stable version
version() {
  echo "0.3.3"
}

echo "Downloading latest version from github $(version)"

#download latest
wget https://github.com/Webinate/users/archive/v$(version).zip
unzip -o "v$(version).zip" "users-$(version)/*"

# Moves the dist folder to the current directory
cp -r users-$(version)/* .

# Remove users temp folder
if [ -d "users-$(version)" ]; then
	rm users-$(version) -R
fi

rm "v$(version).zip"

echo "Users successfully downloaded"
exit
} # this ensures the entire script is downloaded #