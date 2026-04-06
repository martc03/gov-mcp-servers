# Cybersecurity Vulnerability Intelligence MCP Server

Unified vulnerability intelligence from 4 government data sources in a single MCP server. Get enriched CVE lookups with CVSS scores, active exploitation status, exploitation probability, and ATT&CK techniques in one call.

| Source | What It Provides | Update Frequency |
|--------|-----------------|-----------------|
| **NIST NVD 2.0** | CVE details, CVSS scores, descriptions, references, CWE classifications | Continuous |
| **CISA KEV** | Actively exploited vulnerabilities catalog, remediation deadlines | Daily |
| **FIRST.org EPSS** | Exploitation probability scores (0-1) predicting likelihood of exploitation in next 30 days | Daily |
| **MITRE ATT&CK** | Adversary techniques mapped to CVEs | Quarterly |

## Tools

### `vuln_lookup_cve` — Enriched CVE Lookup

The killer feature. Look up any CVE and get intelligence from all 4 sources in a single call.

- **Input:** `{ cveId: "CVE-2021-44228" }`
- **Returns:** NVD details + CVSS score + KEV exploitation status + EPSS probability + ATT&CK techniques

### `vuln_search` — Search CVEs

Search the NVD by keyword, severity, and date range. Optionally filter to only actively exploited (KEV) vulnerabilities.

- **Input:** `{ keyword: "apache log4j", severity: "CRITICAL", hasKev: true, limit: 20 }`

### `vuln_kev_latest` — Recently Exploited Vulnerabilities

Get vulnerabilities recently added to CISA's Known Exploited Vulnerabilities catalog.

- **Input:** `{ days: 7, limit: 20 }`

### `vuln_kev_due_soon` — Upcoming Remediation Deadlines

Get KEV entries with remediation deadlines approaching. Critical for federal compliance.

- **Input:** `{ days: 14, limit: 20 }`

### `vuln_epss_top` — Highest Exploitation Probability

Get CVEs most likely to be exploited in the next 30 days based on EPSS machine learning model.

- **Input:** `{ threshold: 0.7, limit: 20 }`

### `vuln_trending` — Newly Published Critical CVEs

Get recently published high/critical severity CVEs from the NVD.

- **Input:** `{ days: 3, severity: "CRITICAL", limit: 20 }`

### `vuln_by_vendor` — Vendor Vulnerability Assessment

Search CVEs for a specific vendor/product. Cross-references with CISA KEV to flag actively exploited issues.

- **Input:** `{ vendor: "microsoft", product: "windows", limit: 20 }`

## Use Cases

- **Vulnerability triage**: Look up a CVE and instantly know if it's actively exploited, its EPSS score, and what ATT&CK techniques apply
- **Patch prioritization**: Combine KEV status + EPSS scores to prioritize remediation
- **Compliance tracking**: Monitor upcoming CISA KEV remediation deadlines
- **Threat intelligence**: Track trending CVEs and newly weaponized vulnerabilities
- **Vendor risk assessment**: Assess a vendor's vulnerability exposure and active exploitation status

## Quick Start

### Glama (hosted)

Install from [Glama.ai](https://glama.ai/mcp/servers/cybersecurity-vuln-mcp).

### Apify (hosted)

```json
{
  "mcpServers": {
    "cybersecurity": {
      "url": "https://cybersecurity-vuln-mcp.apify.actor/mcp"
    }
  }
}
```

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "cybersecurity": {
      "command": "node",
      "args": ["path/to/servers/cybersecurity-vuln-mcp/dist/stdio.js"],
      "env": {
        "NVD_API_KEY": "your-key-here"
      }
    }
  }
}
```

### Local (stdio)

```bash
git clone https://github.com/martc03/gov-mcp-servers.git
cd gov-mcp-servers/servers/cybersecurity-vuln-mcp
npm install && npm run build
node dist/stdio.js
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NVD_API_KEY` | No | NVD API key for higher rate limits (50 req/30s vs 5 req/30s). [Register here](https://nvd.nist.gov/developers/request-an-api-key). |

## Caching

| Data Source | TTL | Notes |
|-------------|-----|-------|
| NVD CVE lookups | 1 hour | Per-CVE |
| CISA KEV catalog | 2 hours | Full catalog |
| EPSS scores | 24 hours | Per-CVE |
| ATT&CK mappings | Static | Bundled with server |

## Architecture

- **Protocol**: MCP over stdio (Glama/local) or Streamable HTTP (Apify)
- **Runtime**: Node.js 18+, TypeScript
- **Data**: Direct API calls to free government data sources, zero cost
- **Caching**: In-memory with configurable TTLs

## Other Servers in This Repo

This repository contains 13 MCP servers for US government data. See each server's README for details.

| Server | Tools | Data Sources |
|--------|-------|--------------|
| [us-safety-recalls-mcp](servers/us-safety-recalls-mcp) | 4 | NHTSA recalls, FDA recalls |
| [natural-disaster-intel-mcp](servers/natural-disaster-intel-mcp) | 4 | FEMA disasters, NOAA weather, USGS earthquakes |
| [federal-financial-intel-mcp](servers/federal-financial-intel-mcp) | 4 | SEC EDGAR, CFPB complaints, BLS employment |
| [immigration-travel-mcp](servers/immigration-travel-mcp) | 3 | Visa bulletins, border wait times |
| [environmental-compliance-mcp](servers/environmental-compliance-mcp) | 3 | EPA air quality, HUD foreclosures |
| [gov-contracts-mcp](servers/gov-contracts-mcp) | 4 | SAM.gov contracts, USAspending |
| [court-records-mcp](servers/court-records-mcp) | 4 | PACER, federal court records |
| [public-health-mcp](servers/public-health-mcp) | 4 | NIH clinical trials, FDA adverse events |
| [business-entity-mcp](servers/business-entity-mcp) | 4 | SEC company search, SBA resources |
| [regulatory-monitor-mcp](servers/regulatory-monitor-mcp) | 4 | Federal Register, regulations.gov |
| [grant-finder-mcp](servers/grant-finder-mcp) | 4 | Grants.gov, USAspending |
| [competitive-intel-mcp](servers/competitive-intel-mcp) | 4 | SEC filings, patent data, trade data |

A [REST API gateway](gateway/) with 45 endpoints is also available at `govdata-api.netlify.app`.

## Attribution

- NVD: This product uses data from the NVD API but is not endorsed or certified by the NVD.
- EPSS: Data provided by FIRST.org (https://www.first.org/epss/).
- ATT&CK: Registered trademark of The MITRE Corporation. Licensed under Apache 2.0.
- KEV: CISA Known Exploited Vulnerabilities Catalog, US Government public domain.

## Custom MCP Server Development

Need a custom MCP server for your business? Visit [mcpdev.netlify.app](https://mcpdev.netlify.app) or email codee.mcpdev@gmail.com.

## License

MIT
