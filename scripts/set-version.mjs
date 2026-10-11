// CI only: sets app.json "version" (Android versionName) for the build being made, without
// committing it. The build number (versionCode) is assigned by EAS (appVersionSource: remote).
// Usage: node scripts/set-version.mjs 1.3.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: node scripts/set-version.mjs <version>');
  process.exit(1);
}

const path = new URL('../app.json', import.meta.url);
const app = JSON.parse(readFileSync(path, 'utf8'));
app.expo.version = version;
writeFileSync(path, JSON.stringify(app, null, 2) + '\n');
console.log(`app version set to ${version}`);
