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
var activation = "";

describe('Testing user API functions', function(){
	
	describe('Checking authentication', function(){	
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
	
	describe('Calling login', function(){	
	
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
	
	describe('Checking authentication with Cookie!', function(){	
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
					test.string(res.body.user._id).is("000000000000000000000000")
					test.string(res.body.user.email).is(config.adminUser.email)
					test.number(res.body.user.lastLoggedIn).isNotNaN()
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
	
	describe('Getting user data with a Cookie!', function(){	
		it('should get admin user without details', function(done){
			agent
				.get('/users/users/' + config.adminUser.username).set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.bool(res.body.error).isNotTrue()
					test.object(res.body).hasProperty("message")
					test.object(res.body).hasProperty("data")
					test.string(res.body.data._id).is("000000000000000000000000")
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
					test.string(res.body.data._id).is("000000000000000000000000")
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
		})
		
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
		
		it('did create user regular george with valid details', function(done){
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
		
		it('did create an activation key', function(done){
			agent
				.get('/users/george?verbose=true').set('Accept', 'application/json').expect(200).expect('Content-Type', /json/)
				.set('Cookie', sessionCookie)
				.end(function(err, res){
					if (err) return done(err);
					test.object(res.body.data).hasProperty("registerKey")
					activation = res.body.data.registerKey
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
	
	describe('Checking regular user login', function(){	
				
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
		})
		
		it('did not activate with an invalid username', function(done){
			agent
				.get('/users/activate-account?username=NONUSER').set('Accept', 'application/json').expect(302)
				.end(function(err, res){
					if (err) return done(err);
					test.string(res.headers["Location"]).contains("error")
					done();
				});
		})
	})
})