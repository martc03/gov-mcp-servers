---
title: Building 13 MCP Servers for US Government Data: From CVE Lookups to Disaster Alerts
published: false
description: How I built and deployed 13 production MCP servers that give AI agents real-time access to US government data — cybersecurity vulnerabilities, safety recalls, natural disasters, and more.
tags: ai, mcp, typescript, opensource
cover_image:
---

If you've used Claude Desktop, Cursor, or any AI assistant that supports tool calling, you've probably wondered: *what if my AI could pull live data from real sources instead of relying on training data?*

That's exactly what [MCP (Model Context Protocol)](https://modelcontextprotocol.io) enables. It's an open standard by Anthropic that lets AI assistants call external tools — databases, APIs, services — through a standardized interface.

I built **13 production MCP servers** that connect AI agents to free US government APIs. All open source, all deployed, all published to the Official MCP Registry.

**GitHub**: [github.com/martc03/gov-mcp-servers](https://github.com/martc03/gov-mcp-servers)

## What I Built

### The Servers

| Category | Server | Tools | Data Sources |
|----------|--------|-------|-------------|
| Cybersecurity | cybersecurity-vuln-mcp | 7 | NIST NVD 2.0, CISA KEV, EPSS, MITRE ATT&CK |
| Safety | us-safety-recalls-mcp | 4 | NHTSA vehicle recalls, FDA food/drug recalls |
| Disasters | natural-disaster-intel-mcp | 4 | FEMA, NOAA weather, USGS earthquakes |
| Finance | federal-financial-intel-mcp | 4 | SEC EDGAR, CFPB complaints, BLS employment |
| Contracts | gov-contracts-mcp | 4 | SAM.gov, USAspending |
| Legal | court-records-mcp | 4 | Federal courts, PACER |
| Health | public-health-mcp | 4 | NIH clinical trials, FDA adverse events |
| Business | business-entity-mcp | 4 | SEC company search, SBA |
| Travel | immigration-travel-mcp | 3 | Visa bulletins, border wait times |
| Environment | environmental-compliance-mcp | 3 | EPA air quality, HUD foreclosures |
| Regulations | regulatory-monitor-mcp | 4 | Federal Register, regulations.gov |
| Grants | grant-finder-mcp | 4 | Grants.gov, USAspending |
| Intel | competitive-intel-mcp | 4 | SEC filings, patents, trade data |

Plus a REST API gateway with 45 endpoints across all 13 categories.

### The Key Insight

Every one of these data sources is a **free government API**. No API keys required for most of them. Zero data cost. The US government publishes an enormous amount of structured data through public APIs — most developers just don't know they exist.

## Architecture

Every server follows the same pattern:

```
User → MCP Client (Claude/Cursor) → Streamable HTTP → MCP Server → Government API
```

### Tech Stack

- **TypeScript** — Type safety for API response parsing
- **@modelcontextprotocol/sdk** — Official MCP SDK for tool definitions
- **Express** — HTTP server for Streamable HTTP transport
- **Apify** — Hosting platform (standby mode = long-running HTTP server)
- **Docker** — Consistent deployment across all 13 servers

### The Server Pattern

Every server follows an identical structure:

```typescript
import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";

await Actor.init();

// Health check gate — exit cleanly for non-standby runs
if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
    await Actor.pushData({ status: "healthy" });
    await Actor.exit("Health check passed");
}

// Create MCP server with tools
const mcp = new McpServer({
    name: "my-server",
    version: "1.0.0",
});

// Define tools
mcp.tool("search_recalls", { query: z.string() }, async ({ query }) => {
    const data = await fetch(`https://api.fda.gov/food/recall.json?search=${query}`);
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
});

// Wire up Express + MCP transport
const app = express();
app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport("/mcp", res);
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
});

