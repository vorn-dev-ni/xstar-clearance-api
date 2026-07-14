# Deploying the API (GitHub Actions → SSH → PM2)

Pushes to `main` run CI (lint, tests, build) and then deploy over SSH: the workflow
rsyncs `dist/` + Prisma files to the server, installs deps, runs
`prisma migrate deploy` against the production DB, and restarts the app under PM2.
PRs run CI only. Manual deploys: Actions tab → "Backend CI & Deploy" → Run workflow.

## One-time server setup (Ubuntu)

```bash
# 1. Node 22 + pnpm (via corepack) + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs rsync curl
sudo corepack enable
sudo npm install -g pm2
pm2 startup   # follow the printed sudo command so PM2 survives reboots

# 2. Deploy directory (must match the DEPLOY_PATH secret)
sudo mkdir -p /var/www/system-x-star-backend
sudo chown "$USER" /var/www/system-x-star-backend

# 3. Production env file — the ONLY config that lives on the server.
#    Copy .env.example and fill in real values (Neon DATABASE_URL, a strong
#    JWT_SECRET, rotated AWS keys, CORS_ORIGIN = the admin's public URL).
nano /var/www/system-x-star-backend/.env.production

# 4. Deploy SSH key — generate a dedicated keypair (no passphrase):
ssh-keygen -t ed25519 -f ~/.ssh/gh-deploy -C "github-actions"
cat ~/.ssh/gh-deploy.pub >> ~/.ssh/authorized_keys
# The PRIVATE key (~/.ssh/gh-deploy) becomes the SSH_PRIVATE_KEY secret.
```

The API listens on `:3333` (the `PORT` env). Put nginx/Caddy in front for TLS,
proxying to `http://localhost:3333`.

## One-time GitHub setup

```bash
# From system-x-star-backend/ — first push
git add -A && git commit -m "Initial backend"
git remote add origin git@github.com:<you>/system-x-star-backend.git
git push -u origin main
```

Then add repository secrets (Settings → Secrets and variables → Actions):

| Secret            | Value                                              |
| ----------------- | -------------------------------------------------- |
| `SSH_HOST`        | server IP / hostname                               |
| `SSH_USER`        | the user that owns the deploy dir                  |
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/gh-deploy` (the private key)   |
| `DEPLOY_PATH`     | `/var/www/system-x-star-backend`                   |
| `SSH_PORT`        | optional — only if SSH isn't on 22                 |

Optionally create a `production` environment (Settings → Environments) with
required reviewers to gate deploys behind manual approval.

## Notes

- The workflow refuses to deploy if `.env.production` is missing on the server.
- `rsync --delete` is scoped to `dist/` only — server-side `.env.production`,
  `node_modules`, and PM2 state are never touched.
- Migrations run **before** the restart; they must stay backward-compatible with
  the previous running version for the few seconds between the two.
- First deploy needs the seed once: `cd $DEPLOY_PATH && NODE_ENV=production pnpm db:seed`
  (creates the chart of accounts + bootstrap admin).
- Logs: `pm2 logs system-x-star-api` · status: `pm2 status` · manual restart:
  `pm2 restart system-x-star-api`.
