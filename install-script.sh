#!/bin/bash -e
{ # this ensures the entire script is downloaded #

# Prints the latest stable version
nvm_latest_version() {
  echo "v0.0.1"
}

echo "hello world $(nvm_latest_version)"
exit
} # this ensures the entire script is downloaded #