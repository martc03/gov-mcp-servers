import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

import { getCveById, searchCves, getTrendingCves, getCvesByVendor, type NvdCveItem } from "./lib/nvd.js";
import { lookupCve, getLatestKevEntries, getDueSoonEntries, getKevByVendor, type KevEntry } from "./lib/kev.js";
import { getEpssByCve, getTopEpss, type EpssScore } from "./lib/epss.js";
import { getAttackTechniques } from "./lib/attack-map.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

const ATTRIBUTION = {
  nvd: "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
  epss: "EPSS data provided by FIRST.org (https://www.first.org/epss/).",
  attack: "ATT&CK is a registered trademark of The MITRE Corporation. Licensed under Apache 2.0.",
  kev: "CISA Known Exploited Vulnerabilities Catalog — US Government public domain.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCveSummary(cve: NvdCveItem) {
  const description = cve.descriptions?.find((d) => d.lang === "en")?.value ?? "";
  const cvss31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
  const cvss2 = cve.metrics?.cvssMetricV2?.[0]?.cvssData;

  return {
    id: cve.id,
    published: cve.published ?? null,
    lastModified: cve.lastModified ?? null,
    vulnStatus: cve.vulnStatus ?? null,
    description,
    cvss: cvss31
      ? {
          version: "3.1",
          baseScore: cvss31.baseScore ?? null,
          severity: cvss31.baseSeverity ?? null,
          vector: cvss31.vectorString ?? null,
          attackVector: cvss31.attackVector ?? null,
          attackComplexity: cvss31.attackComplexity ?? null,
          privilegesRequired: cvss31.privilegesRequired ?? null,
          userInteraction: cvss31.userInteraction ?? null,
        }
      : cvss2
        ? {
            version: "2.0",
            baseScore: cvss2.baseScore ?? null,
            severity: null,
            vector: cvss2.vectorString ?? null,
          }
        : null,
    weaknesses:
      cve.weaknesses
        ?.flatMap((w) => w.description?.filter((d) => d.lang === "en").map((d) => d.value) ?? [])
        ?? [],
    references: (cve.references ?? []).slice(0, 10).map((r) => ({
      url: r.url,
      source: r.source ?? null,
      tags: r.tags ?? [],
    })),
  };
}

function formatKevStatus(kev: KevEntry | null) {
  if (!kev) {
    return { inKev: false };
  }
  return {
    inKev: true,
    vendorProject: kev.vendorProject,
    product: kev.product,
    vulnerabilityName: kev.vulnerabilityName,
    dateAdded: kev.dateAdded,
    dueDate: kev.dueDate,
    requiredAction: kev.requiredAction,
    knownRansomwareCampaignUse: kev.knownRansomwareCampaignUse,
    shortDescription: kev.shortDescription,
  };
}

function formatEpss(epss: EpssScore | null) {
  if (!epss) {
    return null;
  }
  return {
    score: epss.epss,
    percentile: epss.percentile,
    date: epss.date,
  };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
  name: "cybersecurity-vuln-mcp",
  version: "1.0.0",
});

// ---- Tool 1: Enriched CVE Lookup (the killer feature) ----

mcpServer.tool(
  "vuln_lookup_cve",
  "Look up a CVE by ID and get enriched intelligence: NVD details (CVSS score, description, references), CISA KEV active exploitation status, EPSS exploitation probability score, and MITRE ATT&CK techniques — all in a single call. The go-to tool for assessing any vulnerability.",
  {
    cveId: z
      .string()
      .regex(/^CVE-\d{4}-\d{4,}$/i)
      .describe("CVE identifier (e.g., CVE-2021-44228)"),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ cveId, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    const normalizedId = cveId.toUpperCase();

    // Fetch NVD + KEV + EPSS in parallel — partial failures OK
    const [nvdResult, kevResult, epssResult] = await Promise.allSettled([
      getCveById(normalizedId),
      lookupCve(normalizedId),
      getEpssByCve(normalizedId),
    ]);

    const nvd = nvdResult.status === "fulfilled" ? nvdResult.value : null;
    const kev = kevResult.status === "fulfilled" ? kevResult.value : null;
    const epss = epssResult.status === "fulfilled" ? epssResult.value : null;

    if (!nvd) {
      const nvdError = nvdResult.status === "rejected" ? String(nvdResult.reason) : "";
      return {
        content: [
          {
            type: "text" as const,
            text: `CVE ${normalizedId} not found in NVD.${nvdError ? ` Error: ${nvdError}` : ""}`,
          },
        ],
        isError: true,
      };
    }

    const attackTechniques = getAttackTechniques(normalizedId);

    const enriched = {
      ...formatCveSummary(nvd),
      kevStatus: formatKevStatus(kev),
      epss: formatEpss(epss),
      attackTechniques: attackTechniques.length > 0 ? attackTechniques : null,
      dataSources: {
        nvd: nvdResult.status === "fulfilled",
        kev: kevResult.status === "fulfilled",
        epss: epssResult.status === "fulfilled",
        attack: attackTechniques.length > 0,
      },
      attribution: ATTRIBUTION,
    };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(enriched, null, 2),
        },
      ],
      structuredContent: enriched,
      isError: false,
    };
  },
);

