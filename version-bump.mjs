import { readFileSync, writeFileSync } from "fs";

// Run by the `npm version` lifecycle: npm sets npm_package_version to the new version.
const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
    throw new Error("npm_package_version is not set — run this via `npm version <x.y.z>`.");
}

// Bump manifest.json to the target version, keeping its minAppVersion.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Map the new version -> its minAppVersion in versions.json (used by Obsidian to serve
// the right build to each app version).
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");

console.log(`version-bump: manifest -> ${targetVersion}, versions[${targetVersion}] = ${minAppVersion}`);
