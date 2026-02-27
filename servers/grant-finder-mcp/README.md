# Federal Grant & Funding Finder MCP Server

Search and explore federal grant opportunities on Grants.gov directly from your AI assistant.

## Overview

This MCP (Model Context Protocol) server connects AI assistants to the official US federal grant database at Grants.gov. Discover funding opportunities across all federal agencies including HHS, DOE, NSF, DOD, EPA, NASA, and USDA. Search by keyword, agency, funding category, eligibility, and status. Retrieve full grant details including award amounts, deadlines, eligibility criteria, and application instructions. This server is built for grant writers, nonprofit organizations, researchers, university administrators, small businesses, and state and local governments seeking federal funding.

## Available Tools

### `grants_search_opportunities`

Search Grants.gov for federal funding opportunities with flexible filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyword` | string | No | Search terms for grant title or description |
| `status` | string | No | One of: `forecasted`, `posted`, `closed`, `archived` |
| `agency` | string | No | Federal agency code (e.g., `HHS`, `NSF`, `DOE`) |
| `fundingCategory` | string | No | Category of funding (e.g., `Health`, `Science`, `Education`) |
| `fundingInstrument` | string | No | Instrument type (e.g., `Grant`, `Cooperative Agreement`) |
| `eligibility` | string | No | Eligible applicant type (e.g., `Nonprofits`, `State governments`) |
| `limit` | number | No | Maximum results to return (default: 25) |
| `offset` | number | No | Number of results to skip for pagination |

**Returns**: opportunity ID, opportunity number, title, agency code and name, open and close dates, current status.

### `grants_get_opportunity`

Get comprehensive details for a specific grant opportunity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `opportunityNumber` | string | Yes | The official opportunity number (e.g., `HHS-2025-ACF-OCS-EE-0081`) |

**Returns**: full description, eligibility requirements, funding amounts (floor and ceiling), application deadlines, cost sharing requirements, contact information, and link to full announcement.

### `grants_search_by_agency`

Search for grants from a specific federal agency.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agency` | string | Yes | Agency code: `HHS`, `DOE`, `NSF`, `DOD`, `EPA`, `NASA`, or `USDA` |
| `keyword` | string | No | Additional keyword filter |
| `status` | string | No | Opportunity status filter |
| `limit` | number | No | Maximum results to return (default: 25) |

**Returns**: matching grant opportunities from the specified agency.

### `grants_get_filter_options`

Retrieve available filter values and counts for refining searches.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keyword` | string | No | Optional keyword to scope the filter counts |

**Returns**: lists of available agencies, funding categories, funding instruments, eligibility types, and status options, each with the count of matching opportunities.

## How to Connect

Add this MCP server to your AI client configuration:

```json
{
  "mcpServers": {
    "grant-finder": {
      "type": "url",
      "url": "https://grant-finder-mcp.apify.actor/mcp"
    }
  }
}
```

## Example Prompts

- "Find open grants from the NSF related to artificial intelligence research."
- "What HHS grants are currently posted for community health programs?"
- "Get the full details for grant opportunity number HHS-2025-ACF-OCS-EE-0081."
- "Search for EPA grants that nonprofits are eligible to apply for."
- "Show me all forecasted DOE grants related to clean energy and battery technology."
- "What funding categories and agencies are available for grants related to education?"

## Pricing

Each tool call costs **$0.01**. No subscriptions, no monthly fees. You only pay for the queries you run.

## Data Sources

All data is sourced from [Grants.gov](https://www.grants.gov/) via the official API ([api.grants.gov/v1/api/search2](https://api.grants.gov/v1/api/search2)). Grants.gov is the single access point for over 1,000 federal grant programs offered by 26 federal grant-making agencies. The database is updated continuously as agencies post new opportunities, modify existing ones, and close expired listings.
