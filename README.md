# LinkedIn Feed Adblock

Lightweight browser extension that removes sponsored ("Promoted") and suggested posts from your LinkedIn feed. No popups, background workers, telemetry, or extra permissions: just a clean content script.

## Installation

### Chrome / Brave / Edge
1. Open `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this directory.

### Firefox (128+)
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file from this directory. *(Note: temporary extensions are unloaded when Firefox closes)*.

## Verification

Open your browser console on any LinkedIn feed tab (`https://www.linkedin.com/feed/`):

```js
__linkedinAdblock.getStats()
```

Output details:
- `promoted` & `suggested`: Number of posts cleaned directly from network API responses before rendering.
- `hiddenCards`: Number of cards hidden via DOM observer fallback.

## How It Works

1. **Network Layer:** Intercepts `window.fetch` at `document_start` (in the page context via `world: "MAIN"`) and filters out sponsored/suggested entities and bad URN references from the Voyager API feed payloads.
2. **DOM Layer:** A `MutationObserver` scans the `/feed` page as elements load or stream in, hiding any cards with promoted/suggested badges that slipped past or were server-side rendered.

Labels and selectors can be easily customized in [content.js](content.js).