// ---- Tool 2: Search CVEs ----

mcpServer.tool(
  "vuln_search",
  "Search the NIST National Vulnerability Database for CVEs by keyword, severity, and date range. Returns CVSS scores, descriptions, and weakness classifications.",
  {
    keyword: z.string().optional().describe("Search keyword (e.g., 'apache log4j', 'buffer overflow')"),
    severity: z
      .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
      .optional()
      .describe("Filter by CVSS v3.1 severity"),
    pubStartDate: z
      .string()
      .optional()
      .describe("Publication start date in ISO format (e.g., 2024-01-01T00:00:00.000)"),
    pubEndDate: z
      .string()
      .optional()
      .describe("Publication end date in ISO format"),
    hasKev: z
      .boolean()
      .optional()
      .describe("If true, cross-reference results with CISA KEV to show only actively exploited CVEs"),
    limit: z.number().int().min(1).max(50).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ keyword, severity, pubStartDate, pubEndDate, hasKev, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const result = await searchCves({ keyword, severity, pubStartDate, pubEndDate, limit });

      let cves = result.cves.map(formatCveSummary);

      if (hasKev) {
        const kevChecks = await Promise.allSettled(
          cves.map((c) => lookupCve(c.id)),
        );
        cves = cves.filter(
          (_, i) =>
            kevChecks[i].status === "fulfilled" && kevChecks[i].value !== null,
        );
      }

      const response = {
        totalResults: hasKev ? cves.length : result.totalResults,
        returnedCount: cves.length,
        cves,
        attribution: { nvd: ATTRIBUTION.nvd },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error searching CVEs: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---- Tool 3: Recent KEV Entries ----

mcpServer.tool(
  "vuln_kev_latest",
  "Get recently added entries from the CISA Known Exploited Vulnerabilities (KEV) catalog. These are vulnerabilities confirmed to be actively exploited in the wild and require immediate remediation for federal agencies.",
  {
    days: z.number().int().min(1).max(365).default(7).describe("Look back N days (default 7)"),
    limit: z.number().int().min(1).max(100).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ days, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const entries = await getLatestKevEntries(days, limit);

      const response = {
        period: `Last ${days} days`,
        count: entries.length,
        entries: entries.map((e) => ({
          cveId: e.cveID,
          vendor: e.vendorProject,
          product: e.product,
          name: e.vulnerabilityName,
          dateAdded: e.dateAdded,
          dueDate: e.dueDate,
          requiredAction: e.requiredAction,
          ransomwareUse: e.knownRansomwareCampaignUse,
          description: e.shortDescription,
        })),
        attribution: { kev: ATTRIBUTION.kev },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error fetching KEV entries: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---- Tool 4: KEV Due Soon ----

mcpServer.tool(
  "vuln_kev_due_soon",
  "Get CISA KEV vulnerabilities with upcoming remediation deadlines. Federal agencies are required to patch these by the due date. Useful for compliance tracking and patch prioritization.",
  {
    days: z.number().int().min(1).max(90).default(14).describe("Deadline within next N days (default 14)"),
    limit: z.number().int().min(1).max(100).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ days, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const entries = await getDueSoonEntries(days, limit);

      const response = {
        deadline: `Within ${days} days`,
        count: entries.length,
        entries: entries.map((e) => ({
          cveId: e.cveID,
          vendor: e.vendorProject,
          product: e.product,
          name: e.vulnerabilityName,
          dateAdded: e.dateAdded,
          dueDate: e.dueDate,
          requiredAction: e.requiredAction,
          ransomwareUse: e.knownRansomwareCampaignUse,
          description: e.shortDescription,
        })),
        attribution: { kev: ATTRIBUTION.kev },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error fetching due-soon KEV entries: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---- Tool 5: Top EPSS Scores ----

mcpServer.tool(
  "vuln_epss_top",
  "Get CVEs with the highest Exploit Prediction Scoring System (EPSS) probabilities. EPSS scores predict how likely a CVE is to be exploited in the next 30 days. A score of 0.9 means 90% probability of exploitation.",
  {
    threshold: z
      .number()
      .min(0)
      .max(1)
      .default(0.7)
      .describe("Minimum EPSS score (0-1). Default 0.7 = 70% exploitation probability"),
    limit: z.number().int().min(1).max(100).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ threshold, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const scores = await getTopEpss(threshold, limit);

      const response = {
        threshold,
        count: scores.length,
        scores: scores.map((s) => ({
          cveId: s.cve,
          epssScore: s.epss,
          percentile: s.percentile,
          date: s.date,
        })),
        attribution: { epss: ATTRIBUTION.epss },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error fetching EPSS scores: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---- Tool 6: Trending CVEs ----

mcpServer.tool(
  "vuln_trending",
  "Get recently published critical and high severity CVEs from the NVD. Useful for staying on top of emerging threats and new vulnerability disclosures.",
  {
    days: z.number().int().min(1).max(30).default(3).describe("Published within last N days (default 3)"),
    severity: z
      .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
      .default("CRITICAL")
      .describe("Minimum severity level"),
    limit: z.number().int().min(1).max(50).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ days, severity, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const result = await getTrendingCves({ days, severity, limit });
      const cves = result.cves.map(formatCveSummary);

      const response = {
        period: `Last ${days} days`,
        severity,
        totalResults: result.totalResults,
        returnedCount: cves.length,
        cves,
        attribution: { nvd: ATTRIBUTION.nvd },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error fetching trending CVEs: ${msg}` }],
        isError: true,
      };
    }
  },
);

// ---- Tool 7: CVEs by Vendor ----

mcpServer.tool(
  "vuln_by_vendor",
  "Search CVEs for a specific vendor or product using CPE matching. Cross-references with CISA KEV to flag actively exploited vulnerabilities for the vendor. Essential for vendor risk assessments.",
  {
    vendor: z.string().describe("Vendor name (e.g., 'microsoft', 'apache', 'google', 'cisco')"),
    product: z.string().optional().describe("Product name to narrow results (e.g., 'windows', 'log4j')"),
    limit: z.number().int().min(1).max(50).default(20),
    _gatewayToken: z.string().optional().describe("Internal gateway token"),
  },
  async ({ vendor, product, limit, _gatewayToken }) => {
    if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
      await Actor.charge({ eventName: "tool-request" });
    }

    try {
      const [nvdResult, kevEntries] = await Promise.allSettled([
        getCvesByVendor({ vendor, product, limit }),
        getKevByVendor(vendor, 500),
      ]);

      const cves =
        nvdResult.status === "fulfilled"
          ? nvdResult.value.cves.map(formatCveSummary)
          : [];

      const kevSet = new Set(
        kevEntries.status === "fulfilled"
          ? kevEntries.value.map((e) => e.cveID)
          : [],
      );

      const enrichedCves = cves.map((c) => ({
        ...c,
        inKev: kevSet.has(c.id),
      }));

      const response = {
        vendor,
        product: product ?? null,
        totalResults: nvdResult.status === "fulfilled" ? nvdResult.value.totalResults : 0,
        returnedCount: enrichedCves.length,
        kevCount: enrichedCves.filter((c) => c.inKev).length,
        cves: enrichedCves,
        attribution: { nvd: ATTRIBUTION.nvd, kev: ATTRIBUTION.kev },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
        isError: false,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error searching vendor CVEs: ${msg}` }],
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
        server: "cybersecurity-vuln-mcp",
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
    server: "cybersecurity-vuln-mcp",
    tools: 7,
    sources: ["NVD", "CISA KEV", "EPSS", "ATT&CK"],
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
  console.log(`Cybersecurity Vulnerability Intelligence MCP on port ${port}`);
});
