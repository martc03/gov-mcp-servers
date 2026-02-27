# Court Records & Legal Research MCP Server

Search federal court opinions, case dockets, and judge profiles directly from your AI assistant.

## Overview

This MCP (Model Context Protocol) server gives AI assistants real-time access to the largest open collection of US court data. Powered by the CourtListener database maintained by the Free Law Project, it enables legal research workflows that previously required specialized tools or expensive subscriptions. Search millions of federal court opinions by keyword, court, and date range. Look up case dockets from the RECAP archive. Retrieve detailed judge profiles including appointment history, education, and court assignments. Whether you are a legal professional, journalist, researcher, or civic technologist, this server turns natural language questions into structured legal data.

## Available Tools

### `court_search_opinions`

Search federal court opinions across all US jurisdictions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search terms (case name, topic, legal concept) |
| `court` | string | No | Court identifier (e.g., `scotus`, `ca9`, `nysd`) |
| `dateFrom` | string | No | Start date filter (YYYY-MM-DD) |
| `dateTo` | string | No | End date filter (YYYY-MM-DD) |
| `limit` | number | No | Maximum results to return (default: 20) |

**Returns**: case name, court, date filed, citation, docket number, opinion text excerpt, URL to full opinion.

### `court_search_dockets`

Search case dockets via the RECAP archive of PACER records.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Search terms (case name, party, topic) |
| `court` | string | No | Court identifier |
| `dateFrom` | string | No | Start date filter (YYYY-MM-DD) |
| `dateTo` | string | No | End date filter (YYYY-MM-DD) |
| `limit` | number | No | Maximum results to return (default: 20) |

**Returns**: case name, court, docket number, date filed, parties involved, URL to docket.

### `court_search_judges`

Search federal judge profiles and biographical information.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Judge name or search terms |
| `court` | string | No | Court identifier |
| `limit` | number | No | Maximum results to return (default: 20) |

**Returns**: judge name, court, appointment date, appointing president, born/died dates, education history.

## How to Connect

Add this MCP server to your AI client configuration:

```json
{
  "mcpServers": {
    "court-records": {
      "type": "url",
      "url": "https://court-records-mcp.apify.actor/mcp"
    }
  }
}
```

## Example Prompts

- "Find Supreme Court opinions about Fourth Amendment search and seizure from 2023 to 2025."
- "Search for dockets involving Apple Inc. in the Northern District of California."
- "Look up all federal judges appointed by President Obama to the Ninth Circuit."
- "Find recent opinions from the Southern District of New York about securities fraud."
- "Search for cases related to patent infringement in the Federal Circuit from the last year."
- "Who are the current judges on the DC Circuit Court of Appeals?"

## Pricing

Each tool call costs **$0.01**. No subscriptions, no monthly fees. You only pay for the queries you run.

## Data Sources

All data is sourced from the [CourtListener](https://www.courtlistener.com/) platform, maintained by the [Free Law Project](https://free.law/). CourtListener aggregates court opinions, dockets from the RECAP archive, and judicial biographical data across the entire US federal court system.

- **Court Opinions**: Millions of opinions from SCOTUS, circuit courts, and district courts
- **RECAP Dockets**: Crowd-sourced PACER docket data, freely accessible
- **Judge Data**: Comprehensive biographical and appointment information
