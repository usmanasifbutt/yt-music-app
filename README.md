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

## Notes

- The first launch takes a few seconds to unpack Python and ffmpeg ("Preparing download engine…").
- APK size is ~70–90 MB per ABI because Python + ffmpeg are bundled. `buildArchs` in `app.json` limits builds to `arm64-v8a` (phones) and `x86_64` (emulators).
- Long-press a song in Library to delete it.
