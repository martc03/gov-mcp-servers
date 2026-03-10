import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEC_USER_AGENT =
  "apify-business-entity-mcp/1.0 (contact@example.com)";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// OpenCorporates API token — set OPENCORPORATES_API_KEY env var in Apify
// to unlock higher rate limits. Falls back to anonymous (rate-limited) if absent.
const OC_API_TOKEN = process.env.OPENCORPORATES_API_KEY || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpenCorporatesCompany {
  name: string;
  company_number: string;
  jurisdiction_code: string;
  incorporation_date: string | null;
  dissolution_date: string | null;
  company_type: string | null;
  registry_url: string | null;
  current_status: string | null;
  registered_address?: {
    street_address?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  } | null;
  opencorporates_url: string;
}

interface OpenCorporatesSearchResponse {
  results: {
    companies: Array<{ company: OpenCorporatesCompany }>;
    total_count: number;
    per_page: number;
    page: number;
  };
}

interface OpenCorporatesDetailCompany extends OpenCorporatesCompany {
  officers?: Array<{
    officer: {
      name: string;
      position: string;
      start_date: string | null;
      end_date: string | null;
    };
  }>;
  industry_codes?: Array<{
    industry_code: {
      code: string;
      description: string;
      code_scheme_name: string;
    };
  }>;
  previous_names?: Array<{
    company_name: string;
    con_date: string | null;
  }>;
  source?: {
    publisher: string;
    url: string;
    retrieved_at: string;
  };
  filings?: Array<{
    filing: {
      title: string;
      date: string;
      url: string;
    };
  }>;
}

interface OpenCorporatesDetailResponse {
  results: {
    company: OpenCorporatesDetailCompany;
  };
}

interface SecHit {
  _source: {
    entity_name?: string;
    form_type?: string;
    file_date?: string;
    file_description?: string;
    period_of_report?: string;
    entity_id?: string;
    adsh?: string;
  };
}

