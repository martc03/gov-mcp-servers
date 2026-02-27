# Regulatory Change Monitor MCP Server

Track federal regulations, proposed rules, and agency notices directly from your AI assistant.

## Overview

This MCP (Model Context Protocol) server provides AI assistants with direct access to the Federal Register, the daily journal of the US government. Monitor new regulations, proposed rulemaking, presidential documents, and agency notices across all federal agencies. Search by keyword, agency, document type, date range, and significance level. Get full document details including regulatory text, effective dates, and docket information. This server is essential for compliance professionals, lobbyists, policy analysts, legal teams, and any organization that needs to stay current with federal regulatory activity.

## Available Tools

### `reg_search_documents`

Search Federal Register documents with flexible filtering.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `term` | string | No | Full-text search terms |
| `documentType` | string | No | One of: `RULE`, `PRORULE`, `NOTICE`, `PRESDOCU` |
| `agency` | string | No | Agency slug (e.g., `environmental-protection-agency`) |
| `dateFrom` | string | No | Publication start date (YYYY-MM-DD) |
| `dateTo` | string | No | Publication end date (YYYY-MM-DD) |
| `significant` | boolean | No | Filter to economically significant rules only |
| `perPage` | number | No | Results per page (default: 20) |
| `page` | number | No | Page number for pagination |

**Returns**: document number, title, type, abstract, agencies, publication date, HTML URL, citation, significant flag, action description.

### `reg_get_document`

Retrieve full details for a specific Federal Register document.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `documentNumber` | string | Yes | Federal Register document number (e.g., `2025-01234`) |

**Returns**: all document fields including full text URL, PDF URL, effective date, regulation ID numbers, docket IDs, CFR references, agency details, and complete abstract.

### `reg_search_public_inspection`

Search pre-publication documents currently on public inspection at the Office of the Federal Register.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `term` | string | No | Full-text search terms |
| `agency` | string | No | Agency slug |
| `documentType` | string | No | Document type filter |

**Returns**: document count and details for documents scheduled for upcoming publication.

### `reg_list_agencies`

List or search federal agencies that publish in the Federal Register.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Keyword to filter agency names |

**Returns**: agency name, slug identifier, URL, description, and recent article count.

## How to Connect

Add this MCP server to your AI client configuration:

```json
{
  "mcpServers": {
    "regulatory-monitor": {
      "type": "url",
      "url": "https://regulatory-monitor-mcp.apify.actor/mcp"
    }
  }
}
```

## Example Prompts

- "Find all significant final rules published by the EPA in the last 30 days."
- "Search for proposed rules related to artificial intelligence or machine learning."
- "Get the full details of Federal Register document number 2025-02187."
- "What presidential executive orders have been published this year?"
- "List all federal agencies and show me which ones have published the most documents recently."
- "Are there any documents on public inspection right now related to financial regulation?"

## Pricing

Each tool call costs **$0.01**. No subscriptions, no monthly fees. You only pay for the queries you run.

## Data Sources

All data is sourced from the [Federal Register API](https://www.federalregister.gov/developers/documentation/api/v1) (federalregister.gov/api/v1), the official API for the daily journal of the United States government. The Federal Register publishes rules, proposed rules, notices, and presidential documents from all federal agencies. Updated daily with new publications and public inspection documents.
