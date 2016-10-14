'use strict';

import express = require( 'express' );
import * as def from 'webinate-users';
import { UserManager, UserPrivileges } from './users';

/**
 * Checks if the request has owner rights (admin/owner). If not, an error is sent back to the user
 */
export function ownerRights( req: def.AuthRequest, res: express.Response, next: Function ): any {
    const username = req.params.username || req.params.user;
    requestHasPermission( UserPrivileges.Admin, req, res, username ).then( function() {
        next();

    }).catch( function( error: Error ) {
        res.setHeader( 'Content-Type', 'application/json' );
        return res.end( JSON.stringify( <def.IResponse>{
            message: error.message,
            error: true
        }) );
    });
}

/**
 * Checks if the request has admin rights. If not, an error is sent back to the user
 */
export function adminRights( req: def.AuthRequest, res: express.Response, next: Function ): any {
    UserManager.get.loggedIn( <express.Request><Express.Request>req, res ).then( function( user ) {
        if ( !user )
            return res.end( JSON.stringify( <def.IResponse>{ message: 'You must be logged in to make this request', error: true }) );

        req._user = user;
        if ( user.dbEntry.privileges > UserPrivileges.Admin )
            return res.end( JSON.stringify( <def.IResponse>{ message: 'You don\'t have permission to make this request', error: true }) );
        else
            next();
    });
}

/**
 * Checks for session data and fetches the user. Does not throw an error if the user is not present.
 */
export function identifyUser( req: def.AuthRequest, res: express.Response, next: Function ): any {
    UserManager.get.loggedIn( <express.Request><Express.Request>req, res ).then( function() {
        req._user = null;
        next();

    }).catch( function() {
        next();
    });
}

/**
 * Checks for session data and fetches the user. Sends back an error if no user present
 */
export function requireUser( req: def.AuthRequest, res: express.Response, next: Function ): any {
    UserManager.get.loggedIn( <express.Request><Express.Request>req, res ).then( function( user ) {
        if ( !user ) {
            res.setHeader( 'Content-Type', 'application/json' );
            return res.end( JSON.stringify( <def.IResponse>{
                message: 'You must be logged in to make this request',
                error: true
            }) );
        }

        req._user = user;
        next();

    }).catch( function() {
        next();
    });
}

/**
 * Checks a user is logged in and has permission
 * @param level
 * @param req
 * @param res
 * @param existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
 * @param next
 */
export async function requestHasPermission( level: UserPrivileges, req: def.AuthRequest, res: express.Response, existingUser?: string ): Promise<boolean> {
    const user = await UserManager.get.loggedIn( <express.Request><Express.Request>req, res );

    if ( !user )
        throw new Error( 'You must be logged in to make this request' );

    if ( existingUser !== undefined ) {
        if ( ( user.dbEntry.email !== existingUser && user.dbEntry.username !== existingUser ) && user.dbEntry.privileges > level )
            throw new Error( 'You don\'t have permission to make this request' );
    }
    else if ( user.dbEntry.privileges > level )
        throw new Error( 'You don\'t have permission to make this request' );

    req._user = user;

    return true;
}