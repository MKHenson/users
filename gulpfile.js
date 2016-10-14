var gulp = require('gulp');
var ts = require('gulp-typescript');
var setup = require('./gulp/setup.js');

// CONFIG
// ==============================
const tsConfig = JSON.parse(fs.readFileSync('tsconfig.json'));
const configFiles = [
    './readme.md',
    './install-script.sh',
    './test/package.json',
    './src/dist-files/package.json',
    './package.json'
];

// Builds each of the ts files into JS files in the output folder
gulp.task('ts-code', function () {

    return gulp.src(['src/**/*.ts'], { base: "src" })
        .pipe(ts({
            "module": tsConfig.compilerOptions.module,
            "removeComments": tsConfig.compilerOptions.removeComments,
            "noEmitOnError": tsConfig.compilerOptions.noEmitOnError,
            "declaration": tsConfig.compilerOptions.declaration,
            "sourceMap": tsConfig.compilerOptions.sourceMap,
            "preserveConstEnums": tsConfig.compilerOptions.preserveConstEnums,
            "target": tsConfig.compilerOptions.target,
            "noImplicitAny": tsConfig.compilerOptions.noImplicitAny,
            "allowUnreachableCode": tsConfig.compilerOptions.allowUnreachableCode,
            "allowUnusedLabels": tsConfig.compilerOptions.allowUnusedLabels
        }))
        .pipe(gulp.dest(tsConfig.compilerOptions.outDir));
});

// Copies the distribution files from src to the dist folder
gulp.task('dist-files', function () {
    return gulp.src(['src/dist-files/*.json'], { base: "src/dist-files/" })
        .pipe(gulp.dest(tsConfig.compilerOptions.outDir));
});

// Builds each of the ts files into JS files in the output folder
gulp.task('ts-code-definitions', function () {
    return gulp.src(['src/definitions/custom/definitions.d.ts'], { base: "src/definitions/custom/" })
        .pipe(gulp.dest(tsConfig.compilerOptions.outDir + "/definitions"));
});


gulp.task('bump-patch', function () { return setup.bumpVersion(setup.bumpPatchNum, configFiles) });
gulp.task('bump-minor', function () { return setup.bumpVersion(setup.bumpMidNum, configFiles) });
gulp.task('bump-major', function () { return setup.bumpVersion(setup.bumpMajorNum, configFiles) });
gulp.task('build', ['ts-code', 'ts-code-definitions', 'dist-files']);