import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEC_USER_AGENT = "apify-business-entity-mcp/2.0 (contact@example.com)";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// Companies House API key — reads from Apify Input first, falls back to env var
// Get a free key at https://developer.company-information.service.gov.uk/
const input = await Actor.getInput<{ companiesHouseApiKey?: string }>() ?? {};
const CH_API_KEY = input.companiesHouseApiKey || process.env.COMPANIES_HOUSE_API_KEY || "";

// GLEIF API — completely free, no key required
const GLEIF_BASE = "https://api.gleif.org/api/v1";

// Companies House API — free with registration
const CH_BASE = "https://api.company-information.service.gov.uk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GleifLeiRecord {
  type: string;
  id: string;
  attributes: {
    lei: string;
    entity: {
      legalName: { name: string; language: string | null };
      otherNames?: Array<{ name: string; language: string | null; type: string }>;
      transliteratedOtherNames?: unknown[];
      legalAddress: {
        language: string | null;
        addressLines: string[];
        addressNumber: string | null;
        addressNumberWithinBuilding: string | null;
        mailRouting: string | null;
        city: string;
        region: string | null;
        country: string;
        postalCode: string | null;
      };
      headquartersAddress: {
        language: string | null;
        addressLines: string[];
        city: string;
        region: string | null;
        country: string;
        postalCode: string | null;
      };
      registeredAt?: { id: string; other: string | null };
      registeredAs?: string | null;
      jurisdiction: string | null;
      category: string | null;
      legalForm?: { id: string; other: string | null };
      associatedEntity?: { lei: string | null; name: string | null };
      status: string;
      expiration?: { date: string | null; reason: string | null };
      successorEntity?: { lei: string | null; name: string | null };
      creationDate?: string | null;
    };
    registration: {
      initialRegistrationDate: string;
      lastUpdateDate: string;
      status: string;
      nextRenewalDate: string;
      managingLou: string;
      corroborationLevel: string;
      validatedAt?: { id: string; other: string | null };
      validatedAs?: string | null;
    };
    bic?: string[] | null;
  };
}

interface GleifSearchResponse {
  data: GleifLeiRecord[];
  meta: {
    goldenCopy: { publishDate: string };
    pagination: {
      currentPage: number;
      perPage: number;
      from: number;
      to: number;
      total: number;
      lastPage: number;
    };
  };
}

interface ChCompany {
  company_name: string;
  company_number: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  registered_office_address?: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  jurisdiction?: string;
  sic_codes?: string[];
}

interface ChSearchResponse {
  items: ChCompany[];
  total_results: number;
  page_number: number;
  items_per_page: number;
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
      throw new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 300)}`);
    }

    return response;
  }
  throw new Error(`Failed after ${retries} attempts for ${url}`);
}

function formatGleifAddress(addr: GleifLeiRecord["attributes"]["entity"]["legalAddress"]): string {
  const parts = [
    ...(addr.addressLines ?? []),
    addr.city,
    addr.region,
    addr.postalCode,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ");
}

function formatChAddress(addr?: ChCompany["registered_office_address"]): string | null {
  if (!addr) return null;
  const parts = [
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "business-entity-mcp",
  version: "2.0.0",
});

// ---- Tool 1: entity_search_global ----

mcpServer.tool(
  "entity_search_global",
  "Search the GLEIF global LEI (Legal Entity Identifier) database for companies worldwide. Free, no API key required. Returns company name, LEI, jurisdiction, legal address, status, and registration details. Best for international companies and financial entities.",
  {
    query: z.string().describe("Company name to search"),
    country: z
      .string()
      .optional()
      .describe("ISO 2-letter country code filter (e.g. 'US', 'GB', 'DE')"),
    status: z
      .enum(["ACTIVE", "INACTIVE", "PENDING_TRANSFER", "PENDING_ARCHIVAL"])
      .optional()
      .describe("Entity status filter"),
    limit: z.number().int().min(1).max(50).default(10),
    page: z.number().int().min(1).default(1),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ query, country, status, limit, page, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("filter[entity.legalName]", query);
    params.set("page[size]", String(limit));
    params.set("page[number]", String(page));
    if (country) params.set("filter[entity.legalAddress.country]", country);
    if (status) params.set("filter[registration.status]", status);

    const url = `${GLEIF_BASE}/lei-records?${params.toString()}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/vnd.api+json" },
      });

      const data = (await response.json()) as GleifSearchResponse;
      const records = data?.data ?? [];

      const companies = records.map((rec) => ({
        lei: rec.attributes.lei,
        legalName: rec.attributes.entity.legalName.name,
        jurisdiction: rec.attributes.entity.jurisdiction,
        country: rec.attributes.entity.legalAddress.country,
        status: rec.attributes.entity.status,
        registrationStatus: rec.attributes.registration.status,
        legalAddress: formatGleifAddress(rec.attributes.entity.legalAddress),
        category: rec.attributes.entity.category,
        legalForm: rec.attributes.entity.legalForm?.id ?? null,
        registeredAs: rec.attributes.entity.registeredAs ?? null,
        creationDate: rec.attributes.entity.creationDate ?? null,
        lastUpdated: rec.attributes.registration.lastUpdateDate,
        gleifUrl: `https://www.gleif.org/lei/${rec.attributes.lei}`,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalCount: data?.meta?.pagination?.total ?? 0,
                page: data?.meta?.pagination?.currentPage ?? page,
                perPage: data?.meta?.pagination?.perPage ?? limit,
                source: "GLEIF Global LEI Database (free)",
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
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
        isError: true,
      };
    }
  },
);

