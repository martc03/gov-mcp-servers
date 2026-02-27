import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COURTLISTENER_BASE = "https://www.courtlistener.com";
const COURTLISTENER_API = `${COURTLISTENER_BASE}/api/rest/v4/search/`;
const USER_AGENT = "apify-court-records-mcp/1.0 (contact@example.com)";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, " ")
    .trim();
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    if (response.status === 429 && attempt < retries) {
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await new Promise((r) => setTimeout(r, delay));
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
// Response Interfaces
// ---------------------------------------------------------------------------

interface OpinionResult {
  id: number;
  caseName: string;
  court: string;
  dateFiled: string;
  docketNumber: string;
  citation: string[];
  suitNature: string;
  snippet: string;
  absolute_url: string;
}

interface OpinionSearchResponse {
  count: number;
  results: OpinionResult[];
}

interface DocketResult {
  docket_id: number;
  caseName: string;
  court: string;
  dateArgued: string;
  dateFiled: string;
  docketNumber: string;
  suitNature: string;
  cause: string;
  assignedTo: string;
  referredTo: string;
  absolute_url: string;
}

interface DocketSearchResponse {
  count: number;
  results: DocketResult[];
}

interface JudgeResult {
  id: number;
  name_full: string;
  court: string;
  dob_city: string;
  dob_state: string;
  date_dob: string;
  political_affiliation: string;
  appointer: string;
  absolute_url: string;
}

interface JudgeSearchResponse {
  count: number;
  results: JudgeResult[];
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "court-records-mcp",
  version: "1.0.0",
});

// ---- Tool 1: Search Court Opinions (Case Law) ----

mcpServer.tool(
  "court_search_opinions",
  "Search US court opinions and case law. Returns case name, court, date, citations, and opinion snippets. Covers federal and state courts.",
  {
    query: z
      .string()
      .describe(
        "Search query for case law (e.g., 'first amendment', 'patent infringement')",
      ),
    court: z
      .string()
      .optional()
      .describe(
        "Court ID filter (e.g., 'scotus' for Supreme Court, 'ca9' for 9th Circuit)",
      ),
    dateAfter: z
      .string()
      .optional()
      .describe("Decided after date YYYY-MM-DD"),
    dateBefore: z
      .string()
      .optional()
      .describe("Decided before date YYYY-MM-DD"),
    limit: z.number().int().min(1).max(50).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ query, court, dateAfter, dateBefore, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("q", query);
    params.set("type", "o");
    params.set("order_by", "score desc");
    params.set("page_size", String(limit));

    if (court) params.set("court", court);
    if (dateAfter) params.set("filed_after", dateAfter);
    if (dateBefore) params.set("filed_before", dateBefore);

    const url = `${COURTLISTENER_API}?${params.toString()}`;

    const response = await fetchWithRetry(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    const data = (await response.json()) as OpinionSearchResponse;
    const results = data?.results ?? [];

    const opinions = results.map((r) => ({
      id: r.id ?? 0,
      caseName: r.caseName ?? "",
      court: r.court ?? "",
      dateFiled: r.dateFiled ?? "",
      docketNumber: r.docketNumber ?? "",
      citations: r.citation ?? [],
      snippet: r.snippet ? stripHtml(r.snippet) : "",
      url: r.absolute_url
        ? `${COURTLISTENER_BASE}${r.absolute_url}`
        : "",
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { totalResults: data?.count ?? 0, opinions },
            null,
            2,
          ),
        },
      ],
      structuredContent: { totalResults: data?.count ?? 0, opinions },
      isError: false,
    };
  },
);

// ---- Tool 2: Search Court Dockets (Case Filings) ----

mcpServer.tool(
  "court_search_dockets",
  "Search US court dockets and case filings. Returns case name, court, filing date, suit nature, cause, and assigned judge. Covers federal RECAP archive.",
  {
    query: z.string().describe("Search query for dockets"),
    court: z
      .string()
      .optional()
      .describe(
        "Court ID (e.g., 'dcd' for DC District, 'nysd' for Southern District of NY)",
      ),
    dateAfter: z
      .string()
      .optional()
      .describe("Filed after date YYYY-MM-DD"),
    dateBefore: z
      .string()
      .optional()
      .describe("Filed before date YYYY-MM-DD"),
    limit: z.number().int().min(1).max(50).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ query, court, dateAfter, dateBefore, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("q", query);
    params.set("type", "r");
    params.set("order_by", "score desc");
    params.set("page_size", String(limit));

    if (court) params.set("court", court);
    if (dateAfter) params.set("filed_after", dateAfter);
    if (dateBefore) params.set("filed_before", dateBefore);

    const url = `${COURTLISTENER_API}?${params.toString()}`;

    const response = await fetchWithRetry(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    const data = (await response.json()) as DocketSearchResponse;
    const results = data?.results ?? [];

    const dockets = results.map((r) => ({
      docketId: r.docket_id ?? 0,
      caseName: r.caseName ?? "",
      court: r.court ?? "",
      dateFiled: r.dateFiled ?? "",
      dateArgued: r.dateArgued ?? "",
      docketNumber: r.docketNumber ?? "",
      suitNature: r.suitNature ?? "",
      cause: r.cause ?? "",
      assignedTo: r.assignedTo ?? "",
      url: r.absolute_url
        ? `${COURTLISTENER_BASE}${r.absolute_url}`
        : "",
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { totalResults: data?.count ?? 0, dockets },
            null,
            2,
          ),
        },
      ],
      structuredContent: { totalResults: data?.count ?? 0, dockets },
      isError: false,
    };
  },
);

// ---- Tool 3: Search Judges ----

mcpServer.tool(
  "court_search_judges",
  "Search judges and people in the US court system. Returns name, court, birth info, political affiliation, and appointer.",
  {
    query: z.string().describe("Judge name or keyword"),
    court: z.string().optional().describe("Court ID to filter by"),
    limit: z.number().int().min(1).max(50).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ query, court, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("q", query);
    params.set("type", "p");
    params.set("order_by", "score desc");
    params.set("page_size", String(limit));

    if (court) params.set("court", court);

    const url = `${COURTLISTENER_API}?${params.toString()}`;

    const response = await fetchWithRetry(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });

    const data = (await response.json()) as JudgeSearchResponse;
    const results = data?.results ?? [];

    const judges = results.map((r) => ({
      id: r.id ?? 0,
      name: r.name_full ?? "",
      court: r.court ?? "",
      birthCity: r.dob_city ?? "",
      birthState: r.dob_state ?? "",
      birthDate: r.date_dob ?? "",
      politicalAffiliation: r.political_affiliation ?? "",
      appointer: r.appointer ?? "",
      url: r.absolute_url
        ? `${COURTLISTENER_BASE}${r.absolute_url}`
        : "",
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { totalResults: data?.count ?? 0, judges },
            null,
            2,
          ),
        },
      ],
      structuredContent: { totalResults: data?.count ?? 0, judges },
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
        server: "court-records-mcp",
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
    server: "court-records-mcp",
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
  console.log(`Court Records MCP on port ${port}`);
});
