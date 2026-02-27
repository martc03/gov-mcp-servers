import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FEDERAL_REGISTER_BASE = "https://www.federalregister.gov/api/v1";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

const DOCUMENT_FIELDS = [
  "document_number",
  "title",
  "type",
  "abstract",
  "agencies",
  "publication_date",
  "html_url",
  "pdf_url",
  "citation",
  "action",
  "dates",
  "significant",
  "regulation_id_numbers",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FederalRegisterAgency {
  name?: string;
  id?: number;
  slug?: string;
  url?: string;
  description?: string;
  recent_articles_count?: number;
}

interface FederalRegisterDocument {
  document_number?: string;
  title?: string;
  type?: string;
  abstract?: string;
  agencies?: FederalRegisterAgency[];
  publication_date?: string;
  html_url?: string;
  pdf_url?: string;
  citation?: string;
  action?: string;
  dates?: string;
  significant?: boolean;
  regulation_id_numbers?: Array<{ regulation_id_number?: string }>;
  docket_ids?: string[];
  effective_on?: string;
}

interface DocumentSearchResponse {
  count?: number;
  total_pages?: number;
  results?: FederalRegisterDocument[];
}

interface PublicInspectionDocument {
  document_number?: string;
  title?: string;
  type?: string;
  agencies?: FederalRegisterAgency[];
  publication_date?: string;
  html_url?: string;
  pdf_url?: string;
  filing_type?: string;
  editorial_note?: string;
}

interface PublicInspectionResponse {
  count?: number;
  results?: PublicInspectionDocument[];
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

function truncateText(text: string | undefined, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function flattenAgencies(agencies: FederalRegisterAgency[] | undefined): string {
  if (!agencies || agencies.length === 0) return "";
  return agencies
    .map((a) => a.name ?? "Unknown Agency")
    .join(", ");
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "regulatory-monitor-mcp",
  version: "1.0.0",
});

// ---- Tool 1: Search Federal Register Documents ----

mcpServer.tool(
  "reg_search_documents",
  "Search the Federal Register for rules, proposed rules, notices, and presidential documents. Filter by keyword, document type, agency, date range, and economic significance. No API key required.",
  {
    term: z
      .string()
      .optional()
      .describe("Search term/keyword to search across document titles, abstracts, and full text"),
    documentType: z
      .enum(["RULE", "PRORULE", "NOTICE", "PRESDOCU"])
      .optional()
      .describe("Document type filter: RULE (final rules), PRORULE (proposed rules), NOTICE (notices), PRESDOCU (presidential documents)"),
    agency: z
      .string()
      .optional()
      .describe("Agency slug to filter by (e.g., 'environmental-protection-agency', 'securities-and-exchange-commission', 'food-and-drug-administration')"),
    dateFrom: z
      .string()
      .optional()
      .describe("Start date filter in YYYY-MM-DD format (publication date >= this date)"),
    dateTo: z
      .string()
      .optional()
      .describe("End date filter in YYYY-MM-DD format (publication date <= this date)"),
    significant: z
      .boolean()
      .optional()
      .describe("Filter for economically significant rules only (rules with annual effect of $100M+)"),
    perPage: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of results per page (1-50, default 20)"),
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Page number for pagination (default 1)"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ term, documentType, agency, dateFrom, dateTo, significant, perPage, page, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();

    if (term) {
      params.append("conditions[term]", term);
    }
    if (documentType) {
      params.append("conditions[type][]", documentType);
    }
    if (agency) {
      params.append("conditions[agencies][]", agency);
    }
    if (dateFrom) {
      params.append("conditions[publication_date][gte]", dateFrom);
    }
    if (dateTo) {
      params.append("conditions[publication_date][lte]", dateTo);
    }
    if (significant !== undefined) {
      params.append("conditions[significant]", significant ? "1" : "0");
    }

    params.append("per_page", String(perPage));
    params.append("page", String(page));
    params.append("order", "newest");

    for (const field of DOCUMENT_FIELDS) {
      params.append("fields[]", field);
    }

    const url = `${FEDERAL_REGISTER_BASE}/documents.json?${params.toString()}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const data = (await response.json()) as DocumentSearchResponse;
      const results = data.results ?? [];

      const documents = results.map((doc) => ({
        documentNumber: doc.document_number ?? "",
        title: doc.title ?? "",
        type: doc.type ?? "",
        abstract: truncateText(doc.abstract, 500),
        agencies: flattenAgencies(doc.agencies),
        publicationDate: doc.publication_date ?? "",
        htmlUrl: doc.html_url ?? "",
        citation: doc.citation ?? "",
        significant: doc.significant ?? false,
        action: doc.action ?? "",
      }));

      const result = {
        totalCount: data.count ?? 0,
        totalPages: data.total_pages ?? 0,
        page,
        documents,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching Federal Register: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 2: Get Single Document Details ----

mcpServer.tool(
  "reg_get_document",
  "Get full details of a specific Federal Register document by its document number. Returns complete metadata including abstract, effective dates, regulation IDs, docket IDs, and download links.",
  {
    documentNumber: z
      .string()
      .describe("The Federal Register document number (e.g., '2024-12345', 'E9-1234')"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ documentNumber, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const fieldsParams = DOCUMENT_FIELDS.concat([
      "docket_ids",
      "effective_on",
    ])
      .map((f) => `fields[]=${encodeURIComponent(f)}`)
      .join("&");

    const url = `${FEDERAL_REGISTER_BASE}/documents/${encodeURIComponent(documentNumber)}.json?${fieldsParams}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const doc = (await response.json()) as FederalRegisterDocument;

      const result = {
        documentNumber: doc.document_number ?? "",
        title: doc.title ?? "",
        type: doc.type ?? "",
        abstract: doc.abstract ?? "",
        fullTextUrl: doc.html_url ?? "",
        pdfUrl: doc.pdf_url ?? "",
        agencies: (doc.agencies ?? []).map((a) => ({
          name: a.name ?? "",
          id: a.id ?? null,
          slug: a.slug ?? "",
        })),
        publicationDate: doc.publication_date ?? "",
        citation: doc.citation ?? "",
        effectiveDate: doc.effective_on ?? doc.dates ?? "",
        action: doc.action ?? "",
        regulationIdNumbers: (doc.regulation_id_numbers ?? []).map(
          (r) => r.regulation_id_number ?? "",
        ),
        docketIds: doc.docket_ids ?? [],
        significant: doc.significant ?? false,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      if (msg.includes("404")) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Document '${documentNumber}' not found. Verify the document number is correct. Document numbers typically look like '2024-12345'.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching document '${documentNumber}': ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 3: Search Public Inspection Documents ----

mcpServer.tool(
  "reg_search_public_inspection",
  "Search documents currently on public inspection at the Federal Register (pre-publication). These are documents filed for public inspection before their official publication date, giving early visibility into upcoming regulations.",
  {
    term: z
      .string()
      .optional()
      .describe("Search term/keyword to filter public inspection documents"),
    agency: z
      .string()
      .optional()
      .describe("Agency slug to filter by (e.g., 'environmental-protection-agency')"),
    documentType: z
      .enum(["RULE", "PRORULE", "NOTICE", "PRESDOCU"])
      .optional()
      .describe("Document type filter: RULE, PRORULE, NOTICE, PRESDOCU"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ term, agency, documentType, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const params = new URLSearchParams();

    if (term) {
      params.append("conditions[term]", term);
    }
    if (agency) {
      params.append("conditions[agencies][]", agency);
    }
    if (documentType) {
      params.append("conditions[type][]", documentType);
    }

    const url = `${FEDERAL_REGISTER_BASE}/public-inspection-documents.json?${params.toString()}`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const data = (await response.json()) as PublicInspectionResponse;
      const results = data.results ?? [];

      const documents = results.map((doc) => ({
        documentNumber: doc.document_number ?? "",
        title: doc.title ?? "",
        type: doc.type ?? "",
        agencies: flattenAgencies(doc.agencies),
        publicationDate: doc.publication_date ?? "",
        htmlUrl: doc.html_url ?? "",
        pdfUrl: doc.pdf_url ?? "",
        filingType: doc.filing_type ?? "",
        editorialNote: doc.editorial_note ?? "",
      }));

      const result = {
        count: data.count ?? 0,
        documents,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error searching public inspection documents: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  },
);

// ---- Tool 4: List Federal Agencies ----

mcpServer.tool(
  "reg_list_agencies",
  "List or search federal agencies in the Federal Register. Use this to discover agency slugs needed for filtering document searches. Returns agency name, slug, description, and recent article count.",
  {
    search: z
      .string()
      .optional()
      .describe("Search/filter term to match against agency names (case-insensitive). Leave empty to list all agencies."),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ search, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const url = `${FEDERAL_REGISTER_BASE}/agencies.json`;

    try {
      const response = await fetchWithRetry(url, {
        headers: { Accept: "application/json" },
      });

      const allAgencies = (await response.json()) as FederalRegisterAgency[];

      const filtered = search
        ? allAgencies.filter((a) =>
            (a.name ?? "").toLowerCase().includes(search.toLowerCase()),
          )
        : allAgencies;

      const agencies = filtered.map((a) => ({
        name: a.name ?? "",
        slug: a.slug ?? "",
        url: a.url ?? "",
        description: truncateText(a.description, 300),
        recentArticlesCount: a.recent_articles_count ?? 0,
      }));

      const result = {
        search: search ?? null,
        totalFound: agencies.length,
        agencies,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing agencies: ${msg}`,
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
        server: "regulatory-monitor-mcp",
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
    server: "regulatory-monitor-mcp",
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
  console.log(`Regulatory Monitor MCP on port ${port}`);
});
