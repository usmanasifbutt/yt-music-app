// Bumps app.json "version" (major | minor | patch) and always increments android.versionCode,
// which Android uses to decide whether a build is an upgrade.
// Usage: npm run bump -- minor
import { readFileSync, writeFileSync } from 'node:fs';

const part = process.argv[2] ?? 'patch';
if (!['major', 'minor', 'patch'].includes(part)) {
  console.error('Usage: npm run bump -- [major|minor|patch]');
  process.exit(1);
}

const path = new URL('../app.json', import.meta.url);
const app = JSON.parse(readFileSync(path, 'utf8'));
const [major, minor, patch] = app.expo.version.split('.').map(Number);
const next =
  part === 'major' ? [major + 1, 0, 0] : part === 'minor' ? [major, minor + 1, 0] : [major, minor, patch + 1];

app.expo.version = next.join('.');
app.expo.android.versionCode = (app.expo.android.versionCode ?? 1) + 1;
writeFileSync(path, JSON.stringify(app, null, 2) + '\n');

console.log(`version ${app.expo.version} (versionCode ${app.expo.android.versionCode})`);
console.log(`Next: git commit -am "Release v${app.expo.version}" && git tag v${app.expo.version}`);
