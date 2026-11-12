# RussCast – personal podcast player

A first version of a personal, iPhone-friendly podcast player. It uses the Apple Podcasts/iTunes public search catalogue to find shows, then reads the show's public RSS feed and streams episode audio. Subscriptions, playback positions and settings are stored locally in the browser on this device.

## Included
- Apple Podcasts catalogue search (UK)
- Local podcast library
- RSS episode reader and streaming audio
- Remember listening position
- 15-second rewind and 30-second forward
- Playback speed
- Optional Off / Balanced / Strong dynamics compression using Web Audio API
- Player volume slider
- Sleep timer
- Installable PWA shell
- Optional Cloudflare Worker RSS proxy for feeds that block browser access

## Publish on GitHub Pages
1. Create a new GitHub repository, for example `russcast`.
2. Extract this ZIP.
3. Upload the contents of this folder (not the containing `russcast` folder) to the repository's root.
4. In GitHub, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
6. Wait for GitHub Pages to publish. Open the published HTTPS address on your iPhone.
7. In Safari, use **Share → Add to Home Screen**.

## First test
1. Search for a familiar podcast, for example `The Rest Is Politics`, `BBC Global News Podcast`, or a show you already follow.
2. Tap **Add**.
3. Tap **Episodes** in My podcasts.
4. Tap **Play** on an episode.
5. Try Off, Balanced and Strong volume levelling.

## Important compatibility notes
- Apple Podcasts search is a public catalogue lookup. It does not provide access to Apple-only paid/exclusive content or bypass provider restrictions.
- The app can play only episodes exposed as playable audio in a public RSS feed.
- Some podcast feed hosts do not permit browser-based RSS requests (CORS). If an episode list fails with a CORS/network error, use the optional Cloudflare Worker described below. Some feeds may still be unavailable.
- The Web Audio compressor reduces dynamic range; it does not detect adverts or guarantee that all adverts will be quieter. Strong compression can sound less natural.
- iOS background playback and Web Audio processing can behave differently across iOS versions. Test with the screen locked. If processed audio stops or behaves unexpectedly, select **Off**; ordinary audio playback should remain available.
- This first version streams audio. It does not download episodes for offline listening.
- Data is local to this browser/device. Clearing Safari website data removes the library and saved progress. Private Browsing may not retain data.
- The service worker caches the app shell only, not podcast audio.

## Optional: Cloudflare Worker RSS proxy
Only set this up if RSS episode loading fails because a feed host blocks cross-origin requests.

1. Create a Cloudflare Worker.
2. Copy `cloudflare-worker/worker.js` into the Worker editor and deploy.
3. In Worker **Settings → Variables and Secrets**, add a plain-text variable named `ALLOWED_HOSTS`. Set its value to the exact RSS feed hostnames you need, comma-separated (hostnames only; no `https://` or paths). Example: `feeds.example.com,podcast.example.org`.
4. Save and deploy.
5. In RussCast, open Settings and enter the Worker URL ending in `?url=`. Example: `https://your-worker.workers.dev/?url=`
6. Save, then retry loading the show's episodes.

The worker intentionally uses a host allowlist rather than acting as an unrestricted public proxy. Add only the feed hostnames you trust. If a podcast changes its RSS host, update the allowlist.

## Audio levelling
The compressor settings are starting presets, not a broadcast loudness normaliser. The compressor reacts to peaks and reduces dynamic range. It cannot identify advert boundaries or know the intended programme loudness. Try Balanced first; Strong may make speech more consistent but can sound unnatural.

## Troubleshooting
- **Search does not work:** check internet access and try again. The iTunes Search API may occasionally be unavailable.
- **Show added but no episodes:** open Settings and configure the optional RSS proxy for that feed host. Also check whether the show has a public RSS feed.
- **Episode appears but will not play:** the publisher may block direct audio playback or the episode may have expired.
- **No audio with compression:** choose Off and reload the episode. Some browser/device combinations have Web Audio restrictions.
- **Progress not saved:** use the same browser and avoid clearing its website data.

This is a starter project, not an official Apple Podcasts product.
