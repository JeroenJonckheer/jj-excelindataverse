# Demo media (repeatable)

The README GIF (`media/demo.gif`) and the hero screenshot (`media/screenshot.png`)
are produced from the offline harness - no Dataverse, no screen recorder. The
whole thing is repeatable.

## Regenerate the video and screenshot

```bash
npm run demo
```

This (`playwright.demo.config.ts`) builds the harness with esbuild, serves it on
port 5174, loads the realistic demo board (`harness/harness.tsx`, `?demo=1`), and:

- records the choreographed clip to `demo-output/demo-demo-chromium/video.webm`
  (`e2e-demo/demo.spec.ts`), and
- writes `media/screenshot.png` (`e2e-demo/screenshot.spec.ts`).

The choreography shows, slowly: inline edit, the single-click choice dropdown, a
rectangular selection with the status-bar count/sum/average, copy, the fill
handle, **paste from Excel** (the headline - tabs/newlines become cells/rows and
a paste past the end adds rows), moving a block by its border, find, sort and
save.

## Convert the WebM to an autoplaying GIF

Playwright records WebM only. GitHub READMEs autoplay a GIF inline (a committed
`<video>` does not), so convert with ffmpeg (palette method):

```bash
ffmpeg -y -i demo-output/demo-demo-chromium/video.webm \
  -vf "fps=10,scale=760:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer" \
  -loop 0 media/demo.gif
```

Install ffmpeg if needed: `winget install Gyan.FFmpeg`. The full ~2 min narrated
clip lands around 8-9 MB at these settings; drop `fps`/`scale` to trade smoothness
for size.

## What is committed vs generated

- Committed: `media/demo.gif`, `media/screenshot.png`.
- Generated and gitignored: `demo-output/` (the WebM and trace), `harness/dist/`.

## Adjusting the demo

The board data lives in `harness/harness.tsx` (`demoStore()`, loaded by `?demo=1`).
Keep it full and realistic - sparse or generic data makes the demo look like a toy.
Pacing and the feature order are in `e2e-demo/demo.spec.ts`.
