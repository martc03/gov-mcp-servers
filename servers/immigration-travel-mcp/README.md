# Immigration & Travel Intelligence MCP Server

Check US visa appointment wait times, land border crossing delays, and FAA airport status through a single MCP interface. This server provides AI assistants with real-time and near-real-time travel intelligence from three federal agencies, helping travelers, immigration attorneys, and logistics professionals make informed decisions.

Planning an international trip, preparing a visa application timeline, or routing freight across the US-Mexico border? This server delivers the official government data you need, structured for instant AI-powered analysis.

## Available Tools

### `travel_get_visa_wait_times`

Get current US visa interview appointment wait times at embassies and consulates worldwide.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `country` | string | No | Country name (e.g., "India", "Mexico", "Brazil") |
| `city` | string | No | City name of the consular post (e.g., "Mumbai", "Ciudad Juarez") |
| `visaCategory` | string | No | Visa type (e.g., "Visitor Visa", "Student/Exchange Visitor Visa") |

**Returns**: City, country, visa category, estimated wait time in calendar days, and date of last update.

### `travel_get_border_wait_times`

Get current wait times at US land border crossings along the Canadian and Mexican borders.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `border` | string | No | Border: "Canadian" or "Mexican" |
| `port` | string | No | Port of entry name (e.g., "San Ysidro", "Buffalo-Niagara Falls") |

**Returns**: Port name, border, crossing type (commercial or passenger), lane type (standard, SENTRI, NEXUS, FAST), and current delay in minutes.

### `travel_get_airport_delays`

Get current FAA-reported airport delays and ground stops across the US National Airspace System.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `airport` | string | No | IATA airport code (e.g., "JFK", "LAX", "ORD") |

**Returns**: Airport code, airport name, delay type, reason for delay, average delay duration, and estimated end time.

## How to Connect

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "immigration-travel": {
      "type": "url",
      "url": "https://immigration-travel-mcp.apify.actor/mcp"
    }
  }
}
```

Compatible with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Example Prompts

- "What is the current visa wait time for visitor visas in New Delhi?"
- "How long is the border wait at San Ysidro right now?"
- "Are there any delays at JFK airport?"
- "Compare visa wait times for student visas across all US consulates in Brazil."
- "What are the SENTRI lane wait times at the Mexican border?"
- "Show me all airports currently experiencing ground stops."

## Pricing

This actor charges **$0.01 per tool call**. Each search query counts as one tool call regardless of the number of results returned.

## Data Sources

All data is sourced from official US government systems:

- **US Department of State** -- [travel.state.gov](https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/wait-times.html) -- Visa appointment wait time data for embassies and consulates worldwide.
- **US Customs and Border Protection** -- [bwt.cbp.gov](https://bwt.cbp.gov/) -- Real-time border wait times at all US land ports of entry.
- **Federal Aviation Administration** -- [nasstatus.faa.gov](https://nasstatus.faa.gov/) -- National Airspace System status including airport delays and ground stops.
