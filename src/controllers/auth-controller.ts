﻿'use strict';

import express = require( 'express' );
import bodyParser = require( 'body-parser' );
import * as def from 'webinate-users';
import * as mongodb from 'mongodb';
import { UserManager } from '../users';
import { ownerRights } from '../permission-controller';
import { Controller } from './controller'
import { okJson, errJson } from '../serializers';
import * as compression from 'compression';
import * as winston from 'winston';

/**
 * Main class to use for managing users
 */
export class AuthController extends Controller {
    private _userManager: UserManager;
    private _config: def.IConfig;

	/**
	 * Creates an instance of the user manager
	 * @param userCollection The mongo collection that stores the users
	 * @param sessionCollection The mongo collection that stores the session data
	 * @param The config options of this manager
	 */
    constructor( e: express.Express, config: def.IConfig ) {
        super();

        this._config = config;

        // Setup the rest calls
        const router = express.Router();
        router.use( compression() );
        router.use( bodyParser.urlencoded( { 'extended': true }) );
        router.use( bodyParser.json() );
        router.use( bodyParser.json( { type: 'application/vnd.api+json' }) );

        router.get( '/users/authenticated', this.authenticated.bind( this ) );
        router.get( '/users/logout', this.logout.bind( this ) );
        router.get( '/users/activate-account', this.activateAccount.bind( this ) );
        router.post( '/users/login', this.login.bind( this ) );
        router.post( '/users/register', this.register.bind( this ) );
        router.put( '/users/password-reset', this.passwordReset.bind( this ) );

        router.get( '/users/:user/resend-activation', this.resendActivation.bind( this ) );
        router.get( '/users/:user/request-password-reset', this.requestPasswordReset.bind( this ) );
        router.put( '/users/:user/approve-activation', <any>[ ownerRights, this.approveActivation.bind( this ) ] );

        // Register the path
        e.use( config.apiPrefix, router );
    }

	/**
	 * Called to initialize this controller and its related database objects
	 */
    async initialize( db: mongodb.Db ): Promise<void> {
        const collections = await Promise.all( [
            this.createCollection( this._config.userCollection, db )
        ] );

        const userCollection = collections[ 0 ];

        await Promise.all( [
            this.ensureIndex( userCollection, 'username' ),
            this.ensureIndex( userCollection, 'createdOn' ),
            this.ensureIndex( userCollection, 'lastLoggedIn' ),
        ] );
        return;
    }

	/**
	 * Activates the user's account
	 */
    private async activateAccount( req: express.Request, res: express.Response ) {
        const redirectURL = this._config.accountRedirectURL;

        try {
            // Check the user's activation and forward them onto the admin message page
            await this._userManager.checkActivation( req.query.user, req.query.key );
            res.redirect( `${redirectURL}?message=${encodeURIComponent( 'Your account has been activated!' )}&status=success&origin=${encodeURIComponent( req.query.origin )}` );

        } catch ( error ) {
            winston.error( error.toString(), { process: process.pid });
            res.redirect( `${redirectURL}?message=${encodeURIComponent( error.message )}&status=error&origin=${encodeURIComponent( req.query.origin )}` );
        };
    }

	/**
	 * Resends the activation link to the user
	 */
    private async resendActivation( req: express.Request, res: express.Response ) {
        try {
            const origin = encodeURIComponent( req.headers[ 'origin' ] || req.headers[ 'referer' ] );

            await this._userManager.resendActivation( req.params.user, origin );
            okJson<def.IResponse>( { error: false, message: 'An activation link has been sent, please check your email for further instructions' }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

    /**
	 * Resends the activation link to the user
	 */
    private async requestPasswordReset( req: express.Request, res: express.Response ) {
        try {
            const origin = encodeURIComponent( req.headers[ 'origin' ] || req.headers[ 'referer' ] );

            await this._userManager.requestPasswordReset( req.params.user, origin );

            okJson<def.IResponse>( { error: false, message: 'Instructions have been sent to your email on how to change your password' }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

    /**
	 * resets the password if the user has a valid password token
	 */
    private async passwordReset( req: express.Request, res: express.Response ) {
        try {
            if ( !req.body )
                throw new Error( 'Expecting body content and found none' );
            if ( !req.body.user )
                throw new Error( 'Please specify a user' );
            if ( !req.body.key )
                throw new Error( 'Please specify a key' );
            if ( !req.body.password )
                throw new Error( 'Please specify a password' );

            // Check the user's activation and forward them onto the admin message page
            await this._userManager.resetPassword( req.body.user, req.body.key, req.body.password );

            okJson<def.IResponse>( { error: false, message: 'Your password has been reset' }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

	/**
	 * Approves a user's activation code so they can login without email validation
	 */
    private async approveActivation( req: express.Request, res: express.Response ) {
        try {
            await this._userManager.approveActivation( req.params.user );
            okJson<def.IResponse>( { error: false, message: 'Activation code has been approved' }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

	/**
	 * Attempts to log the user in. Expects the username, password and rememberMe parameters be set.
	 */
    private async login( req: express.Request, res: express.Response ) {
        try {
            const token: def.ILoginToken = req.body;
            const user = await this._userManager.logIn( token.username, token.password, token.rememberMe, req, res );

            okJson<def.IAuthenticationResponse>( {
                message: ( user ? 'User is authenticated' : 'User is not authenticated' ),
                authenticated: ( user ? true : false ),
                user: ( user ? user.generateCleanedData( Boolean( req.query.verbose ) ) : {}),
                error: false
            }, res );

        } catch ( err ) {

            okJson<def.IAuthenticationResponse>( {
                message: err.message,
                authenticated: false,
                error: true
            }, res );
        };
    }

	/**
	 * Attempts to log the user out
	 */
    private async logout( req: express.Request, res: express.Response ) {
        try {
            await this._userManager.logOut( req, res );
            okJson<def.IResponse>( { error: false, message: 'Successfully logged out' }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

	/**
	 * Attempts to register a new user
	 */
    private async register( req: express.Request, res: express.Response ) {
        try {
            const token: def.IRegisterToken = req.body;
            const user = await this._userManager.register( token.username!, token.password!, token.email!, token.captcha!, {}, req );

            return okJson<def.IAuthenticationResponse>( {
                message: ( user ? 'Please activate your account with the link sent to your email address' : 'User is not authenticated' ),
                authenticated: ( user ? true : false ),
                user: ( user ? user.generateCleanedData( Boolean( req.query.verbose ) ) : {}),
                error: false
            }, res );

        } catch ( err ) {
            return errJson( err, res );
        };
    }

	/**
	 * Checks to see if the current session is logged in. If the user is, it will be returned redacted. You can specify the 'verbose' query parameter
	 */
    private async authenticated( req: express.Request, res: express.Response ) {
        try {
            const user = await this._userManager.loggedIn( req, res );
            return okJson<def.IAuthenticationResponse>( {
                message: ( user ? 'User is authenticated' : 'User is not authenticated' ),
                authenticated: ( user ? true : false ),
                error: false,
                user: ( user ? user.generateCleanedData( Boolean( req.query.verbose ) ) : {})
            }, res );

        } catch ( error ) {
            return okJson<def.IAuthenticationResponse>( {
                message: error.message,
                authenticated: false,
                error: true
            }, res );
        };
    }
}