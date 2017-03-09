const tslint = require( "tslint" );
const glob = require( "glob" );

function files( path, options = undefined ) {
    return new Promise( function( resolve, reject ) {

        // options is optional
        glob( path, options, function( err, files ) {
            // files is an array of filenames.
            // If the `nonull` option is set, and nothing
            // was found, then files is ["**/*.js"]
            // er is an error object or null.
            if ( err )
                return reject( err );
            else
                return resolve( files );
        } );
    } );
}

async function lint() {
    const filePaths = await files( './dist/**/*.js' );
    for ( const file of filePaths )
        console.log( `File: ${file}` )
}

lint();