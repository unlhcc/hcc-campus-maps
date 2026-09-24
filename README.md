# Purpose

This repository is for a static webpage displaying a map of the UNL campus demonstrating the widespread usage of the Holland Computing Center by highlighting buildings whose associated departments have run jobs on the HCC's computers.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/unlhcc/hcc-campus-maps.git

2. Navigate to project directory:
   ```bash
   cd hcc-campus-maps

3. Run the deploy script:
   ```bash
   bash deploydev.sh

### How the map is published

```
HCC (daily, scrontab or cron)                GitHub
───────────────────────────────              ──────────────────────────────────────
scripts/publish_departments.sh                .github/workflows/pages.yml
  sacct (14 days) → usernames                   on push to static_map_webpage/ + daily:
  RCF MySQL → departments                         scrape buildings (maps.unl.edu)
  normalize → departments JSON  ──git push──►     deploy to GitHub Pages
  (usernames never leave HCC)                     fail if data is > 3 days old
```

Only `static_map_webpage/departments_completing_jobs.json` (aggregate department names) is pushed from HCC.

#### One-time setup

1. **GitHub Pages:** in the repo's *Settings → Pages*, set *Source* to **GitHub Actions**.
2. **Deploy key:** on HCC, run `ssh-keygen -t ed25519 -f ~/.ssh/hcc-campus-maps-deploy -N ""`, then add the `.pub` half under *Settings → Deploy keys* with **Allow write access** checked.
3. **Python env on HCC:** `bash install.sh` (or any Python with `scripts/requirements.txt` installed).
4. **Config:** copy `scripts/publish.env.example` to `~/.config/hcc-campus-maps/publish.env`, fill it in, and `chmod 600` it.
5. **Test by hand:** `scripts/publish_departments.sh`
6. **Schedule:** install the entry from `scripts/publish_departments.scrontab.example` with `scrontab -e`. If compute nodes can't reach github.com or the MySQL host, use the plain cron line in that file on a service/login node instead.

If the HCC job stops running, the daily workflow's `check-freshness` job fails and GitHub emails the repo admins.
