var gulp = require('gulp');
var ts = require('gulp-typescript');

// CONFIG
// ==============================
var outDir = "dist";

// Builds each of the ts files into JS files in the output folder
gulp.task('ts-code', function() {

    return gulp.src(['references.d.ts', 'src/**/*.ts', 'src/**/*.json'], { base: "src/lib" })
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

gulp.task('build-all', ['ts-code']);