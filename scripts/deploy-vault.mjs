/**
 * Copies built plugin artifacts to the local Obsidian test vault.
 * Configure the target by creating a .vault-path file at the repo root
 * containing the absolute path to the plugin directory, e.g.:
 *   C:\ObsidianRootVault\.obsidian\plugins\zettelflow
 *
 * Usage:
 *   npm run deploy:vault          — one-shot copy after `npm run release`
 *   (called automatically by dev:vault after each esbuild rebuild)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const vaultPathFile = path.join(root, ".vault-path");

if (!fs.existsSync(vaultPathFile)) {
    console.error(
        "[deploy-vault] No .vault-path file found.\n" +
        "Create one at the repo root with the absolute path to your plugin directory:\n" +
        "  echo C:\\YourVault\\.obsidian\\plugins\\zettelflow > .vault-path"
    );
    process.exit(1);
}

const targetDir = fs.readFileSync(vaultPathFile, "utf-8").trim();

if (!fs.existsSync(targetDir)) {
    console.error(`[deploy-vault] Target directory does not exist: ${targetDir}`);
    process.exit(1);
}

const artifacts = [
    { src: path.join(root, "dist", "main.js"), name: "main.js" },
    { src: path.join(root, "dist", "styles.css"), name: "styles.css" },
    { src: path.join(root, "manifest.json"), name: "manifest.json" },
];

let ok = true;
for (const { src, name } of artifacts) {
    if (!fs.existsSync(src)) {
        console.warn(`[deploy-vault] Missing artifact (run build first): ${src}`);
        ok = false;
        continue;
    }
    const dest = path.join(targetDir, name);
    fs.copyFileSync(src, dest);
    console.log(`[deploy-vault] ${name} → ${dest}`);
}

if (!ok) process.exit(1);
console.log("[deploy-vault] Done.");
