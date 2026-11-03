# EE Outlook

A dashboard of the Canada Express Entry pool and a projection of the next draw's CRS cut-off, built from IRCC's published [rounds of invitations](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/policies-operational-instructions-agreements/ministerial-instructions/express-entry-rounds.html).

Scores follow the rules in force since **November 3, 2026**, which added points for high-wage Canadian work and job offers. Until IRCC publishes a pool count under the new rules, the dashboard estimates the rescored pool from IRCC's last count and a scenario you set. When a count dated November 3 or later arrives, that count is used as it is and the estimate switches off.

> Statistical estimates, not IRCC guidance. IRCC sets each draw's size and type itself.

## What's in it

| Page | Shows |
| --- | --- |
| Overview | Pool size, profiles at 501+, the projected next cut-off, cut-off history with the projection, invitations per month, pool by score range, latest draws |
| Next draw forecast | How the projection is built (waterfall), how the cut-off moves with the number of invitations, every draw type side by side |
| Pool scores | Profiles by score band under the new rules, the November 3 scoring changes, IRCC pool counts since 2024 |
| All draws | Every draw since January 2024 as a bubble chart and a searchable, sortable table |
| Method and sources | How each number is worked out |

The scenario bar at the top sets the draw type, the next draw's size, and the share of profiles that gain high-wage work or job-offer points. Every page follows it.

The default shares use only whole-pool IRCC figures, never invited candidates: about 56% of the pool is in high-wage occupations (from Table 17a of the 2024 Year-End Report and the high-wage list), 36% of eligible profiles have Canadian education, and 12.3% claimed job-offer points. That gives 20% gaining work points and 7% gaining job-offer points. `node scripts/assumptions.mjs` recomputes them from `data/assumption_inputs.json`.

## Run it locally

Requires Node.js 20 or later. No dependencies to install.

```bash
npm run fetch   # download the latest rounds from IRCC into data/ee_rounds.json
npm run dev     # build dist/ and serve it at http://localhost:8080
```

`npm run build` writes the static site to `dist/`, which any static web server can host.

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

```
src/page.html          the dashboard: markup, styles, calculations and charts (d3 v7)
src/dash-shim.js       the small data and drawing runtime the page runs on
src/shell.html         the standalone HTML wrapper
scripts/fetch-ircc.mjs downloads and validates IRCC's feed
scripts/build.mjs      assembles dist/
scripts/serve.mjs      static server with timed refresh, used by Docker
scripts/assumptions.mjs recomputes the high-wage scenario defaults from pool-level IRCC figures
data/ee_rounds.json    the latest committed IRCC snapshot
data/high_wage_occupations.json, data/assumption_inputs.json  inputs to the scenario defaults
```

The fetch script keeps each round's pool distribution only when IRCC's subtotals add up, so a malformed row never reaches the dashboard.

## Method in brief

The projection for a draw type adds three parts:

1. **Recent pattern**: the average of a weighted mean of the last six cut-offs and a pool estimate (the score in IRCC's latest count where a usual-size draw runs out, using the share of profiles above recent cut-offs that were invited).
2. **New points**: the same pool estimate on the pool with the November 3 points added, minus the estimate on the old count.
3. **Draw size**: the pool estimate at the draw size you set, minus the estimate at the usual size.

The likely range comes from replaying the method on each type's last six draws. Provincial Nominee and Physicians draws use only the recent pattern, because IRCC reports their scores in one wide band. See the Method page in the dashboard for details.

## License

MIT
