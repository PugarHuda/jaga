# Jaga — demo video recorder

Automated product-tour recorder (Playwright). Drives the live site, smooth-scrolls each
section with caption overlays, and records a ~65s 1280×720 video ending on a branded card.

## Regenerate

```bash
cd video
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.49.1   # uses installed Chrome
npx playwright install ffmpeg                                # video encoder only
node record.mjs                                              # → out/<hash>.webm
```

Override the target with `JAGA_URL=http://localhost:3000 node record.mjs`.

The rendered `out/*.webm` is gitignored (it goes to YouTube for the submission).
Trim/re-encode example (Playwright's bundled ffmpeg, webm/vp8 only):

```bash
FF=~/AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe
"$FF" -ss 2.6 -i out/raw.webm -c:v libvpx -b:v 2M -an -y out/jaga-demo.webm
```
