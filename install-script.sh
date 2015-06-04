#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Stops the execution of a script if a command or pipeline has an error
set -e

# Functiom that prints the latest stable version
nvm_latest_version() {
  echo "v0.0.1"
}

echo "Downloading latest version from github $(nvm_latest_version)"

#download latest
wget https://github.com/MKHenson/webinate-users/archive/master.zip
unzip -j "master.zip" "webinate-users-master/server/*"
rm master.zip
echo "Users successfully installed"
exit
} # this ensures the entire script is downloaded #