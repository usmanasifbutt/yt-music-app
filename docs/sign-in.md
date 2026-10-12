# YouTube sign-in

Signing in is optional. It's there for one problem: on some networks, mobile data especially, YouTube answers downloads with **"Sign in to confirm you're not a bot"**. Many people share the same mobile network address, so YouTube distrusts it. A signed-in request is trusted far more.

> **Use a spare Google account, not your main one.** YouTube can limit or suspend accounts that download a lot.

## How signing in works

1. **Settings → YouTube account → Sign in** opens Google's own sign-in page inside the app.
2. You sign in there, including 2-step verification if your account uses it.
3. Google sends you on to YouTube. The moment the app sees YouTube open while signed in, it:
   - copies the **YouTube session cookies** (a long-lived "you're signed in" token) into one private file,
   - **wipes everything else** the sign-in page stored, including the Google session that could open Gmail or Drive,
   - closes the page.
4. From then on, each download hands that session to the download engine, which sends it to YouTube.

The sign-in page runs in a fresh, private browser session. It saves no passwords or form data, and it only opens Google and YouTube pages; any other link is blocked.

## What is stored, and what isn't

| | Stored? |
|---|---|
| Your password | **No.** You type it into Google's page, never into the app. The app has no way to read it. |
| 2-step verification codes | **No.** |
| Google session (Gmail, Drive, ...) | **No.** Wiped right after sign-in. |
| Your name, email or profile | **No.** The app doesn't know which account you used. |
| YouTube session cookies | **Yes**: one file, `youtube-cookies.txt`, in the app's private storage. |

That file:
- can only be read by this app (Android keeps each app's private storage separate),
- is **excluded from phone backups**, so it never goes to Google Drive or a backup file,
- is never shown in the app, in errors or in logs. The app's interface only ever knows "signed in" or "signed out",
- is used for downloads only, never for search.

During a download the engine works on a temporary copy of the file, which is deleted when the download ends. YouTube refreshes some cookies as you use it, so a successful download saves the refreshed ones back.

## Signing out

**Settings → YouTube account → Sign out** deletes the session file and anything left from the sign-in page.

This removes the session from the phone, but Google still considers that sign-in active until it expires. To end it on Google's side too, open your Google Account → **Security → Your devices** and sign that device out.

Uninstalling the app also deletes the session file.

## If Google blocks the sign-in page

Google sometimes refuses sign-ins inside apps ("This browser or app may not be secure"). You can import a cookies file instead:

1. On a computer, open a **private (incognito) window** and sign in to youtube.com with the spare account.
2. Export the youtube.com cookies with a cookies.txt browser extension (for example *Get cookies.txt LOCALLY*), then **close the private window**. Closing it stops the browser from using, and changing, that session.
3. Copy the file to your phone, then choose **Settings → YouTube account → Import cookies file**.

The app keeps only the YouTube lines of the file (anything for other websites is thrown away) and refuses files that don't contain a YouTube sign-in. Afterwards it offers to **delete the file you picked**. Say yes: that file holds the session in plain text, readable by other apps that can see your Downloads folder.

## When the sign-in stops working

Sessions expire, and you may sign out of everything from your Google account. When that happens, downloads fail with a message saying your sign-in may have expired. Sign out, then sign in again.

## Risks to know about

- **Account limits or suspension**: why a spare account is recommended.
- **Someone with full access to the phone** (rooted phone, or malware with root access) could copy the session file. Sign out and sign that device out in your Google Account to cut it off.
- **The download engine uses the session.** The engine updates itself from yt-dlp's official GitHub builds (see [Downloads and the engine](downloads.md)). If you'd rather approve each update yourself, turn off **Settings → Download engine → Auto-update daily**.
