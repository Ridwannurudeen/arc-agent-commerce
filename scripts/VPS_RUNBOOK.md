# VPS runbook — items #3 and #4

Copy-paste commands to run on the VPS box that hosts arc.gudman.xyz. Assumes the existing layout from prior deployments:

- Repo (server side): `/opt/arc-commerce-repo`
- Frontend: `/opt/arc-commerce` (systemd `arc-commerce.service`, port 3007)
- Deployer/builder PKs in `/opt/arc-commerce-repo/.env` (mode 600)
- nginx vhost for `arc.gudman.xyz`

## #3 — Recreate Pipeline #0 on the new orchestrator

Pre-req: BUILDER wallet (Agent #933) needs ≥80 USDC on Arc Testnet. Check first.

```bash
ssh root@<vps>
cd /opt/arc-commerce-repo
git pull
set -a; source .env; set +a   # loads ARC_BUILDER_PK, ARC_AUDITOR_PK, ARC_DEPLOYER_PK + agent IDs

# verify USDC balance for BUILDER
python -c "
from web3 import Web3
import os
w3 = Web3(Web3.HTTPProvider('https://rpc.testnet.arc.network'))
acct = w3.eth.account.from_key(os.environ['ARC_BUILDER_PK'])
usdc = w3.eth.contract(
    address=Web3.to_checksum_address('0x3600000000000000000000000000000000000000'),
    abi=[{'constant':True,'inputs':[{'name':'_owner','type':'address'}],'name':'balanceOf','outputs':[{'name':'balance','type':'uint256'}],'type':'function'}]
)
bal = usdc.functions.balanceOf(acct.address).call()
print(f'{acct.address}: {bal/1e6:.2f} USDC')
assert bal >= 80_000_000, 'need >= 80 USDC'
print('OK')
"

# run the demo against new orchestrator
cd sdk/examples
python pipeline_demo.py
```

Expected: pipeline #0 created on `0x276F9CDD...7Dd7`, both stages approved, exit code 0.

Verify on-chain:

```bash
curl -s https://arc.gudman.xyz/api/stats | python -c "import json,sys;d=json.load(sys.stdin);print('pipelines:',d.get('pipelines'),'jobs:',d.get('jobs'))"
```

`pipelines: 1` confirms it. The frontend hero will then show "1 pipeline on-chain" instead of "Arc Testnet · 5042002".

If the script fails on USDC approval, first do `cast send 0x3600000000000000000000000000000000000000 "approve(address,uint256)" 0x276F9CDD64f82362185Bc6FC715846A19B0f7Dd7 80000000 --rpc-url https://rpc.testnet.arc.network --private-key $ARC_BUILDER_PK` from the same shell, then retry.

## #4 — Deploy the indexer

The indexer is a Node.js process running Ponder against `0x276F9CDD...7Dd7` and `0x792170...B72c`. Plan: Postgres for storage, systemd for supervision, nginx for `/indexer/` routing.

### Step 1 — Postgres database

```bash
ssh root@<vps>
sudo -u postgres psql <<'SQL'
CREATE DATABASE arc_commerce_indexer;
CREATE USER arc_indexer WITH ENCRYPTED PASSWORD '<choose-a-password>';
GRANT ALL PRIVILEGES ON DATABASE arc_commerce_indexer TO arc_indexer;
\c arc_commerce_indexer
GRANT ALL ON SCHEMA public TO arc_indexer;
SQL
```

### Step 2 — install indexer

```bash
cd /opt/arc-commerce-repo
git pull   # pulls in indexer/ if not already there
cd indexer
npm install --omit=dev
cp .env.local.example .env.local
# edit .env.local:
#   DATABASE_URL=postgresql://arc_indexer:<password>@localhost:5432/arc_commerce_indexer
#   PONDER_RPC_URL_5042002=https://rpc.testnet.arc.network
#   DATABASE_SCHEMA=public
chmod 600 .env.local

# test once in foreground (Ctrl-C after you see "API endpoints: Live at http://localhost:42069")
npm run start
```

### Step 3 — systemd unit

```bash
sudo tee /etc/systemd/system/arc-commerce-indexer.service >/dev/null <<'EOF'
[Unit]
Description=Arc Commerce Indexer (Ponder)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/arc-commerce-repo/indexer
EnvironmentFile=/opt/arc-commerce-repo/indexer/.env.local
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx ponder start --port 42069
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now arc-commerce-indexer.service
sudo systemctl status arc-commerce-indexer.service
journalctl -u arc-commerce-indexer.service -n 50 --no-pager
```

Look for `API endpoints: Live at http://localhost:42069` in the journal.

### Step 4 — nginx route

Add to `/etc/nginx/sites-available/arc.gudman.xyz` inside the existing `server { ... listen 443 ... }` block. Forward only the GraphQL endpoint (POST) and a health probe — Ponder also serves `/metrics`, `/status`, `/ready` on the same port and we don't want those public.

```nginx
location = /indexer/graphql {
    if ($request_method !~ ^(POST|OPTIONS)$ ) { return 405; }
    proxy_pass http://127.0.0.1:42069/graphql;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_buffering off;
}

location = /indexer/health {
    proxy_pass http://127.0.0.1:42069/health;
}
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sS https://arc.gudman.xyz/indexer/ | head -20
curl -sS -X POST https://arc.gudman.xyz/indexer/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ pipelines(limit:5){items{id status totalBudget}} }"}'
```

Expected: GraphQL returns the pipeline you created in #3 (or `items: []` if you skipped #3).

### Rollback

```bash
sudo systemctl disable --now arc-commerce-indexer.service
sudo rm /etc/systemd/system/arc-commerce-indexer.service
sudo systemctl daemon-reload
# remove the location /indexer/ block from nginx config and reload
sudo -u postgres psql -c "DROP DATABASE arc_commerce_indexer;"
sudo -u postgres psql -c "DROP USER arc_indexer;"
```
