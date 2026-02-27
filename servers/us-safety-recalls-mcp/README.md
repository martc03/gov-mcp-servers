# US Safety Recalls MCP Server

Search vehicle recalls, FDA drug/food/device recalls, and consumer financial complaints through a single MCP interface. This server aggregates safety data from three major federal agencies -- NHTSA, FDA, and CFPB -- giving AI assistants instant access to public safety recall and complaint records.

Whether you are a consumer researching a used car, a compliance analyst monitoring product recalls, or a journalist investigating complaint patterns, this server provides structured, queryable access to data that would otherwise require navigating three separate government websites.

## Available Tools

### `safety_search_vehicle_recalls`

Search NHTSA vehicle recall campaigns by make, model, year, or component.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `make` | string | No | Vehicle manufacturer (e.g., "Toyota", "Ford") |
| `modelYear` | number | No | Model year (e.g., 2020) |
| `component` | string | No | Vehicle component (e.g., "AIR BAGS", "BRAKES") |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Campaign number, manufacturer, make, model, year, component, summary, consequence, remedy, parkIt flag (immediate stop-driving advisory), and number of units affected.

### `safety_search_fda_recalls`

Search FDA recalls for drugs, food products, and medical devices.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `productType` | string | No | One of: `drugs`, `food`, `devices` |
| `searchTerm` | string | No | Free-text search across product descriptions |
| `classification` | string | No | Recall severity: Class I (most serious), II, or III |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Recall number, product type, classification, recalling firm, product description, reason for recall, and distribution pattern.

### `safety_search_consumer_complaints`

Search CFPB consumer complaints about financial products and services.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `searchTerm` | string | No | Free-text search across complaint narratives |
| `product` | string | No | Financial product (e.g., "Mortgage", "Credit card") |
| `company` | string | No | Company name |
| `state` | string | No | Two-letter state code (e.g., "CA", "TX") |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Complaint ID, product, issue, company, state, date received, and company response status.

## How to Connect

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "us-safety-recalls": {
      "type": "url",
      "url": "https://us-safety-recalls-mcp.apify.actor/mcp"
    }
  }
}
```

Compatible with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Example Prompts

- "Are there any recalls on 2019 Honda CR-V air bags?"
- "Show me Class I FDA food recalls from the past month."
- "What consumer complaints have been filed against Wells Fargo in California?"
- "Find vehicle recalls related to brake failures in 2022 Teslas."
- "Search for FDA medical device recalls mentioning pacemaker."
- "How many CFPB complaints mention student loans in New York?"

## Pricing

This actor charges **$0.01 per tool call**. Each search query counts as one tool call regardless of the number of results returned.

## Data Sources

All data is sourced from official US government APIs:

- **NHTSA Recalls API** -- [api.nhtsa.gov](https://api.nhtsa.gov) -- National Highway Traffic Safety Administration vehicle recall database.
- **openFDA API** -- [api.fda.gov](https://api.fda.gov) -- FDA drug, food, and medical device recall enforcement reports.
- **CFPB Consumer Complaint Database** -- [consumerfinance.gov](https://www.consumerfinance.gov/data-research/consumer-complaints/) -- Consumer Financial Protection Bureau public complaint records.
