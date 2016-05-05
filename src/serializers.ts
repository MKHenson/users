"use strict";

import express = require("express");
import * as http from "http";
import * as def from "webinate-users";
import * as winston from "winston";

/**
 * Helper function to return a status 200 json object of type T
 */
export function okJson<T extends def.IResponse>( data: T, res: express.Response )
{
    if (data.error)
        winston.error(data.message, { process: process.pid });

    res.setHeader('Content-Type', 'application/json');
    res.end( JSON.stringify( data ) );
}

/**
 * Helper function to return a status 200 json object of type T
 */
export function errJson( err: Error, res: express.Response )
{
    winston.error(err.message, { process: process.pid });
    res.setHeader('Content-Type', 'application/json');
    res.end( JSON.stringify( <def.IResponse>{ error : true, message: err.message } ) );
}