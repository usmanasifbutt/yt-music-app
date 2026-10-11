# YT Music

A personal Android app that searches YouTube / YouTube Music, downloads audio to the phone, and plays it offline with background and lock-screen playback.

> Downloading from YouTube is against YouTube's Terms of Service and, for copyrighted music, may infringe copyright where you live. Use it for content you have the right to keep.

## How it works

| Piece | Where | Notes |
|---|---|---|
| Search + download | `modules/yt-dlp` (local Expo module, Kotlin) | Wraps [youtubedl-android](https://github.com/yausername/youtubedl-android) 0.18.1, which bundles yt-dlp, Python and ffmpeg. |
| Library | `src/library.ts` | Audio saved to **Music/YT Music/**, video to **Movies/YT Music/** (visible to Files and other players, with title/artist tags). Covers and the `library.json` index stay in app storage. |
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

Each release has a version in `app.json` (`version`, shown in the app's top-right corner) and an
Android `versionCode`, which must go up for a build to install as an update. Each release is also tagged
in git (`v1.0.0`, `v1.1.0`, …).

**Release a new version**

```bash
npm run bump -- minor        # or patch / major; also increments versionCode
git commit -am "Release v1.2.0"
git tag -a v1.2.0 -m "v1.2.0"   # annotated, so --follow-tags pushes it
git push --follow-tags
eas build -p android --profile preview
```

**Test before replacing your app.** The `beta` profile builds **YT Music Beta**, which has its own package ID,
so it installs *next to* the real app with its own empty library. Use it to try a risky build; if it works,
build `preview` for real.

```bash
eas build -p android --profile beta
```

**Roll back.** Every build stays on expo.dev → Projects → yt-music-app → Builds, where you can download any
older APK. Android blocks installing a lower `versionCode` over a higher one, so either:

- **Rebuild the old code as a new version (keeps your library):** `git checkout v1.0.0`, set `versionCode` in
  `app.json` above the broken build's, `eas build -p android --profile preview`, then `git checkout master`.
- **Uninstall and install the old APK (quick, but loses the in-app library and playlists).** Your downloaded
  files stay in `Music/YT Music` and `Movies/YT Music`.

## Notes

- The first launch takes a few seconds to unpack Python and ffmpeg ("Preparing download engine…").
- APK size is ~70–90 MB per ABI because Python + ffmpeg are bundled. `buildArchs` in `app.json` limits builds to `arm64-v8a` (phones) and `x86_64` (emulators).
- Long-press a song in Library to delete it.
