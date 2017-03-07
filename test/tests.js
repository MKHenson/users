const test = require( 'unit.js' );
const fs = require( 'fs' );
const ws = require( 'ws' );

// Load the file
const jsonConfig = fs.readFileSync( "../dist/config.json", "utf8" );
let config;

try {
    // Parse the config
    console.log( "Parsing file config..." );
    config = JSON.parse( jsonConfig );

}
catch ( exp ) {
    console.log( exp.toString() )
    process.exit();
}

let apiPrefix = "";
const agent = test.httpAgent( "http://" + config.host + ":" + config.portHTTP + apiPrefix );
let adminCookie = "";
let georgeCookie = "";
let george2Cookie = "";
let activation = "";
let fileId = "";
let publicURL = "";
let wsClient;

// A map of all web socket events
const socketEvents = {
    login: null,
    logout: null,
    activated: null,
    removed: null,
    fileUploaded: null,
    fileRemoved: null,
    bucketUploaded: null,
    bucketRemoved: null,
    metaRequest: null,
};

const numWSCalls = {
    login: 0,
    logout: 0,
    activated: 0,
    removed: 0,
    fileUploaded: 0,
    fileRemoved: 0,
    bucketUploaded: 0,
    bucketRemoved: 0,
    metaRequest: 0,
};

/**
 * This function catches all events from the web socket and stores them for later inspection
 */
function onWsEvent( data ) {

    const token = JSON.parse( data );

    if ( !token.type )
        throw new Error( "type does not exist on socket token" );

    switch ( token.type ) {
        case 'Login':
            socketEvents.login = token;
            numWSCalls.login++;
            break;
        case 'Logout':
            socketEvents.logout = token;
            numWSCalls.logout++;
            break;
        case 'Activated':
            socketEvents.activated = token;
            numWSCalls.activated++;
            break;
        case 'Removed':
            socketEvents.removed = token;
            numWSCalls.removed++;
            break;
        case 'FileUploaded':
            socketEvents.fileUploaded = token;
            numWSCalls.fileUploaded++;
            break;
        case 'FileRemoved':
            socketEvents.fileRemoved = token;
            numWSCalls.fileRemoved++;
            break;
        case 'BucketUploaded':
            socketEvents.bucketUploaded = token;
            numWSCalls.bucketUploaded++;
            break;
        case 'BucketRemoved':
            socketEvents.bucketRemoved = token;
            numWSCalls.bucketRemoved++;
            break;
        case 'MetaRequest':
            socketEvents.metaRequest = token;
            numWSCalls.metaRequest++;
            break;
    }
}

/** Empty listener to ensure the client isn't garbage collected */
function onSocketMessage( data, flags ) {
}


describe( 'Testing WS connectivity', function() {

    it( 'should not connect when the origin is not approved', function( done ) {

        const socketUrl = "ws://localhost:" + config.websocket.port;
        wsClient = new ws( socketUrl, { headers: { origin: "badhost" } } );

        // Opens a stream to the users socket events
        wsClient.on( 'close', function() {
            wsClient.close();
            return done();
        } );
    } )

    it( 'connected to the users socket API', function( done ) {

        const socketUrl = "ws://localhost:" + config.websocket.port;
        const options = { headers: { origin: "localhost" } };
        options.headers[ 'users-api-key' ] = config.websocket.socketApiKey;

        wsClient = new ws( socketUrl, options );

        // Opens a stream to the users socket events
        wsClient.on( 'open', function() {
            wsClient.on( 'message', onSocketMessage );
            return done();
        } );

        // Report if there are any errors
        wsClient.on( 'error', function( err ) {
            return done( err );
        } );
    } )
} )


describe( 'Hook WS API events', function() {

    it( 'hooked all relevant events to (onWsEvent) event handler', function( done ) {
        wsClient.on( 'message', onWsEvent );
        done();
    } );
} );


