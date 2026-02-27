# Government Contracts & Procurement MCP Server

Search federal contract opportunities on SAM.gov, explore USASpending.gov award data, and look up registered government entities through a single MCP interface. This server gives AI assistants direct access to the federal procurement ecosystem, enabling businesses, researchers, and analysts to discover contract opportunities, track government spending, and verify entity registrations.

Small businesses pursuing government contracts, grant writers researching agency spending patterns, and journalists investigating federal procurement can all query these authoritative databases through natural language prompts.

## Available Tools

### `contracts_search_opportunities`

Search SAM.gov for active and recent federal contract opportunities, including solicitations, pre-solicitations, and award notices.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyword` | string | No | Keyword search across opportunity titles and descriptions |
| `naicsCode` | string | No | NAICS industry code (e.g., "541512" for computer systems design) |
| `postedFrom` | string | No | Start date in MM/DD/YYYY format |
| `postedTo` | string | No | End date in MM/DD/YYYY format |
| `limit` | number | No | Maximum results to return (default: 10) |
| `offset` | number | No | Results offset for pagination |

**Returns**: Notice ID, title, solicitation number, department, office, posted date, notice type, response deadline, NAICS code, set-aside type, description, and direct SAM.gov link.

> **Note**: This tool requires a SAM.gov API key. You can obtain one for free at [sam.gov](https://sam.gov).

### `contracts_search_spending`

Search USASpending.gov for federal award and spending data across contracts, grants, loans, and other financial assistance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyword` | string | No | Keyword search across award descriptions and recipients |
| `awardType` | string | No | Award type: `contracts`, `grants`, `loans`, `direct_payments`, `other` |
| `dateFrom` | string | No | Start date in YYYY-MM-DD format |
| `dateTo` | string | No | End date in YYYY-MM-DD format |
| `agency` | string | No | Awarding agency name |
| `limit` | number | No | Maximum results to return (default: 10) |
| `page` | number | No | Page number for pagination |

**Returns**: Award ID, recipient name, award amount, awarding agency, sub-agency, award type, start and end dates, and award description.

> **Note**: This tool works without any API key.

### `contracts_lookup_entity`

Look up entities registered in SAM.gov, including their registration status, CAGE codes, and NAICS codes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `legalBusinessName` | string | No | Legal business name to search |
| `ueiSAM` | string | No | Unique Entity Identifier (UEI) |
| `cageCode` | string | No | CAGE / NCAGE code |
| `state` | string | No | Two-letter state code (e.g., "VA", "CA") |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Legal business name, UEI, CAGE code, registration status, registration expiration date, physical address, and NAICS codes.

> **Note**: This tool requires a SAM.gov API key. You can obtain one for free at [sam.gov](https://sam.gov).

## How to Connect

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "gov-contracts": {
      "type": "url",
      "url": "https://gov-contracts-mcp.apify.actor/mcp"
    }
  }
}
```

Compatible with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Example Prompts

- "Find open contract opportunities for cybersecurity services on SAM.gov."
- "How much has the Department of Defense spent on AI contracts this year?"
- "Look up the SAM.gov registration for Lockheed Martin."
- "Search for small business set-aside contracts in NAICS code 541512."
- "Show me the largest grants awarded by the Department of Energy in 2024."
- "Is there a company with CAGE code 1XYZ3 registered in SAM.gov?"

## Pricing

This actor charges **$0.01 per tool call**. Each search query counts as one tool call regardless of the number of results returned.

## Data Sources

All data is sourced from official US government APIs:

- **SAM.gov Opportunities API** -- [api.sam.gov](https://api.sam.gov) -- Federal contract opportunities, solicitations, and award notices. Requires a free API key from [sam.gov](https://sam.gov).
- **USASpending.gov API** -- [api.usaspending.gov](https://api.usaspending.gov) -- Federal spending data including contracts, grants, loans, and other financial assistance. No API key required.
- **SAM.gov Entity Management API** -- [api.sam.gov](https://api.sam.gov) -- Registered entity data including UEI, CAGE codes, and registration status. Requires a free API key from [sam.gov](https://sam.gov).
