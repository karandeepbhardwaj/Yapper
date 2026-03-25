import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["./out/extension.js"],
  bundle: true,
  outfile: "./out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  allowOverwrite: true,
  minify: true,
  sourcemap: false,
});

console.log("Bundled extension.js with ws dependency");
