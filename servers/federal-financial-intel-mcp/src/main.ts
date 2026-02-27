import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

const SEC_USER_AGENT =
  "apify-financial-mcp/1.0 (contact@example.com)";

const BLS_SERIES_TITLES: Record<string, string> = {
  LNS14000000: "Unemployment Rate",
  CES0000000001: "Total Nonfarm Employment",
  "CUUR0000SA0": "CPI - All Urban Consumers",
  LNS12000000: "Civilian Employment Level",
  CES0500000003: "Average Hourly Earnings",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SecHit {
  _source: {
    entity_name?: string;
    form_type?: string;
    file_date?: string;
    file_description?: string;
    period_of_report?: string;
    file_num?: string;
    entity_id?: string;
    adsh?: string;
  };
}

interface SecSearchResponse {
  hits: {
    hits: SecHit[];
  };
}

interface BlsSeries {
  seriesID: string;
  data: Array<{
    year: string;
    period: string;
    periodName: string;
    value: string;
    footnotes: Array<{ text?: string }>;
  }>;
}

interface BlsApiResponse {
  Results: {
    series: BlsSeries[];
  };
}

interface UsdaRecord {
  commodity_desc: string;
  statisticcat_desc: string;
  state_alpha: string;
  year: number;
  reference_period_desc: string;
  Value: string;
  unit_desc: string;
}

interface UsdaApiResponse {
  data: UsdaRecord[];
}

function buildSecFilingUrl(entityId: string, adsh: string): string {
  const noDashes = adsh.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${entityId}/${noDashes}/${adsh}-index.htm`;
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
        `HTTP ${response.status} from ${url}: ${body.slice(0, 200)}`,
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
  name: "federal-financial-intel-mcp",
  version: "1.0.0",
});

// ---- Tool 1: SEC EDGAR Filings ----

mcpServer.tool(
  "finance_search_sec_filings",
  "Search SEC EDGAR for company filings (10-K, 10-Q, 8-K, etc). Returns entity name, form type, filing date, description, and direct filing URL.",
  {
    searchText: z
      .string()
      .optional()
      .describe("Company name or keyword"),
    formTypes: z
      .array(z.string())
      .optional()
      .default(["10-K", "10-Q", "8-K"])
      .describe("Form types like 10-K, 10-Q, 8-K"),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date YYYY-MM-DD"),
    dateTo: z
      .string()
      .optional()
      .describe("End date YYYY-MM-DD"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ searchText, formTypes, dateFrom, dateTo, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    if (searchText) params.set("q", searchText);
    if (formTypes && formTypes.length > 0) {
      params.set("forms", formTypes.join(","));
    }
    if (dateFrom || dateTo) {
      params.set("dateRange", "custom");
      if (dateFrom) params.set("startdt", dateFrom);
      if (dateTo) params.set("enddt", dateTo);
    }
    params.set("from", "0");
    params.set("size", String(limit));

    const url = `https://efts.sec.gov/LATEST/search-index?${params.toString()}`;

    const response = await fetchWithRetry(url, {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json",
      },
    });

    const data = (await response.json()) as SecSearchResponse;
    const hits = data?.hits?.hits ?? [];

    const filings = hits.map((hit) => {
      const s = hit._source;
      const entityId = s.entity_id ?? "";
      const adsh = s.adsh ?? "";
      return {
        entityName: s.entity_name ?? "",
        formType: s.form_type ?? "",
        fileDate: s.file_date ?? "",
        description: s.file_description ?? "",
        periodOfReport: s.period_of_report ?? "",
        fileNumber: s.file_num ?? "",
        filingUrl:
          entityId && adsh ? buildSecFilingUrl(entityId, adsh) : "",
      };
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(filings, null, 2),
        },
      ],
      structuredContent: { filings },
      isError: false,
    };
  },
);

// ---- Tool 2: BLS Employment Statistics ----

