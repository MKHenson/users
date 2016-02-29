var gulp = require('gulp');
var ts = require('gulp-typescript');

// CONFIG
// ==============================
var outDir = "dist";

// Builds each of the ts files into JS files in the output folder
gulp.task('ts-code', function() {

    return gulp.src(['references.d.ts', 'src/**/*.ts', 'src/**/*.json'], { base: "src" })
        .pipe(ts({
            "module": "commonjs",
            "removeComments": false,
            "noEmitOnError": true,
            "declaration": false,
            "sourceMap": false,
            "preserveConstEnums": true,
            "target": "es5",
            "noImplicitAny": false
            }))
        .pipe(gulp.dest(outDir));
});

// Builds each of the ts files into JS files in the output folder
gulp.task('ts-code-definitions', function() {

    return gulp.src(['src/definitions/custom/definitions.d.ts'], { base: "src/definitions/custom/" })
        .pipe(gulp.dest(outDir + "/definitions"));
});

gulp.task('build-all', ['ts-code', 'ts-code-definitions']);