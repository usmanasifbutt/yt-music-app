# Playlists

## Making playlists

- **New playlist:** Library → Playlists, then add songs from your library.
- **Add songs:** a song's ⋮ menu → *Add to playlist*, or long-press to select several. While playing, tap **Save**.
- **From YouTube:** paste a YouTube or YouTube Music playlist link into Search, then tap **Save** on the playlist banner. The app creates the playlist and downloads any songs you don't have yet, as audio. Songs appear in the playlist as their downloads finish.

Playlist names are unique (ignoring capital letters). If you create or import a playlist whose name is taken, the app asks whether to **add the songs to the existing one** or **create a new one** with a free name like "Gym 2". Importing the same YouTube playlist again is safe: it only adds and downloads songs you don't have yet.

## Where playlists are kept

Each playlist lives in two places:

1. **The app's database**, which is what the app reads.
2. **A playlist file** in `Music/YT Music/`, for example `Gym.m3u`. It's updated whenever the playlist changes, so other music players on your phone can open your playlists too.

The `.m3u` format is a plain text list of files. A YT Music playlist file looks like this:

```
#EXTM3U
#EXTINF:215,Artist - Song title
#YTM:{"id":"3j7bhOvW6jw","kind":"audio","h":0,"added":1760000000000}
Song title - Artist.m4a
```

- `#EXTINF` is the standard "length and name" line.
- `#YTM:` is YT Music's own line: the YouTube video ID, whether it's audio or video, the video quality, and when it was added. Other players skip lines they don't know, and YT Music uses it for **Restore**.

There's also **`All downloads.m3u`**, a list of your whole library. It's what lets Restore bring back songs that aren't in any playlist.

## If a playlist file is deleted or edited

The app's database is what counts. If you delete a playlist file outside the app, the app writes it again the next time it opens. Edits made to the file in other apps are overwritten the next time the playlist changes in YT Music.

Deleting a song in YT Music removes it from every playlist. If a song's file is deleted outside the app, it drops out of your library and playlists the next time the app opens.

## Restore

After a reinstall, or on a new phone with your Music and Movies folders copied over, **Settings → Storage → Restore** reads those folders:

1. It finds your downloads in `Music/YT Music` and `Movies/YT Music`.
2. It reads the playlist files and `All downloads.m3u` to work out which song is which, and rebuilds your playlists.
3. Android then asks to let YT Music manage those files again. Files from an earlier install belong to that install, so without this the app can play them but not rename or delete them.

Restore also **removes duplicate playlist files**, such as `Gym (1).m3u` or a second `All downloads.m3u`, which Android creates when a file with that name already belongs to an earlier install. Run it any time to tidy up.

A fresh install offers to restore by itself when it finds earlier downloads.