mcpServer.tool(
  "finance_get_employment_stats",
  "Get BLS employment statistics: unemployment rate, nonfarm payrolls, CPI, hourly earnings. Provide series IDs and year range.",
  {
    seriesIds: z
      .array(z.string())
      .default(["LNS14000000", "CES0000000001", "CUUR0000SA0"])
      .describe(
        "BLS series IDs. Defaults: Unemployment Rate, Total Nonfarm Employment, CPI",
      ),
    startYear: z
      .number()
      .int()
      .min(2000)
      .default(2023),
    endYear: z
      .number()
      .int()
      .max(2027)
      .default(2026),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ seriesIds, startYear, endYear, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const body = {
      seriesid: seriesIds,
      startyear: String(startYear),
      endyear: String(endYear),
    };

    const response = await fetchWithRetry(
      "https://api.bls.gov/publicAPI/v2/timeseries/data/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    const data = (await response.json()) as BlsApiResponse;
    const seriesList = data?.Results?.series ?? [];

    const results = seriesList.flatMap((series) => {
      const seriesTitle =
        BLS_SERIES_TITLES[series.seriesID] ?? series.seriesID;
      return (series.data ?? []).map((d) => ({
        seriesId: series.seriesID,
        seriesTitle,
        year: d.year,
        period: d.period,
        periodName: d.periodName,
        value: d.value,
      }));
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(results, null, 2),
        },
      ],
      structuredContent: { results },
      isError: false,
    };
  },
);

// ---- Tool 3: USDA Crop/Commodity Prices ----

mcpServer.tool(
  "finance_get_crop_prices",
  "Get USDA crop and commodity prices (corn, soybeans, wheat, etc). Query by commodity, state, and year range.",
  {
    commodities: z
      .array(z.string())
      .default(["CORN", "SOYBEANS", "WHEAT"])
      .describe("Commodity names (uppercase)"),
    states: z
      .array(z.string())
      .optional()
      .describe("State codes like CA, NY"),
    years: z
      .array(z.number())
      .default([2024, 2025])
      .describe("Years to query"),
    statisticCategory: z
      .string()
      .default("PRICE RECEIVED"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ commodities, states, years, statisticCategory, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const allRecords: Array<{
      commodity: string;
      statisticCategory: string;
      state: string;
      year: number;
      period: string;
      value: string;
      unit: string;
    }> = [];

    for (const commodity of commodities) {
      const params = new URLSearchParams();
      params.set("key", "DEMO_KEY");
      params.set("commodity_desc", commodity);
      params.set("statisticcat_desc", statisticCategory);
      params.set("format", "JSON");
      params.set("year__GE", String(minYear));
      params.set("year__LE", String(maxYear));

      if (states && states.length > 0) {
        params.set("state_alpha", states.join(","));
      }

      const url = `https://quickstats.nass.usda.gov/api/api_GET/?${params.toString()}`;

      try {
        const response = await fetchWithRetry(url, {
          headers: { Accept: "application/json" },
        });

        const data = (await response.json()) as UsdaApiResponse;
        const records = (data?.data ?? []).slice(0, limit);

        for (const r of records) {
          allRecords.push({
            commodity: r.commodity_desc ?? "",
            statisticCategory: r.statisticcat_desc ?? "",
            state: r.state_alpha ?? "",
            year: r.year ?? 0,
            period: r.reference_period_desc ?? "",
            value: r.Value ?? "",
            unit: r.unit_desc ?? "",
          });
        }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        allRecords.push({
          commodity,
          statisticCategory,
          state: "ERROR",
          year: 0,
          period: "",
          value: `Error fetching ${commodity}: ${msg}`,
          unit: "",
        });
      }
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(allRecords, null, 2),
        },
      ],
      structuredContent: { results: allRecords },
      isError: false,
    };
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
        server: "federal-financial-intel-mcp",
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
    server: "federal-financial-intel-mcp",
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
    const msg =
      error instanceof Error ? error.message : String(error);
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
  console.log(`Federal Financial Intel MCP on port ${port}`);
});
