# Getting Started with the US Government Data API

## Quick Start

The US Government Data API gives you unified access to 45 endpoints across 13 federal data categories — all through a single API key.

### Base URL

All requests go through RapidAPI:

```
https://us-government-data-api.p.rapidapi.com/api/v1
```

### Authentication

Every request requires two headers:

```
X-RapidAPI-Key: YOUR_RAPIDAPI_KEY
X-RapidAPI-Host: us-government-data-api.p.rapidapi.com
```

### Your First Request

Let's search for FDA drug recalls:

**cURL:**

```bash
curl -s "https://us-government-data-api.p.rapidapi.com/api/v1/safety/fda-recalls?productType=drug&limit=5" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: us-government-data-api.p.rapidapi.com"
```

**JavaScript (fetch):**

```javascript
const response = await fetch(
  'https://us-government-data-api.p.rapidapi.com/api/v1/safety/fda-recalls?productType=drug&limit=5',
  {
    headers: {
      'X-RapidAPI-Key': 'YOUR_RAPIDAPI_KEY',
      'X-RapidAPI-Host': 'us-government-data-api.p.rapidapi.com'
    }
  }
);
const data = await response.json();
console.log(data);
```

**Python:**

```python
import requests

url = "https://us-government-data-api.p.rapidapi.com/api/v1/safety/fda-recalls"
params = {"productType": "drug", "limit": 5}
headers = {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "us-government-data-api.p.rapidapi.com"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data)
```

### Response Format

Every endpoint returns a consistent JSON structure:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "tool": "safety_search_fda_recalls",
    "latencyMs": 342,
    "source": "us-safety-recalls-mcp"
  }
}
```

- `success` — `true` if the request completed, `false` on error
- `data` — the actual results from the federal data source
- `meta.tool` — which backend tool processed the request
- `meta.latencyMs` — response time in milliseconds
- `meta.source` — which MCP server handled it

### Browse All Endpoints

To see every available endpoint and its category:

```bash
curl -s "https://us-government-data-api.p.rapidapi.com/api/v1" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: us-government-data-api.p.rapidapi.com"
```

This returns a full catalog of all 45 endpoints organized by category (Safety, Disasters, Finance, Travel, Environment, Contracts, Courts, Health, Regulations, Grants, Entities, Intelligence, Cybersecurity).
