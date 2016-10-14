var gulp = require( 'gulp' );
var ts = require( 'gulp-typescript' );
var setup = require( './gulp/setup.js' );

// CONFIG
// ==============================
const tsProject = ts.createProject( 'tsconfig.json' );
const configFiles = [
    './readme.md',
    './install-script.sh',
    './test/package.json',
    './src/dist-files/package.json',
    './package.json'
];

// Builds each of the ts files into JS files in the output folder
gulp.task( 'ts-code', function() {

    var tsResult = tsProject.src()
        .pipe( tsProject() );

    return tsResult.js.pipe( gulp.dest( './dist' ) );
});

// Copies the distribution files from src to the dist folder
gulp.task( 'dist-files', function() {
    return gulp.src( [ 'src/dist-files/*.json' ], { base: "src/dist-files/" })
        .pipe( gulp.dest( './dist' ) );
});

// Builds each of the ts files into JS files in the output folder
gulp.task( 'ts-code-definitions', function() {
    return gulp.src( [ 'src/definitions/custom/users.d.ts' ], { base: "src/definitions/custom/" })
        .pipe( gulp.dest( './src/definitions/generated' ) );
});


gulp.task( 'bump-patch', function() { return setup.bumpVersion( setup.bumpPatchNum, configFiles ) });
gulp.task( 'bump-minor', function() { return setup.bumpVersion( setup.bumpMidNum, configFiles ) });
gulp.task( 'bump-major', function() { return setup.bumpVersion( setup.bumpMajorNum, configFiles ) });
gulp.task( 'build', [ 'ts-code', 'ts-code-definitions', 'dist-files' ] );