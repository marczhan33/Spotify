# Pocket Player

An ad-free, offline music player for **music files you own**. It runs in Safari, installs to your
iPhone home screen like an app, and stores your songs **on your device**. There are no accounts,
servers, tracking or ads.

## Features

- Import MP3, M4A/AAC, FLAC, WAV and AIFF files from the iPhone **Files** app (select many at once)
- Reads song titles, artists, albums, track numbers and **cover art** from the files' tags
  (ID3v2.2/2.3/2.4, FLAC Vorbis comments, MP4/iTunes atoms). Untagged files fall back to
  `Artist - Title.mp3`-style filenames
- Songs / Albums / Artists / Playlists views and search
- Full-screen player with seek, shuffle, repeat (all / one) and an "Up next" queue
- Play next, add to queue, add to or remove from playlists, delete
- **Lock-screen and Control Center controls** with artwork (Media Session API)
- Keeps playing in the background, remembers where you left off, works fully offline
- A built-in **Get Music** guide listing legal places to buy or download DRM-free music

## Put it on your iPhone

The app is a static website, so it needs to be hosted somewhere you can open in Safari.

### Option A: GitHub Pages (free, recommended)

GitHub Pages is free for **public** repositories (private repos need GitHub Pro). The code
contains no personal data, and your music is never uploaded anywhere; it stays on your phone.

1. On github.com open this repo → **Settings** → **General** → scroll to the bottom → **Change visibility** → Public.
   *(Optional: rename the repo to something like `pocket-player` first.)*
2. **Settings** → **Pages** → *Build and deployment* → Source: **Deploy from a branch**.
   Choose the branch this code is on (or `master` after merging) and folder **/ (root)** → **Save**.
3. After a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.

### Option B: Netlify Drop (no GitHub settings needed)

On a computer, download this repo as a ZIP, unzip it, and drag the folder onto
<https://app.netlify.com/drop>. You'll get a URL you can open on your phone.

### Then, on the iPhone

1. Open the URL in **Safari**.
2. Tap **Share** → **Add to Home Screen**. Launch it from the new icon from now on.
   Installed web apps get much more storage and iOS won't clear your library.
3. Tap **+ Add**, pick songs in Files, and start listening.

## Getting music files (legally)

Open the **Get Music** tab in the app for the full guide. In short:

| Kind | Where |
| --- | --- |
| Buy DRM-free (mainstream) | [Bandcamp](https://bandcamp.com), [Qobuz store](https://www.qobuz.com/shop), [7digital](https://www.7digital.com), [Amazon MP3](https://www.amazon.com/music/mp3) |
| Free & legal | [Free Music Archive](https://freemusicarchive.org), [Jamendo](https://www.jamendo.com), [Internet Archive Audio](https://archive.org/details/audio), [NoiseTrade](https://www.noisetrade.com), [Musopen](https://musopen.org) |
| Already own CDs | Rip them on a computer (Apple Music app or fre:ac), then AirDrop or iCloud Drive the files to your phone |

On iPhone, Safari downloads land in **Files → Downloads**. Tap a `.zip` once to unzip it, then
import the folder's songs with **+ Add**.

Stream-ripping tools ("Spotify/YouTube downloaders") are piracy. They often carry malware and
can get accounts banned, so this project doesn't support them.

## Development

No build step. Serve the folder with any static server:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

| File | Purpose |
| --- | --- |
| `index.html` | App shell |
| `styles.css` | Styles (dark theme, iPhone safe areas) |
| `app.js` | Library storage (IndexedDB), tag parsing, player, UI |
| `sw.js` | Service worker that caches the app for offline use (bump `VERSION` when you ship changes) |
| `manifest.webmanifest`, `icons/` | Home-screen install metadata and icons (`icons/make_icons.py` regenerates the PNGs) |

### Notes and limits

- Songs are stored in the browser's IndexedDB for that site. Deleting the home-screen app or
  clearing Safari website data deletes the library, so keep your original files backed up
  (e.g. in iCloud Drive).
- Songs bought in the iTunes Store live inside Apple's Music app and can't be imported.
  Apple Music / Spotify downloads are DRM-protected and can't be played here.
- OGG/Opus playback depends on your iOS version. Files the device can't play are skipped on import.
