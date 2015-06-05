Webinate Users
===============

A small library providing utility methods for logging in and managing users. The application runs as a standalone 
server with a RESTful API that allows you to interact with the underlying functions. Users requires NodeJS v.0.12.0 (or IO.js),
Node Package Manager (NPM) and a running instance of mongoDB

* Version 0.0.34

## Ubuntu Installation

Create a folder on your server with write permissions, then cd into that folder and run

	sudo curl -o- https://raw.githubusercontent.com/MKHenson/webinate-users/master/install-script.sh | bash
	
This will download the latest version of users. Then call npm update to load the dependencies.

	npm update

That should be it for the installation

## Startup
To start the server, simply run the Main.js file using node (at least v.0.12.0) or IO. 
You must pass the location of the config file as the first argument. 
The server uses mongoDB as its database engine - make sure this is running before you start the server.

    node Main.js "config.json"

The file must be formatted as a valid JSON. 
Please have a look at the (latest config definition)[https://github.com/MKHenson/webinate-users/blob/master/webinate-users.d.ts#L112] 
for details of what each parameter does.


## REST Functions
Below is a list of function calls you can make once the server is running. Each call returns a JSON 
object. Calls can be made from both a client browser or server, though some requests will require
the caller to be authenticated.



### Authenticated

Checks to see if a user is logged in. If the user is logged in, then their details will be sent back in the 'user' field.
By default the information of the user that is returned is obscured. You can turn this off
by adding the *verbose=true* query parameter. The verbose parameter will only be respected for admin users and if the
user making the call is the same as the user's details being requested.

    `/authenticated`

**Request Type: GET**

**Parameters**
* verbose - If true, sensitive data will not be obscured. This will only work for admin users.

**Examples**
```
http://localhost:8000/api/authenticated

{
	message: "User is authenticated",
	authenticated: true,
	error: false,
	user: {
		_id: "000000000000000000000000",
		email: "test@test.net",
		lastLoggedIn: 1432114922204,
		password: "***********************************************************",
		registerKey: "",
		sessionId: "**********",
		username: "test",
		privileges: 1,
		passwordTag: ""
	}
}
```

### Login

Attempts to log the user in with the provided credentials

    `/login`

**Request Type: POST**

**Parameters**
* username - The username of the user
* password - The password of the user

**Examples**
```
http://localhost:8000/api/login

{
	message: "User is authenticated",
	authenticated: true,
	error: false
}
```


### Logout

Attempts to log out the current user. This removes the user's session and they will have to login again to be authenticated.

    `/logout`

**Request Type: GET**

**Examples**
```
http://localhost:8000/api/logout

{
	message: "Successfully logged out",
	error: false
}
```


### Get Specific User

*You must be logged in to make this call.* 
Fetches a specific user from the database. By default the information returned is obscured. You can turn this off
by adding the *verbose=true* query parameter. The verbose parameter will only be respected for admin users and if the
user making the call is the same as the user's details being requested.

    `/users/:username`

**Request Type: GET**

**Parameters**
* verbose - If true, sensitive data will not be obscured. This will only work for admin users.

**Examples**
```
http://localhost:8000/api/users/test // Gets the user with the username test
http://localhost:8000/api/users/test?verbose=true // Gets the user with the username test and does not obscure the sensitive data

{
	error: false,
	message: "Found user test",
	data: {
		_id: "000000000000000000000000",
		email: "test@test.net",
		lastLoggedIn: 1432114922204,
		password: "***********************************************************",
		registerKey: "",
		sessionId: "**********",
		username: "test",
		privileges: 1,
		passwordTag: ""
	}
}
```



### Get Users
*You must be logged in to make this call.* By default the information returned is obscured. You can turn this off
by adding the *verbose=true* query parameter. The verbose parameter will only be respected for admin users. You
also narrow down the results with the other parameters listed below.

    `/users`

**Request Type: GET**

**Parameters**
* index - Specify the index to start the fetch from
* limit - Specify the number of entries to fetch
* search - Specify a term that either the email or username must contain. eg 'mat' will return users with the username or email containing the term 'mat'
* verbose - If true, sensitive data will not be obscured

**Example calls**
```
http://localhost:8000/api/users // Gets all users
http://localhost:8000/api/users?index=0&limit=4 // Gets up to 4 users from index 0
http://localhost:8000/api/users?search=test // Gets all users with the username or email containing 'test'
http://localhost:8000/api/users?search=test&limit=4 // Gets up to 4 users with the username or email containing 'test'
http://localhost:8000/api/users?search=test&limit=4&index=1 // Gets up to 4 users from index 1 whose username or email contains 'test'
http://localhost:8000/api/users?verbose=true // If verbose, sensitive data will not be obscured

{
	error: false,
	message: "Found 4 users",
	data: [ 
		0: {
			_id: "000000000000000000000000",
			email: "test@test.net",
			lastLoggedIn: 1432114922204,
			password: "***********************************************************",
			registerKey: "",
			sessionId: "**********",
			username: "test",
			privileges: 1,
			passwordTag: ""
		}
	]
}
```