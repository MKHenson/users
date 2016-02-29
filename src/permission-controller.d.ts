import express = require("express");
import * as def from "webinate-users";
import { UserPrivileges } from "./users";
export declare var secret: {
    key: string;
};
/**
* Checks if the request has owner rights (admin/owner). If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
export declare function ownerRights(req: def.AuthRequest, res: express.Response, next: Function): any;
/**
* Checks if the request has admin rights. If not, an error is sent back to the user
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
export declare function adminRights(req: def.AuthRequest, res: express.Response, next: Function): any;
/**
* Checks for session data and fetches the user. Sends back an error if no user present
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {Function} next
*/
export declare function identifyUser(req: def.AuthRequest, res: express.Response, next: Function): any;
/**
* Checks a user is logged in and has permission
* @param {def.UserPrivileges} level
* @param {def.AuthRequest} req
* @param {express.Response} res
* @param {string} existingUser [Optional] If specified this also checks if the authenticated user is the user making the request
* @param {Function} next
*/
export declare function requestHasPermission(level: UserPrivileges, req: def.AuthRequest, res: express.Response, existingUser?: string): Promise<boolean>;
