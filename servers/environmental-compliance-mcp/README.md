# Environmental & Housing Intelligence MCP Server

Check EPA air quality conditions and search HUD foreclosure property listings through a single MCP interface. This server connects AI assistants to federal environmental and housing data, supporting real estate investors, public health researchers, urban planners, and anyone who needs to assess air quality or find government-owned property deals.

Whether you are evaluating neighborhood livability, monitoring pollution levels for health research, or hunting for below-market HUD homes, this server delivers structured federal data directly to your AI assistant.

## Available Tools

### `env_get_air_quality`

Get current EPA air quality index (AQI) readings and pollutant concentrations by state and pollutant type.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | No | Two-letter state code (e.g., "CA", "TX") |
| `pollutant` | string | No | Pollutant type (e.g., "PM2.5", "PM10", "Ozone", "NO2", "SO2", "CO") |

**Returns**: Monitoring station name, state, current AQI value, pollutant measured, concentration level, EPA category (Good, Moderate, Unhealthy for Sensitive Groups, Unhealthy, Very Unhealthy, Hazardous), and station coordinates (latitude/longitude).

### `env_search_hud_foreclosures`

Search HUD-owned foreclosure properties available for purchase across the United States.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | No | Two-letter state code (e.g., "FL", "OH") |
| `zipCode` | string | No | Five-digit ZIP code |
| `minPrice` | number | No | Minimum list price in dollars |
| `maxPrice` | number | No | Maximum list price in dollars |
| `bedrooms` | number | No | Minimum number of bedrooms |

**Returns**: Case number, full street address, city, state, list price, number of bedrooms, number of bathrooms, square footage, property type, listing date, listing status, and property coordinates (latitude/longitude).

## How to Connect

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "environmental-compliance": {
      "type": "url",
      "url": "https://environmental-compliance-mcp.apify.actor/mcp"
    }
  }
}
```

Compatible with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Example Prompts

- "What is the current air quality in California?"
- "Show me HUD foreclosures in Florida under $150,000 with at least 3 bedrooms."
- "Are PM2.5 levels elevated in any Texas monitoring stations?"
- "Find HUD homes in ZIP code 44102."
- "Compare ozone levels across all monitoring stations in the Northeast."
- "What foreclosure properties are available in Ohio under $100,000?"

## Pricing

This actor charges **$0.01 per tool call**. Each search query counts as one tool call regardless of the number of results returned.

## Data Sources

All data is sourced from official US government systems:

- **EPA AirNow API** -- [airnowtech.org](https://www.airnowtech.org/) -- Real-time air quality index readings and pollutant monitoring data from EPA monitoring stations nationwide.
- **HUD Home Store** -- [hudhomestore.gov](https://www.hudhomestore.gov/) -- US Department of Housing and Urban Development foreclosure property listings.
