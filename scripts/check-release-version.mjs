import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const tauriConfig = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
const cargoToml = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = new Map([
  ["package.json", packageJson.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", cargoVersion]
]);
const expected = packageJson.version;
const mismatches = [...versions].filter(([, version]) => version !== expected);
if (mismatches.length) {
  throw new Error(`Versions désynchronisées : ${[...versions].map(([file, version]) => `${file}=${version}`).join(", ")}`);
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expected)) {
  throw new Error(`La version ${expected} n’est pas une SemVer publiable.`);
}
const versionCode = tauriConfig.bundle?.android?.versionCode;
if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error("bundle.android.versionCode doit être un entier positif.");
}
console.log(`Version de release cohérente : ${expected} (Android ${versionCode}).`);
