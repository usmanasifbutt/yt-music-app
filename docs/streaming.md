# Playing without downloading

Songs don't have to be downloaded to play. Tap any song in **Search** or on **Home** and it plays straight away. It's streamed from YouTube unless you've already downloaded it, in which case the file plays instead.

## Starting a song

- **Up next** is the rest of the list you tapped from, for example the other search results or the rest of a Home row.
- **Autoplay:** when the list runs out, related songs from YouTube follow, so the music doesn't stop. Turn it off under **Settings → Playback → Autoplay**.
- **⋮ or long-press** a song for more: *Play next*, *Add to queue*, *Share link*, and the download formats with their sizes.

The first tap waits a few seconds while the app asks YouTube for the song's stream link. To keep that wait rare:

- While a song plays, the **next song's link is looked up in advance**, so it starts almost at once.
- When search results appear, the **top result is looked up in advance** too, since most taps go there.
- A lookup is shared: if you tap a song that's already being looked up, the app waits for that lookup instead of starting another one.

Stream links expire after a few hours, so the app keeps them for an hour at most and looks a song up again after that.

## Now Playing

- **Streaming** or **Downloaded** next to the title tells you where the song comes from.
- **Download** (the round button with a progress ring) saves the song in the background, in the format chosen under *Settings → Downloads*. Playback isn't interrupted. Long-press it for every format.
- If a stream fails (a dropped connection, or a link YouTube refused), you'll see why, with **Try again** and **Download**. A failed song never skips on by itself.

## Audio and video

The **Audio | Video** switch at the top of Now Playing swaps the artwork for the song's video, from the same second. Switching back, or closing Now Playing, carries on as audio from where the video was.

- A song you've **downloaded as video** plays from the file. Otherwise the video is streamed.
- **Quality** (the button at the bottom-left of the video): *Auto* adapts to your connection, or pick a fixed quality from 144p up to whatever the video offers. Your choice is remembered.
- **Full screen** (the button at the bottom-right) turns the video landscape with the standard video controls. Press back to leave.
- Video plays while the app is open; leaving the app pauses it. Audio keeps playing in the background as always.

## Data use

Streaming uses mobile data every time you play, while a downloaded song uses none. As a rough guide, audio uses about 1 MB per minute, and video anything from about 2 MB per minute at 360p to 10+ MB at 1080p. For songs you play often, downloading is cheaper.

## How it works

1. The [download engine](downloads.md) (yt-dlp) asks YouTube for the video's details, the same lookup a download uses. If you're [signed in](sign-in.md), it sends your YouTube session along.
2. To be quick, it first asks with a single YouTube method (`tv_samsung`) that doesn't need yt-dlp to solve YouTube's JavaScript puzzle, which is slow on a phone. If that doesn't work, it asks again with all of yt-dlp's methods.
3. For **audio**, the app picks the best audio-only stream (usually the same `.m4a` a download would save) and plays it like a downloaded song, in the background and on the lock screen.
4. For **video**, it plays YouTube's HLS "master playlist", a list of every picture quality plus the audio. YouTube no longer offers single files with both picture and sound. For a fixed quality, the app writes a trimmed copy of that playlist listing only that quality.
5. The details are kept in memory for up to an hour, so switching to video, checking download sizes or downloading the song you're playing all reuse them instead of asking YouTube again. A download that starts from them begins straight away.
