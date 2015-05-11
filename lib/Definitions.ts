import * as mongodb from "mongodb";

export interface IResponse
{
	message: string;
	error: boolean;
}

export interface IUserResponse extends IResponse
{
	authenticated: boolean;
}

export interface IGetResponse<T> extends IResponse
{
	data: Array<T>;
}

export interface IMessage
{
	name: string;
	email: string;
	message: string;
	phone?: string;
	website?: string;
}

export interface IUserAPILogin
{
	username: string;
	password: string;
	rememberMe: boolean;
}

export interface IUserAPIRegister
{
	username: string;
	password: string;
	email: string;
	captcha?: string;
	challenge?: string;
	privileges: number;
}

export interface IUserAPIActivationLink
{
	username: string;
}

/*
* Describes what kind of privileges the user has
*/
export enum UserPrivileges
{
	SuperAdmin = 1,
	Admin = 2,
	Regular = 3
}

/*
* An interface to describe the data stored in the database for users
*/
export interface IUserEntry
{
	_id?: mongodb.ObjectID;
	username?: string;
	email?: string;
	password?: string;
	registerKey?: string;
	sessionId?: string;
	lastLoggedIn?: number;
	privileges?: UserPrivileges;
}

/*
* Represents the details of the admin user
*/
export interface IAdminUser
{
	username: string;
	email: string;
	password: string;
}

/*
* Options for configuring the API
*/
export interface IConfig
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
	accountActivatedURL: string;

	/**
	* The name of the collection for storing user details
	*/
	userCollection: string;

	/**
	* The name of the collection for storing session details
	*/
	sessionCollection: string;

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
	adminUser: IAdminUser;
}
