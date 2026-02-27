# Public Health Intelligence MCP Server

Query CDC datasets and WHO global health indicators directly from your AI assistant.

## Overview

This MCP (Model Context Protocol) server connects AI assistants to the world's most authoritative public health data sources. Access the CDC's extensive collection of surveillance datasets covering COVID-19, influenza, chronic disease indicators, vaccination rates, and hundreds of other health topics. Query the WHO Global Health Observatory for international health metrics across 194 member states. This server transforms complex epidemiological databases into conversational data access, enabling public health professionals, researchers, journalists, and policymakers to get answers without writing API queries or navigating data portals.

## Available Tools

### `health_get_cdc_data`

Query any CDC dataset available through the Socrata open data platform.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `datasetId` | string | Yes | Socrata dataset identifier (e.g., `9mfq-cb36` for COVID cases) |
| `filters` | object | No | Key-value pairs for filtering rows (column name to value) |
| `limit` | number | No | Maximum rows to return (default: 100) |
| `offset` | number | No | Number of rows to skip for pagination |

**Returns**: dataset rows as JSON objects. Common datasets include COVID-19 case surveillance, flu surveillance (ILINet), chronic disease indicators, BRFSS survey data, and vaccination coverage statistics.

### `health_get_who_indicator`

Retrieve WHO Global Health Observatory indicator data by country and year.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `indicatorCode` | string | Yes | WHO GHO indicator code (e.g., `WHOSIS_000001` for life expectancy) |
| `country` | string | No | ISO 3166-1 alpha-3 country code (e.g., `USA`, `GBR`, `JPN`) |
| `year` | number | No | Specific year to retrieve data for |

**Returns**: indicator values organized by country and year, including dimension breakdowns where available (sex, age group, region).

### `health_list_who_indicators`

Browse and search available WHO Global Health Observatory indicators.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `search` | string | No | Keyword to filter indicators by name or description |

**Returns**: list of indicator codes, display names, and descriptions matching the search criteria.

## How to Connect

Add this MCP server to your AI client configuration:

```json
{
  "mcpServers": {
    "public-health": {
      "type": "url",
      "url": "https://public-health-mcp.apify.actor/mcp"
    }
  }
}
```

## Example Prompts

- "Get the latest CDC COVID-19 case surveillance data for California."
- "What is the life expectancy in Japan compared to the United States according to WHO data?"
- "Pull CDC flu surveillance data from the 2024-2025 season."
- "List all WHO indicators related to maternal mortality."
- "Show me chronic disease indicator data for diabetes prevalence across US states."
- "What are the WHO tuberculosis incidence rates for Sub-Saharan African countries?"

## Common CDC Dataset IDs

Here are some frequently used CDC dataset identifiers for the `datasetId` parameter:

| Dataset ID | Description |
|------------|-------------|
| `9mfq-cb36` | COVID-19 case surveillance public use data |
| `unsk-b7fc` | United States COVID-19 community levels by county |
| `hk9y-quqm` | Indicators of anxiety or depression (Household Pulse) |
| `5cdz-s4pr` | Behavioral Risk Factor Surveillance System (BRFSS) |
| `g4ie-h725` | National Immunization Survey - flu vaccination |

## Pricing

Each tool call costs **$0.01**. No subscriptions, no monthly fees. You only pay for the queries you run.

## Data Sources

- **CDC Open Data** ([data.cdc.gov](https://data.cdc.gov/)): Accessed via the Socrata SODA API. Hundreds of public health datasets including disease surveillance, behavioral risk factors, vaccination coverage, environmental health, and vital statistics.
- **WHO Global Health Observatory** ([ghoapi.azureedge.net](https://ghoapi.azureedge.net/)): Accessed via the OData API. Over 2,000 health indicators covering 194 WHO member states, including mortality, morbidity, risk factors, health systems, and sustainable development goal tracking.
