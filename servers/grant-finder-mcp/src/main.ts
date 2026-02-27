import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GrantsSearchResponse {
  errorcode: number;
  msg: string;
  data: {
    hitCount: number;
    startRecord: number;
    oppHits: GrantOppHit[];
    oppStatusOptions: FilterOption[];
    eligibilities: FilterOption[];
    fundingCategories: FilterOption[];
    fundingInstruments: FilterOption[];
    agencies: FilterOption[];
  };
}

interface GrantOppHit {
  id: number;
  number: string;
  title: string;
  agencyCode: string;
  agencyName: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
  docType: string;
  alnList?: string[];
}

interface FilterOption {
  code: string;
  name: string;
  count?: number;
}

interface FetchOpportunityResponse {
  errorcode: number;
  msg: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function truncateText(text: string, maxLength = 2000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength) + "... [truncated]";
}

function formatOpportunity(hit: GrantOppHit) {
  return {
    id: hit.id,
    number: hit.number,
    title: hit.title,
    agencyCode: hit.agencyCode,
    agencyName: hit.agencyName,
    openDate: hit.openDate,
    closeDate: hit.closeDate,
    status: hit.oppStatus,
    docType: hit.docType,
  };
}

const SEARCH_URL = "https://api.grants.gov/v1/api/search2";
const FETCH_URL = "https://api.grants.gov/v1/api/fetchOpportunity";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "grant-finder-mcp",
  version: "1.0.0",
});

// ---- Tool 1: grants_search_opportunities ----

