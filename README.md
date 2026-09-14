# Prague Stop Collector

A personal, installable, mostly-offline web app for tracking which Prague
public transport stops you've visited or driven through.

## What's in this folder

- `index.html`, `css/style.css`, `js/app.js` — the app itself
- `data/stops.json` — **all 1,473 Prague PID stops** across metro, tram,
  bus, trolleybus, train (S-lines), ferry, and the Petřín funicular, built
  from PID's own open data feed, filtered to `municipality == "Praha"`.
- `manifest.json`, `service-worker.js`, `icons/` — what makes this
  installable on your phone and usable offline
- `icons/grey.png`, `icons/green.png`, `icons/star.png` — the three map
  marker states (not collected / driven through / visited). **Replace any
  of these files with your own PNG of the same name** and it just works —
  nothing else needs to change.

## 1. Put it online (so it can be "installed" and work offline)

A phone needs to load this over `https://` (or `localhost`) at least once
for "Add to Home Screen" and offline mode to work — opening the raw files
from a folder on the phone doesn't support that. The easiest free way:

1. Create a free account at [github.com](https://github.com) if you don't
   have one.
2. Create a new repository (e.g. `prague-stops`), and upload every file in
   this folder to it (drag-and-drop on the GitHub website works fine —
   keep the folder structure, e.g. `css/style.css` stays inside a `css`
   folder).
3. In the repository, go to **Settings → Pages**, set "Source" to the
   `main` branch, root folder, and save.
4. After a minute, GitHub gives you a URL like
   `https://yourname.github.io/prague-stops/`. Open that on your phone.

## 2. Install it on your phone

- **Android (Chrome):** open the URL, tap the ⋮ menu → **"Add to Home
  screen"** (or you'll see a banner offering to install it).
- Once installed, it opens full-screen like a normal app, and works
  without internet for everything except *new* map areas you haven't
  scrolled to before (those need one data connection to fetch tiles; after
  that they're cached).

## 3. Keeping the stop data up to date

PID regenerates their open-data feed regularly (new lines, rerouted
buses, etc.). To refresh `data/stops.json` later:

1. On a computer with a normal browser, go to:
   `https://data.pid.cz/stops/json/stops.json`
2. Save the file (Ctrl+S / Cmd+S).
3. Send it to me in our chat and ask me to rebuild `data/stops.json`.
4. Replace the file in your GitHub repo with the one I send back, and
   reload the app on your phone once while online.

This file is published by ROPID/PID (Prague's transit authority) as open
data under a CC-BY 4.0 licence — see `pid.cz/en/opendata/` for licence
terms.

## Notes on accuracy

- Built from PID's live feed, filtered to `municipality == "Praha"`
  (1,473 stops, 424 distinct lines). Stredocesky kraj (Central Bohemia)
  is excluded, as requested.
- 9 stop entries in the raw feed had no line data attached at all (likely
  deprecated/unused stop records) and were dropped.
- The **Petřín funicular**'s 3 stops (Újezd, Nebozízek, Petřín) carry no
  line metadata in PID's feed at all, so I added a single manual line
  entry ("Lanovka") for those three by hand, based on public knowledge of
  the route — everything else in the file comes straight from PID's data.

## Customising

- **Colours:** edit the `:root` variables at the top of `css/style.css`
  (`--lime`, `--black`, etc).
- **Visited icon:** replace `icons/star.png` with any PNG (square, ideally
  transparent background, ~128×128px works well).
- **App name on the home screen:** edit `short_name` in `manifest.json`.
