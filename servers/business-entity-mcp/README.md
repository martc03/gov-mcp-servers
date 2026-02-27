# Business Entity Intelligence MCP Server

Look up company registrations, corporate filings, and business entity data worldwide from your AI assistant.

## Overview

This MCP (Model Context Protocol) server gives AI assistants access to corporate registry data spanning over 140 jurisdictions worldwide, plus the full SEC EDGAR database for US public companies. Use it to verify business registrations, check company status, find officers and directors, review SEC filings, and conduct due diligence research. The server combines the OpenCorporates global database of over 200 million companies with the SEC's comprehensive filing system, making it a powerful tool for legal professionals, compliance teams, investigators, journalists, and anyone who needs reliable business entity data.

## Available Tools

### `entity_search_companies`

Search the OpenCorporates database for companies across 140+ jurisdictions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Company name or search terms |
| `jurisdiction` | string | No | Jurisdiction code (e.g., `us_de`, `gb`, `us_ca`) |
| `status` | string | No | Company status filter (e.g., `Active`, `Dissolved`) |
| `limit` | number | No | Maximum results to return (default: 20) |

**Returns**: company name, company number, jurisdiction, incorporation status, incorporation date, registered address, OpenCorporates URL.

### `entity_get_company_details`

Retrieve full details for a specific company from OpenCorporates.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `jurisdiction` | string | Yes | Jurisdiction code (e.g., `us_de`, `gb`) |
| `companyNumber` | string | Yes | Official company registration number |

**Returns**: complete company record including officers and directors, filing history, registered address, agent information, industry codes, and alternative names.

### `entity_search_sec_companies`

Search SEC EDGAR for US publicly traded companies and their filings.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Company name, ticker, or search terms |
| `formType` | string | No | SEC form type filter (e.g., `10-K`, `10-Q`, `8-K`, `S-1`) |
| `limit` | number | No | Maximum results to return (default: 20) |

**Returns**: entity name, CIK number, form type, filing date, direct EDGAR URL.

## How to Connect

Add this MCP server to your AI client configuration:

```json
{
  "mcpServers": {
    "business-entity": {
      "type": "url",
      "url": "https://business-entity-mcp.apify.actor/mcp"
    }
  }
}
```

## Example Prompts

- "Search for all active companies named 'Acme' registered in Delaware."
- "Get the full details for company number 00445790 in the UK jurisdiction."
- "Find recent 10-K annual report filings from Tesla on SEC EDGAR."
- "Look up companies registered in California with 'solar' in the name."
- "Search for S-1 IPO filings submitted to the SEC in the last 6 months."
- "What is the registered address and status of Apple Inc. in its state of incorporation?"

## Common Jurisdiction Codes

Here are some frequently used jurisdiction codes for OpenCorporates queries:

| Code | Jurisdiction |
|------|-------------|
| `us_de` | Delaware, USA |
| `us_ca` | California, USA |
| `us_ny` | New York, USA |
| `us_tx` | Texas, USA |
| `gb` | United Kingdom |
| `ie` | Ireland |
| `ca` | Canada (Federal) |
| `de` | Germany |

## Pricing

Each tool call costs **$0.01**. No subscriptions, no monthly fees. You only pay for the queries you run.

## Data Sources

- **OpenCorporates** ([api.opencorporates.com](https://api.opencorporates.com/)): The largest open database of companies in the world, aggregating official company register data from over 140 jurisdictions. Includes company names, registration numbers, status, officers, filings, and registered addresses.
- **SEC EDGAR** ([efts.sec.gov](https://efts.sec.gov/)): The US Securities and Exchange Commission's Electronic Data Gathering, Analysis, and Retrieval system. Full-text search across all public company filings including annual reports (10-K), quarterly reports (10-Q), current reports (8-K), and registration statements.
