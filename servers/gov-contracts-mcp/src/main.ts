import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

const SAM_OPPORTUNITIES_URL =
  "https://api.sam.gov/opportunities/v2/search";
const SAM_ENTITIES_URL =
  "https://api.sam.gov/entity-information/v3/entities";
const USASPENDING_AWARDS_URL =
  "https://api.usaspending.gov/api/v2/search/spending_by_award/";

const AWARD_TYPE_CODES: Record<string, string[]> = {
  contracts: ["A", "B", "C", "D"],
  grants: ["02", "03", "04", "05"],
  loans: ["07", "08"],
  direct_payments: ["06", "10"],
  other: ["09", "11"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SamOpportunity {
  noticeId?: string;
  title?: string;
  solicitationNumber?: string;
  department?: string;
  subtier?: string;
  office?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  archiveType?: string;
  archiveDate?: string;
  setAsideDescription?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  classificationCode?: string;
  description?: string;
  organizationType?: string;
  additionalInfoLink?: string;
  uiLink?: string;
}

interface SamOpportunitiesResponse {
  totalRecords?: number;
  opportunitiesData?: SamOpportunity[];
}

interface SamEntityRegistration {
  legalBusinessName?: string;
  ueiSAM?: string;
  cageCode?: string;
  registrationStatus?: string;
  registrationDate?: string;
}

interface SamPhysicalAddress {
  addressLine1?: string;
  city?: string;
  stateOrProvinceCode?: string;
  zipCode?: string;
}

interface SamEntityData {
  entityRegistration?: SamEntityRegistration;
  coreData?: {
    physicalAddress?: SamPhysicalAddress;
    entityInformation?: {
      entityURL?: string;
    };
  };
  assertions?: {
    naicsCode?: string;
  };
}

interface SamEntitiesResponse {
  totalRecords?: number;
  entityData?: SamEntityData[];
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
  generated_internal_id?: string;
}

interface UsaSpendingResponse {
  results?: UsaSpendingResult[];
  page_metadata?: {
    total?: number;
    page?: number;
    hasNext?: boolean;
  };
}

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

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let samApiKey: string | undefined;

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "gov-contracts-mcp",
  version: "1.0.0",
});

// ---- Tool 1: Search SAM.gov Contract Opportunities ----

mcpServer.tool(
  "contracts_search_opportunities",
  "Search SAM.gov for active federal contract opportunities (solicitations, RFPs, RFQs). Filter by keyword, NAICS code, and date range. Requires a SAM.gov API key.",
  {
    keyword: z
      .string()
      .optional()
      .describe("Search keyword for contract opportunities"),
    naicsCode: z
      .string()
      .optional()
      .describe("NAICS code filter (e.g., '541512' for IT services)"),
    postedFrom: z
      .string()
      .optional()
      .describe("Posted after date (MM/dd/yyyy)"),
    postedTo: z
      .string()
      .optional()
      .describe("Posted before date (MM/dd/yyyy)"),
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).default(0),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ keyword, naicsCode, postedFrom, postedTo, limit, offset, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    if (!samApiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "SAM.gov API key is required for this tool.",
                instructions:
                  "Register for a free API key at https://sam.gov/content/entity-registration and provide it as the 'samApiKey' input when starting this actor.",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const params = new URLSearchParams();
    params.set("api_key", samApiKey);
    params.set("ptype", "o");
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    if (keyword) params.set("keyword", keyword);
    if (naicsCode) params.set("naics", naicsCode);
    if (postedFrom) params.set("postedFrom", postedFrom);
    if (postedTo) params.set("postedTo", postedTo);

    const url = `${SAM_OPPORTUNITIES_URL}?${params.toString()}`;

    const response = await fetchWithRetry(url, {
      headers: { Accept: "application/json" },
    });

    const data = (await response.json()) as SamOpportunitiesResponse;
    const opportunities = (data?.opportunitiesData ?? []).map((opp) => ({
      noticeId: opp.noticeId ?? "",
      title: opp.title ?? "",
      solicitationNumber: opp.solicitationNumber ?? "",
      department: opp.department ?? "",
      office: opp.office ?? "",
      postedDate: opp.postedDate ?? "",
      type: opp.type ?? "",
      responseDeadline: opp.responseDeadLine ?? "",
      naicsCode: opp.naicsCode ?? "",
      setAside: opp.setAsideDescription ?? "",
      description: truncateText(opp.description, 500),
      link: opp.uiLink ?? "",
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { totalRecords: data?.totalRecords ?? 0, opportunities },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        totalRecords: data?.totalRecords ?? 0,
        opportunities,
      },
      isError: false,
    };
  },
);

// ---- Tool 2: Search USASpending.gov Award Data ----

mcpServer.tool(
  "contracts_search_spending",
  "Search USASpending.gov for federal award spending data (contracts, grants, loans). No API key required. Filter by keyword, award type, date range, and agency.",
  {
    keyword: z
      .string()
      .optional()
      .describe("Search keyword for awards/spending"),
    awardType: z
      .enum(["contracts", "grants", "loans", "direct_payments", "other"])
      .optional()
      .default("contracts"),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date YYYY-MM-DD"),
    dateTo: z
      .string()
      .optional()
      .describe("End date YYYY-MM-DD"),
    agency: z
      .string()
      .optional()
      .describe("Awarding agency name"),
    limit: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ keyword, awardType, dateFrom, dateTo, agency, limit, page, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const filters: Record<string, unknown> = {};

    if (keyword) {
      filters.keyword = keyword;
    }

    if (awardType) {
      filters.award_type_codes = AWARD_TYPE_CODES[awardType] ?? AWARD_TYPE_CODES.contracts;
    }

    if (dateFrom || dateTo) {
      filters.time_period = [
        {
          start_date: dateFrom ?? "2000-01-01",
          end_date: dateTo ?? "2099-12-31",
        },
      ];
    }

    if (agency) {
      filters.agencies = [
        {
          type: "awarding",
          tier: "toptier",
          name: agency,
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
    const results = (data?.results ?? []).map((r) => ({
      awardId: r["Award ID"] ?? "",
      recipientName: r["Recipient Name"] ?? "",
      awardAmount: r["Award Amount"] ?? 0,
      awardingAgency: r["Awarding Agency"] ?? "",
      subAgency: r["Awarding Sub Agency"] ?? "",
      awardType: r["Award Type"] ?? "",
      startDate: r["Start Date"] ?? "",
      endDate: r["End Date"] ?? "",
      description: r.Description ?? "",
    }));

    const pageMetadata = {
      total: data?.page_metadata?.total ?? 0,
      page: data?.page_metadata?.page ?? page,
      hasNext: data?.page_metadata?.hasNext ?? false,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ pageMetadata, results }, null, 2),
        },
      ],
      structuredContent: { pageMetadata, results },
      isError: false,
    };
  },
);

