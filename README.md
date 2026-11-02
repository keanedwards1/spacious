# Aether: cinematic intro

A one-minute, film-style intro for a fictional space-travel brand. It plays as five chapters and then hands off to a landing page. It's plain HTML, CSS and JavaScript: no frameworks, no build step and no audio files.

## Run it

Serve the folder and open it:

```bash
python3 -m http.server 8000
```

Or deploy it to Vercel with `npx vercel` from this folder, or by importing the repository with the framework preset set to **Other**. There's no build step: the files are served as they are.

Press `Esc` or click **Skip intro** to jump straight to the landing page. If your system has reduced motion turned on, the page skips the intro automatically.

## How it works

`sequence()` in `script.js` runs the chapters one after another, each as an `async` function:

| # | Chapter | What happens |
|---|---|---|
| 00 | Systems check | A real image preloader counts to 100, then waits for the sound choice |
| 01 | Departure | A starfield speeds up into hyperspace, then flies into a spinning wormhole |
| 02 | Eclipse | A circle opens to reveal an eclipse while the title decodes letter by letter |
| 03 | Orbit | A sunrise over Earth builds from vertical slices |
| 04 | The Route | The Moon, Mars and Saturn fly past at different depths |

Then `finish()` fades the intro out and animates the landing page in.

## Techniques

- **Web Animations API.** Every animation is an `element.animate()` call made through a small `play()` helper, and the code `await`s each animation's `.finished` promise, so each chapter reads top to bottom like a script.
- **Skipping.** Every wait goes through a `guard()` wrapper. Skipping makes each pending wait return a promise that never resolves, so the sequence stops wherever it was, with no cleanup code needed.
- **Canvas starfield.** Stars are projected from 3D positions onto the screen. Each frame only partly clears the canvas, so stars leave trails that stretch into streaks as warp speed rises.
- **Web Audio score.** All sound is generated live through one compressor and reverb chain. Sound only starts after the viewer clicks, because browsers block audio until then. Until sound is enabled, every sound function does nothing, so the scenes can call them freely.
- **Real preloading.** The counter follows actual image loads but never finishes faster than a set minimum. If an image takes longer than 9 seconds, it's counted as loaded so one slow file can't stall the intro.
- **Depth and parallax.** The background and the planets move slightly with the mouse, smoothed over several frames. The planets offset through the CSS `translate` property, which applies alongside their animated `transform`, so the parallax and the fly-by paths don't conflict.
- **Text effects.** Text is split into words or letters at runtime so each piece can animate on its own. The title's decoding effect cycles through random symbols before each letter settles.
- **Atmosphere.** A custom cursor, an animated film-grain overlay, and an on-screen camera-style display with a running clock and chapter label.

Images are loaded from Pixabay's CDN (see `ASSETS` at the top of `script.js`).
