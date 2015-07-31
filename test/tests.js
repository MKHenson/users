var test = require('unit.js');
var fs = require('fs');


// Load the file
var jsonConfig = fs.readFileSync("../server/config.json", "utf8")
try
{
    // Parse the config
    console.log("Parsing file config...");
    var config = JSON.parse(jsonConfig);
	
}
catch (exp)
{
	console.log(exp.toString())
	process.exit();
}

var agent = test.httpAgent("http://"+ config.host +":" + config.portHTTP);
var sessionCookie = "";
var sessionCookie2 = "";
var activation = "";
var fileId = "";
var publicURL = "";

describe('Testing user API functions', function(){
	
	describe('Checking basic authentication', function(){	
		it('should not be logged in', function(done){
			agent
				.get('/users/authenticated').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		})
	})
	
	describe('Checking login with admin user', function(){	
	
		it('did not log in with empty credentials', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username:"", password:""})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.bool(res.body.authenticated).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		})
		
		it('did not log in with bad credentials', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username:"$%^\}{}\"&*[]@~£&$", password:"$%^&*£&@#`{}/\"£%\"$"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.bool(res.body.authenticated).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		})
		
		it('did not log in with false credentials', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username:"GeorgeTheTwat", password:"FakePass"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.bool(res.body.authenticated).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		})
		
		it('did not log in with a valid username but invalid password', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: config.adminUser.username, password:"FakePass"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.bool(res.body.authenticated).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		})
				
		it('did log in with a valid username & valid password', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: config.adminUser.username, password: config.adminUser.password })
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isTrue()
					test.object(res.body).hasProperty("message")
					sessionCookie = res.headers["set-cookie"][0].split(";")[0];
					done();
				});
		})
	})
	
	describe('Checking authentication with cookie', function(){	
		it('should be logged in with hidden user details', function(done){
			agent
				.get('/users/authenticated').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("user")
					test.string(res.body.user._id).contains("00000000")
					test.string(res.body.user.email).is(config.adminUser.email)
					test.number(res.body.user.lastLoggedIn).isNotNaN()
					test.number(res.body.user.createdOn).isNotNaN()
					test.string(res.body.user.password).is("***********************************************************")
					test.object(res.body.user).hasProperty("registerKey")
					test.string(res.body.user.sessionId).is("**********")
					test.string(res.body.user.username).is(config.adminUser.username)
					test.number(res.body.user.privileges).is(1)
					test.object(res.body.user).hasProperty("passwordTag")					
					done();
				});
		})
		
		it('should be logged in with visible user details', function(done){
			agent
				.get('/users/authenticated?verbose=true').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("user")
					test.string(res.body.user._id).isNot("000000000000000000000000")
					test.string(res.body.user.email).is(config.adminUser.email)
					test.number(res.body.user.lastLoggedIn).isNotNaN()
					test.number(res.body.user.createdOn).isNotNaN()
					test.string(res.body.user.password).isNot("***********************************************************")
					test.object(res.body.user).hasProperty("registerKey")
					test.string(res.body.user.sessionId).isNot("**********")
					test.string(res.body.user.username).is(config.adminUser.username)
					test.number(res.body.user.privileges).is(1)
					test.object(res.body.user).hasProperty("passwordTag")					
					done();
				});
		})
	})
	
	describe('Getting user data with admin cookie', function(){	
		it('should get admin user without details', function(done){
			agent
				.get('/users/users/' + config.adminUser.username).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.string(res.body.data._id).contains("00000000")
					test.string(res.body.data.email).is(config.adminUser.email)
					test.number(res.body.data.lastLoggedIn).isNotNaN()
					test.string(res.body.data.password).is("***********************************************************")
					test.object(res.body.data).hasProperty("registerKey")
					test.string(res.body.data.sessionId).is("**********")
					test.string(res.body.data.username).is(config.adminUser.username)
					test.number(res.body.data.privileges).is(1)
					test.object(res.body.data).hasProperty("passwordTag")					
					done();
				});
		})
		
		it('should get admin user with details', function(done){
			agent
				.get('/users/users/' + config.adminUser.username + "?verbose=true").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.string(res.body.data._id).isNot("000000000000000000000000")
					test.string(res.body.data.email).is(config.adminUser.email)
					test.number(res.body.data.lastLoggedIn).isNotNaN()
					test.string(res.body.data.password).isNot("***********************************************************")
					test.object(res.body.data).hasProperty("registerKey")
					test.string(res.body.data.sessionId).isNot("**********")
					test.string(res.body.data.username).is(config.adminUser.username)
					test.number(res.body.data.privileges).is(1)
					test.object(res.body.data).hasProperty("passwordTag")					
					done();
				});
		})
		
		it('should get admin user by email without details', function(done){
			agent
				.get('/users/users/' + config.adminUser.email).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.string(res.body.data._id).contains("00000000")
					test.string(res.body.data.email).is(config.adminUser.email)
					test.number(res.body.data.lastLoggedIn).isNotNaN()
					test.string(res.body.data.password).is("***********************************************************")
					test.object(res.body.data).hasProperty("registerKey")
					test.string(res.body.data.sessionId).is("**********")
					test.string(res.body.data.username).is(config.adminUser.username)
					test.number(res.body.data.privileges).is(1)
					test.object(res.body.data).hasProperty("passwordTag")					
					done();
				});
		})
		
		it('should get admin user by email with details', function(done){
			agent
				.get('/users/users/' + config.adminUser.email + "?verbose=true").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.string(res.body.data._id).isNot("000000000000000000000000")
					test.string(res.body.data.email).is(config.adminUser.email)
					test.number(res.body.data.lastLoggedIn).isNotNaN()
					test.string(res.body.data.password).isNot("***********************************************************")
					test.object(res.body.data).hasProperty("registerKey")
					test.string(res.body.data.sessionId).isNot("**********")
					test.string(res.body.data.username).is(config.adminUser.username)
					test.number(res.body.data.privileges).is(1)
					test.object(res.body.data).hasProperty("passwordTag")					
					done();
				});
		})
	})
	
	describe('Logging out', function(){	
		it('should log out', function(done){
			agent
				.get('/users/logout').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		})
	})
	
	describe('Checking authentication with stale session', function(){	
		it('should veryify logged out', function(done){
			agent
				.get('/users/authenticated').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		})
	})
	
	describe('When not logged in', function(){	
		it('should get no user with username', function(done){
			agent
				.get('/users/users/' + config.adminUser.username).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					test.object(res.body).hasProperty("message")
					test.bool(res.body.error).isTrue()
					test.string(res.body.message).is("You must be logged in to make this request")
					done();
				});
		})
		it('should get no user with email or verbose', function(done){
			agent
				.get('/users/users/' + config.adminUser.email + "?verbose=true").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					test.object(res.body).hasProperty("message")
					test.bool(res.body.error).isTrue()
					test.string(res.body.message).is("You must be logged in to make this request")
					done();
				});
		})
		it('should get no group of users', function(done){
			agent
				.get('/users/users').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					test.object(res.body).hasProperty("message")
					test.bool(res.body.error).isTrue()
					test.string(res.body.message).is("You must be logged in to make this request")
					done();
				});
		})
		it('should get no sessions', function(done){
			agent
				.get('/users/sessions').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					test.object(res.body).hasProperty("message")
					test.bool(res.body.error).isTrue()
					test.string(res.body.message).is("You must be logged in to make this request")
					done();
				});
		})
		it('should not be able to create a new user', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "George", password:"Password", email:"george@webinate.net", email:"george@webinate.net", privileges: 1})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You must be logged in to make this request")
					done();
				});
		})
	})
	
	describe('Registering as a new user', function(){	
		it('should not register with blank credentials', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "", password:""})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Please enter a valid username")
					done();
				});
		})
		it('should not register with existing username', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: config.adminUser.username, password:"FakePass"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("That username or email is already in use; please choose another or login.")
					done();
				});
		})
		it('should not register with blank username', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "", password:"FakePass"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Please enter a valid username")
					done();
				});
		})
		it('should not register with blank password', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "sdfsdsdfsdfdf", password:""})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Password cannot be null or empty")
					done();
				});
		})
		it('should not register with bad characters', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "!\"£$%^^&&*()-=~#}{}", password:"!\"./<>;£$$%^&*()_+"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Please only use alpha numeric characters for your username")
					done();
				});
		})
		it('should not with valid information but no email', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "George", password:"Password"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Email cannot be null or empty")
					done();
				});
		})
		it('should not with valid information but invalid email', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "George", password:"Password", email: "bad_email"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Please use a valid email address")
					done();
				});
		})
		it('should not with valid information, email & no captcha', function(done){
			agent
				.post('/users/register').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "George", password:"Password", email:"george@webinate.net"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Captcha cannot be null or empty")
					done();
				});
		})
	})
	
	describe('Create a new user when logged in as admin', function(){	
				
		it('did log in with an admin username & valid password', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: config.adminUser.username, password: config.adminUser.password })
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isTrue()
					test.object(res.body).hasProperty("message")
					sessionCookie = res.headers["set-cookie"][0].split(";")[0];
					done();
				});
		})
		
		it('did remove any users called george', function(done){
			agent
				.delete('/users/remove-user/george').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					done();
				});
		}).timeout(25000)
		
		it('did remove any users called george2', function(done){
			agent
				.delete('/users/remove-user/george2').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					done();
				});
		}).timeout(25000)
		
		it('did not create a new user without a username', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "", password: "" })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Username cannot be empty")
					done();
				});
		})
		
		it('did not create a new user without a password', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "", email: "test@test.com" })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Password cannot be empty")
					done();
				});
		})
		
		it('did not create a new user with invalid characters', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "!\"£$%^&*()", password: "password" })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Username must be alphanumeric")
					done();
				});
		})
		
		it('did not create a new user without email', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password" })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Email cannot be empty")
					done();
				});
		})
		
		it('did not create a new user with invalid email', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password", email: "matmat" })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Email must be valid")
					done();
				});
		})
		
		it('did not create a new user with invalid privilege', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password", email: "matmat@yahoo.com", privileges: 4 })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Privilege type is unrecognised")
					done();
				});
		})
		
		it('did not create a new user with an existing username', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: config.adminUser.username, password: "password", email: "matmat@yahoo.com", privileges: 2 })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("A user with that name or email already exists")
					done();
				});
		})
		
		it('did not create a new user with an existing email', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password", email: config.adminUser.email, privileges: 2 })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("A user with that name or email already exists")
					done();
				});
		})
		
		it('did not create user george with super admin privileges', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password", email: "test@test.com", privileges: 1 })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You cannot create a user with super admin permissions")
					done();
				});
		})
		
		it('did create regular user george with valid details', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password", email: "test@test.com", privileges: 3 })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isFalse()
					test.object(res.body).hasProperty("message")
					done();
				});
		}).timeout(16000)
		
		it('did create another regular user george2 with valid details', function(done){
			agent
				.post('/users/create-user').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george2", password: "password", email: "test2@test.com", privileges: 3 })
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isFalse()
					test.object(res.body).hasProperty("message")
					done();
				});
		}).timeout(16000)
		
		it('did create an activation key for george', function(done){
			agent
				.get('/users/users/george?verbose=true').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.object(res.body.data).hasProperty("registerKey")
					activation = res.body.data.registerKey
					done();
				});
		})
		
		it('did active george2 through the admin', function(done){
			agent
				.put('/users/approve-activation/george2').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isFalse()
					done();
				});
		})
		
		it('admin did logout', function(done){
			agent
				.get('/users/logout').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					done();
				});
		})
	})
	
	describe('Checking user login with activation code present', function(){	
				
		it('did not log in with an activation code present', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password" })
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.bool(res.body.authenticated).isFalse()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Please authorise your account by clicking on the link that was sent to your email")
					done();
				});
		})
		
		it('did not resend an activation with an invalid user', function(done){
			agent
				.get('/users/resend-activation/NONUSER5').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("No user exists with the specified details")
					done();
				});
		})
		
		it('did resend an activation email with a valid user', function(done){
			agent
				.get('/users/resend-activation/george').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isFalse()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("An activation link has been sent, please check your email for further instructions")
					done();
				});
		}).timeout(16000)
		
		it('did not activate with an invalid username', function(done){
			agent
				.get('/users/activate-account?user=NONUSER').set('Accept', 'application/json').expect(302)
				.end(function(err, res){
					if (err) return done(err);
					test.string(res.headers["location"]).contains("error")
					done();
				});
		})
		
		it('did not activate with an valid username and no key', function(done){
			agent
				.get('/users/activate-account?user=george').set('Accept', 'application/json').expect(302)
				.end(function(err, res){
					if (err) return done(err);
					test.string(res.headers["location"]).contains("error")
					done();
				});
		})
		
		it('did not activate with an valid username and invalid key', function(done){
			agent
				.get('/users/activate-account?user=george&key=123').set('Accept', 'application/json').expect(302)
				.end(function(err, res){
					if (err) return done(err);
					test.string(res.headers["location"]).contains("error")
					
					// We need to get the new key - so we log in as admin, get the user details and then log out again
					// Login as admin
					agent
						.post('/users/login').set('Accept', 'application/json')
						.send({username: config.adminUser.username, password: config.adminUser.password })
						.end(function(err, res){
							if (err) return done(err);
							sessionCookie = res.headers["set-cookie"][0].split(";")[0];
							
							// Get the new user register key
							agent
								.get('/users/users/george?verbose=true').set('Accept', 'application/json')
								.set('Cookie', sessionCookie)
								.end(function(err, res){
									if (err) return done(err);
									activation = res.body.data.registerKey
									
									// Logout again
									agent
										.get('/users/logout').set('Accept', 'application/json')
										.end(function(err, res){
											if (err) return done(err);
											
											// Finished
											done();
										});
								});
							
						});
				});
				
		}).timeout(30000)
		
		it('did activate with a valid username and key', function(done){
			agent
				.get('/users/activate-account?user=george&key=' + activation).set('Accept', 'application/json').expect(302)
				.end(function(err, res){
					if (err) return done(err);
					test.string(res.headers["location"]).contains("success")
					done();
				});
		})
		
		it('did log in with valid details and an activated account', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george", password: "password" })
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isNotFalse()
					test.object(res.body).hasProperty("message")
					sessionCookie = res.headers["set-cookie"][0].split(";")[0];
					done();
				});
		})
	})
	
	describe('Getting/Setting data when a regular user', function(){	
	
		it('did not get details of the admin user (no permission)', function(done){
			agent
				.get("/users/users/"+ config.adminUser.username +"?verbose=true").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not get details other users (no permission)', function(done){
			agent
				.get("/users/users"+"?verbose=true").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not get sessions (no permission)', function(done){
			agent
				.get("/users/sessions").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not remove the admin user (no permission)', function(done){
			agent
				.delete("/users/remove-user/" + config.adminUser.username ).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not approve activation (no permission)', function(done){
			agent
				.put("/users/approve-activation/" + config.adminUser.username ).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create a new user (no permission)', function(done){
			agent
				.post("/users/create-user/").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did get user data of myself', function(done){
			agent
				.get("/users/users/george?verbose=true").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.string(res.body.data._id).isNot("000000000000000000000000")
					test.string(res.body.data.email).is("test@test.com")
					test.number(res.body.data.lastLoggedIn).isNotNaN()
					test.string(res.body.data.password).isNot("***********************************************************")
					test.string(res.body.data.registerKey).is("")
					test.string(res.body.data.sessionId).isNot("**********")
					test.string(res.body.data.username).is("george")
					test.number(res.body.data.privileges).is(3)
					test.object(res.body.data).hasProperty("passwordTag")					
					done();
				});	
		})
	})
})