// ---- Tool 2: entity_get_lei_record ----

mcpServer.tool(
  "entity_get_lei_record",
  "Get full GLEIF LEI record details for a company by its LEI code. Returns complete entity data including addresses, registration authority, legal form, and relationship links. Free, no API key required.",
  {
    lei: z.string().describe("20-character Legal Entity Identifier (LEI) code"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ lei, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const url = `${GLEIF_BASE}/lei-records/${encodeURIComponent(lei)}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/vnd.api+json" },
      });

      const data = (await response.json()) as { data: GleifLeiRecord };
      const rec = data?.data;

      if (!rec) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "LEI record not found" }, null, 2) }],
          isError: true,
        };
      }

      const result = {
        lei: rec.attributes.lei,
        legalName: rec.attributes.entity.legalName.name,
        otherNames: (rec.attributes.entity.otherNames ?? []).map((n) => n.name),
        jurisdiction: rec.attributes.entity.jurisdiction,
        category: rec.attributes.entity.category,
        legalForm: rec.attributes.entity.legalForm?.id ?? null,
        status: rec.attributes.entity.status,
        creationDate: rec.attributes.entity.creationDate ?? null,
        legalAddress: formatGleifAddress(rec.attributes.entity.legalAddress),
        headquartersAddress: formatGleifAddress(rec.attributes.entity.headquartersAddress),
        registeredAs: rec.attributes.entity.registeredAs ?? null,
        registeredAt: rec.attributes.entity.registeredAt?.id ?? null,
        registration: {
          status: rec.attributes.registration.status,
          initialDate: rec.attributes.registration.initialRegistrationDate,
          lastUpdate: rec.attributes.registration.lastUpdateDate,
          nextRenewal: rec.attributes.registration.nextRenewalDate,
          managingLou: rec.attributes.registration.managingLou,
          corroborationLevel: rec.attributes.registration.corroborationLevel,
        },
        gleifUrl: `https://www.gleif.org/lei/${rec.attributes.lei}`,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
        isError: true,
      };
    }
  },
);

// ---- Tool 3: entity_search_uk_companies ----

