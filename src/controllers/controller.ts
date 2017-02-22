'use strict';

import * as mongodb from 'mongodb';

/**
 * Base class for all controllers
 */
export abstract class Controller {
    constructor() {
    }

    /**
     * All controllers must successfully return a promise for its initialization phase.
     */
    async initialize( db: mongodb.Db ) {
        return;
    }
}

