# Downloads and the engine

## The download engine

Downloads are done by [yt-dlp](https://github.com/yt-dlp/yt-dlp), the open-source downloader, which is built into the app with what it needs to run on a phone:

| Part | What it does |
|---|---|
| yt-dlp | Finds the audio and video streams of a YouTube video and downloads them |
| Python | yt-dlp is written in Python |
| ffmpeg | Joins video and audio into one file, adds tags and cover art |
| QuickJS | A small JavaScript engine yt-dlp uses to solve YouTube's player puzzles |

These make up most of the app's size. The first time the app opens, it unpacks them, which takes a few seconds ("Preparing download engine…").

## Keeping the engine up to date

YouTube changes often, and an old yt-dlp soon stops working. The app can replace yt-dlp with a newer version without needing an app update:

- **Automatically**, once a day when you open the app, if **Settings → Download engine → Auto-update daily** is on.
- **By hand**, with **Settings → Download engine → Update**.

Updates come from yt-dlp's **nightly builds**: official builds published every day or two on yt-dlp's GitHub. YouTube fixes reach them weeks before a "stable" release. For example, signed-in downloads were broken on the stable version for weeks while the nightly build already worked.

If downloads start failing, updating the engine is the first thing to try.

## What happens when you tap download

1. The song joins the **download queue** (Library → Downloads shows it).
2. The engine asks YouTube for the video's streams. If you're [signed in](sign-in.md), it sends your YouTube session along.
3. It downloads:
   - **Audio**: YouTube's original audio stream, usually `.m4a`, saved without re-encoding, so there's no quality loss.
   - **Video**: the best stream up to the quality you picked (360p, 720p or 1080p), preferring the H.264 format every phone can play, joined with the audio into an `.mp4`.
4. It writes the title and artist into the file, and saves the cover image for the app.
5. The file is copied into your phone's **Music** or **Movies** folder (see [Storage](storage.md)) and added to your library, and any playlists waiting for it are updated.

Downloads keep going when you leave the app or turn the screen off; a notification shows their progress. Downloading the song that's playing doesn't interrupt it.

**Starting quickly.** Before any data arrives the row shows *Starting…* while the engine looks the song up. That's faster when:
- you've just played the song or checked its download sizes: the download reuses that lookup and starts straight away (if those links have expired, it simply looks the song up again);
- the engine has run before: it keeps YouTube's player code in a cache instead of fetching it every time.

## Pacing, and YouTube's bot check

Many downloads in a row can make YouTube ask you to "confirm you're not a bot". To avoid that, the queue paces itself:

- A short random pause (a few seconds) between downloads.
- During a big queue, the engine also waits a second between its own requests to YouTube. Single downloads skip that wait, so they start faster.
- **Settings → Simultaneous downloads** sets how many run at once (1–3).
- With more than 3 songs waiting, for example after importing a playlist, it switches to **one at a time** with longer pauses (15–30 seconds).

If YouTube asks anyway:

- **A single download** fails straight away, with YouTube's message and a hint, so you can retry or sign in.
- **During a big queue**, the whole queue pauses for 5, then 15, then 30 minutes, then stops until you tap **Resume**. Songs stay queued, nothing is lost, and Library → Downloads shows why it paused.

On networks where this keeps happening, [signing in](sign-in.md) is the fix.

## When a download fails

You'll see the error in three places:
- a short message on screen, wherever you are,
- a red icon on the song in Search (tap it for the full error and **Retry**),
- Library → Downloads (tap the song for the full error).

The error text comes from yt-dlp and YouTube; include it if you [report a problem](https://github.com/usmanasifbutt/yt-music-app/issues/new).
