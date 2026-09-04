import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const outDir = path.join(rootDir, "dist");

const isWatch = process.argv.includes("--watch");
const isProduction = process.env.NODE_ENV === "production";

// Clean dist
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const buildOptions = [
  {
    entryPoints: [path.join(srcDir, "content", "main.ts")],
    outfile: path.join(outDir, "content.js"),
    format: "iife",
  },
  {
    entryPoints: [path.join(srcDir, "background", "main.ts")],
    outfile: path.join(outDir, "background.js"),
    format: "esm",
  },
  {
    entryPoints: [path.join(srcDir, "popup", "popup.ts")],
    outfile: path.join(outDir, "popup.js"),
    format: "iife",
  },
  {
    entryPoints: [path.join(srcDir, "offscreen", "offscreen.ts")],
    outfile: path.join(outDir, "offscreen.js"),
    format: "iife",
  },
];

async function build() {
  for (const opts of buildOptions) {
    await esbuild.build({
      entryPoints: opts.entryPoints,
      bundle: true,
      outfile: opts.outfile,
      format: opts.format,
      target: "chrome116",
      sourcemap: !isProduction,
      minify: isProduction,
    });
  }

  // Copy static files
  const staticFiles = ["popup.html", "popup.css"];
  // Copy offscreen HTML
  const offscreenHtml = path.join(srcDir, "offscreen", "offscreen.html");
  if (fs.existsSync(offscreenHtml)) {
    fs.copyFileSync(offscreenHtml, path.join(outDir, "offscreen.html"));
  }
  for (const file of staticFiles) {
    const src = path.join(srcDir, "popup", file);
    const dest = path.join(outDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }

  // Copy icons
  const iconsSrc = path.join(rootDir, "icons");
  const iconsDest = path.join(outDir, "icons");
  if (fs.existsSync(iconsSrc)) {
    fs.cpSync(iconsSrc, iconsDest, { recursive: true });
  }

  // Copy manifest
  const manifestSrc = path.join(rootDir, "manifest.json");
  fs.copyFileSync(manifestSrc, path.join(outDir, "manifest.json"));

  console.log("[build] Extension built successfully");
}

if (isWatch) {
  // Simple watch mode using esbuild context
  console.log("[build] Watch mode not implemented yet, building once...");
  await build();
} else {
  await build();
}