describe( 'Testing user API functions', function() {

    describe( 'Checking basic authentication', function() {
        it( 'should not be logged in', function( done ) {
            agent
                .get( '/auth/authenticated' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.bool( res.body.authenticated ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'Checking login with admin user', function() {

        it( 'did not log in with empty credentials', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "", password: "" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.bool( res.body.authenticated ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not log in with bad credentials', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "$%^\}{}\"&*[]@~�&$", password: "$%^&*�&@#`{}/\"�%\"$" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.bool( res.body.authenticated ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not log in with false credentials', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "GeorgeTheTwat", password: "FakePass" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.bool( res.body.authenticated ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not log in with a valid username but invalid password', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: config.adminUser.username, password: "FakePass" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.bool( res.body.authenticated ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    done();
                } );
        } ).timeout( 25000 )

        it( 'did log in with a valid username & valid password', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: config.adminUser.username, password: config.adminUser.password } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.bool( res.body.authenticated ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    adminCookie = res.headers[ "set-cookie" ][ 0 ].split( ";" )[ 0 ];
                    done();
                } );
        } ).timeout( 25000 )
    } )

    describe( 'Checking authentication with cookie', function() {
        it( 'should be logged in with hidden user details', function( done ) {
            agent
                .get( '/auth/authenticated' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.bool( res.body.authenticated ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "user" )
                    test.string( res.body.user._id )
                    test.value( res.body.user.email ).isUndefined()
                    test.number( res.body.user.lastLoggedIn ).isNotNaN()
                    test.number( res.body.user.createdOn ).isNotNaN()
                    test.value( res.body.user.password ).isUndefined()
                    test.value( res.body.user.registerKey ).isUndefined()
                    test.value( res.body.user.sessionId ).isUndefined()
                    test.string( res.body.user.username ).is( config.adminUser.username )
                    test.number( res.body.user.privileges ).is( 1 )
                    test.value( res.body.user.passwordTag ).isUndefined()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should be logged in with visible user details', function( done ) {
            agent
                .get( '/auth/authenticated?verbose=true' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.bool( res.body.authenticated ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "user" )
                    test.string( res.body.user._id )
                    test.string( res.body.user.email ).is( config.adminUser.email )
                    test.number( res.body.user.lastLoggedIn ).isNotNaN()
                    test.number( res.body.user.createdOn ).isNotNaN()
                    test.value( res.body.user.password )
                    test.value( res.body.user.registerKey )
                    test.value( res.body.user.sessionId )
                    test.string( res.body.user.username ).is( config.adminUser.username )
                    test.number( res.body.user.privileges ).is( 1 )
                    test.value( res.body.user.passwordTag )
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'Getting user data with admin cookie', function() {
        it( 'should get admin user without details', function( done ) {
            agent
                .get( '/users/' + config.adminUser.username ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "data" )
                    test.string( res.body.data._id )
                    test.value( res.body.data.email ).isUndefined()
                    test.number( res.body.data.lastLoggedIn ).isNotNaN()
                    test.value( res.body.data.password ).isUndefined()
                    test.value( res.body.data.registerKey ).isUndefined()
                    test.value( res.body.data.sessionId ).isUndefined()
                    test.string( res.body.data.username ).is( config.adminUser.username )
                    test.number( res.body.data.privileges ).is( 1 )
                    test.value( res.body.data.passwordTag ).isUndefined()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should get admin user with details', function( done ) {
            agent
                .get( '/users/' + config.adminUser.username + "?verbose=true" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "data" )
                    test.string( res.body.data._id )
                    test.string( res.body.data.email ).is( config.adminUser.email )
                    test.number( res.body.data.lastLoggedIn ).isNotNaN()
                    test.value( res.body.data.password )
                    test.value( res.body.data.registerKey )
                    test.value( res.body.data.sessionId )
                    test.string( res.body.data.username ).is( config.adminUser.username )
                    test.number( res.body.data.privileges ).is( 1 )
                    test.value( res.body.data.passwordTag )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should get admin user by email without details', function( done ) {
            agent
                .get( '/users/' + config.adminUser.email ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "data" )
                    test.string( res.body.data._id )
                    test.value( res.body.data.email ).isUndefined()
                    test.number( res.body.data.lastLoggedIn ).isNotNaN()
                    test.value( res.body.data.password ).isUndefined()
                    test.value( res.body.data.registerKey ).isUndefined()
                    test.value( res.body.data.sessionId ).isUndefined()
                    test.string( res.body.data.username ).is( config.adminUser.username )
                    test.number( res.body.data.privileges ).is( 1 )
                    test.value( res.body.data.passwordTag ).isUndefined()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should get admin user by email with details', function( done ) {
            agent
                .get( '/users/' + config.adminUser.email + "?verbose=true" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "data" )
                    test.string( res.body.data._id )
                    test.string( res.body.data.email ).is( config.adminUser.email )
                    test.number( res.body.data.lastLoggedIn ).isNotNaN()
                    test.value( res.body.data.password )
                    test.value( res.body.data.registerKey )
                    test.value( res.body.data.sessionId )
                    test.value( res.body.data.passwordTag )
                    test.string( res.body.data.username ).is( config.adminUser.username )
                    test.number( res.body.data.privileges ).is( 1 )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did set user meta data of myself', function( done ) {
            agent
                .post( "/users/" + config.adminUser.username + "/meta" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { value: { sister: "sam", brother: "mat" } } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "User's data has been updated" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did get user meta "sister"', function( done ) {
            agent
                .get( "/users/" + config.adminUser.username + "/meta/sister" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.body ).is( "sam" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did get user meta "brother"', function( done ) {
            agent
                .get( "/users/" + config.adminUser.username + "/meta/brother" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.body ).is( "mat" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did update user meta "brother" to john', function( done ) {
            agent
                .post( "/users/" + config.adminUser.username + "/meta/brother" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { value: "john" } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Value 'brother' has been updated" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did get user meta "brother" and its john', function( done ) {
            agent
                .get( "/users/" + config.adminUser.username + "/meta/brother" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.body ).is( "john" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did set clear all user data', function( done ) {
            agent
                .post( "/users/" + config.adminUser.username + "/meta" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "User's data has been updated" )
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'Logging out', function() {
        it( 'should log out', function( done ) {
            agent
                .get( '/auth/logout' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'Checking authentication with stale session', function() {
        it( 'should veryify logged out', function( done ) {
            agent
                .get( '/auth/authenticated' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.bool( res.body.authenticated ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'When not logged in', function() {
        it( 'should get no user with username', function( done ) {
            agent
                .get( '/users/' + config.adminUser.username ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.bool( res.body.error ).isTrue()
                    test.string( res.body.message ).is( "You must be logged in to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should get no user with email or verbose', function( done ) {
            agent
                .get( '/users/' + config.adminUser.email + "?verbose=true" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.bool( res.body.error ).isTrue()
                    test.string( res.body.message ).is( "You must be logged in to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should get no sessions', function( done ) {
            agent
                .get( '/sessions' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.bool( res.body.error ).isTrue()
                    test.string( res.body.message ).is( "You must be logged in to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not be able to create a new user', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "George", password: "Password", email: "george@webinate.net", privileges: 1 } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You must be logged in to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not be able to get user meta data', function( done ) {
            agent
                .get( '/users/' + config.adminUser.username + '/meta/datum' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You must be logged in to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

    } )

    describe( 'Registering as a new user', function() {
        it( 'should not register with blank credentials', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "", password: "" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Please enter a valid username" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not register with existing username', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: config.adminUser.username, password: "FakePass" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "That username or email is already in use; please choose another or login." )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not register with blank username', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "", password: "FakePass" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Please enter a valid username" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not register with blank password', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "sdfsdsdfsdfdf", password: "" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Password cannot be null or empty" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not register with bad characters', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "!\"�$%^^&&*()-=~#}{}", password: "!\"./<>;�$$%^&*()_+" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Please only use alpha numeric characters for your username" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not register with valid information but no email', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "George", password: "Password" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Email cannot be null or empty" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not register with valid information but invalid email', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "George", password: "Password", email: "bad_email" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Please use a valid email address" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'should not register with valid information, email & no captcha', function( done ) {
            agent
                .post( '/auth/register' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "George", password: "Password", email: "george@webinate.net" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Captcha cannot be null or empty" )
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'Create a new user when logged in as admin', function() {

        it( 'did log in with an admin username & valid password', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: config.adminUser.username, password: config.adminUser.password } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.bool( res.body.authenticated ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    adminCookie = res.headers[ "set-cookie" ][ 0 ].split( ";" )[ 0 ];
                    done();
                } );
        } ).timeout( 20000 )



        it( 'did not create a new user without a username', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "", password: "" } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Username cannot be empty" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user without a password', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "", email: "thisisatest@test.com" } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Password cannot be empty" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user with invalid characters', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "!\"�$%^&*()", password: "password" } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Username must be alphanumeric" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user without email', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password" } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Email cannot be empty" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user with invalid email', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password", email: "matmat" } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Email must be valid" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user with invalid privilege', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password", email: "matmat@yahoo.com", privileges: 4 } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Privilege type is unrecognised" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user with an existing username', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: config.adminUser.username, password: "password", email: "matmat@yahoo.com", privileges: 2 } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "A user with that name or email already exists" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user with an existing email', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password", email: config.adminUser.email, privileges: 2 } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "A user with that name or email already exists" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create user george with super admin privileges', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password", email: "thisisatest@test.com", privileges: 1 } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You cannot create a user with super admin permissions" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did create regular user george with valid details', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password", email: "thisisatest@test.com", privileges: 3 } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.body.message ).is( "User george has been created" )
                    done();
                } );
        } ).timeout( 16000 )

        it( 'should get george when searching all registered users', function( done ) {
            agent
                .get( '/users?search=george' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Found 1 users" )
                    test.bool( res.body.error ).isFalse()
                    test.value( res.body.data[ 0 ].password ).isUndefined()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did create another regular user george2 with valid details', function( done ) {
            agent
                .post( '/users' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george2", password: "password", email: "thisisatest2@test.com", privileges: 3 } )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.body.message ).is( "User george2 has been created" )
                    done();
                } );
        } ).timeout( 16000 )

        it( 'did create an activation key for george', function( done ) {
            agent
                .get( '/users/george?verbose=true' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body.data ).hasProperty( "registerKey" )
                    activation = res.body.data.registerKey
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did activate george2 through the admin', function( done ) {
            agent
                .put( '/auth/george2/approve-activation' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isFalse()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'admin did logout', function( done ) {
            agent
                .get( '/auth/logout' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', adminCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'Checking user login with activation code present', function() {

        it( 'did not log in with an activation code present', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.bool( res.body.authenticated ).isFalse()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Please authorise your account by clicking on the link that was sent to your email" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not resend an activation with an invalid user', function( done ) {
            agent
                .get( '/auth/NONUSER5/resend-activation' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "No user exists with the specified details" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did resend an activation email with a valid user', function( done ) {
            agent
                .get( '/auth/george/resend-activation' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isFalse()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "An activation link has been sent, please check your email for further instructions" )
                    done();
                } );
        } ).timeout( 16000 )

        it( 'did not activate with an invalid username', function( done ) {
            agent
                .get( '/auth/activate-account?user=NONUSER' ).set( 'Accept', 'application/json' ).expect( 302 )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.headers[ "location" ] ).contains( "error" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not activate with an valid username and no key', function( done ) {
            agent
                .get( '/auth/activate-account?user=george' ).set( 'Accept', 'application/json' ).expect( 302 )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.headers[ "location" ] ).contains( "error" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not activate with an valid username and invalid key', function( done ) {
            agent
                .get( '/auth/activate-account?user=george&key=123' ).set( 'Accept', 'application/json' ).expect( 302 )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.headers[ "location" ] ).contains( "error" )

                    // We need to get the new key - so we log in as admin, get the user details and then log out again
                    // Login as admin
                    agent
                        .post( '/auth/login' ).set( 'Accept', 'application/json' )
                        .send( { username: config.adminUser.username, password: config.adminUser.password } )
                        .end( function( err, res ) {
                            if ( err ) return done( err );
                            adminCookie = res.headers[ "set-cookie" ][ 0 ].split( ";" )[ 0 ];

                            // Get the new user register key
                            agent
                                .get( '/users/george?verbose=true' ).set( 'Accept', 'application/json' )
                                .set( 'Cookie', adminCookie )
                                .end( function( err, res ) {
                                    if ( err ) return done( err );
                                    activation = res.body.data.registerKey

                                    // Logout again
                                    agent
                                        .get( '/auth/logout' ).set( 'Accept', 'application/json' )
                                        .set( 'Cookie', adminCookie )
                                        .end( function( err, res ) {
                                            if ( err ) return done( err );

                                            // Finished
                                            done();
                                        } );
                                } );

                        } );
                } );

        } ).timeout( 30000 )

        it( 'did activate with a valid username and key', function( done ) {
            agent
                .get( '/auth/activate-account?user=george&key=' + activation ).set( 'Accept', 'application/json' ).expect( 302 )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.headers[ "location" ] ).contains( "success" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did log in with valid details and an activated account', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george", password: "password" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.bool( res.body.authenticated ).isNotFalse()
                    test.object( res.body ).hasProperty( "message" )
                    georgeCookie = res.headers[ "set-cookie" ][ 0 ].split( ";" )[ 0 ];
                    done();
                } );
        } )
    } ).timeout( 20000 )

    describe( 'Getting/Setting data when a regular user', function() {

        it( 'did not get details of the admin user (no permission)', function( done ) {
            agent
                .get( "/users/" + config.adminUser.username + "?verbose=true" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not get sessions (no permission)', function( done ) {
            agent
                .get( "/sessions" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not remove the admin user (no permission)', function( done ) {
            agent
                .delete( "/users/" + config.adminUser.username ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not approve activation (no permission)', function( done ) {
            agent
                .put( "/auth/" + config.adminUser.username + "/approve-activation" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create a new user (no permission)', function( done ) {
            agent
                .post( "/users" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did get user data of myself', function( done ) {
            agent
                .get( "/users/george?verbose=true" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "data" )
                    test.string( res.body.data._id )
                    test.string( res.body.data.email ).is( "thisisatest@test.com" )
                    test.number( res.body.data.lastLoggedIn ).isNotNaN()
                    test.value( res.body.data.password )
                    test.value( res.body.data.registerKey )
                    test.value( res.body.data.sessionId )
                    test.value( res.body.data.passwordTag )
                    test.string( res.body.data.username ).is( "george" )
                    test.number( res.body.data.privileges ).is( 3 )
                    done();
                } );
        } ).timeout( 20000 )
    } )
} )

describe( 'Testing WS API calls', function() {

    it( 'Cannot set meta data for unkown user', function( done ) {
        const onMessge = function( data ) {
            const response = JSON.parse( data );
            wsClient.removeListener( 'message', onMessge );
            test.string( response.error ).is( "Could not find user george3" )
            done();
        }

        wsClient.on( 'message', onMessge );
        wsClient.send( JSON.stringify( { type: "MetaRequest", val: { sister: "sam", brother: "mat" }, username: "george3" } ) );
    } );

    it( 'Can set meta data for user george', function( done ) {
        const onMessge = function( data ) {
            const response = JSON.parse( data );
            wsClient.removeListener( 'message', onMessge );
            test.string( response.val.sister ).is( "sam" )
            test.string( response.val.brother ).is( "mat" )
            done();
        }

        wsClient.on( 'message', onMessge );
        wsClient.send( JSON.stringify( { type: "MetaRequest", val: { sister: "sam", brother: "mat" }, username: "george" } ) );
    } );

    it( 'Can get meta data for user george', function( done ) {
        const onMessge = function( data ) {
            const response = JSON.parse( data );
            wsClient.removeListener( 'message', onMessge );
            test.string( response.val.sister ).is( "sam" )
            test.string( response.val.brother ).is( "mat" )
            done();
        }

        wsClient.on( 'message', onMessge );
        wsClient.send( JSON.stringify( { type: "MetaRequest", username: "george" } ) );
    } );

    it( 'Can set the meta property "brother" for user george', function( done ) {
        const onMessge = function( data ) {
            const response = JSON.parse( data );
            wsClient.removeListener( 'message', onMessge );
            test.string( response.val ).is( "George's brother" )
            done();
        }

        wsClient.on( 'message', onMessge );
        wsClient.send( JSON.stringify( { type: "MetaRequest", property: "brother", val: "George's brother", username: "george" } ) );
    } );

    it( 'Can get the meta property "brother" for user george', function( done ) {
        const onMessge = function( data ) {
            const response = JSON.parse( data );
            wsClient.removeListener( 'message', onMessge );
            test.string( response.val ).is( "George's brother" )
            done();
        }

        wsClient.on( 'message', onMessge );
        wsClient.send( JSON.stringify( { type: "MetaRequest", property: "brother", username: "george" } ) );
    } );
} )

describe( 'Checking media API', function() {

    describe( 'Getting/Setting data when a Regular user', function() {

        it( 'did not get stats for admin', function( done ) {
            agent
                .get( "/users/" + config.adminUser.username + "/get-stats" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not get buckets for admin', function( done ) {
            agent
                .get( "/users/" + config.adminUser.username + "/buckets" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create stats for admin', function( done ) {
            agent
                .post( "/create-stats/" + config.adminUser.username ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage calls for admin', function( done ) {
            agent
                .put( "/stats/storage-calls/" + config.adminUser.username + "/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage memory for admin', function( done ) {
            agent
                .put( "/stats/storage-memory/" + config.adminUser.username + "/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage allocated calls for admin', function( done ) {
            agent
                .put( "/stats/storage-allocated-calls/" + config.adminUser.username + "/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage allocated memory for admin', function( done ) {
            agent
                .put( "/stats/storage-allocated-memory/" + config.adminUser.username + "/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage calls for itself', function( done ) {
            agent
                .put( "/stats/storage-calls/george/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage memory for itself', function( done ) {
            agent
                .put( "/stats/storage-memory/george/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage allocated calls for itself', function( done ) {
            agent
                .put( "/stats/storage-allocated-calls/george/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not create storage allocated memory for itself', function( done ) {
            agent
                .put( "/stats/storage-allocated-memory/george/90000" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did get stats for itself', function( done ) {
            agent
                .get( "/users/george/get-stats" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.string( res.body.message ).is( "Successfully retrieved george's stats" )
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "data" )
                    test.object( res.body.data ).hasProperty( "_id" )
                    test.string( res.body.data.user ).is( "george" )
                    test.number( res.body.data.apiCallsAllocated ).is( 20000 )
                    test.number( res.body.data.memoryAllocated ).is( 500000000 )
                    test.number( res.body.data.apiCallsUsed ).is( 1 )
                    test.number( res.body.data.memoryUsed ).is( 0 )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did get buckets for itself', function( done ) {
            agent
                .get( "/users/george/buckets" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "count" )
                    test.object( res.body ).hasProperty( "data" )
                    test.number( res.body.count ).is( 1 )
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not get files for another user\'s bucket', function( done ) {
            agent
                .get( "/users/" + config.adminUser.username + "/buckets/BAD_ENTRY/files" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not get files for a non existant bucket', function( done ) {
            agent
                .get( "/users/george/buckets/test/files" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Could not find the bucket 'test'" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not create a bucket for another user', function( done ) {
            agent
                .post( "/users/" + config.adminUser.username + "/buckets/test" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "You don't have permission to make this request" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not create a bucket with bad characters', function( done ) {
            agent
                .post( "/users/george/buckets/�BAD!CHARS" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Please only use safe characters" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did create a new bucket called dinosaurs', function( done ) {
            agent
                .post( "/users/george/buckets/dinosaurs" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Bucket 'dinosaurs' created" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not create a bucket with the same name as an existing one', function( done ) {
            agent
                .post( "/users/george/buckets/dinosaurs" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "A Bucket with the name 'dinosaurs' has already been registered" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } )

        it( 'did create a bucket with a different name', function( done ) {
            agent
                .post( "/users/george/buckets/dinosaurs2" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Bucket 'dinosaurs2' created" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not delete any buckets when the name is wrong', function( done ) {
            agent
                .delete( "/buckets/dinosaurs3,dinosaurs4" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Removed [0] buckets" )
                    test.array( res.body.data ).isEmpty()
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } )

        it( 'did get the 2 buckets for george', function( done ) {
            agent
                .get( "/users/george/buckets" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Found [3] buckets" )
                    test.array( res.body.data ).hasLength( 3 )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not upload a file to a bucket that does not exist', function( done ) {
            agent
                .post( "/buckets/dinosaurs3/upload" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .attach( '"�$^&&', "file.png" )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "tokens" )
                    test.string( res.body.message ).is( "No bucket exists with the name 'dinosaurs3'" )
                    test.array( res.body.tokens ).hasLength( 0 )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did upload a file to dinosaurs', function( done ) {
            agent
                .post( "/buckets/dinosaurs/upload" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .attach( 'small-image', "file.png" )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "tokens" )
                    test.string( res.body.message ).is( "Upload complete. [1] Files have been saved." )
                    test.array( res.body.tokens ).hasLength( 1 )
                    test.string( res.body.tokens[ 0 ].field ).is( "small-image" )
                    test.string( res.body.tokens[ 0 ].filename ).is( "file.png" )
                    test.bool( res.body.tokens[ 0 ].error ).isNotTrue()
                    test.string( res.body.tokens[ 0 ].errorMsg ).is( "" )
                    test.object( res.body.tokens[ 0 ] ).hasProperty( "file" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not upload a file when the meta was invalid', function( done ) {
            agent
                .post( "/buckets/dinosaurs/upload" ).set( 'content-type', 'application/x-www-form-urlencoded' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .field( 'meta', 'BAD META' )
                .attach( 'small-image', "file.png" )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "tokens" )
                    test.string( res.body.message ).is( "Error: Meta data is not a valid JSON: SyntaxError: Unexpected token B in JSON at position 0" )
                    test.array( res.body.tokens ).hasLength( 0 )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not upload a file when the meta was invalid', function( done ) {
            agent
                .post( "/buckets/dinosaurs/upload" ).set( 'content-type', 'application/x-www-form-urlencoded' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .field( 'meta', '{ "meta" : "good" }' )
                .attach( 'small-image', "file.png" )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "tokens" )
                    test.string( res.body.message ).is( "Upload complete. [1] Files have been saved." )
                    test.array( res.body.tokens ).hasLength( 1 )
                    test.bool( res.body.error ).isFalse()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'fetched the files of the dinosaur bucket', function( done ) {
            agent
                .get( "/users/george/buckets/dinosaurs/files" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .attach( 'small-image', "file.png" )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "data" )
                    test.string( res.body.message ).is( "Found [2] files" )
                    test.array( res.body.data ).hasLength( 2 )
                    test.number( res.body.data[ 0 ].numDownloads ).is( 0 )
                    test.number( res.body.data[ 0 ].size ).is( 226 )
                    test.string( res.body.data[ 0 ].mimeType ).is( "image/png" )
                    test.string( res.body.data[ 0 ].user ).is( "george" )
                    test.object( res.body.data[ 0 ] ).hasProperty( "publicURL" )
                    test.bool( res.body.data[ 0 ].isPublic ).isTrue()
                    test.object( res.body.data[ 0 ] ).hasProperty( "identifier" )
                    test.object( res.body.data[ 0 ] ).hasProperty( "bucketId" )
                    test.object( res.body.data[ 0 ] ).hasProperty( "created" )
                    test.string( res.body.data[ 0 ].bucketName ).is( "dinosaurs" )
                    test.object( res.body.data[ 0 ] ).hasProperty( "_id" )

                    // Check the second files meta
                    test.object( res.body.data[ 1 ] ).hasProperty( "meta" )
                    test.string( res.body.data[ 1 ].meta.meta ).is( "good" )

                    fileId = res.body.data[ 0 ].identifier
                    publicURL = res.body.data[ 0 ].publicURL
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not make a non-file public', function( done ) {
            agent
                .put( "/files/123/make-public" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "File '123' does not exist" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } )

        it( 'did not make a non-file private', function( done ) {
            agent
                .put( "/files/123/make-private" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "File '123' does not exist" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } )

        it( 'did make a file public', function( done ) {
            agent
                .put( "/files/" + fileId + "/make-public" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "File is now public" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did download the file off the bucket', function( done ) {
            test.httpAgent( publicURL )
                .get( "" ).expect( 200 ).expect( 'content-type', /image/ )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    done();
                } );
        } )

        it( 'did make a file private', function( done ) {
            agent
                .put( "/files/" + fileId + "/make-private" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "File is now private" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'updated its stats accordingly', function( done ) {
            agent
                .get( "/users/george/get-stats" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.number( res.body.data.apiCallsUsed ).is( 9 )
                    test.number( res.body.data.memoryUsed ).is( 226 * 2 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did upload another file to dinosaurs2', function( done ) {
            agent
                .post( "/buckets/dinosaurs2/upload" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .attach( 'small-image', "file.png" )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "tokens" )
                    test.string( res.body.message ).is( "Upload complete. [1] Files have been saved." )
                    test.array( res.body.tokens ).hasLength( 1 )
                    test.string( res.body.tokens[ 0 ].field ).is( "small-image" )
                    test.string( res.body.tokens[ 0 ].filename ).is( "file.png" )
                    test.bool( res.body.tokens[ 0 ].error ).isNotTrue()
                    test.string( res.body.tokens[ 0 ].errorMsg ).is( "" )
                    test.object( res.body.tokens[ 0 ] ).hasProperty( "file" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'updated its stats with the 2nd upload accordingly', function( done ) {
            agent
                .get( "/users/george/get-stats" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.number( res.body.data.apiCallsUsed ).is( 10 )
                    test.number( res.body.data.memoryUsed ).is( 226 * 3 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not download a file with an invalid id anonomously', function( done ) {
            agent
                .get( "/files/123/download" ).set( 'Accept', 'application/json' ).expect( 404 )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did download an image file with a valid id anonomously', function( done ) {
            agent
                .get( "/files/" + fileId + "/download" ).expect( 200 ).expect( 'Content-Type', /image/ ).expect( 'Content-Length', "226" )
                .end( function( err, res ) {
                    //if (err) return done(err);
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did update the api calls to 5', function( done ) {
            agent
                .get( "/users/george/get-stats" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.number( res.body.data.apiCallsUsed ).is( 11 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did upload another file to dinosaurs2', function( done ) {
            agent
                .post( "/buckets/dinosaurs2/upload" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .attach( 'small-image', "file.png" )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.object( res.body ).hasProperty( "tokens" )
                    test.string( res.body.message ).is( "Upload complete. [1] Files have been saved." )
                    test.array( res.body.tokens ).hasLength( 1 )
                    test.string( res.body.tokens[ 0 ].field ).is( "small-image" )
                    test.string( res.body.tokens[ 0 ].filename ).is( "file.png" )
                    test.bool( res.body.tokens[ 0 ].error ).isNotTrue()
                    test.string( res.body.tokens[ 0 ].errorMsg ).is( "" )
                    test.object( res.body.tokens[ 0 ] ).hasProperty( "file" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'fetched the uploaded file Id of the dinosaur2 bucket', function( done ) {
            agent
                .get( "/users/george/buckets/dinosaurs2/files" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );
                    test.bool( res.body.error ).isNotTrue()
                    fileId = res.body.data[ 1 ].identifier
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not rename an incorrect file to testy', function( done ) {
            agent
                .put( "/files/123/rename-file" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .set( "contentType", 'application/json' )
                .send( { name: "testy" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "File '123' does not exist" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not rename a correct file with an empty name', function( done ) {
            agent
                .put( "/files/" + fileId + "/rename-file" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .set( "contentType", 'application/json' )
                .send( { name: "" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Please specify the new name of the file" )
                    test.bool( res.body.error ).isTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did rename a correct file to testy', function( done ) {
            agent
                .put( "/files/" + fileId + "/rename-file" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .set( "contentType", 'application/json' )
                .send( { name: "testy" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Renamed file to 'testy'" )
                    test.bool( res.body.error ).isNotTrue()
                    done()
                } );
        } ).timeout( 20000 )

        it( 'did not remove a file from dinosaurs2 with a bad id', function( done ) {
            agent
                .delete( "/files/123" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Removed [0] files" )
                    test.array( res.body.data ).hasLength( 0 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did remove a file from dinosaurs2 with a valid id', function( done ) {
            agent
                .delete( "/files/" + fileId ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Removed [1] files" )
                    test.array( res.body.data ).hasLength( 1 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'updated its stats to reflect a file was deleted', function( done ) {
            agent
                .get( "/users/george/get-stats" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.number( res.body.data.apiCallsUsed ).is( 14 )
                    test.number( res.body.data.memoryUsed ).is( 226 * 3 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did not remove a bucket with a bad name', function( done ) {
            agent
                .delete( "/buckets/123" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Removed [0] buckets" )
                    test.array( res.body.data ).hasLength( 0 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'did remove the bucket dinosaurs2', function( done ) {
            agent
                .delete( "/buckets/dinosaurs2" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.object( res.body ).hasProperty( "message" )
                    test.string( res.body.message ).is( "Removed [1] buckets" )
                    test.array( res.body.data ).hasLength( 1 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )

        it( 'updated its stats that both a file and bucket were deleted', function( done ) {
            agent
                .get( "/users/george/get-stats" ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .set( 'Cookie', georgeCookie )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.number( res.body.data.apiCallsUsed ).is( 16 )
                    test.number( res.body.data.memoryUsed ).is( 226 * 2 )
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )
    } )

    describe( 'Checking permission data for another regular user', function() {

        it( 'did log in with valid details for george2', function( done ) {
            agent
                .post( '/auth/login' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
                .send( { username: "george2", password: "password" } )
                .end( function( err, res ) {
                    if ( err ) return done( err );

                    test.bool( res.body.authenticated ).isNotFalse()
                    test.object( res.body ).hasProperty( "message" )
                    george2Cookie = res.headers[ "set-cookie" ][ 0 ].split( ";" )[ 0 ];
                    test.bool( res.body.error ).isNotTrue()
                    done();
                } );
        } ).timeout( 20000 )
    } )
} )

describe( 'Cleaning up', function() {

    it( 'We did log in as admin', function( done ) {
        // Login as admin
        agent
            .post( '/auth/login' ).set( 'Accept', 'application/json' )
            .send( { username: config.adminUser.username, password: config.adminUser.password } )
            .end( function( err, res ) {
                if ( err ) return done( err );
                adminCookie = res.headers[ "set-cookie" ][ 0 ].split( ";" )[ 0 ];
                done();
            } )
    } )

    it( 'did remove any users called george', function( done ) {
        agent
            .delete( '/users/george' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
            .set( 'Cookie', adminCookie )
            .end( function( err, res ) {
                if ( err ) return done( err );
                test.string( res.body.message ).is( "User george has been removed" )
                done();
            } );
    } ).timeout( 25000 )

    it( 'did remove any users called george2', function( done ) {
        agent
            .delete( '/users/george2' ).set( 'Accept', 'application/json' ).expect( 200 ).expect( 'Content-Type', /json/ )
            .set( 'Cookie', adminCookie )
            .end( function( err, res ) {
                if ( err ) return done( err );
                test.string( res.body.message ).is( "User george2 has been removed" )
                done();
            } );
    } ).timeout( 25000 )
} )

describe( 'Test WS API events are valid', function() {

    it( 'has valid user event properties', function( done ) {
        test.object( socketEvents.login ).hasProperty( 'username' );
        test.object( socketEvents.logout ).hasProperty( 'username' );
        test.object( socketEvents.activated ).hasProperty( 'username' );
        done();
    } );

    it( 'has valid fileAdded event properties', function( done ) {
        test.object( socketEvents.fileUploaded ).hasProperty( 'username' );
        test.object( socketEvents.fileUploaded ).hasProperty( 'file' );
        done();
    } );

    it( 'has valid fileRemoved event properties', function( done ) {
        test.object( socketEvents.fileRemoved ).hasProperty( 'file' );
        done();
    } );

    it( 'has valid bucket added event properties', function( done ) {

        test.object( socketEvents.bucketUploaded ).hasProperty( 'username' );
        test.object( socketEvents.bucketUploaded ).hasProperty( 'bucket' );
        test.string( socketEvents.bucketUploaded.bucket.name )
        test.string( socketEvents.bucketUploaded.bucket.identifier )
        test.string( socketEvents.bucketUploaded.bucket.user )
        test.number( socketEvents.bucketUploaded.bucket.created )
        test.number( socketEvents.bucketUploaded.bucket.memoryUsed )
        test.string( socketEvents.bucketUploaded.bucket._id )
        done();
    } );

    it( 'has valid bucket removed event properties', function( done ) {
        test.object( socketEvents.bucketRemoved ).hasProperty( 'bucket' );
        test.string( socketEvents.bucketRemoved.bucket.name )
        test.string( socketEvents.bucketRemoved.bucket.identifier )
        test.string( socketEvents.bucketRemoved.bucket.user )
        test.number( socketEvents.bucketRemoved.bucket.created )
        test.number( socketEvents.bucketRemoved.bucket.memoryUsed )
        test.string( socketEvents.bucketRemoved.bucket._id )
        done();
    } );

    it( 'has the correct number of events registered', function( done ) {
        test.number( numWSCalls.login ).is( 6 )
        test.number( numWSCalls.logout ).is( 3 )
        test.number( numWSCalls.activated ).is( 2 )
        test.number( numWSCalls.bucketRemoved ).is( 4 )
        test.number( numWSCalls.bucketUploaded ).is( 4 )
        test.number( numWSCalls.fileRemoved ).is( 5 )
        test.number( numWSCalls.fileUploaded ).is( 4 )
        test.number( numWSCalls.metaRequest ).is( 5 )
        test.number( numWSCalls.removed ).is( 2 )
        done();
    } );
} );

describe( 'Cleaning up socket', function() {

    it( 'closed the sockets', function( done ) {

        if ( wsClient ) {
            wsClient.removeListener( 'message', onSocketMessage );
            wsClient.close();
            wsClient = null;
            wsClient2 = null;
        }
        done();
    } )
} )