mcpServer.tool(
  "entity_search_uk_companies",
  "Search UK Companies House for British company registrations. Returns company name, number, status, type, incorporation date, and registered address. Requires COMPANIES_HOUSE_API_KEY env var (free registration at https://developer.company-information.service.gov.uk/).",
  {
    query: z.string().describe("Company name to search"),
    status: z
      .enum(["active", "dissolved", "liquidation", "administration", "voluntary-arrangement"])
      .optional()
      .describe("Company status filter"),
    limit: z.number().int().min(1).max(100).default(10),
    page: z.number().int().min(1).default(1),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ query, status, limit, page, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    if (!CH_API_KEY) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                error: "COMPANIES_HOUSE_API_KEY not configured. Get a free API key at https://developer.company-information.service.gov.uk/ and set it as an environment variable in Apify.",
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
    params.set("q", query);
    params.set("items_per_page", String(limit));
    params.set("start_index", String((page - 1) * limit));
    if (status) params.set("restrictions", status);

    const url = `${CH_BASE}/search/companies?${params.toString()}`;

    // Companies House uses Basic Auth: API key as username, empty password
    const authHeader = "Basic " + Buffer.from(`${CH_API_KEY}:`).toString("base64");

    try {
      const response = await fetchWithRetry(url, {
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
      });

      const data = (await response.json()) as ChSearchResponse;
      const items = data?.items ?? [];

      const companies = items.map((c) => ({
        companyName: c.company_name,
        companyNumber: c.company_number,
        status: c.company_status ?? null,
        type: c.company_type ?? null,
        incorporationDate: c.date_of_creation ?? null,
        jurisdiction: c.jurisdiction ?? "United Kingdom",
        registeredAddress: formatChAddress(c.registered_office_address),
        sicCodes: c.sic_codes ?? [],
        companiesHouseUrl: `https://find-and-update.company-information.service.gov.uk/company/${c.company_number}`,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalCount: data?.total_results ?? 0,
                page,
                perPage: limit,
                source: "UK Companies House (free API)",
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
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
        isError: true,
      };
    }
  },
);

// ---- Tool 4: entity_search_sec_companies ----

mcpServer.tool(
  "entity_search_sec_companies",
  "Search SEC EDGAR for US public company filings and CIK lookup. Returns entity name, form type, filing date, description, and direct filing URL. Useful for KYC and compliance checks on US public companies. Free, no API key required.",
  {
    companyName: z.string().describe("Company name to search"),
    formTypes: z
      .array(z.string())
      .optional()
      .default(["10-K", "10-Q", "8-K"])
      .describe("SEC form types like 10-K, 10-Q, 8-K"),
    dateFrom: z.string().optional().describe("Start date YYYY-MM-DD"),
    dateTo: z.string().optional().describe("End date YYYY-MM-DD"),
    limit: z.number().int().min(1).max(50).default(10),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ companyName, formTypes, dateFrom, dateTo, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();
    params.set("q", companyName);
    if (formTypes && formTypes.length > 0) params.set("forms", formTypes.join(","));
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
        { headers: { "User-Agent": SEC_USER_AGENT, Accept: "application/json" } },
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
          filingUrl: entityId && adsh ? buildSecFilingUrl(entityId, adsh) : "",
        };
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(filings, null, 2) }],
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ error: msg }, null, 2) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Express + MCP HTTP Transport
// ---------------------------------------------------------------------------

await Actor.init();

if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
  console.log("Non-standby run detected — running health check...");
  await Actor.pushData({
    status: "healthy",
    server: "business-entity-mcp",
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    dataSources: {
      gleif: "active (free, no key)",
      companiesHouse: CH_API_KEY ? "active (key configured)" : "inactive (set COMPANIES_HOUSE_API_KEY)",
      secEdgar: "active (free, no key)",
    },
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
    version: "2.0.0",
    dataSources: {
      gleif: "active (free)",
      companiesHouse: CH_API_KEY ? "active" : "needs COMPANIES_HOUSE_API_KEY",
      secEdgar: "active (free)",
    },
  });
});

app.post("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => { transport.close(); });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error", detail: msg });
    }
  }
});

app.get("/mcp", (_req, res) => { res.status(405).json({ error: "Use POST" }); });
app.delete("/mcp", (_req, res) => { res.status(405).json({ error: "Not supported" }); });

const port = parseInt(process.env.APIFY_ACTOR_STANDBY_PORT || "4321", 10);
app.listen(port, () => {
  console.log(`Business Entity MCP v2.0.0 on port ${port}`);
  console.log(`GLEIF: active (free)`);
  console.log(`Companies House: ${CH_API_KEY ? "active ✓" : "needs COMPANIES_HOUSE_API_KEY"}`);
  console.log(`SEC EDGAR: active (free)`);
});