mcpServer.tool(
  "grants_search_opportunities",
  "Search Grants.gov for federal funding opportunities. Filter by keyword, status, agency, funding category, instrument type, and eligibility. Returns matching grant listings with titles, deadlines, and agency info. No API key required.",
  {
    keyword: z
      .string()
      .optional()
      .describe("Search term to find grants (e.g., 'renewable energy', 'public health', 'education')"),
    status: z
      .enum(["forecasted", "posted", "closed", "archived"])
      .optional()
      .default("posted")
      .describe("Opportunity status filter. Defaults to 'posted' (currently open)"),
    agency: z
      .string()
      .optional()
      .describe("Agency code filter (e.g., 'HHS', 'DOE', 'NSF', 'EPA', 'NASA', 'USDA', 'DOD')"),
    fundingCategory: z
      .string()
      .optional()
      .describe("Funding category code filter. Use grants_get_filter_options to discover valid codes"),
    fundingInstrument: z
      .string()
      .optional()
      .describe("Funding instrument code (e.g., 'G' for grant, 'CA' for cooperative agreement)"),
    eligibility: z
      .string()
      .optional()
      .describe("Eligibility code filter. Use grants_get_filter_options to discover valid codes"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Number of results to return (1-100, default 25)"),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Starting record number for pagination (default 0)"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ keyword, status, agency, fundingCategory, fundingInstrument, eligibility, limit, offset, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const body: Record<string, unknown> = {
      keyword: keyword ?? "",
      rows: limit,
      startRecordNum: offset,
    };

    if (status) {
      body.oppStatuses = status;
    }
    if (agency) {
      body.agencies = agency;
    }
    if (fundingCategory) {
      body.fundingCategories = fundingCategory;
    }
    if (fundingInstrument) {
      body.fundingInstruments = fundingInstrument;
    }
    if (eligibility) {
      body.eligibilities = eligibility;
    }

    try {
      const response = await fetchWithRetry(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as GrantsSearchResponse;

      if (result.errorcode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Grants.gov API error (code ${result.errorcode}): ${result.msg}`,
            },
          ],
          isError: true,
        };
      }

      const opportunities = (result.data.oppHits ?? []).map(formatOpportunity);

      const output = {
        totalHits: result.data.hitCount,
        returned: opportunities.length,
        offset,
        opportunities,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching Grants.gov: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 2: grants_get_opportunity ----

mcpServer.tool(
  "grants_get_opportunity",
  "Get detailed information about a specific grant opportunity by its opportunity number. Returns full description, eligibility requirements, funding amounts, deadlines, and contact information. No API key required.",
  {
    opportunityNumber: z
      .string()
      .describe("The grant opportunity number (e.g., 'HHS-2024-ACF-OCC-YD-0001')"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ opportunityNumber, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const url = `${FETCH_URL}?oppNum=${encodeURIComponent(opportunityNumber)}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const result = (await response.json()) as FetchOpportunityResponse;

      if (result.errorcode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Grants.gov API error (code ${result.errorcode}): ${result.msg}`,
            },
          ],
          isError: true,
        };
      }

      const opportunity = result.data;

      // Truncate very long description fields to keep response manageable
      const processed = { ...opportunity };
      for (const key of Object.keys(processed)) {
        const value = processed[key];
        if (typeof value === "string" && value.length > 2000) {
          processed[key] = truncateText(value);
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(processed, null, 2),
          },
        ],
        structuredContent: { opportunityNumber, opportunity: processed },
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("404")) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Opportunity '${opportunityNumber}' not found. Verify the opportunity number is correct. Use grants_search_opportunities to find valid opportunity numbers.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching opportunity '${opportunityNumber}': ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 3: grants_search_by_agency ----

mcpServer.tool(
  "grants_search_by_agency",
  "Search for grants from a specific federal agency. Convenience tool that searches Grants.gov filtered by agency code. Common agencies: HHS (Health & Human Services), DOE (Energy), NSF (National Science Foundation), DOD (Defense), EPA (Environmental Protection), NASA, USDA (Agriculture), ED (Education), DOJ (Justice), DOT (Transportation). No API key required.",
  {
    agency: z
      .string()
      .describe("Federal agency code (e.g., 'HHS', 'DOE', 'NSF', 'DOD', 'EPA', 'NASA', 'USDA', 'ED', 'DOJ', 'DOT')"),
    keyword: z
      .string()
      .optional()
      .describe("Additional keyword filter to narrow results within the agency"),
    status: z
      .enum(["forecasted", "posted", "closed", "archived"])
      .optional()
      .default("posted")
      .describe("Opportunity status filter. Defaults to 'posted' (currently open)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Number of results to return (1-100, default 25)"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ agency, keyword, status, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const body: Record<string, unknown> = {
      keyword: keyword ?? "",
      rows: limit,
      startRecordNum: 0,
      agencies: agency,
    };

    if (status) {
      body.oppStatuses = status;
    }

    try {
      const response = await fetchWithRetry(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as GrantsSearchResponse;

      if (result.errorcode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Grants.gov API error (code ${result.errorcode}): ${result.msg}`,
            },
          ],
          isError: true,
        };
      }

      const opportunities = (result.data.oppHits ?? []).map(formatOpportunity);

      const output = {
        totalHits: result.data.hitCount,
        agency,
        returned: opportunities.length,
        opportunities,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching agency '${agency}' grants: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 4: grants_get_filter_options ----

mcpServer.tool(
  "grants_get_filter_options",
  "Get available filter options (agencies, funding categories, eligibilities, instruments, statuses) from Grants.gov. Useful for discovering valid filter values to use with grants_search_opportunities. Optionally scope results with a keyword. No API key required.",
  {
    keyword: z
      .string()
      .optional()
      .describe("Optional keyword to scope the filter options (e.g., 'health' to see filters relevant to health grants)"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ keyword, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const body: Record<string, unknown> = {
      keyword: keyword ?? "",
      rows: 1,
      startRecordNum: 0,
    };

    try {
      const response = await fetchWithRetry(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = (await response.json()) as GrantsSearchResponse;

      if (result.errorcode !== 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Grants.gov API error (code ${result.errorcode}): ${result.msg}`,
            },
          ],
          isError: true,
        };
      }

      const output = {
        keyword: keyword ?? null,
        agencies: (result.data.agencies ?? []).map((a) => ({
          code: a.code,
          name: a.name,
          count: a.count ?? null,
        })),
        fundingCategories: (result.data.fundingCategories ?? []).map((c) => ({
          code: c.code,
          name: c.name,
          count: c.count ?? null,
        })),
        fundingInstruments: (result.data.fundingInstruments ?? []).map((i) => ({
          code: i.code,
          name: i.name,
          count: i.count ?? null,
        })),
        eligibilities: (result.data.eligibilities ?? []).map((e) => ({
          code: e.code,
          name: e.name,
          count: e.count ?? null,
        })),
        statusOptions: (result.data.oppStatusOptions ?? []).map((s) => ({
          code: s.code,
          name: s.name,
          count: s.count ?? null,
        })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching filter options: ${msg}`,
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
        server: "grant-finder-mcp",
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
    server: "grant-finder-mcp",
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
  console.log(`Grant Finder MCP on port ${port}`);
});
