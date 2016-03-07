Setting Up with Google Developers
=================================
Users is built with both Google Storage and Gmail support. In order to use the upload and email features, you will need to have a Google Developers account.
Each registered user can potentially create and upload data to private storage buckets. There are limits on the amounts that can be uploaded as well as number of API calls.
Users also makes use of the Gmail API to send and recieve emails.

# Creating your application's google.keyFile file

## Setup Developers Account
Go to the developers site and create yourself an [account](https://developers.google.com/)

## Go to your console and enable the APISs
[Login](https://console.developers.google.com/home/dashboard) to the developer console.

Create a [new project](https://console.developers.google.com/projectselector/apis/library) or open and existing one

Click on the [Enable APIs and get credentials section](https://console.developers.google.com/apis/library). Specifically we make sure that the following APIs are enabled:

* Gmail API
* Google Cloud Storage
* Google Cloud Storage JSON API

## Setup credentials
While still in the console, click on the [Credentials section](https://console.developers.google.com/apis/credentials)

Click on the Create Credentials button and choose Service Account Key

    This is basically a server to server key so we don't have to ask for user validation as we will use our main Google dev account

In the service account drop down, select 'New service account'

Give is a useful name

For the key type, select JSON

Click Create

    This will download a private key JSON. This is the JSON we use in the users config file. Specifically for the setting: google.keyFile

Once the key is downloaded, move the key to a safe folder and update the config fiole the path to that file.

Now go back to the credentials screen.

Click on manage service accounts

You will see your new service account listed. Select the ... button at then end of the row corresponding to your account

Click Edit

Make sure the "Enable Google apps Domain-wide Delegation" checkbox is ticked

    This will tell Google that your service account should have access to all API's. However, a service account cannot by default access all API's
    as some have to be used as a registered Google user. For example, the storage API is now enabled however if you were to use the Gmail API, you would need to use it as a registered account.
    Because of this, we need to update our Google security settings to allow this new service to act on our behalf.

## Allow access to the service
Go to your Google admin screen and click on the security tab ([link](https://admin.google.com/AdminHome?fral=1#SecuritySettings:))

Click show more

Click advanced settings

Click Manage API client access

In the client name enter in the client_id. You can find the client_id in the JSON you downloaded earlier.

For the One ore More API Scopes, enter in the following:

    https://mail.google.com/, https://www.googleapis.com/auth/gmail.compose, https://www.googleapis.com/auth/gmail.modify, https://www.googleapis.com/auth/gmail.send

Allowing us, to compose, draft, read and send emails.

Click Authorize

## Update the config
Finally open up the config and change the google.mail.apiEmail property to be your Google developer account. This must be the same you have authorized the API service for mail.

You can also set the google.mail.from property to set the email of whom emails will be sent from (This can be different from the api email - preferably an alias).





