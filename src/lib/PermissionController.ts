import express = require("express");
import bodyParser = require('body-parser');

// NEW ES6 METHOD
import * as http from "http";
import * as def from "./Definitions";
import {UserManager, User} from "./Users";


/**
* Checks if the request has admin rights. If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
export function hasAdminRights(req: def.AuthRequest, res: express.Response, next: Function): any
{
    var username = req.params.username || req.params["user"];
    requestHasPermission(def.UserPrivileges.Admin, req, res, username).then(function (user)
    {
        next();

    }).catch(function (error: Error)
    {
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify(<def.IResponse>{
            message: error.message,
            error: true
        }));
    });
}

/**
* Checks for session data and fetches the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
export function identifyUser(req: def.AuthRequest, res: express.Response, next: Function): any
{
    UserManager.get.loggedIn(req, res).then(function (user)
    {
        req._user = user;
        next();

    }).catch(function (error: Error)
    {
        next();
    });
}

/**
* Checks a user is logged in and has permission
* @param {def.UserPrivileges} level
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {string} existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
* @param {Function} next
*/
export function requestHasPermission(level: def.UserPrivileges, req: def.AuthRequest, res: express.Response, existingUser?: string): Promise<boolean>
{
    return new Promise(function (resolve, reject)
    {
        UserManager.get.loggedIn(req, res).then(function (user)
        {
            if (!user)
                return reject(new Error("You must be logged in to make this request"));

            if (existingUser !== undefined)
            {
                if ((user.dbEntry.email != existingUser && user.dbEntry.username != existingUser) && user.dbEntry.privileges > level)
                    return reject(new Error("You don't have permission to make this request"));
            }
            else if (user.dbEntry.privileges > level)
                return reject(new Error("You don't have permission to make this request"));

            req._user = user;

            resolve(true);

        })
    })
}