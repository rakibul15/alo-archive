# Lighthouse reports

Self-contained HTML reports from `npx lighthouse <url> --preset=desktop` against
a production build (`npm run build && npm start`), one per route. Open any of
them directly in a browser — no server required.

`scores.txt` is the numeric summary. See the main [README](../../README.md#lighthouse-100--100--100--100-desktop-all-three-routes)
and [ASSUMPTIONS.md](../../ASSUMPTIONS.md#what-the-token-check-cannot-see-and-what-caught-it-instead)
for what was found and fixed to get here, and why desktop rather than the
default mobile-simulated preset is the number reported.