const port = process.env.APIFY_ACTOR_STANDBY_PORT || 3000;
app.listen(port);
```

This pattern repeats across all 13 servers. The only thing that changes is the tool definitions and the government APIs they call.

## The Cybersecurity Server: A Deep Dive

The cybersecurity server is the most complex one, querying 4 data sources in parallel using `Promise.allSettled`:

### Data Sources

1. **NIST NVD 2.0** — The National Vulnerability Database. Full CVE details, CVSS scores (v2, v3, v4), descriptions, references.

2. **CISA KEV** — The Known Exploited Vulnerabilities catalog. If a CVE is in KEV, it's been actively exploited in the wild and federal agencies have mandatory remediation deadlines.

3. **FIRST.org EPSS** — Exploitation Prediction Scoring System. A probability score (0-1) predicting the likelihood of exploitation in the next 30 days.

4. **MITRE ATT&CK** — Maps CVEs to adversary techniques and tactics. I pre-computed a mapping of 172 CVEs to 42 techniques across 12 tactics from the STIX bundle.

### Enriched Lookup

When you query `vuln_lookup_cve` with a CVE ID like `CVE-2021-44228` (Log4Shell), all 4 sources are queried simultaneously:

```
CVSS: 10.0 CRITICAL
EPSS: 0.944 (94.4% exploitation probability, 99th percentile)
KEV: YES — Remediation due 2021-12-24
ATT&CK: T1190 (Exploit Public-Facing Application),
         T1203 (Exploitation for Client Execution),
         T1595.002 (Vulnerability Scanning)
```

This kind of enriched view would normally require manually checking 4 different websites. Now an AI agent gets it in one tool call.

## Lessons Learned

### 1. The Dockerfile Gotcha

The biggest debugging headache was a stale `dist/` directory. Our Dockerfile uses a multi-stage build:

```dockerfile
FROM node:18 AS builder
COPY . ./
RUN npm run build

FROM node:18
COPY --from=builder /home/myuser/dist ./dist
COPY . ./  # This overwrites builder's dist with local stale dist!
```

That final `COPY . ./` copies everything from the local build context — including a potentially stale `dist/` folder — overwriting the freshly built one from the builder stage.

**Fix**: Added `.dockerignore` excluding `dist/` and always running `npm run build` locally before pushing.

### 2. Apify Health Check Detection

Apify's platform runs periodic health checks on actors. For MCP servers in standby mode (long-running HTTP servers), these health checks would start the actor as a normal run, causing it to hang waiting for HTTP requests that never come — resulting in timeouts.

**Fix**: Check `APIFY_META_ORIGIN`:
- `"STANDBY"` = normal MCP server mode
- `"API"` = health check run → push data and exit immediately

### 3. Government APIs Are Better Than You Think

Many of these APIs are surprisingly well-designed:
- NVD 2.0 has clean JSON responses with comprehensive CVE data
- FEMA's API supports geospatial queries
- FDA's openFDA API supports complex Elasticsearch-style queries
- BLS has structured time-series data going back decades

The documentation can be sparse, but the APIs themselves are solid.

## How to Use These Servers

### Claude Desktop

Add to your Claude Desktop MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "cybersecurity": {
      "url": "https://cybersecurity-vuln-mcp.apify.actor/mcp"
    },
    "safety-recalls": {
      "url": "https://us-safety-recalls-mcp.apify.actor/mcp"
    },
    "disasters": {
      "url": "https://natural-disaster-intel-mcp.apify.actor/mcp"
    }
  }
}
```

### Any MCP Client

All 13 servers are published to the [Official MCP Registry](https://registry.modelcontextprotocol.io). Search for `io.github.martc03` to find them all.

## What's Next

- Adding more government data sources (Census, NOAA climate, USPTO patents)
- Building a unified dashboard for monitoring all 13 servers
- Writing more detailed tool documentation with example queries

If you need a custom MCP server for your business, I build these professionally. Check out [mcpdev.netlify.app](https://mcpdev.netlify.app) or reach out at codee.mcpdev@gmail.com.

---

*All 13 servers are open source: [github.com/martc03/gov-mcp-servers](https://github.com/martc03/gov-mcp-servers)*