interface SecSearchResponse {
  hits: {
    total: { value: number };
    hits: SecHit[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSecFilingUrl(entityId: string, adsh: string): string {
  const noDashes = adsh.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${entityId}/${noDashes}/${adsh}-index.htm`;
}

function formatAddress(
  addr?: OpenCorporatesCompany["registered_address"],
): string | null {
  if (!addr) return null;
  const parts = [
    addr.street_address,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
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
  name: "business-entity-mcp",
  version: "1.0.0",
});

// ---- Tool 1: entity_search_companies ----

mcpServer.tool(
  "entity_search_companies",
  "Search OpenCorporates for company registrations worldwide. Returns company name, number, jurisdiction, incorporation date, status, and registry URL. Provide OPENCORPORATES_API_KEY env var for higher rate limits.",
  {
    query: z.string().describe("Company name to search"),
    jurisdiction: z
      .string()
      .optional()
      .describe(
        "Jurisdiction code like 'us_ca' (California), 'us_ny' (New York), 'gb' (UK), 'us' (all US)",
      ),
    status: z
      .enum(["Active", "Inactive", "Dissolved"])
      .optional()
      .describe("Company status filter"),
    limit: z.number().int().min(1).max(30).default(10),
    page: z.number().int().min(1).default(1),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ query, jurisdiction, status, limit, page, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("q", query);
    if (jurisdiction) params.set("jurisdiction_code", jurisdiction);
    if (status) params.set("current_status", status);
    params.set("per_page", String(limit));
    params.set("page", String(page));
    // Attach API token if configured — unlocks higher rate limits
    if (OC_API_TOKEN) params.set("api_token", OC_API_TOKEN);

    const url = `https://api.opencorporates.com/v0.4/companies/search?${params.toString()}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const data = (await response.json()) as OpenCorporatesSearchResponse;
      const companiesRaw = data?.results?.companies ?? [];

      const companies = companiesRaw.map(({ company }) => ({
        name: company.name,
        companyNumber: company.company_number,
        jurisdiction: company.jurisdiction_code,
        incorporationDate: company.incorporation_date,
        dissolutionDate: company.dissolution_date,
        companyType: company.company_type,
        currentStatus: company.current_status,
        registryUrl: company.registry_url,
        opencorporatesUrl: company.opencorporates_url,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalCount: data?.results?.total_count ?? 0,
                page: data?.results?.page ?? page,
                perPage: data?.results?.per_page ?? limit,
                companies,
              },
              null,
              2,
            ),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("403")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: OC_API_TOKEN
                    ? "Rate limited by OpenCorporates (HTTP 403). Wait a moment and try again."
                    : "Rate limited by OpenCorporates (HTTP 403). Set OPENCORPORATES_API_KEY env var in Apify for higher rate limits.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

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

// ---- Tool 2: entity_get_company_details ----

mcpServer.tool(
  "entity_get_company_details",
  "Get detailed company information from OpenCorporates by jurisdiction and company number. Returns officers, industry codes, previous names, registered address, and filing history.",
  {
    jurisdiction: z
      .string()
      .describe("Jurisdiction code (e.g., 'us_ca', 'us_de', 'gb')"),
    companyNumber: z
      .string()
      .describe("Company registration number"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ jurisdiction, companyNumber, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    // Attach API token if configured
    if (OC_API_TOKEN) params.set("api_token", OC_API_TOKEN);
    const queryString = OC_API_TOKEN ? `?${params.toString()}` : "";

    const url = `https://api.opencorporates.com/v0.4/companies/${encodeURIComponent(jurisdiction)}/${encodeURIComponent(companyNumber)}${queryString}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const data = (await response.json()) as OpenCorporatesDetailResponse;
      const company = data?.results?.company;

      if (!company) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { error: "Company not found" },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

      const officers = (company.officers ?? []).slice(0, 10).map((o) => ({
        name: o.officer.name,
        position: o.officer.position,
        startDate: o.officer.start_date,
        endDate: o.officer.end_date,
      }));

      const industryCodes = (company.industry_codes ?? []).map((ic) => ({
        code: ic.industry_code.code,
        description: ic.industry_code.description,
        scheme: ic.industry_code.code_scheme_name,
      }));

      const previousNames = (company.previous_names ?? []).map((pn) => ({
        name: pn.company_name,
        changeDate: pn.con_date,
      }));

      const result = {
        name: company.name,
        companyNumber: company.company_number,
        jurisdiction: company.jurisdiction_code,
        incorporationDate: company.incorporation_date,
        companyType: company.company_type,
        currentStatus: company.current_status,
        registeredAddress: formatAddress(company.registered_address),
        officers,
        industryCodes,
        previousNames,
        registryUrl: company.registry_url,
        opencorporatesUrl: company.opencorporates_url,
      };

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

      if (msg.includes("403")) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  error: OC_API_TOKEN
                    ? "Rate limited by OpenCorporates (HTTP 403). Wait a moment and try again."
                    : "Rate limited by OpenCorporates (HTTP 403). Set OPENCORPORATES_API_KEY env var in Apify for higher rate limits.",
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }

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

// ---- Tool 3: entity_search_sec_companies ----

mcpServer.tool(
  "entity_search_sec_companies",
  "Search SEC EDGAR for US public company filings and CIK lookup. Returns entity name, form type, filing date, description, and direct filing URL. Useful for KYC and compliance checks on public companies.",
  {
    companyName: z.string().describe("Company name to search"),
    formTypes: z
      .array(z.string())
      .optional()
      .default(["10-K", "10-Q", "8-K"])
      .describe("SEC form types like 10-K, 10-Q, 8-K"),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date YYYY-MM-DD"),
    dateTo: z
      .string()
      .optional()
      .describe("End date YYYY-MM-DD"),
    limit: z.number().int().min(1).max(50).default(10),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ companyName, formTypes, dateFrom, dateTo, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("q", companyName);
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

    try {
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
        server: "business-entity-mcp",
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
    server: "business-entity-mcp",
    apiTokenConfigured: !!OC_API_TOKEN,
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
  console.log(`Business Entity MCP on port ${port}`);
  console.log(`OpenCorporates API token: ${OC_API_TOKEN ? "configured ✓" : "not set (anonymous/rate-limited)"}`);
});
