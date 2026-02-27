# Contributing Guide

## Project Structure

```
gov-mcp-servers/
├── servers/                    # 13 MCP servers
│   ├── cybersecurity-vuln-mcp/
│   ├── us-safety-recalls-mcp/
│   ├── natural-disaster-intel-mcp/
│   ├── federal-financial-intel-mcp/
│   ├── immigration-travel-mcp/
│   ├── environmental-compliance-mcp/
│   ├── gov-contracts-mcp/
│   ├── court-records-mcp/
│   ├── public-health-mcp/
│   ├── business-entity-mcp/
│   ├── regulatory-monitor-mcp/
│   ├── grant-finder-mcp/
│   └── competitive-intel-mcp/
├── gateway/                    # REST API gateway (45 endpoints)
├── registry/                   # Official MCP Registry server.json files
├── README.md
├── LICENSE
└── .gitignore
```

Each server follows an identical layout:

```
servers/{name}/
├── src/main.ts                 # Server entry point + MCP tool definitions
├── .actor/
│   ├── actor.json              # Apify Actor configuration
│   ├── input_schema.json       # Actor input schema
│   └── pay_per_event.json      # Monetization config
├── Dockerfile                  # Multi-stage build (builder + runner)
├── .dockerignore               # Excludes node_modules, dist, .git
├── package.json
├── tsconfig.json
└── README.md
```

## Development Workflow

### Prerequisites

- Node.js >= 18
- npm
- [Apify CLI](https://docs.apify.com/cli) (`npm install -g apify-cli`)
- An [Apify account](https://apify.com)

### Local Development

```bash
# Navigate to a server
cd servers/cybersecurity-vuln-mcp

# Install dependencies
npm install

# Run locally (dev mode with tsx)
npm run start:dev

# Build TypeScript
npm run build

# Run production build
npm start
```

### Available Scripts (per server)

| Script | Command | Description |
|--------|---------|-------------|
| `start` | `node dist/main.js` | Run compiled production build |
| `start:dev` | `npx tsx src/main.ts` | Run in dev mode with TypeScript |
| `build` | `tsc` | Compile TypeScript to dist/ |
| `test` | — | No tests yet |

### Deploying to Apify

```bash
cd servers/{server-name}

# Build locally first (prevents stale dist in Docker)
npm run build

# Push to Apify
apify push
```

**Important**: Always run `npm run build` locally before `apify push`. The Dockerfile copies local files, and stale `dist/` can overwrite the Docker builder's fresh output. The `.dockerignore` mitigates this, but a local build is the safest approach.

### Deploying All Servers

```bash
# Build and push all 13 (2 at a time to stay under 8192MB memory limit)
for server in servers/*/; do
  echo "=== Deploying $(basename $server) ==="
  cd "$server"
  npm run build
  apify push
  cd ../..
done
```

## Environment Variables

| Variable | Required | Used By | Description |
|----------|----------|---------|-------------|
| `APIFY_TOKEN` | Yes | All | Apify API token (set via `apify login`) |
| `APIFY_META_ORIGIN` | Auto | All | Set by Apify runtime. `"STANDBY"` for HTTP mode, `"API"` for health checks |
| `APIFY_ACTOR_STANDBY_PORT` | Auto | All | Port for standby HTTP server |
| `NVD_API_KEY` | Optional | cybersecurity-vuln-mcp | NIST NVD API key for higher rate limits (50 req/30s vs 5 req/30s) |

## Architecture

### MCP Server Pattern

Every server follows the same pattern:

1. `Actor.init()` — Initialize Apify runtime
2. Health check gate — If `APIFY_META_ORIGIN !== "STANDBY"`, push health data and exit
3. Create `McpServer` with tool definitions
4. Create Express app with `StreamableHTTPServerTransport`
5. Listen on `APIFY_ACTOR_STANDBY_PORT`

### Data Sources

All servers call free government APIs directly. No API keys required (except optional NVD key for higher rate limits). Zero data cost.

### Caching

Each server uses in-memory caching with configurable TTLs to reduce API calls to government endpoints.

## Adding a New Server

1. Copy an existing server directory as a template
2. Update `package.json` name and description
3. Update `.actor/actor.json` with new Actor metadata
4. Implement MCP tools in `src/main.ts`
5. Update root `README.md` with the new server
6. Create `registry/{name}.server.json` for the Official MCP Registry
7. Deploy with `npm run build && apify push`

## Publishing to MCP Registry

Server definitions live in `registry/`. After changes:

```bash
~/.local/bin/mcp-publisher login github
~/.local/bin/mcp-publisher publish registry/{name}.server.json
```
