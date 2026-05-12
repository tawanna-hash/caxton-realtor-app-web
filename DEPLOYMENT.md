# Deployment — Caxton Realtor App

## Frontend deploy (Vercel auto from git)

This is the entire workflow. No CI tooling, no manual UI clicks.

```bash
# 1. From Tawanna's Mac
cd ~/Downloads/caxton-realtor-app-web

# 2. Make changes (edit files, run patches, etc.)

# 3. Verify changes locally
grep -n "<thing you changed>" "app/(dashboard)/dashboard/page.tsx"

# 4. Commit and push
git add -A
git commit -m "Short imperative summary of the change"
git push

# 5. Wait ~90 seconds for Vercel auto-build
#    Watch progress: vercel.com/tawanna-verocks-projects/caxton-realtor-app-web
#    Look for green checkmark on the latest deployment.

# 6. Verify in browser
#    - Open app.myrealtyline.com
#    - DevTools open → right-click reload → "Empty Cache and Hard Reload"
#    - (Required — bundles cache aggressively)
```

---

## API deploy (manual SSH, only when API code changes)

```bash
# 1. SSH in
ssh caxton-prod

# 2. Edit files in /opt/caxton/api/
cd /opt/caxton/api
nano src/<file>.ts
# or: scp from Mac to /opt/caxton/api/src/<file>.ts

# 3. Rebuild — pm2 runs the compiled output at dist/index.js,
#    so source edits do NOT take effect until rebuilt.
npm run build

# 4. Restart PM2
#    - If you ONLY edited TypeScript source (no .env change), a plain restart is fine:
pm2 restart caxton-api

#    - If you ALSO edited .env, do NOT use `pm2 restart` (with or without --update-env).
#      pm2 caches env at the daemon level — plain restarts will NOT pick up .env changes.
#      Follow the kill sequence in "Reload after .env change" below.

# 5. Verify clean startup
pm2 logs caxton-api --lines 30 --nostream

# Expect: "Caxton Realtor API listening on port 8080" with no errors above.
```

---

## Reload after `.env` change — the kill sequence

**Do not use `pm2 restart --update-env`.** It caches env at the daemon level and silently serves stale values. The only reliable reload sequence is:

```bash
# After editing /opt/caxton/api/.env:
set -a && . /opt/caxton/api/.env && set +a
pm2 kill                                    # ← kills daemon, clears all cache
sleep 2
cd /opt/caxton/api
pm2 start dist/index.js --name caxton-api
sleep 3
pm2 logs caxton-api --lines 30 --nostream   # verify startup is clean

# CRITICAL — persist the new env to ~/.pm2/dump.pm2 so the next reboot
# resurrects with the current env, not the captured-stale env
pm2 save
```

Why every step matters:

- **`pm2 kill` (not stop, not restart, not delete+start):** Only `kill` terminates the pm2 god daemon and clears its env cache. `pm2 restart --update-env`, `pm2 stop && pm2 start`, and `pm2 delete && pm2 start` all preserve cached values. Cost a 25-min outage on May 11, 2026 — see `GOTCHAS.md` → "pm2 restart --update-env is NOT enough".
- **`set -a && . .env && set +a` before kill:** Sources `.env` into the current shell so `pm2 start` picks up the new values from the environment. Without this, you'd kill the daemon and restart with whatever was in the shell before.
- **`pm2 save` at the end:** pm2's systemd resurrect-on-boot path reads from `~/.pm2/dump.pm2`, which is only updated by `pm2 save`. Skip this and the next droplet reboot resurrects `caxton-api` with the env snapshot from the last time `pm2 save` ran — likely your previous `.env`. The reboot will appear successful, the API will start, and the first DB-touching request will fail with `28P01`. Caught and avoided live on May 12, 2026.

---

## Env var changes

### Vercel (frontend)
1. Go to `vercel.com/tawanna-verocks-projects/caxton-realtor-app-web/settings/environment-variables`
2. Add or edit env var
3. **Redeploy WITHOUT build cache:** Deployments → ⋯ on latest → Redeploy → uncheck "Use existing build cache" → confirm

### Droplet (`/opt/caxton/api/.env`)
1. SSH in: `ssh caxton-prod`
2. `nano /opt/caxton/api/.env`
3. Add/edit value
4. Follow the kill sequence in "Reload after .env change" above — including `pm2 save` at the end

---

## DB queries

```bash
# From the droplet (uses internal VPC network, fastest).
# Password lives only in .env — do NOT hardcode it here, in commands, or in shell history.
ssh caxton-prod
cd /opt/caxton/api
PGPASSWORD="$(grep '^DATABASE_URL=' .env | sed -E 's|.*://doadmin:([^@]+)@.*|\1|')" \
  psql \
    "host=private-caxton-prod-db-do-user-34407670-0.h.db.ondigitalocean.com \
     port=25060 dbname=defaultdb user=doadmin sslmode=require" \
    -c "<your SQL>" | cat
unset PGPASSWORD

# Always pipe to | cat to avoid getting stuck in less viewer.
```

Useful one-liners (same PGPASSWORD pattern — extract, run, unset):

```bash
psql ... -c "\dt" | cat                                      # list tables
psql ... -c "\d <table_name>" | cat                          # describe schema
psql ... -c "SELECT enum_range(NULL::market_enum)" | cat     # enum values
```

For the Neon DB instead of DO, the whole connection string lives in `NEON_DATABASE_URL` and psql can parse it directly:

```bash
cd /opt/caxton/api
psql "$(grep '^NEON_DATABASE_URL=' .env | sed -E 's|^[^=]+=||')" -c "<your SQL>" | cat
```

---

## Common debug recipes

### Did Vercel pick up my push?
- `vercel.com/tawanna-verocks-projects/caxton-realtor-app-web/deployments`
- Newest row should match your last `git push` commit message
- Green ✓ = live, yellow = building, red = failed (click row → Build Logs)

### Is the API responding?
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.myrealtyline.com/health
# Expect 200. /health returns a small JSON status payload — useful for
# scripting (no body parse needed, just the status code).
```

### Are emails actually going out?
```bash
ssh caxton-prod
pm2 logs caxton-api --lines 50 --nostream | grep -iE "resend|email"
# Expect "Using ResendEmailProvider" near startup, send confirmations after magic-link requests
```

### Did the latest commit deploy?
- Empty-cache hard reload `app.myrealtyline.com`
- DevTools Console: should be clean (ignore Mailtrack errors from `chrome-extension://hlbhaaegomldlibkeiiifaejlciaifmj/`)
- DevTools Network: HTML response should reference a new bundle hash

---

## Rollback

If a frontend change broke production:

```bash
git revert HEAD
git push
# Vercel auto-deploys the revert in 90s. Same path as a normal deploy.
```

For API source code (no `.env` involved):

```bash
ssh caxton-prod
cd /opt/caxton/api
git log --oneline -5
git checkout <previous-commit-hash> -- <file>
npm run build          # rebuild — pm2 runs dist/, not src/
pm2 restart caxton-api
pm2 logs caxton-api --lines 30 --nostream   # verify clean startup
```

If the broken change was an `.env` edit (rare): edit `.env` back to the prior value, then follow the "Reload after .env change" kill sequence above.

---

## Branches strategy

`main` only. No feature branches for solo dev. Commits small (1 logical change), descriptive messages, push immediately.

If a change breaks production: `git revert HEAD && git push` rolls it back in 90 seconds.
