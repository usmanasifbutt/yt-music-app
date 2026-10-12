# Storage

The app keeps your music in your phone's shared folders, where you and other apps can see it, and its own bookkeeping in private storage only it can read.

## Your music (shared folders)

```
Music/
└── YT Music/
    ├── Song title - Artist.m4a      ← audio downloads
    ├── Gym.m3u                      ← one file per playlist
    └── All downloads.m3u            ← list of everything, used by Restore
Movies/
└── YT Music/
    └── Video title - Artist.mp4     ← video downloads
```

- Files are named "Title - Artist", with characters Android doesn't allow in file names replaced.
- Each file has its title and artist written inside it, so other music players show them properly.
- Because they're ordinary files, you can copy them to a computer, back them up, or play them in any app.
- Test builds ("YT Music Beta") use `Music/YT Music Beta` and `Movies/YT Music Beta`, so they never mix with your real library.
- On **Android 9 and older**, Android doesn't let apps add to these folders without extra permission, so files go to `Android/data/com.local.ytmusicoffline/files/Music/YT Music` (and `.../Movies/YT Music`) instead. File managers can still open them there.

## The app's private storage

Only YT Music can read this. Android deletes it when you uninstall the app.

| What | Contents |
|---|---|
| `library.db` | Your library (which downloads you have, play counts, last played), your playlists, and settings: interests, recent searches, playback speed, Home suggestions cache |
| `thumbs/` | Cover images for your downloads |
| Download engine | yt-dlp, Python and ffmpeg, unpacked on first launch |
| `youtube-cookies.txt` | Only if you [sign in](sign-in.md). Kept out of phone backups. |
| Temporary download folder | Used while a download is in progress, emptied when it finishes |

Nothing is sent anywhere except to YouTube (searching and downloading) and GitHub (engine updates). The app has no server, no analytics and no ads.

## Uninstalling and reinstalling

- **Uninstalling** removes the app's private storage: library, playlists in the database, settings, cover images and the YouTube sign-in.
- **Your music stays** in Music and Movies, along with the playlist files.
- **Reinstalling:** the app offers to **Restore**, which rebuilds the library and playlists from those folders (see [Playlists → Restore](playlists.md#restore)). You'll need to sign in to YouTube again.

## Freeing up space

**Settings → Storage** shows how much space audio and video use. **Clean up** deletes downloads you haven't played (or, if never played, added) in the last 30 days. You can also delete songs one by one, or select several in Library.
