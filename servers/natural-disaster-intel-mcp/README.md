# Natural Disaster Intelligence MCP Server

Monitor FEMA disaster declarations, active weather alerts, and earthquake activity through a single MCP interface. This server connects AI assistants to three critical federal data sources for natural disaster awareness, enabling real-time situational intelligence and historical disaster research.

Emergency managers, insurance professionals, researchers, and concerned citizens can use this server to query active weather threats, review FEMA disaster history for any state, or search recent seismic activity worldwide -- all through natural language prompts to an AI assistant.

## Available Tools

### `disaster_search_fema_declarations`

Search FEMA disaster declarations by state, type, and date range.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | No | Two-letter state code (e.g., "FL", "CA") |
| `disasterType` | string | No | Declaration type (e.g., "DR" for major disaster, "EM" for emergency) |
| `dateFrom` | string | No | Start date in YYYY-MM-DD format |
| `dateTo` | string | No | End date in YYYY-MM-DD format |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Disaster number, state, declaration type, title, incident type, begin and end dates, and close-out date.

### `disaster_get_weather_alerts`

Get active NOAA/National Weather Service alerts for any US state or territory.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | No | Two-letter state code (e.g., "TX", "OK") |
| `severity` | string | No | Alert severity: Extreme, Severe, Moderate, Minor, Unknown |
| `urgency` | string | No | Alert urgency: Immediate, Expected, Future, Past, Unknown |
| `event` | string | No | Event type (e.g., "Tornado Warning", "Flash Flood Watch") |

**Returns**: Alert ID, event type, severity, urgency, headline, full description, affected area, effective date, and expiration date.

### `disaster_search_earthquakes`

Search USGS earthquake data by magnitude, location, and date range.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `minMagnitude` | number | No | Minimum magnitude (e.g., 4.0) |
| `dateFrom` | string | No | Start date in YYYY-MM-DD format |
| `dateTo` | string | No | End date in YYYY-MM-DD format |
| `latitude` | number | No | Center latitude for radius search |
| `longitude` | number | No | Center longitude for radius search |
| `maxRadiusKm` | number | No | Search radius in kilometers (requires lat/lon) |
| `limit` | number | No | Maximum results to return (default: 10) |

**Returns**: Magnitude, place description, time, coordinates (latitude, longitude), depth in km, tsunami flag, and USGS alert level.

## How to Connect

Add this server to your MCP client configuration:

```json
{
  "mcpServers": {
    "natural-disaster-intel": {
      "type": "url",
      "url": "https://natural-disaster-intel-mcp.apify.actor/mcp"
    }
  }
}
```

Compatible with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client.

## Example Prompts

- "What weather alerts are active in Oklahoma right now?"
- "Show me all FEMA disaster declarations for Florida in 2024."
- "Find earthquakes above magnitude 5.0 near Los Angeles in the past 30 days."
- "Are there any tornado warnings in the central US?"
- "What FEMA emergencies were declared in Texas during hurricane season?"
- "Show me recent earthquakes within 200 km of San Francisco."

## Pricing

This actor charges **$0.01 per tool call**. Each search query counts as one tool call regardless of the number of results returned.

## Data Sources

All data is sourced from official US government APIs:

- **FEMA OpenFEMA API** -- [fema.gov/api/open](https://www.fema.gov/about/openfema/api) -- Historical disaster declarations and emergency management data.
- **National Weather Service API** -- [api.weather.gov](https://api.weather.gov) -- Real-time weather alerts, watches, and warnings from NOAA.
- **USGS Earthquake Hazards API** -- [earthquake.usgs.gov](https://earthquake.usgs.gov/fdsnws/event/1/) -- Real-time and historical earthquake event data worldwide.
