# Runbook

## Deployment

### Single Server

```bash
cd servers/{server-name}
npm run build
apify push
```

After push, the server auto-deploys on Apify in standby mode.

### All Servers

```bash
for server in servers/*/; do
  (cd "$server" && npm run build && apify push)
done
```

**Memory limit**: Apify free plan has 8192MB concurrent build limit. Push 2 at a time max if builds overlap.

### Gateway

```bash
cd gateway
npm run build
apify push
```

After push, abort any running standby instance to pick up the new build.

## Monitoring

### Check Server Health

Each server responds to non-standby runs with health data:

```bash
# Via Apify API
curl "https://api.apify.com/v2/acts/{actorId}/runs" \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -d '{}' | jq '.data.status'
```

Expected: `SUCCEEDED` with exit code 0.

### Check Standby Status

```bash
# Direct HTTP check
curl -s https://{server-name}.apify.actor/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
```

Should return a JSON-RPC response with server capabilities.

### Apify Console

- All actors: https://console.apify.com/actors
- Actor runs: https://console.apify.com/actors/{actorId}/runs
- Standby logs: visible in running standby instance

## Alerts & Common Issues

### "Under Maintenance" Flag

**Cause**: Health check runs timing out (100% timeout rate).

**Fix**: Ensure the health check gate is in `src/main.ts`:
```typescript
if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
    console.log("Non-standby run detected — running health check...");
    await Actor.pushData({ status: "healthy", ... });
    await Actor.exit("Health check passed");
}
```

Then rebuild and push:
```bash
npm run build && apify push
```

After push, manually unflag the actor in Apify Console.

### Stale Code After Push

**Cause**: Local `dist/` directory is stale and gets copied into Docker build context, overwriting the builder stage output.

**Fix**: Always build locally before pushing:
```bash
npm run build
apify push
```

The `.dockerignore` should exclude `dist/`, but local build is the safest guarantee.

### NVD Rate Limiting (cybersecurity-vuln-mcp)

**Symptom**: CVE lookups return errors or empty results.

**Cause**: Without an API key, NVD limits to 5 requests per 30 seconds.

**Fix**: Register at https://nvd.nist.gov/developers/request-an-api-key and set `NVD_API_KEY` as a secret environment variable on the cybersecurity-vuln-mcp actor. This increases the limit to 50 requests per 30 seconds.

### Gateway Returns Stale Data

**Cause**: Running standby instance uses old build.

**Fix**: Abort the current running standby in Apify Console. A new instance starts automatically with the latest build.

## Rollback

### Single Server

```bash
# View recent builds in Apify Console
# Or revert locally:
git log --oneline servers/{server-name}/
git checkout {commit-hash} -- servers/{server-name}/
cd servers/{server-name}
npm run build
apify push
```

### All Servers

```bash
git revert HEAD
for server in servers/*/; do
  (cd "$server" && npm run build && apify push)
done
```

## Key Actor IDs

| Server | Actor ID |
|--------|----------|
| us-safety-recalls-mcp | jUz9vhAagqYhYUS6b |
| natural-disaster-intel-mcp | IoiOhZLHxApBJDdb2 |
| federal-financial-intel-mcp | 8n9OTUhW3edDmxCdQ |
| immigration-travel-mcp | 4mszur30oWvLBudby |
| environmental-compliance-mcp | 2qQ9d5j6jz8sxnUll |
| gov-contracts-mcp | 12KQ6Z6RgGF9PYox4 |
| court-records-mcp | mcwBIzz80BhZWii6H |
| public-health-mcp | jRduNQ6KzGAuzp6eU |
| business-entity-mcp | qagGwj2oggueK3DNl |
| regulatory-monitor-mcp | KQBu1U4O87k5Fkug1 |
| grant-finder-mcp | v10P33X6mfLiJNZ1A |
| competitive-intel-mcp | zaEkpuNazzRUzNett |
| cybersecurity-vuln-mcp | TCeaSEcGKAqAD0Lea |
| us-gov-data-api (gateway) | K7Svnuf5M6JFOJWmg |

## Registry Publishing

### Publish All to Official MCP Registry

```bash
~/.local/bin/mcp-publisher login github
cd registry
for f in *.server.json; do
  ~/.local/bin/mcp-publisher publish "$f"
done
```

### Verify Registry Listing

```bash
curl -s "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.martc03" | python3 -m json.tool
```

## Directory Listings

| Directory | Status | Auto-updates? |
|-----------|--------|---------------|
| Official MCP Registry | Published | Manual (mcp-publisher) |
| PulseMCP | Pending (ingests from registry) | Yes (weekly) |
| Glama.ai | Submitted for review | No |
| mcp.so | Issue #587 submitted | No |
| mcpservers.org | 13 submitted | No |
| awesome-mcp-servers | PR #2459 | No |