describe('Checking media API', function(){
	
	describe('Getting/Setting data when a Regular user', function(){
		
		it('did not get all stats', function(done){
			agent
				.get("/media/get-stats").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not get stats for admin', function(done){
			agent
				.get("/media/get-stats/" + config.adminUser.username).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not get buckets for admin', function(done){
			agent
				.get("/media/get-buckets/" + config.adminUser.username).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not get buckets for all users', function(done){
			agent
				.get("/media/get-buckets/").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create stats for admin', function(done){
			agent
				.post("/media/create-stats/" + config.adminUser.username).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage calls for admin', function(done){
			agent
				.put("/media/storage-calls/" + config.adminUser.username + "/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage memory for admin', function(done){
			agent
				.put("/media/storage-memory/" + config.adminUser.username + "/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage allocated calls for admin', function(done){
			agent
				.put("/media/storage-allocated-calls/" + config.adminUser.username + "/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage allocated memory for admin', function(done){
			agent
				.put("/media/storage-allocated-memory/" + config.adminUser.username + "/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage calls for itself', function(done){
			agent
				.put("/media/storage-calls/george/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage memory for itself', function(done){
			agent
				.put("/media/storage-memory/george/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage allocated calls for itself', function(done){
			agent
				.put("/media/storage-allocated-calls/george/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did not create storage allocated memory for itself', function(done){
			agent
				.put("/media/storage-allocated-memory/george/90000").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done();
				});	
		})
		
		it('did get stats for itself', function(done){
			agent
				.get("/media/get-stats/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.object(res.body.data).hasProperty("_id")
					test.string(res.body.data.user).is("george")
					test.number(res.body.data.apiCallsAllocated).is(20000)
					test.number(res.body.data.memoryAllocated).is(500000000)
					test.number(res.body.data.apiCallsUsed).is(0)
					test.number(res.body.data.memoryUsed).is(0)
					done();
				});	
		})
		
		it('did get buckets for itself', function(done){
			agent
				.get("/media/get-buckets/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("count")
					test.object(res.body).hasProperty("data")
					test.number(res.body.count).is(0)
					done();
				});	
		})
		
		it('did not get files for another user\'s bucket', function(done){
			agent
				.get("/media/get-files/"+ config.adminUser.username +"/BAD_ENTRY").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done()
				});	
		})
		
		it('did not get files for a non existant bucket', function(done){
			agent
				.get("/media/get-files/george/test").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Error: Could not find the bucket 'test'")
					done()
				});	
		})
		
		it('did not create a bucket for another user', function(done){
			agent
				.post("/media/create-bucket/" + config.adminUser.username + "/test").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("You don't have permission to make this request")
					done()
				});	
		})
		
		it('did not create a bucket with bad characters', function(done){
			agent
				.post("/media/create-bucket/george/__BAD__CHARS").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Please only use safe characters")
					done()
				});	
		})
		
		it('did create a new bucket called dinosaurs', function(done){
			agent
				.post("/media/create-bucket/george/dinosaurs").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Bucket 'dinosaurs' created")
					done()
				});	
		}).timeout(20000)
		
		it('did not create a bucket with the same name as an existing one', function(done){
			agent
				.post("/media/create-bucket/george/dinosaurs").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Error: A Bucket with the name 'dinosaurs' has already been registered")
					done()
				});	
		})
		
		it('did create a bucket with a different name', function(done){
			agent
				.post("/media/create-bucket/george/dinosaurs2").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Bucket 'dinosaurs2' created")
					done()
				});	
		}).timeout(20000)
		
		it('did not delete any buckets when the name is wrong', function(done){
			agent
				.delete("/media/remove-buckets/dinosaurs3,dinosaurs4").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Removed [0] buckets")
					test.array(res.body.data).isEmpty()
					done()
				});	
		})
		
		it('did get the 2 buckets for george', function(done){
			agent
				.get("/media/get-buckets/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Found [2] buckets")
					test.array(res.body.data).hasLength(2)
					done()
				});	
		})
		
		it('did not upload a file to a bucket that does not exist', function(done){
			agent
				.post("/media/upload/dinosaurs3").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.attach('"£$^&&', "file.png")
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("tokens")
					test.string(res.body.message).is("No bucket exists with the name 'dinosaurs3'")
					test.array(res.body.tokens).hasLength(0)
					done()
				});	
		}).timeout(20000)
		
		it('did not upload a file to dinosaurs with unsafe characters', function(done){
			agent
				.post("/media/upload/dinosaurs").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.attach('"£$^&&', "file.png")
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("tokens")
					test.string(res.body.message).is("Upload complete. [0] Files have been saved.")
					test.array(res.body.tokens).hasLength(1)
					test.string(res.body.tokens[0].field).is("")
					test.string(res.body.tokens[0].filename).is("file.png")
					test.bool(res.body.tokens[0].error).isTrue()
					test.string(res.body.tokens[0].errorMsg).is("Please use safe characters")
					test.string(res.body.tokens[0].file).is("")
					done()
				});	
		}).timeout(20000)
		
		it('did upload a file to dinosaurs', function(done){
			agent
				.post("/media/upload/dinosaurs").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.attach('small-image', "file.png")
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("tokens")
					test.string(res.body.message).is("Upload complete. [1] Files have been saved.")
					test.array(res.body.tokens).hasLength(1)
					test.string(res.body.tokens[0].field).is("small-image")
					test.string(res.body.tokens[0].filename).is("file.png")
					test.bool(res.body.tokens[0].error).isNotTrue()
					test.string(res.body.tokens[0].errorMsg).is("")
					test.object(res.body.tokens[0]).hasProperty("file")
					done()
				});	
		}).timeout(20000)
		
		it('fetched the files of the dinosaur bucket', function(done){
			agent
				.get("/media/get-files/george/dinosaurs").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.attach('small-image', "file.png")
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.string(res.body.message).is("Found [1] files")
					test.array(res.body.data).hasLength(1)
					test.number(res.body.data[0].numDownloads).is(0)
					test.number(res.body.data[0].size).is(226)
					test.string(res.body.data[0].mimeType).is("image/png")
					test.string(res.body.data[0].user).is("george")
					test.object(res.body.data[0]).hasProperty("publicURL")
					test.bool(res.body.data[0].isPublic).isTrue()
					test.object(res.body.data[0]).hasProperty("identifier")
					test.object(res.body.data[0]).hasProperty("bucketId")
					test.object(res.body.data[0]).hasProperty("created")
					test.string(res.body.data[0].bucketName).is("dinosaurs")
					test.object(res.body.data[0]).hasProperty("_id")
					
					fileId = res.body.data[0].identifier
					publicURL = res.body.data[0].publicURL
					done()
				});	
		}).timeout(20000)
		
		it('did not make a non-file public', function(done){
			agent
				.put("/media/make-public/123").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("File '123' does not exist")
					done()
				});	
		})
		
		it('did not make a non-file private', function(done){
			agent
				.put("/media/make-private/123").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("File '123' does not exist")
					done()
				});	
		})
		
		it('did make a file public', function(done){
			agent
				.put("/media/make-public/" + fileId).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("File is now public")
					done()
				});	
		}).timeout(20000)
		
		it('did download the file off the bucket', function(done){
			test.httpAgent(publicURL)
				.get("").expect(200).expect('content-type', /image/)
				.end(function(err, res){
					if (err) return done(err);
					
					done();
				});	
		})
		
		it('did make a file private', function(done){
			agent
				.put("/media/make-private/" + fileId).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("File is now private")
					done()
				});	
		}).timeout(20000)
		
		it('did not download the file off the bucket when private', function(done){
			test.httpAgent(publicURL)
				.get("").expect(403)
				.end(function(err, res){
					if (err) return done(err);
					done();
				});	
		})
		
		it('updated its stats accordingly', function(done){
			agent
				.get("/media/get-stats/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.number(res.body.data.apiCallsUsed).is(5)
					test.number(res.body.data.memoryUsed).is(226)
					done();
				});	
		})
		
		it('did upload another file to dinosaurs2', function(done){
			agent
				.post("/media/upload/dinosaurs2").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.attach('small-image', "file.png")
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("tokens")
					test.string(res.body.message).is("Upload complete. [1] Files have been saved.")
					test.array(res.body.tokens).hasLength(1)
					test.string(res.body.tokens[0].field).is("small-image")
					test.string(res.body.tokens[0].filename).is("file.png")
					test.bool(res.body.tokens[0].error).isNotTrue()
					test.string(res.body.tokens[0].errorMsg).is("")
					test.object(res.body.tokens[0]).hasProperty("file")
					done()
				});	
		}).timeout(20000)
		
		it('updated its stats with the 2nd upload accordingly', function(done){
			agent
				.get("/media/get-stats/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.number(res.body.data.apiCallsUsed).is(6)
					test.number(res.body.data.memoryUsed).is(226 * 2)
					done();
				});	
		})
		
		it('did not download a file with an invalid id anonomously', function(done){
			agent
				.get("/media/download/123").set('Accept', 'application/json').expect(404)
				.end(function(err, res){
					if (err) return done(err);
					done();
				});	
		})
		
		it('did download an image file with a valid id anonomously', function(done){
			agent
				.get("/media/download/" + fileId).expect(200).expect('Content-Type', /image/).expect('Content-Length', "226")
				.end(function(err, res){
					//if (err) return done(err);
					done();
				});	
		})
		
		it('did update the api calls to 5', function(done){
			agent
				.get("/media/get-stats/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.number(res.body.data.apiCallsUsed).is(7)
					done();
				});	
		})
		
		it('did upload another file to dinosaurs2', function(done){
			agent
				.post("/media/upload/dinosaurs2").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.attach('small-image', "file.png")
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("tokens")
					test.string(res.body.message).is("Upload complete. [1] Files have been saved.")
					test.array(res.body.tokens).hasLength(1)
					test.string(res.body.tokens[0].field).is("small-image")
					test.string(res.body.tokens[0].filename).is("file.png")
					test.bool(res.body.tokens[0].error).isNotTrue()
					test.string(res.body.tokens[0].errorMsg).is("")
					test.object(res.body.tokens[0]).hasProperty("file")
					done()
				});	
		}).timeout(20000)
		
		it('fetched the uploaded file Id of the dinosaur2 bucket', function(done){
			agent
				.get("/media/get-files/george/dinosaurs2").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					fileId = res.body.data[1].identifier
					done()
				});	
		})
		
		it('did not rename an incorrect file to testy', function(done){
			agent
				.put("/media/rename-file/123").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.set( "contentType", 'application/json')
				.send({name:"testy"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("File '123' does not exist")
					done()
				});	
		})
		
		it('did not rename a correct file with an empty name', function(done){
			agent
				.put("/media/rename-file/"+ fileId).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.set( "contentType", 'application/json')
				.send({name:""})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Please specify the new name of the file")
					done()
				});	
		})
		
		it('did rename a correct file to testy', function(done){
			agent
				.put("/media/rename-file/"+ fileId).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.set( "contentType", 'application/json')
				.send({name:"testy"})
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Renamed file to 'testy'")
					done()
				});	
		})
		
		it('did not remove a file from dinosaurs2 with a bad id', function(done){
			agent
				.delete("/media/remove-files/123").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Removed [0] files")
					test.array(res.body.data).hasLength(0)
					done();
				});	
		})
		
		it('did remove a file from dinosaurs2 with a valid id', function(done){
			agent
				.delete("/media/remove-files/" + fileId).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Removed [1] files")
					test.array(res.body.data).hasLength(1)
					done();
				});	
		})
		
		it('updated its stats to reflect a file was deleted', function(done){
			agent
				.get("/media/get-stats/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.number(res.body.data.apiCallsUsed).is(10)
					test.number(res.body.data.memoryUsed).is(226 * 2)
					done();
				});	
		})
		
		it('did not remove a bucket with a bad name', function(done){
			agent
				.delete("/media/remove-buckets/123").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Removed [0] buckets")
					test.array(res.body.data).hasLength(0)
					done();
				});	
		})
		
		it('did not remove the bucket dinosaurs2', function(done){
			agent
				.delete("/media/remove-buckets/dinosaurs2").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.string(res.body.message).is("Removed [1] buckets")
					test.array(res.body.data).hasLength(1)
					done();
				});	
		}).timeout(20000)
		
		it('updated its stats that both a file and bucket were deleted', function(done){
			agent
				.get("/media/get-stats/george").set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.number(res.body.data.apiCallsUsed).is(12)
					test.number(res.body.data.memoryUsed).is(226)
					done();
				});	
		})
	})
	
	describe('Checking permission data for another regular user', function(){
		
		it('did log in with valid details for george2', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george2", password: "password" })
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.bool(res.body.authenticated).isNotFalse()
					test.object(res.body).hasProperty("message")
					sessionCookie2 = res.headers["set-cookie"][0].split(";")[0];
					done();
				});
		})
	})
})

describe('Cleaning up', function(){
	describe('Checking permission data for another regular user', function(){
		
		it('did remove user george', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george2", password: "password" })
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		}).timeout(20000)
		
		it('did remove user george2', function(done){
			agent
				.post('/users/login').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.send({username: "george2", password: "password" })
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					done();
				});
		}).timeout(20000)
		
	})
})