// ---- Tool 3: Lookup SAM.gov Registered Entities ----

mcpServer.tool(
  "contracts_lookup_entity",
  "Search SAM.gov for registered entities (contractors, grantees). Look up by business name, UEI, CAGE code, or state. Requires a SAM.gov API key.",
  {
    legalBusinessName: z
      .string()
      .optional()
      .describe("Business name to search"),
    ueiSAM: z
      .string()
      .optional()
      .describe("Unique Entity ID (UEI)"),
    cageCode: z
      .string()
      .optional()
      .describe("CAGE code"),
    state: z
      .string()
      .optional()
      .describe("State code like CA, NY"),
    limit: z.number().int().min(1).max(100).default(10),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ legalBusinessName, ueiSAM, cageCode, state, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    if (!samApiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "SAM.gov API key is required for this tool.",
                instructions:
                  "Register for a free API key at https://sam.gov/content/entity-registration and provide it as the 'samApiKey' input when starting this actor.",
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }

    const params = new URLSearchParams();
    params.set("api_key", samApiKey);
    params.set("registrationStatus", "A");
    params.set("includeSections", "entityRegistration");
    params.set("limit", String(limit));

    if (legalBusinessName) params.set("legalBusinessName", legalBusinessName);
    if (ueiSAM) params.set("ueiSAM", ueiSAM);
    if (cageCode) params.set("cageCode", cageCode);
    if (state) params.set("physicalAddress.stateOrProvinceCode", state);

    const url = `${SAM_ENTITIES_URL}?${params.toString()}`;

    const response = await fetchWithRetry(url, {
      headers: { Accept: "application/json" },
    });

    const data = (await response.json()) as SamEntitiesResponse;
    const entities = (data?.entityData ?? []).map((entity) => {
      const reg = entity.entityRegistration ?? {};
      const addr = entity.coreData?.physicalAddress ?? {};
      return {
        legalBusinessName: reg.legalBusinessName ?? "",
        uei: reg.ueiSAM ?? "",
        cageCode: reg.cageCode ?? "",
        registrationStatus: reg.registrationStatus ?? "",
        registrationDate: reg.registrationDate ?? "",
        address: addr.addressLine1 ?? "",
        city: addr.city ?? "",
        state: addr.stateOrProvinceCode ?? "",
        zipCode: addr.zipCode ?? "",
        naicsCode: entity.assertions?.naicsCode ?? "",
      };
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            { totalRecords: data?.totalRecords ?? 0, entities },
            null,
            2,
          ),
        },
      ],
      structuredContent: {
        totalRecords: data?.totalRecords ?? 0,
        entities,
      },
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
        server: "gov-contracts-mcp",
        timestamp: new Date().toISOString(),
        message: "MCP server is healthy. Use standby mode for MCP tool access.",
    });
    await Actor.exit("Health check passed — use standby mode for MCP access.");
}

const input = await Actor.getInput<{ samApiKey?: string }>();
samApiKey = input?.samApiKey;

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    server: "gov-contracts-mcp",
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
  console.log(`Gov Contracts MCP on port ${port}`);
});
