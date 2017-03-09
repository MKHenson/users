var fs = require( 'fs' );

const files = [
    './readme.md',
    './install-script.sh',
    './test/package.json',
    './src/dist-files/package.json',
    './package.json'
];

/**
 * Goes through each of the main config files and increments
 * the version
 */
function bumpVersion( f ) {
    let fileStr = '';
    let version = '';

    if ( !fs.existsSync( './package.json' ) )
        throw new Error( `You dont seem to have a package json file. This is needed to identify the version.` );

    version = JSON.parse( fs.readFileSync( './package.json' ) ).version;
    const bumpedVersion = f( version );

    return Promise.all( files.map( function( file ) {
        return new Promise( function( resolve, reject ) {
            if ( !fs.existsSync( file ) )
                throw new Error( `File ${file} does not exist` );

            fileStr = fs.readFileSync( file ).toString();
            const matchedVersion = fileStr.match( new RegExp( version, 'i' ) );
            if ( !matchedVersion || matchedVersion.length === 0 )
                throw new Error( `File ${file} does not have a consistent version number of '${version}'` );

            fileStr = fileStr.replace( version, bumpedVersion );
            fs.writeFileSync( file, fileStr );
        } );
    } ) );
}

/**
 * Increments a semvar version patch number
 * @param {string} version The version coming in. E.g. 1.0.1
 * @returns {string}
 */
function bumpPatchNum( version ) {
    const segments = version.split( '.' );
    const patch = parseInt( segments[ 2 ] ) + 1;
    return `${segments[ 0 ]}.${segments[ 1 ]}.${patch}`
};

/**
 * Increments a semvar version minor number
 * @param {string} version The version coming in. E.g. 1.0.1
 * @returns {string}
 */
function bumpMinorNum( version ) {
    const segments = version.split( '.' );
    const minor = parseInt( segments[ 1 ] ) + 1;
    return `${segments[ 0 ]}.${minor}.0`
};

/**
 * Increments a semvar version major number
 * @param {string} version The version coming in. E.g. 1.0.1
 * @returns {string}
 */
function bumpMajorNum( version ) {
    const segments = version.split( '.' );
    const major = parseInt( segments[ 0 ] ) + 1;
    return `${major}.0.0`
};

const type = process.argv[ 2 ];
console.log( "Starting bump process..." );
console.log( `Bumping [${type}]...` );

switch ( type ) {
    case 'patch':
        bumpVersion( bumpPatchNum );
        break;
    case 'minor':
        bumpVersion( bumpMinorNum );
        break;
    case 'major':
        bumpVersion( bumpMajorNum );
        break;
    default:
        console.error( `Type [${type}] not supported.` );
        break;
}