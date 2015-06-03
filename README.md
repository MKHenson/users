Webinate Users
===============

A small library providing utility methods for logging in and managing users. The application runs as a standalone 
server with a RESTful API that allows you to interact with the underlying functions. 

* Version 0.0.31

## Startup
To start the server, simply run the Main.js file using node or IO. You must pass the location of the config file as the 
first argument. The server uses mongoDB as its database engine - make sure this is running before you start the server.

    node Main.js "users.config"

Below is a breakdown of the config file. The file must be formatted as a valid JSON.

```
{
	/**
	* The domain or host of the site
	*/
	host: string;

	/**
	* The RESTful path of this service. Eg: "/api/users"
	*/
    restURL: string;

    /**
	* The URL to redirect to if the user attempts to activate their account
	*/
    accountRedirectURL: string;

    /**
	* The base URL sent to users emails for when their password is reset
	*/
    passwordResetURL: string;
    
    /**
	* The URL to redirect to when the password has been reset
	*/
    passwordRedirectURL: string;

	/**
	* The name of the collection for storing user details
	*/
	userCollection: string;

	/**
	* The name of the collection for storing session details
	*/
    sessionCollection: string;

    /**
	* An array of approved domains that can access this API. Eg ["webinate.net", "google.com"]
	*/
    approvedDomains: Array<string>;

	/**
	* The port number to use for regular HTTP.
	*/
	portHTTP: number;

	/**
	* The port number to use for SSL
	*/
	portHTTPS: number;
	
	/**
	* The port number to use for the database
	*/
	portDatabase: number;

	/**
	* If true, the API will try to secure its communications
	*/
	ssl: boolean;

	/**
	* The SSL key
	*/
	sslKey: string;

	/**
	* The SSL certificate authority
	*/
	sslCA: string;

	/**
	* The SSL certificate file path
	*/
	sslCert: string;

	/**
	* The SSL pass phrase (if in use)
	*/
	sslPassPhrase: string;

	/**
	* The name of the database to use
	*/
	databaseName: string;

	/*
	* If set, the session will be restricted to URLs underneath the given path.
	* By default the path is "/", which means that the same sessions will be shared across the entire domain.
	*/
	sessionPath?: string;

	/**  
	* If present, the cookie (and hence the session) will apply to the given domain, including any subdomains.
	* For example, on a request from foo.example.org, if the domain is set to '.example.org', then this session will persist across any subdomain of example.org.
	* By default, the domain is not set, and the session will only be visible to other requests that exactly match the domain.
	*/
	sessionDomain?: string;

	/**
	* A persistent connection is one that will last after the user closes the window and visits the site again (true).
	* A non-persistent that will forget the user once the window is closed (false)
	*/
	sessionPersistent?: boolean;
	
	/**
	* The default length of user sessions in seconds
	*/
	sessionLifetime?: number;

	/**
	* The private key to use for Google captcha 
	* Get your key from the captcha admin: https://www.google.com/recaptcha/intro/index.html
	*/
	captchaPrivateKey: string;

	/**
	* The public key to use for Google captcha 
	* Get your key from the captcha admin: https://www.google.com/recaptcha/intro/index.html
	*/
	captchaPublicKey: string;
	
	/**
	* The email of the admin account
	*/
	emailAdmin: string;

	/**
	* The 'from' email when notifying users
	*/
	emailFrom: string;

	/**
	* Email service we are using to send mail. For example 'Gmail'
	*/
	emailService: string;

	/**
	* The email address / username of the service
	*/
	emailServiceUser: string;

	/**
	* The password of the email service
	*/
	emailServicePassword: string;

	/**
	* The administrative user
	*/
	adminUser: {
		username: string;
		email: string;
		password: string;
	}
}
```


## REST Functions
Below is a list of function calls you can make once the server is running. Each call returns a JSON 
object. Calls can be made from both a client browser or server, though some requests will require
the caller to be authenticated.



### Check if authenticated

    `/authenticated`

**Request Type: GET**

**Examples**
```
http://localhost:8000/api/authenticated

{
	message: "User is authenticated",
	authenticated: true,
	error: false,
	user: {
		_id: "554b3d19bbdc18481100fe0f",
		email: "test@test.net",
		lastLoggedIn: 1432130298681,
		password: "$2a$10$t9e1SDEUPLUyK3TnGV79Pes/GwIpHbSTShrbs77Kn5lVlCFk9p5nG",
		registerKey: "",
		sessionId: "",
		username: "test",
		privileges: 3,
		passwordTag: ""
	}
}
```



### Login

    `/login`

**Request Type: POST**

**Parameters**
* **username** - The username of the user
* **password** - The password of the user

**Examples**
```
http://localhost:8000/api/login

{
	message: "User is authenticated",
	authenticated: true,
	error: false
}
```




### Get Specific User
*You must be logged in to make this call*

    `/users/:username`

**Request Type: GET**

**Parameters**
* **verbose** - If true, sensitive data will not be obscured. This will only work for admin users.

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
*You must be logged in to make this call*

    `/users`

**Request Type: GET**

**Parameters**
* **index** - Specify the index to start the fetch from
* **limit** - Specify the number of entries to fetch
* **search** - Specify a term that either the email or username must contain
* **verbose** - If true, sensitive data will not be obscured

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