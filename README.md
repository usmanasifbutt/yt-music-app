# YT Music

A personal Android app for listening to music offline. Search YouTube, save songs or videos to your phone, and play them anytime, even without internet, with the screen off.

> Built as a learning project. Please read the [legal notice](#legal-notice) before using it.

---

## What you can do

**Find music**
- Search YouTube for songs, artists, naats, recitations and more
- Paste a YouTube link (a single video or a whole playlist)
- A Home screen with suggestions based on the interests you pick, plus "Because you played…" mixes

**Save it to your phone**
- Download as audio, or as video in 360p, 720p or 1080p
- Downloads keep going when you leave the app
- Files go to your phone's **Music** and **Movies** folders, so other music players can use them too

**Listen anywhere**
- Plays in the background and on the lock screen
- Shuffle, repeat, queue, playback speed and a sleep timer
- Playlists, including importing a whole YouTube playlist in one tap
- Sort and filter your library, and see how much space it uses

**Keep your music safe**
- If you reinstall the app or move to a new phone, **Restore** brings back your downloads and playlists

## Screenshots

_Coming soon._

---

## Install the app

**You need:**
- An Android phone running Android 7 or newer (most phones from the last few years)
- About **140 MB** of free space for the app, plus space for your music
- An internet connection for searching and downloading (not for listening)

**Steps:**
1. On your phone, open the [latest release](https://github.com/usmanasifbutt/yt-music-app/releases/latest).
2. Download the **.apk** file under *Assets*.
3. Open it. If Android asks, allow your browser to **install unknown apps**.
4. Open **YT Music**, read the short notice, and pick a few interests.

**Updating:** download and install a newer release the same way. Your library and playlists are kept.

## Keep downloads working

YouTube changes often, and that can stop downloads from working. The app has a built-in download engine that you can update:

- **Automatic:** the app checks for an engine update once a day when you open it.
- **Manual:** go to **Settings → Download engine → Update**.

If searches or downloads start failing, update the engine first. It fixes most problems.

## Something not working?

1. Update the download engine (see above) and try again.
2. If it still fails, [open an issue](https://github.com/usmanasifbutt/yt-music-app/issues/new) and include:
   - What you were doing (for example, "downloading a song as 720p video")
   - The error message. For failed downloads, tap the item in **Library → Downloads** to see the full message.
   - The app version, shown at the top of **Home** and in **Settings → About**
   - Your phone model and Android version
   - Screenshots, if they help

---

## Build it yourself

For developers who want to run their own copy.

**You need:**
- [Node.js](https://nodejs.org) 22 or newer
- A free [Expo](https://expo.dev) account
- Git

**Steps:**
1. Download the code and install what it needs:
   ```bash
   git clone https://github.com/usmanasifbutt/yt-music-app.git
   cd yt-music-app
   npm install
   ```
2. Build the app on Expo's servers (no Android Studio needed):
   ```bash
   npx eas-cli login
   npx eas-cli build --platform android --profile preview
   ```
3. When it finishes, open the link it prints on your phone and install the app.

This app uses its own native code, so it doesn't run in the Expo Go app.

**On GitHub** (no local setup): open the repository's **Actions** tab → **Build APK** → **Run workflow**, pick a branch and where to build, then download the APK from the finished run:
- **github**: free, builds on GitHub (about 20–40 minutes)
- **cloud**: builds on Expo's servers, usually faster, but uses the Expo plan's monthly build limit

**Releases** are automatic: pushing a version tag like `v1.7.0` builds the app on GitHub and publishes it on the Releases page.

**Replacing a release's APK** (for example, to rebuild it with the cloud builder):
- One click: **Actions → Release → Run workflow**, enter the tag (e.g. `v1.6.1`) and pick the builder. The APK on that release is replaced.
- By hand: run **Build APK** on the tag (choose it under "Use workflow from"). The APK gets the clean version number, so you can upload it to the release yourself.

---

## App info

| | |
|---|---|
| Platform | Android 7.0+ (64-bit phones) |
| App size | About 136 MB. Most of that is the download engine built into the app. |
| Where files are saved | Music/YT Music (audio) and Movies/YT Music (video) |
| Accounts | None needed |
| Data collected | None. Everything stays on your phone. |
| Built with | React Native (Expo) and the open-source [yt-dlp](https://github.com/yt-dlp/yt-dlp) download engine |

## Legal notice

This project was made for **learning and exploration only**. It isn't affiliated with YouTube or Google.

Downloading from YouTube goes against YouTube's Terms of Service, and saving copyrighted music may break copyright law where you live. Only download content you have the right to keep, such as your own uploads or freely licensed music. You are responsible for how you use this app.

---

Thanks for checking out YT Music! Suggestions and bug reports are welcome on the [issues page](https://github.com/usmanasifbutt/yt-music-app/issues).
