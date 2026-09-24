# Purpose

This repository is for a static webpage displaying a map of the UNL campus demonstrating the widespread usage of the Holland Computing Center by highlighting buildings whose associated departments have run jobs on the HCC's computers.

The live map is at **https://unlhcc.github.io/hcc-campus-maps/** and refreshes daily.

## How the map is published

```
HCC (daily, scrontab or cron)                GitHub
───────────────────────────────              ──────────────────────────────────────
scripts/publish_departments.sh                .github/workflows/pages.yml
  sacct (14 days) → usernames                   on push to static_map_webpage/ + daily:
  RCF MySQL → departments                         scrape buildings (maps.unl.edu)
  normalize → departments JSON  ──git push──►     deploy to GitHub Pages
  (usernames never leave HCC)                     fail if data is > 3 days old
```

Getting the department list needs `sacct` and the internal RCF MySQL database, so that step runs inside HCC. It pushes only `static_map_webpage/departments_completing_jobs.json`, which holds aggregate department names; usernames never leave HCC. Everything else (scraping building outlines from maps.unl.edu, building the site, hosting it) runs on GitHub.

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
   Fill in the `RCF_MYSQL_*` values, and check that `PYTHON` points at the environment `install.sh` created.

4. Run it once by hand:
   ```bash
   ~/hcc-campus-maps/scripts/publish_departments.sh
   ```
   You should see `Published static_map_webpage/departments_completing_jobs.json`. That push triggers a deploy.

5. Schedule it: run `scrontab -e` and paste in the entry from `scripts/publish_departments.scrontab.example`, filling in the partition and log path. The job needs outbound access to github.com and network access to the RCF MySQL server. If compute nodes don't have that, use the plain `cron` line from the same file on a login or service node instead.

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
- **Manual refresh:** use **Actions → Build and deploy map → Run workflow** to redeploy, or run `scripts/publish_departments.sh` on HCC to push new department data.
- **Building-to-department mapping:** `data/maps/departments_per_building.json` sets which departments are in each building, and `data/maps/department_normalization_map.json` maps the raw department names in the RCF database to canonical names. Run `find_missing_buildings.sh` to list buildings that have no departments assigned.

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
