# Competitive Intelligence MCP Server

Get SEC filings, news, and federal contract data for any company directly from your AI assistant.

## Overview

This MCP (Model Context Protocol) server equips AI assistants with a multi-source competitive intelligence capability. Investigate any company by pulling together SEC EDGAR filings, recent news coverage, and federal contract awards into a unified view. Run individual queries against each data source or use the combined profile tool to get a full competitive snapshot in a single call. This server is designed for business analysts, investors, sales teams, procurement professionals, and anyone conducting market research or competitive analysis who needs fast, structured access to public company intelligence.

## Available Tools

### `intel_company_filings`

Search SEC EDGAR for a company's regulatory filings.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companyName` | string | Yes | Company name or ticker symbol |
| `formType` | string | No | SEC form type (e.g., `10-K`, `10-Q`, `8-K`, `DEF 14A`) |
| `dateFrom` | string | No | Filing start date (YYYY-MM-DD) |
| `dateTo` | string | No | Filing end date (YYYY-MM-DD) |
| `limit` | number | No | Maximum results to return (default: 20) |

**Returns**: entity name, form type, filing date, description, reporting period, file number, direct EDGAR URL.

### `intel_company_news`

Search recent news articles mentioning a company.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Company name or topic to search for |
| `limit` | number | No | Maximum articles to return (default: 10) |

**Returns**: article title, link, published date, source outlet name.

### `intel_company_contracts`

Search federal contracts, grants, and loans awarded to a company via USASpending.gov.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companyName` | string | Yes | Company or recipient name |
| `awardType` | string | No | One of: `contracts`, `grants`, `loans`, `all` (default: `all`) |
| `dateFrom` | string | No | Award start date (YYYY-MM-DD) |
| `dateTo` | string | No | Award end date (YYYY-MM-DD) |
| `limit` | number | No | Maximum results to return (default: 20) |
| `page` | number | No | Page number for pagination |

**Returns**: award ID, recipient name, award amount, awarding agency, award type, start and end dates, description of work.

### `intel_company_profile`

Generate a full competitive intelligence snapshot combining all data sources in one call.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companyName` | string | Yes | Company name to investigate |

**Returns**: a combined object containing the 5 most recent SEC filings, 5 latest news articles, 5 recent federal contract awards, and summary statistics including total filing count, total contract count, and total contract dollar value.

## How to Connect

Add this MCP server to your AI client configuration:

```json
{
  "mcpServers": {
    "competitive-intel": {
      "type": "url",
      "url": "https://competitive-intel-mcp.apify.actor/mcp"
    }
  }
}
```

## Example Prompts

- "Give me a full competitive intelligence profile on Palantir Technologies."
- "What 10-K and 10-Q filings has Lockheed Martin submitted in the past year?"
- "Find recent news articles about Rivian Automotive."
- "How much has the Department of Defense awarded to Raytheon in federal contracts since 2023?"
- "Search for 8-K filings from CrowdStrike to find any material event disclosures."
- "Compare federal contract activity between Boeing and Northrop Grumman over the last two years."

## Pricing

Each tool call costs **$0.01**. No subscriptions, no monthly fees. You only pay for the queries you run.

## Data Sources

- **SEC EDGAR** ([efts.sec.gov](https://efts.sec.gov/)): The US Securities and Exchange Commission's full-text search system for public company filings. Covers all form types including annual reports, quarterly reports, proxy statements, and material event disclosures.
- **Google News RSS**: Aggregated recent news coverage from thousands of media outlets worldwide, providing up-to-date press coverage and media mentions.
- **USASpending.gov** ([api.usaspending.gov](https://api.usaspending.gov/)): The official source for federal spending data. Tracks all federal contracts, grants, loans, and other financial assistance awarded by US government agencies, with detailed recipient and transaction information.
