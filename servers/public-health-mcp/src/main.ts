import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WhoObservation {
  SpatialDim?: string;
  TimeDim?: number;
  Dim1?: string;
  NumericValue?: number;
  Value?: string;
  Date?: string;
}

interface WhoApiResponse {
  value: WhoObservation[];
}

interface WhoIndicator {
  IndicatorCode: string;
  IndicatorName: string;
  Language: string;
}

interface WhoIndicatorResponse {
  value: WhoIndicator[];
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < retries) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} from ${url}: ${body.slice(0, 300)}`,
      );
    }

    return response;
  }
  throw new Error(`Failed after ${retries} attempts for ${url}`);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "public-health-mcp",
  version: "1.0.0",
});

// ---- Tool 1: CDC Open Data (Socrata SODA API) ----

mcpServer.tool(
  "health_get_cdc_data",
  "Query CDC Open Data (Socrata-powered) for disease and health statistics. Common datasets: Chronic Disease Indicators (g4ie-h725), NNDSS Weekly Disease Tables (x9gk-5huc), COVID Surveillance (vbim-akqf), Vaccination (unsk-b7fc), COVID Community Levels (3nnm-4jni). No API key required.",
  {
    datasetId: z
      .string()
      .default("g4ie-h725")
      .describe(
        "CDC Socrata dataset ID. Common ones: 'g4ie-h725' (Chronic Disease Indicators), 'x9gk-5huc' (NNDSS Weekly Disease), 'vbim-akqf' (COVID Surveillance), 'unsk-b7fc' (Vaccination)",
      ),
    query: z
      .string()
      .optional()
      .describe(
        "SoQL where clause filter (e.g., \"state='CA'\" or \"topic='Cancer'\")",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0),
    orderBy: z
      .string()
      .optional()
      .describe("Column name to sort by"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ datasetId, query, limit, offset, orderBy, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("$limit", String(limit));
    params.set("$offset", String(offset));

    if (query) {
      params.set("$where", query);
    }
    if (orderBy) {
      params.set("$order", orderBy);
    }

    const url = `https://data.cdc.gov/resource/${encodeURIComponent(datasetId)}.json?${params.toString()}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const records = (await response.json()) as Record<string, unknown>[];

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(records, null, 2),
          },
        ],
        structuredContent: { datasetId, recordCount: records.length, records },
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("404")) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Dataset '${datasetId}' not found. Verify the dataset ID at https://data.cdc.gov. Common IDs: g4ie-h725 (Chronic Disease), x9gk-5huc (NNDSS), vbim-akqf (COVID).`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Error querying CDC dataset '${datasetId}': ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 2: WHO Global Health Observatory Indicators ----

mcpServer.tool(
  "health_get_who_indicator",
  "Query WHO Global Health Observatory (GHO) for global health indicators. Examples: Life expectancy (WHOSIS_000001), Infant mortality (MDG_0000000001), Obesity prevalence (NCD_BMI_30A), Physicians per 10k (WHS4_100), Air pollution PM2.5 (SDGPM25). No API key required.",
  {
    indicatorCode: z
      .string()
      .default("WHOSIS_000001")
      .describe(
        "WHO GHO indicator code. Examples: 'WHOSIS_000001' (Life expectancy), 'WHOSIS_000002' (Healthy life expectancy), 'MDG_0000000001' (Infant mortality), 'NCD_BMI_30A' (Obesity prevalence), 'WHS4_100' (Physicians per 10k), 'SA_0000001688' (Alcohol consumption), 'SDGPM25' (Air pollution PM2.5), 'TOBACCO_0000000264' (Tobacco smoking)",
      ),
    country: z
      .string()
      .optional()
      .describe("3-letter ISO country code (e.g., 'USA', 'GBR', 'JPN')"),
    year: z
      .number()
      .int()
      .optional()
      .describe("Filter by specific year"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ indicatorCode, country, year, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const filterParts: string[] = [];

    if (country) {
      filterParts.push(`SpatialDim eq '${country}'`);
    }
    if (year !== undefined) {
      filterParts.push(`TimeDim eq ${year}`);
    }

    const params = new URLSearchParams();
    if (filterParts.length > 0) {
      params.set("$filter", filterParts.join(" and "));
    }
    params.set("$top", String(limit));

    const url = `https://ghoapi.azureedge.net/api/${encodeURIComponent(indicatorCode)}?${params.toString()}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const data = (await response.json()) as WhoApiResponse;
      const observations = data?.value ?? [];

      const results = observations.map((obs) => ({
        country: obs.SpatialDim ?? "",
        year: obs.TimeDim ?? null,
        dimension: obs.Dim1 ?? "",
        numericValue: obs.NumericValue ?? null,
        displayValue: obs.Value ?? "",
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
        structuredContent: { indicatorCode, resultCount: results.length, results },
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error querying WHO indicator '${indicatorCode}': ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 3: List WHO GHO Indicators ----

mcpServer.tool(
  "health_list_who_indicators",
  "List available WHO Global Health Observatory indicators to find the right indicator code. Search by keyword (e.g., 'mortality', 'life expectancy', 'HIV', 'malaria'). No API key required.",
  {
    search: z
      .string()
      .optional()
      .describe(
        "Search term to filter indicators (e.g., 'mortality', 'life expectancy', 'HIV')",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ search, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const url = "https://ghoapi.azureedge.net/api/Indicator";

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const data = (await response.json()) as WhoIndicatorResponse;
      const allIndicators = data?.value ?? [];

      const englishIndicators = allIndicators.filter(
        (ind) => ind.Language === "EN",
      );

      const filtered = search
        ? englishIndicators.filter((ind) =>
            ind.IndicatorName.toLowerCase().includes(search.toLowerCase()),
          )
        : englishIndicators;

      const results = filtered.slice(0, limit).map((ind) => ({
        code: ind.IndicatorCode,
        name: ind.IndicatorName,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
        structuredContent: {
          search: search ?? null,
          resultCount: results.length,
          totalMatches: filtered.length,
          results,
        },
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing WHO indicators: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Express + MCP HTTP Transport
// ---------------------------------------------------------------------------

await Actor.init();

// ---------------------------------------------------------------------------
// Non-standby health check: exit cleanly so Apify marks the run as SUCCEEDED
// ---------------------------------------------------------------------------
if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
    console.log("Non-standby run detected — running health check...");
    await Actor.pushData({
        status: "healthy",
        server: "public-health-mcp",
        timestamp: new Date().toISOString(),
        message: "MCP server is healthy. Use standby mode for MCP tool access.",
    });
    await Actor.exit("Health check passed — use standby mode for MCP access.");
}

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    server: "public-health-mcp",
  });
});

app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", detail: msg });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).json({ error: "Use POST" });
});

app.delete("/mcp", (_req, res) => {
  res.status(405).json({ error: "Not supported" });
});

const port = parseInt(
  process.env.APIFY_ACTOR_STANDBY_PORT || "4321",
  10,
);
app.listen(port, () => {
  console.log(`Public Health MCP on port ${port}`);
});
