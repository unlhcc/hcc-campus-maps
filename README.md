# Purpose

This repository is for a static webpage displaying a map of the UNL campus demonstrating the widespread usage of the Holland Computing Center by highlighting buildings whose associated departments have run jobs on the HCC's computers.

The live map is at **https://unlhcc.github.io/hcc-campus-maps/** and refreshes daily.

## How the map is published

```
HCC (daily, scrontab or cron)                GitHub
───────────────────────────────              ──────────────────────────────────────
scripts/publish_departments.sh                .github/workflows/pages.yml
  hcc-xdmod (365 days)                          on push to static_map_webpage/ + daily:
    → jobs by department                          scrape buildings (maps.unl.edu)
  normalize → departments JSON  ──git push──►     deploy to GitHub Pages
                                                  fail if data is > 3 days old
```

The department list comes from HCC's Open XDMoD (https://hcc-xdmod.unl.edu): the Jobs realm grouped by Department, for the past year, read through its public view with no login. XDMoD is only reachable on the campus network or through the VPN, so that step runs inside HCC. It pushes only `static_map_webpage/departments_completing_jobs.json`, which holds aggregate department names. Everything else (scraping building outlines from maps.unl.edu, building the site, hosting it) runs on GitHub.

## Deployment

### 1. Turn on GitHub Pages

In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**. Pushes to `main` that touch `static_map_webpage/`, `data/maps/`, `scripts/fetch_buildings.py`, or the workflow then deploy the site, and the workflow also runs once a day.

### 2. Set up the daily job on HCC

Do this as whichever HCC account should own the job.

1. Create a deploy key:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/hcc-campus-maps-deploy -N ""
   ```
   Add the contents of `~/.ssh/hcc-campus-maps-deploy.pub` under the repo's **Settings → Deploy keys → Add deploy key**, and check **Allow write access**.

2. Clone the repo and create the Python environment:
   ```bash
   git clone https://github.com/unlhcc/hcc-campus-maps.git ~/hcc-campus-maps && cd ~/hcc-campus-maps && bash install.sh
   ```

3. Create the config file:
   ```bash
   mkdir -p ~/.config/hcc-campus-maps && cp scripts/publish.env.example ~/.config/hcc-campus-maps/publish.env && chmod 600 ~/.config/hcc-campus-maps/publish.env
   ```
   Check that `PYTHON` points at the environment `install.sh` created. No credentials are needed; XDMoD is read through its public view.

4. Run it once by hand:
   ```bash
   ~/hcc-campus-maps/scripts/publish_departments.sh
   ```
   You should see `Published static_map_webpage/departments_completing_jobs.json`. That push triggers a deploy.

5. Schedule it. On Swan, `scrontab` and `crontab` are both disabled for users, so use the self-resubmitting batch job. It runs now, and each run queues the next one for 05:30 the following day:
   ```bash
   mkdir -p $WORK/logs && sbatch --output=$WORK/logs/hcc-campus-map-%j.out ~/hcc-campus-maps/scripts/publish_departments.sbatch
   ```
   The job runs on a compute node, so compute nodes need outbound access to github.com and to hcc-xdmod.unl.edu. To change the time, set `RUN_AT=HH:MM` in `publish.env`. Each run deletes this job's logs older than 30 days; set `LOG_RETENTION_DAYS` to change that. Check the chain with `squeue --me --name=hcc-campus-map`, and stop it with `scancel --name=hcc-campus-map`.

   On clusters that allow `scrontab` or `cron`, use `scripts/publish_departments.scrontab.example` instead.

### 3. Embed the map on hcc.unl.edu

In the Drupal page body's HTML/source view, paste:

```html
<div style="position:relative; width:100%; aspect-ratio:4/3; min-height:400px;">
  <iframe src="https://unlhcc.github.io/hcc-campus-maps/"
          title="Map of UNL buildings whose departments use HCC"
          style="position:absolute; inset:0; width:100%; height:100%; border:0;"
          loading="lazy"></iframe>
</div>
<p><a href="https://unlhcc.github.io/hcc-campus-maps/">Open the map full screen</a></p>
```

If the iframe disappears when you save, that page's text format strips iframes. Switch to "Full HTML", or ask the UNLcms admins to allow iframes from `unlhcc.github.io`.

#### Embed mode

When the map is inside an iframe, it switches to embed mode automatically, so it doesn't take over the host page's scrolling:

- Scroll-wheel zoom, and one-finger panning on phones, stay off until someone clicks or taps the map. Until then, a hint explains how to activate it.
- An **Open full map** link opens the standalone page.
- The info bar is more compact.

Add `?embed=1` to the URL to force embed mode on, or `?embed=0` to force it off. To turn off automatic detection, set `embed.auto_detect_iframe: false` in `static_map_webpage/map-config.yml`.

## Operations

- **Monitoring:** if the HCC job stops pushing, the daily workflow's `check-freshness` job fails once the data is more than 3 days old, and GitHub emails the repo admins. Check the job's log on HCC; the path is set by `--output` in your scrontab entry.
- **Lookback window:** set `LOOKBACK_DAYS` in `publish.env` (default 365), and set `usage_window_days` in `static_map_webpage/map-config.yml` to match; the page uses it for wording such as "in the past year".
- **Manual refresh:** use **Actions → Build and deploy map → Run workflow** to redeploy, or run `scripts/publish_departments.sh` on HCC to push new department data.
- **Campuses:** `campuses` in `static_map_webpage/map-config.yml` sets the groups in the **Buildings** list (also the map's text alternative for keyboard and screen-reader users) and the pointers at the map's edge that point toward, and fly to, each campus that's out of view. The map opens on `map.default_campus` (City Campus). A building belongs to the first campus whose `area` contains its center; anything outside every area is listed under "Other locations".
- **Building-to-department mapping:** `data/maps/departments_per_building.json` sets which departments are in each building, and `data/maps/department_normalization_map.json` maps the raw department names in XDMoD to canonical names. Run `find_missing_buildings.sh` to list buildings that have no departments assigned.

## Local development

1. Clone the repository:
   ```bash
   git clone https://github.com/unlhcc/hcc-campus-maps.git
   ```

2. Go to the project directory:
   ```bash
   cd hcc-campus-maps
   ```

3. Start the local server (it can optionally re-scrape building outlines first):
   ```bash
   bash deploydev.sh
   ```

To test embed mode locally, open `http://localhost:8000/?embed=1`.

To refresh the department data locally, connect to the campus network or VPN and run:
```bash
python scripts/fetch_active_departments.py
```
