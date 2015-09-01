///<reference path='./node.d.ts' />

declare module "ws" {
    var server: WS.Static;

    export = server;
}

//import {EventEmitter} from "events";
declare module WS
{
    export interface Static
    {
        /**
        * WebSocket implementation
        *
        * @constructor
        * @param {String} address Connection address.
        * @param {String|Array} protocols WebSocket protocols.
        * @param {Object} options Additional connection options.
        */
        (path: string, protocols?: string | Array<any>, options?: any): typeof WebSocket;

        Server: typeof Server;
    }

    /**
    * WebSocket implementation
    */
    export class WebSocket implements NodeJS.EventEmitter
    {
        /**
        * WebSocket implementation
        *
        * @constructor
        * @param {String} address Connection address.
        * @param {String|Array} protocols WebSocket protocols.
        * @param {Object} options Additional connection options.
        * @api public
        */
        constructor(path: string, protocols?: string | Array<any>, options?: any);

        /**
        * Gracefully closes the connection, after sending a description message to the server
        *
        * @param {Object} data to be sent to the server
        * @api public
        */
        close(code, data);

        /**
        * Pause the client stream
        */
        pause();

        /**
        * Sends a ping
        *
        * @param {Object} data to be sent to the server
        * @param {Object} Members - mask: boolean, binary: boolean
        * @param {boolean} dontFailWhenClosed indicates whether or not to throw if the connection isnt open
        * @api public
        */
        ping(data, options, dontFailWhenClosed);

        /**
        * Resume the client stream
        *
        * @api public
        */
        resume();

        /**
        * Sends a pong
        *
        * @param {Object} data to be sent to the server
        * @param {Object} Members - mask: boolean, binary: boolean
        * @param {boolean} dontFailWhenClosed indicates whether or not to throw if the connection isnt open
        * @api public
        */
        pong(data, options, dontFailWhenClosed);

        /**
        * Sends a piece of data
        *
        * @param {Object} data to be sent to the server
        * @param {Object} Members - mask: boolean, binary: boolean, compress: boolean
        * @param {function} Optional callback which is executed after the send completes
        * @api public
        */
        send(data, options, cb);

        /**
        * Streams data through calls to a user supplied function
        *
        * @param {Object} Members - mask: boolean, binary: boolean, compress: boolean
        * @param {function} 'function (error, send)' which is executed on successive ticks of which send is 'function (data, final)'.
        * @api public
        */
        stream(options, cb: (Error, send) => any);

        /**
        * Immediately shuts down the connection
        *
        * @api public
        */
        terminate();

        addListener(event: string, listener: Function): NodeJS.EventEmitter;
        on(event: string, listener: Function): NodeJS.EventEmitter;
        once(event: string, listener: Function): NodeJS.EventEmitter;
        removeListener(event: string, listener: Function): NodeJS.EventEmitter;
        removeAllListeners(event?: string): NodeJS.EventEmitter;
        setMaxListeners(n: number): void;
        listeners(event: string): Function[];
        emit(event: string, ...args: any[]): boolean;
    }

    /**
    * HyBi Sender implementation
    */
    export class Server implements NodeJS.EventEmitter
    {
        constructor(socket, extensions);

        /**
        * Sends a close instruction to the remote party.
        */
        close(code, data, mask, cb);

        /**
        * Sends a ping message to the remote party.
        */
        ping(data, options);

        /**
        * Sends a pong message to the remote party.
        */
        pong(data, options);

        /**
        * Sends text or binary data to the remote party.
        */
        send(data, options, cb);

        /**
        * Frames and sends a piece of data according to the HyBi WebSocket protocol.
        */
        frameAndSend(opcode, data, finalFragment, maskData, compressed, cb);

        /**
        * Execute message handler buffers
        */
        flush();

        addListener(event: string, listener: Function): NodeJS.EventEmitter;
        on(event: string, listener: Function): NodeJS.EventEmitter;
        once(event: string, listener: Function): NodeJS.EventEmitter;
        removeListener(event: string, listener: Function): NodeJS.EventEmitter;
        removeAllListeners(event?: string): NodeJS.EventEmitter;
        setMaxListeners(n: number): void;
        listeners(event: string): Function[];
        emit(event: string, ...args: any[]): boolean;
    }
}