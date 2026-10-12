# Permissions

Android only shows a pop-up for a few permissions. The rest are granted at install and listed under the app's info page.

## Permissions you're asked for

| Permission | Why | When it's asked |
|---|---|---|
| **Notifications** | Shows download progress | The first time you download something (Android 13 and newer) |
| **Music and audio / Videos** (older Android: **Files and media**) | Lets **Restore** find downloads left by an earlier install of the app | Only when you use Restore. The app doesn't need it to save or play its own downloads. |
| **Allow YT Music to modify these files?** | After a reinstall, lets the app manage (update, delete) its old downloads again | During Restore (Android 11 and newer) |

Saying no to any of these doesn't stop the app from working. Without notifications, downloads still run but you won't see their progress. Without media access, Restore can't find old downloads.

## Permissions granted at install

| Permission | Why |
|---|---|
| Internet, network state | Searching and downloading |
| Foreground service (data sync) | Keeps downloads running when you leave the app |
| Foreground service (media playback), wake lock | Keeps music playing with the screen off |
| Modify audio settings | Audio playback controls |

## Permissions declared but not used

These are added by the app's framework or libraries. YT Music never uses them, and you'll never be asked for them:

| Permission | Where it comes from |
|---|---|
| Display over other apps | The app template (React Native) |
| Vibrate | The app template |
| Storage write (Android 9 and older) | The app template. YT Music saves files without it. |
| Install referrer | The library that reads the app's version number |

## What the app does not ask for

No location, contacts, camera, microphone, phone or SMS access. No accounts on the phone. [Signing in to YouTube](sign-in.md) happens on Google's page, not through Android's account settings.
