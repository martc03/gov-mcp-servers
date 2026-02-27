# US Government Data MCP Servers

13 production MCP (Model Context Protocol) servers that give AI agents real-time access to US government data. Built on [Apify](https://apify.com/martc03) with the [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Servers

### Tier 1 — Core Government Data
| Server | Tools | Data Sources |
|--------|-------|--------------|
| [us-safety-recalls-mcp](servers/us-safety-recalls-mcp) | 4 | NHTSA recalls, FDA recalls |
| [natural-disaster-intel-mcp](servers/natural-disaster-intel-mcp) | 4 | FEMA disasters, NOAA weather, USGS earthquakes |
| [federal-financial-intel-mcp](servers/federal-financial-intel-mcp) | 4 | SEC EDGAR, CFPB complaints, BLS employment |
| [immigration-travel-mcp](servers/immigration-travel-mcp) | 3 | Visa bulletins, border wait times |
| [environmental-compliance-mcp](servers/environmental-compliance-mcp) | 3 | EPA air quality, HUD foreclosures |

### Tier 2 — Specialized Data
| Server | Tools | Data Sources |
|--------|-------|--------------|
| [gov-contracts-mcp](servers/gov-contracts-mcp) | 4 | SAM.gov contracts, USAspending |
| [court-records-mcp](servers/court-records-mcp) | 4 | PACER, federal court records |
| [public-health-mcp](servers/public-health-mcp) | 4 | NIH clinical trials, FDA adverse events |
| [business-entity-mcp](servers/business-entity-mcp) | 4 | SEC company search, SBA resources |

### Tier 3 — AI Agent Tools
| Server | Tools | Data Sources |
|--------|-------|--------------|
| [regulatory-monitor-mcp](servers/regulatory-monitor-mcp) | 4 | Federal Register, regulations.gov |
| [grant-finder-mcp](servers/grant-finder-mcp) | 4 | Grants.gov, USAspending |
| [competitive-intel-mcp](servers/competitive-intel-mcp) | 4 | SEC filings, patent data, trade data |

### Cybersecurity
| Server | Tools | Data Sources |
|--------|-------|--------------|
| [cybersecurity-vuln-mcp](servers/cybersecurity-vuln-mcp) | 7 | NIST NVD 2.0, CISA KEV, FIRST.org EPSS, MITRE ATT&CK |

## REST API Gateway

The [gateway](gateway/) provides a unified REST API with 45 endpoints across all 13 categories. Deployed on Netlify at `govdata-api.netlify.app`.

## Quick Start

Each server runs on Apify in standby mode. Connect any MCP client:

```json
{
  "mcpServers": {
    "cybersecurity": {
      "url": "https://cybersecurity-vuln-mcp.apify.actor/mcp"
    }
  }
}
```

Or use the Apify store: [apify.com/martc03](https://apify.com/martc03)

## Architecture

- **Runtime**: Apify Actors in standby mode (long-running HTTP servers)
- **Protocol**: MCP over Streamable HTTP (`StreamableHTTPServerTransport`)
- **Data**: Direct calls to free government APIs — zero API cost
- **Caching**: In-memory caching per server (configurable TTLs)

## Tech Stack

- TypeScript + Node.js
- `@modelcontextprotocol/sdk` for MCP protocol
- `apify` SDK for Actor lifecycle
- Express for HTTP routing
- Docker for deployment

## Custom MCP Server Development

Need a custom MCP server for your business? Visit [mcpdev.netlify.app](https://mcpdev.netlify.app) or email codee.mcpdev@gmail.com.

## License

MIT
