# YT Music

A personal Android app that searches YouTube / YouTube Music, downloads audio to the phone, and plays it offline with background and lock-screen playback.

> Downloading from YouTube is against YouTube's Terms of Service and, for copyrighted music, may infringe copyright where you live. Use it for content you have the right to keep.

## How it works

| Piece | Where | Notes |
|---|---|---|
| Search + download | `modules/yt-dlp` (local Expo module, Kotlin) | Wraps [youtubedl-android](https://github.com/yausername/youtubedl-android) 0.18.1, which bundles yt-dlp, Python and ffmpeg. |
| Library | `src/library.ts` | Audio saved to **Music/YT Music/**, video to **Movies/YT Music/** (visible to Files and other players, with title/artist tags). Covers and the SQLite library database stay in app storage; playlists are mirrored as `.m3u` files in Music/YT Music. |
| Downloads queue | `src/downloads.ts` | Up to 2 in parallel, progress events, cancel, retry. |
| Player | `src/player.ts` | `expo-audio` with background playback, lock-screen controls, queue, shuffle, repeat. |
| UI | `App.tsx`, `src/ui/*` | Search and Library tabs, mini player, full-screen player. |

Audio is saved as YouTube's original stream (m4a/AAC, or webm/Opus when m4a is unavailable). Nothing is re-encoded.

**Update engine** (Library tab) pulls the latest yt-dlp onto the phone. Use it whenever searches or downloads start failing; YouTube changes break older versions.

## Building

This app uses custom native code, so it **does not run in Expo Go**. You need a development build or a standalone APK.

### Option A: Expo cloud build (no Android SDK needed)

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Install the APK it links to on your phone. Use `--profile development` for a dev client that live-reloads JS from `npx expo start`.

### Option B: Local build

Requires JDK 17 and Android Studio (SDK + platform tools). Then, with the phone connected over USB with debugging enabled:

```bash
npx expo run:android
```

For a release APK: `npx expo prebuild -p android`, then `cd android && ./gradlew assembleRelease`.

## Versions and rollback

The app shows its version in the top-right corner, e.g. **v1.3.0 (7)**:

- **Version name (1.3.0)** comes from the git tag. CI sets it at build time; `app.json` isn't edited.
- **Build number (7)** is Android's `versionCode`. EAS keeps it on its servers (`appVersionSource: remote`)
  and raises it on every build (`autoIncrement`), so each APK installs as an update.
- Builds from pushes to `master` are named after the last release, e.g. **v1.2.0-dev.ea3c35e (6)**.

**Release a new version.** Just tag and push. `.github/workflows/release.yml` builds the APK and
publishes the GitHub release:

```bash
git tag -a v1.3.0 -m "v1.3.0"   # annotated, so --follow-tags pushes it
git push --follow-tags
```

**Test before replacing your app.** The `beta` profile builds **YT Music Beta**, which has its own package ID,
so it installs *next to* the real app with its own empty library. Use it to try a risky build; if it works,
build `preview` for real.

```bash
eas build -p android --profile beta
```

**Roll back.** Every build stays on expo.dev → Projects → yt-music-app → Builds, where you can download any
older APK. Android blocks installing a lower `versionCode` over a higher one, so either:

- **Rebuild the old code (keeps your library):** `git checkout v1.2.0`, `eas build -p android --profile
  production`, then `git checkout master`. EAS gives it the next build number, so it installs over the
  broken build.
- **Uninstall and install the old APK (quick, but loses the in-app library and playlists).** Your downloaded
  files stay in `Music/YT Music` and `Movies/YT Music`.

## Notes

- The first launch takes a few seconds to unpack Python and ffmpeg ("Preparing download engine…").
- APK size is ~70–90 MB per ABI because Python + ffmpeg are bundled. `buildArchs` in `app.json` limits builds to `arm64-v8a` (phones) and `x86_64` (emulators).
- Long-press a song in Library to delete it.
