# Federal Financial Intelligence MCP Server

Query SEC corporate filings, Bureau of Labor Statistics employment data, and USDA crop and commodity prices through a single MCP interface. This server gives AI assistants structured access to three cornerstone federal data sources that drive financial analysis, economic research, and agricultural market intelligence.

Investors researching public companies, economists tracking labor trends, and agricultural analysts monitoring commodity markets can all query authoritative federal data through natural language -- no API expertise required.

## Available Tools

### `finance_search_sec_filings`

Search SEC EDGAR for corporate filings such as 10-K annual reports, 10-Q quarterly reports, 8-K events, and more.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Company name or keyword search |
| `formType` | string | No | SEC form type (e.g., "10-K", "10-Q", "8-K", "S-1") |
| `dateFrom` | string | No | Start date in YYYY-MM-DD format |
| `dateTo` | string | No | End date in YYYY-MM-DD format |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Entity name, form type, filing date, description, reporting period, file number, and direct EDGAR URL.

### `finance_get_employment_stats`

Retrieve Bureau of Labor Statistics time-series data for employment, unemployment, CPI, and other economic indicators.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `seriesIds` | string[] | Yes | BLS series IDs (e.g., ["LNS14000000"] for unemployment rate) |
| `startYear` | number | No | Start year for data range |
| `endYear` | number | No | End year for data range |

**Returns**: Series ID, year, period (month/quarter), value, and any applicable footnotes.

### `finance_get_crop_prices`

Get USDA crop and commodity price data from the National Agricultural Statistics Service.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `commodity` | string | No | Commodity name (e.g., "CORN", "WHEAT", "SOYBEANS") |
| `state` | string | No | State name (e.g., "IOWA", "CALIFORNIA") |
| `year` | number | No | Data year |
| `statisticalCategory` | string | No | Category (e.g., "PRICE RECEIVED", "PRODUCTION", "YIELD") |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Commodity name, state, year, value, unit of measurement, and statistical description.

## How to Connect

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "federal-financial-intel": {
      "type": "url",
      "url": "https://federal-financial-intel-mcp.apify.actor/mcp"
    }
  }
}
```

Compatible with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Example Prompts

- "Find the latest 10-K filings from Apple."
- "What is the current US unemployment rate from BLS?"
- "Show me corn prices in Iowa for 2024."
- "Search for SEC 8-K filings from Tesla in the past 6 months."
- "Get monthly CPI data for the last 2 years."
- "What was the average wheat yield in Kansas last year?"

## Pricing

This actor charges **$0.01 per tool call**. Each search query counts as one tool call regardless of the number of results returned.

## Data Sources

All data is sourced from official US government APIs:

- **SEC EDGAR Full-Text Search** -- [efts.sec.gov](https://efts.sec.gov/LATEST/search-index?q=%22test%22) -- Securities and Exchange Commission corporate filing database.
- **Bureau of Labor Statistics API** -- [api.bls.gov](https://api.bls.gov/publicAPI/v2/timeseries/data/) -- Employment statistics, CPI, PPI, and other economic indicators.
- **USDA NASS QuickStats API** -- [quickstats.nass.usda.gov](https://quickstats.nass.usda.gov/api) -- National Agricultural Statistics Service crop and commodity data.
