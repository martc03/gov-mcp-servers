import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEC_EDGAR_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index";
const SEC_USER_AGENT = "CompetitiveIntelMCP/1.0 (contact@apify.com)";
const GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss/search";
const USASPENDING_AWARDS_URL =
  "https://api.usaspending.gov/api/v2/search/spending_by_award/";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

const AWARD_TYPE_CODES: Record<string, string[]> = {
  contracts: ["A", "B", "C", "D"],
  grants: ["02", "03", "04", "05"],
  loans: ["07", "08"],
  all: ["A", "B", "C", "D", "02", "03", "04", "05", "07", "08"],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EdgarHitSource {
  entity_name?: string;
  form_type?: string;
  file_date?: string;
  display_date_dt?: string;
  file_description?: string;
  period_of_report?: string;
  file_num?: string;
  file_type?: string;
  biz_locations?: string;
  entity_id?: string;
  adsh?: string;
}

interface EdgarHit {
  _id: string;
  _source: EdgarHitSource;
}

interface EdgarResponse {
  hits: {
    total: { value: number };
    hits: EdgarHit[];
  };
}

interface NewsItem {
  title: string;
  link: string;
  publishedDate: string;
  source: string;
}

interface UsaSpendingResult {
  "Award ID"?: string;
  "Recipient Name"?: string;
  "Award Amount"?: number;
  "Awarding Agency"?: string;
  "Awarding Sub Agency"?: string;
  "Award Type"?: string;
  "Start Date"?: string;
  "End Date"?: string;
  Description?: string;
}

interface UsaSpendingResponse {
  results?: UsaSpendingResult[];
  page_metadata?: {
    total?: number;
    page?: number;
    hasNext?: boolean;
  };
}

interface FilingRecord {
  entityName: string;
  formType: string;
  filingDate: string;
  description: string;
  periodOfReport: string;
  fileNumber: string;
  edgarUrl: string;
}

interface AwardRecord {
  awardId: string;
  recipientName: string;
  amount: number;
  agency: string;
  subAgency: string;
  awardType: string;
  startDate: string;
  endDate: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncateText(text: string | undefined, maxLen: number): string {
  if (!text) return "";
  const cleaned = text.replace(/<[^>]*>/g, "").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "...";
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

function buildSecFilingUrl(entityId: string, adsh: string): string {
  const noDashes = adsh.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${entityId}/${noDashes}/${adsh}-index.htm`;
}

function parseRssItems(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const itemXml = match[1];
    const title = (
      itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""
    )
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .trim();
    const link =
      itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const pubDate =
      itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const source = (
      itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? ""
    )
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .trim();
    items.push({ title, link, publishedDate: pubDate, source });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Data-fetching functions (reusable for both individual tools + profile)
// ---------------------------------------------------------------------------

async function fetchSecFilings(
  companyName: string,
  formType: string | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  limit: number,
): Promise<{ totalHits: number; filings: FilingRecord[] }> {
  const params = new URLSearchParams();
  params.set("q", `"${companyName}"`);

  if (formType) {
    params.set("forms", formType);
  }

  if (dateFrom || dateTo) {
    params.set("dateRange", "custom");
    if (dateFrom) params.set("startdt", dateFrom);
    if (dateTo) params.set("enddt", dateTo);
  }

  params.set("from", "0");
  params.set("size", String(limit));

  const url = `${SEC_EDGAR_SEARCH_URL}?${params.toString()}`;

  const response = await fetchWithRetry(
    url,
    {
      headers: {
        "User-Agent": SEC_USER_AGENT,
        Accept: "application/json",
      },
    },
    3,
  );

  const data = (await response.json()) as EdgarResponse;
  const totalHits = data?.hits?.total?.value ?? 0;
  const hits = data?.hits?.hits ?? [];

  const filings: FilingRecord[] = hits.map((hit) => {
    const s = hit._source;
    const entityId = s.entity_id ?? "";
    const adsh = s.adsh ?? "";
    return {
      entityName: s.entity_name ?? "",
      formType: s.form_type ?? s.file_type ?? "",
      filingDate: s.file_date ?? s.display_date_dt ?? "",
      description: truncateText(s.file_description, 500),
      periodOfReport: s.period_of_report ?? "",
      fileNumber: s.file_num ?? "",
      edgarUrl: entityId && adsh ? buildSecFilingUrl(entityId, adsh) : "",
    };
  });

  return { totalHits, filings };
}

async function fetchNews(
  query: string,
  limit: number,
): Promise<NewsItem[]> {
  const params = new URLSearchParams();
  params.set("q", query);
  params.set("hl", "en-US");
  params.set("gl", "US");
  params.set("ceid", "US:en");

  const url = `${GOOGLE_NEWS_RSS_URL}?${params.toString()}`;

  const response = await fetchWithRetry(url, {
    headers: {
      Accept: "application/xml, text/xml, application/rss+xml",
    },
  });

  const xml = await response.text();
  return parseRssItems(xml, limit);
}

async function fetchContracts(
  companyName: string,
  awardType: string,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  limit: number,
  page: number,
): Promise<{
  totalRecords: number;
  hasNext: boolean;
  awards: AwardRecord[];
}> {
  const filters: Record<string, unknown> = {
    keyword: companyName,
    award_type_codes:
      AWARD_TYPE_CODES[awardType] ?? AWARD_TYPE_CODES.contracts,
  };

  if (dateFrom || dateTo) {
    filters.time_period = [
      {
        start_date: dateFrom ?? "2000-01-01",
        end_date: dateTo ?? "2099-12-31",
      },
    ];
  }

  const requestBody = {
    filters,
    fields: [
      "Award ID",
      "Recipient Name",
      "Award Amount",
      "Awarding Agency",
      "Awarding Sub Agency",
      "Award Type",
      "Start Date",
      "End Date",
      "Description",
    ],
    limit,
    page,
    sort: "Award Amount",
    order: "desc",
  };

  const response = await fetchWithRetry(USASPENDING_AWARDS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = (await response.json()) as UsaSpendingResponse;
  const totalRecords = data?.page_metadata?.total ?? 0;
  const hasNext = data?.page_metadata?.hasNext ?? false;

  const awards: AwardRecord[] = (data?.results ?? []).map((r) => ({
    awardId: r["Award ID"] ?? "",
    recipientName: r["Recipient Name"] ?? "",
    amount: r["Award Amount"] ?? 0,
    agency: r["Awarding Agency"] ?? "",
    subAgency: r["Awarding Sub Agency"] ?? "",
    awardType: r["Award Type"] ?? "",
    startDate: r["Start Date"] ?? "",
    endDate: r["End Date"] ?? "",
    description: truncateText(r.Description, 500),
  }));

  return { totalRecords, hasNext, awards };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "competitive-intel-mcp",
  version: "1.0.0",
});

// ---- Tool 1: intel_company_filings ----

mcpServer.tool(
  "intel_company_filings",
  "Search SEC EDGAR for a company's regulatory filings (10-K, 10-Q, 8-K, proxy, etc.). Returns filing date, form type, description, period of report, and direct EDGAR URL.",
  {
    companyName: z
      .string()
      .describe("Company name to search in SEC EDGAR"),
    formType: z
      .string()
      .optional()
      .describe(
        "SEC form type filter (e.g., '10-K', '8-K', '10-Q', 'DEF 14A')",
      ),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date filter (YYYY-MM-DD)"),
    dateTo: z
      .string()
      .optional()
      .describe("End date filter (YYYY-MM-DD)"),
    limit: z.number().int().min(1).max(40).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ companyName, formType, dateFrom, dateTo, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const result = await fetchSecFilings(
        companyName,
        formType,
        dateFrom,
        dateTo,
        limit,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: msg }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 2: intel_company_news ----

mcpServer.tool(
  "intel_company_news",
  "Search recent news articles about a company using Google News RSS. Returns article title, link, publication date, and source outlet.",
  {
    query: z
      .string()
      .describe("Company name or topic to search news for"),
    limit: z.number().int().min(1).max(20).default(10),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ query, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const articles = await fetchNews(query, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ articles }, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: msg }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 3: intel_company_contracts ----

mcpServer.tool(
  "intel_company_contracts",
  "Search USASpending.gov for federal contracts, grants, or loans awarded to a company. Returns award amounts, agencies, dates, and descriptions sorted by award amount.",
  {
    companyName: z
      .string()
      .describe("Company name to search federal awards for"),
    awardType: z
      .enum(["contracts", "grants", "loans", "all"])
      .default("contracts")
      .describe("Type of federal award to search"),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date filter (YYYY-MM-DD)"),
    dateTo: z
      .string()
      .optional()
      .describe("End date filter (YYYY-MM-DD)"),
    limit: z.number().int().min(1).max(50).default(20),
    page: z.number().int().min(1).default(1),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ companyName, awardType, dateFrom, dateTo, limit, page, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const result = await fetchContracts(
        companyName,
        awardType,
        dateFrom,
        dateTo,
        limit,
        page,
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: msg }, null, 2),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 4: intel_company_profile ----

mcpServer.tool(
  "intel_company_profile",
  "Get a comprehensive competitive intelligence snapshot for a company. Combines SEC EDGAR filings, Google News articles, and USASpending.gov federal contracts into a single profile with summary statistics.",
  {
    companyName: z
      .string()
      .describe("Company name to build intelligence profile for"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ companyName, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const [filingsResult, newsArticles, contractsResult] =
        await Promise.all([
          fetchSecFilings(companyName, undefined, undefined, undefined, 5),
          fetchNews(companyName, 5),
          fetchContracts(
            companyName,
            "contracts",
            undefined,
            undefined,
            5,
            1,
          ),
        ]);

      const totalContractValue = contractsResult.awards.reduce(
        (sum, award) => sum + award.amount,
        0,
      );

      const profile = {
        companyName,
        recentFilings: filingsResult.filings,
        recentNews: newsArticles,
        federalContracts: contractsResult.awards,
        summary: {
          totalFilings: filingsResult.totalHits,
          totalContracts: contractsResult.totalRecords,
          totalContractValue,
        },
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(profile, null, 2),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: msg }, null, 2),
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
        server: "competitive-intel-mcp",
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
    server: "competitive-intel-mcp",
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
  console.log(`Competitive Intel MCP on port ${port}`);
});
