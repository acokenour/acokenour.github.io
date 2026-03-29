const esbuild = require("esbuild");
const path = require("path");
const fs = require("fs");
const watch = process.argv.includes("--watch");

// Pretext ships .ts source files but uses .js import specifiers internally.
// This plugin rewrites .js -> .ts so esbuild finds the actual source files.
const resolveTsExtensions = {
  name: "resolve-ts-extensions",
  setup(build) {
    build.onResolve({ filter: /\.js$/ }, (args) => {
      const tsPath = args.path.replace(/\.js$/, ".ts");
      const resolved = path.resolve(path.dirname(args.importer), tsPath);
      if (fs.existsSync(resolved)) {
        return { path: resolved };
      }
    });
  },
};

const config = {
  entryPoints: [path.resolve(__dirname, "src/main.ts")],
  bundle: true,
  outfile: path.resolve(__dirname, "dist/bundle.js"),
  platform: "browser",
  target: "es2020",
  format: "iife",
  plugins: [resolveTsExtensions],
  minify: false,
  sourcemap: true,
};

async function run() {
  if (watch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log("Watching for changes...");
  } else {
    await esbuild.build(config);
    console.log("Build complete -> dist/bundle.js");
  }
}

run().catch(() => process.exit(1));