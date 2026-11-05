# EE Outlook

A dashboard of the Canada Express Entry pool and projections of the CRS cut-off of every round through February 2027, corrected after each round IRCC publishes, built from IRCC's published [rounds of invitations](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html).

Scores follow the rules in force since **November 3, 2026**, which added points for high-wage Canadian work and job offers. Until IRCC publishes a pool count under the new rules, the dashboard rescores IRCC's last count with a scenario you set. When a count dated November 3 or later arrives, the pool view uses it as it is, and the high-wage share starts from the share that turns IRCC's last old count into it.

> Statistical estimates, not IRCC guidance. IRCC sets each draw's size and type itself.

## What's in it

| Page | Shows |
| --- | --- |
| Overview | Pool size, profiles at 501+, the projected next cut-off, cut-off history with every projected round and its likely range, invitations per month, pool by score range, latest draws |
| Forecast | Every projected round of every draw type through February 2027, what was projected before each round under the new rules against what IRCC drew, how the next projection is built (waterfall), how the cut-off moves with the number of invitations, every draw type side by side |
| Pool scores | Profiles by score band under the new rules, the November 3 scoring changes, IRCC pool counts since 2024 |
| All draws | Every draw since January 2024 as a bubble chart and a searchable, sortable table |
| Method and sources | A calculator that breaks the projection down step by step as you change the inputs, the method, how it does when replayed on past rounds, and every source |

Every chart is selectable: hover or tap for details, click or tap a point, bar or slice to pin its figure on the chart (click it again to remove it), or drag across a stretch to pin every figure in it. With the keyboard, focus a chart, move between figures with the arrow keys, pin with Enter and clear with Escape. While a chart has pins, a **Clear selection** button at the right edge of its title bar removes them.

The scenario bar at the top sets the draw type, its invitations per round, the share of Canadian work in high-wage occupations (fitted to the rounds under the new rules unless you set it), and the share of profiles without Canadian work that hold a high-wage job offer. The calculator on the Method page also sets the Canadian work share and the next round's date. Every page follows the same values.

The defaults use only figures that describe the whole pool or the whole workforce, never candidates already invited:

| Input | Default | Source |
| --- | --- | --- |
| Pool with 12+ months of Canadian work | 66.3% | IRCC pool by program, 2025: 159,675 of 240,675 profiles eligible for the Canadian Experience Class |
| Of those, in high-wage occupations | 40.1% (18% / 51% / 31% in 2× / 1.5× / 1.3×) | 2021 Census, non-permanent residents by occupation (StatCan 98-10-0585, 98-10-0449), TEER 0–3, weighted by people and matched to IRCC's 186 high-wage occupations |
| No Canadian work, high-wage job offer | 5.0% | 12.3% of 2024 eligible profiles claimed a job offer (Year-End Report 2024), times the high-wage share |
| Category shares of the pool | STEM 19%, healthcare 8%, trades 4%, transport 4%, French 9% | Year-End Report 2024, Table 17a and fact sheet |

`node scripts/census.mjs` downloads the census tables into `data/census_noc_2021.json`; `node scripts/assumptions.mjs` recomputes `data/pool_composition.json` from it, `data/assumption_inputs.json` and `data/high_wage_occupations.json`.

## Run it locally

Requires Node.js 20 or later. No dependencies to install.

```bash
npm run fetch   # download the latest rounds from IRCC into data/ee_rounds.json
npm run dev     # build dist/ and serve it at http://localhost:8080
npm test        # check the model against the committed data
```

`npm run build` writes the static site to `dist/`, which any static web server can host. Scripts and styles go under `dist/assets/<version>/`, named after their content, so a rebuilt site always loads its own code: an ordinary reload shows it, with no stale script left over from the build before.

## Docker

```bash
docker build -t ee-draw-outlook .
docker run -p 8080:8080 ee-draw-outlook
# or
docker compose up -d
```

The container serves the site on port 8080, refreshes IRCC data when it starts, and again every `REFRESH_HOURS` (default 6). If IRCC can't be reached, it keeps serving the last snapshot.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `REFRESH_HOURS` | `6` | Hours between IRCC refreshes; `0` turns them off |
| `REFRESH_ON_START` | `1` | Set to `0` to skip the refresh when the container starts |
| `SINCE` | `2024-01-01` | Earliest draw date to keep |

A health check answers at `/healthz`.

## GitHub Pages and Actions

1. Push this folder to a new GitHub repository, on the `main` branch.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The **Refresh IRCC data and deploy to GitHub Pages** workflow runs on every push, every day at 22:47 UTC, and on demand from the Actions tab. It downloads the IRCC feed, commits `data/ee_rounds.json` when IRCC adds a draw, builds the site and deploys it.
4. The **Build and publish the Docker image** workflow pushes `ghcr.io/<owner>/<repo>` for amd64 and arm64 on every push to `main` and on `v*` tags.

## How it's built

Plain HTML, CSS and native ES modules, with d3 v7 from a CDN. Nothing to install and no bundler.

