import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const outputPath = path.join(rootDir, "web-subtitle-capture.zip");

if (!fs.existsSync(distDir)) {
  console.error("[package] dist/ not found. Run build first.");
  process.exit(1);
}

// Remove existing zip
if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath);
}

// Create zip using system zip command (works on Linux/macOS/WSL)
try {
  execSync(`cd "${distDir}" && zip -r "${outputPath}" .`, { stdio: "inherit" });
  console.log(`[package] Created: ${outputPath}`);
} catch {
  // Fallback: list files that would be packaged
  console.log("[package] zip command not available. Files in dist/:");
  const files = fs.readdirSync(distDir, { recursive: true });
  for (const file of files) {
    console.log(`  ${file}`);
  }
  console.log("\n[package] Manual zip: cd dist && zip -r ../web-subtitle-capture.zip .");
}