```
src/
  index.html             the page: markup only; each element a view draws into has data-view="<name>"
  styles/
    app.css              imports the rest in order; the build inlines them into one file
    tokens.css           colours and type for light and dark mode
    base.css, layout.css, components.css, tables.css, charts.css, method.css
  js/
    main.js              entry point: maps every data-view name to its view and starts the app
    config.js            data files, scenario defaults, pages
    state.js             the store, the datasets derived from IRCC's files, the forecast for the current scenario
    core/store.js        data and scenario state, no DOM: datasets cached until a file reloads
    core/renderer.js     draws views on the next frame after a change; skips hidden pages
    model/eem.js         CRS model math: pool density, eligibility, new points, cut-offs, rounds carried forward
    model/datasets.js    draws, monthly totals, pool counts and draw types from IRCC's rounds
    model/forecast.js    projections, self-correction and the pool under the new rules
    charts/              one module per chart, the shared axes, and pick.js (hover, pin, drag, keyboard)
    views/               navigation, scenario controls, values, tables, the Method page
    ui/                  number and date formats, theme colours, small DOM builders
    lib/d3.js            the d3 global as a module
test/model.test.mjs      model checks for `npm test`
scripts/fetch-ircc.mjs   downloads and validates IRCC's feed
scripts/build.mjs        assembles dist/ with versioned assets
scripts/serve.mjs        static server with timed refresh, used by Docker and npm run dev
scripts/census.mjs       downloads 2021 Census occupation tables from Statistics Canada
scripts/assumptions.mjs  computes the pool composition defaults
data/ee_rounds.json      the latest committed IRCC snapshot
data/pool_composition.json  the scenario defaults the dashboard loads
data/high_wage_occupations.json, data/assumption_inputs.json, data/census_noc_2021.json  inputs to the defaults
```

The model modules are pure functions over plain arrays, so the tests run them in Node exactly as the page does. Views read state only through `store`, `scenario` and `model` in `state.js`.

The fetch script keeps each round's pool distribution only when IRCC's subtotals add up, so a malformed row never reaches the dashboard. It drops a repeated draw number, reports a pool count dated after its round, two different counts under one date, or one count repeated under two dates (the dashboard counts it once), and refuses a feed that ends before the saved data, so a stale cache can't erase rounds the projections have learned from.

## Method in brief

The cut-off is the lowest score still invited when a round's invitations run out, counting down from the top of the profiles eligible for it. For each draw type the dashboard works that out on the pool itself, under the November 3 rules:

1. **Pool**: IRCC's latest count of profiles by CRS band, spread evenly within ten-point bands; the 501–600 band thins out from the 491–500 density.
2. **Eligible below the last cut-off**: everyone eligible above the type's last cut-off was invited, so below it the type's share of the whole pool applies (66.3% for Canadian Experience Class, each category's Table 17a share otherwise).
3. **Arrivals since**: above the last cut-off only new arrivals count: the type's invitations per day over its recent rounds, times the days to the next round (the rescoring pause included).
4. **New points**: with Canadian work, +70, +40 or +20 for 12 months in a 2×, 1.5× or 1.3× high-wage occupation; without it, 100, 70 or 50 for a high-wage job offer. The factor takes the higher of the two, so job offers only lift profiles without Canadian work.
5. **Cut-off**: the score where the rescored eligible count reaches the round's size.

The likely range adds the method's average miss when replayed on the type's recent rounds (each against the pool count IRCC published before it) and the cut-offs at a high-wage share 10 points lower or higher. Provincial Nominee rounds use the median of the last four cut-offs. Senior managers and Physicians rounds use their recent median plus the new points, since IRCC reports their scores in one wide band.

**Rounds after the next.** Each type keeps its usual gap and size; rounds that fall on a weekend or in the year-end break (none from December 19 to January 4 since 2024) move to the next weekday or the first week of January. Each round starts from the pool the one before left behind:

- every profile invited is gone;
- new profiles arrive above the type's last cut-off at its recent rate, carrying the new points at the pool's rate;
- profiles below it are replaced as rounds reach into them, at the type's turnover: the rate that best replays its old-rules rounds two to four rounds ahead (types with too few rounds take the rate fitted to all of them). The replacements carry the new points only as often as the pool does, not as often as the profiles invited did, since 12 months in a high-wage job or a high-wage offer is a higher bar than the old turnover had to clear. High-wage profiles become scarcer round by round, and the cut-off eases back.

The range widens with the square root of the rounds ahead.

**After each new round.** The projections correct themselves from what IRCC drew:

- the pool is carried through every round held under the new rules at the sizes IRCC drew, from the type's last old-rules round and IRCC's last old-rules count, and half of the last round's miss is carried into the next projection (a quarter into the one after);
- the high-wage share is refitted to every round held so far, each miss weighed against the type's usual miss; moving it 10 points costs as much as a 5-point miss, so one round can't swing it far;
- Provincial Nominee, Senior managers and Physicians rounds add their average miss under the new rules, shrunk toward zero.

The Forecast page lists every round under the new rules with what was projected before it, using only the rounds before it.

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
