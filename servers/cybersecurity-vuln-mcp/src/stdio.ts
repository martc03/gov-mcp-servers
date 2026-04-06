import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getCveById, searchCves, getTrendingCves, getCvesByVendor, type NvdCveItem } from "./lib/nvd.js";
import { lookupCve, getLatestKevEntries, getDueSoonEntries, getKevByVendor, type KevEntry } from "./lib/kev.js";
import { getEpssByCve, getTopEpss, type EpssScore } from "./lib/epss.js";
import { getAttackTechniques } from "./lib/attack-map.js";

const ATTRIBUTION = {
  nvd: "This product uses data from the NVD API but is not endorsed or certified by the NVD.",
  epss: "EPSS data provided by FIRST.org (https://www.first.org/epss/).",
  attack: "ATT&CK is a registered trademark of The MITRE Corporation. Licensed under Apache 2.0.",
  kev: "CISA Known Exploited Vulnerabilities Catalog — US Government public domain.",
};

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

const mcpServer = new McpServer({
  name: "cybersecurity-vuln-mcp",
  version: "1.0.0",
});

mcpServer.tool(
  "vuln_lookup_cve",
  "Look up a CVE by ID and get enriched intelligence: NVD details (CVSS score, description, references), CISA KEV active exploitation status, EPSS exploitation probability score, and MITRE ATT&CK techniques.",
  {
    cveId: z
      .string()
      .regex(/^CVE-\d{4}-\d{4,}$/i)
      .describe("CVE identifier (e.g., CVE-2021-44228)"),
  },
  async ({ cveId }) => {
    const normalizedId = cveId.toUpperCase();

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
      content: [{ type: "text" as const, text: JSON.stringify(enriched, null, 2) }],
      isError: false,
    };
  },
);

mcpServer.tool(
  "vuln_search",
  "Search the NIST NVD for CVEs by keyword, severity, and date range.",
  {
    keyword: z.string().optional().describe("Search keyword (e.g., 'apache log4j')"),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional().describe("CVSS v3.1 severity"),
    pubStartDate: z.string().optional().describe("Start date ISO format"),
    pubEndDate: z.string().optional().describe("End date ISO format"),
    hasKev: z.boolean().optional().describe("Only show actively exploited CVEs"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ keyword, severity, pubStartDate, pubEndDate, hasKev, limit }) => {
    try {
      const result = await searchCves({ keyword, severity, pubStartDate, pubEndDate, limit });
      let cves = result.cves.map(formatCveSummary);

      if (hasKev) {
        const kevChecks = await Promise.allSettled(cves.map((c) => lookupCve(c.id)));
        cves = cves.filter((_, i) => kevChecks[i].status === "fulfilled" && kevChecks[i].value !== null);
      }

      const response = {
        totalResults: hasKev ? cves.length : result.totalResults,
        returnedCount: cves.length,
        cves,
        attribution: { nvd: ATTRIBUTION.nvd },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
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

mcpServer.tool(
  "vuln_kev_latest",
  "Get recently added CISA KEV entries (actively exploited vulnerabilities).",
  {
    days: z.number().int().min(1).max(365).default(7).describe("Look back N days"),
    limit: z.number().int().min(1).max(100).default(20),
  },
  async ({ days, limit }) => {
    try {
      const entries = await getLatestKevEntries(days, limit);
      const response = {
        period: `Last ${days} days`,
        count: entries.length,
        entries: entries.map((e) => ({
          cveId: e.cveID, vendor: e.vendorProject, product: e.product,
          name: e.vulnerabilityName, dateAdded: e.dateAdded, dueDate: e.dueDate,
          requiredAction: e.requiredAction, ransomwareUse: e.knownRansomwareCampaignUse,
          description: e.shortDescription,
        })),
        attribution: { kev: ATTRIBUTION.kev },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }], isError: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `Error fetching KEV entries: ${msg}` }], isError: true };
    }
  },
);

mcpServer.tool(
  "vuln_kev_due_soon",
  "Get CISA KEV vulnerabilities with upcoming remediation deadlines.",
  {
    days: z.number().int().min(1).max(90).default(14).describe("Deadline within next N days"),
    limit: z.number().int().min(1).max(100).default(20),
  },
  async ({ days, limit }) => {
    try {
      const entries = await getDueSoonEntries(days, limit);
      const response = {
        deadline: `Within ${days} days`,
        count: entries.length,
        entries: entries.map((e) => ({
          cveId: e.cveID, vendor: e.vendorProject, product: e.product,
          name: e.vulnerabilityName, dateAdded: e.dateAdded, dueDate: e.dueDate,
          requiredAction: e.requiredAction, ransomwareUse: e.knownRansomwareCampaignUse,
          description: e.shortDescription,
        })),
        attribution: { kev: ATTRIBUTION.kev },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }], isError: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  },
);

mcpServer.tool(
  "vuln_epss_top",
  "Get CVEs with highest EPSS exploitation probability scores.",
  {
    threshold: z.number().min(0).max(1).default(0.7).describe("Minimum EPSS score (0-1)"),
    limit: z.number().int().min(1).max(100).default(20),
  },
  async ({ threshold, limit }) => {
    try {
      const scores = await getTopEpss(threshold, limit);
      const response = {
        threshold, count: scores.length,
        scores: scores.map((s) => ({ cveId: s.cve, epssScore: s.epss, percentile: s.percentile, date: s.date })),
        attribution: { epss: ATTRIBUTION.epss },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }], isError: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  },
);

mcpServer.tool(
  "vuln_trending",
  "Get recently published critical/high severity CVEs from the NVD.",
  {
    days: z.number().int().min(1).max(30).default(3).describe("Published within last N days"),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("CRITICAL"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ days, severity, limit }) => {
    try {
      const result = await getTrendingCves({ days, severity, limit });
      const cves = result.cves.map(formatCveSummary);
      const response = {
        period: `Last ${days} days`, severity,
        totalResults: result.totalResults, returnedCount: cves.length,
        cves, attribution: { nvd: ATTRIBUTION.nvd },
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }], isError: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  },
);

mcpServer.tool(
  "vuln_by_vendor",
  "Search CVEs for a specific vendor/product, cross-referenced with CISA KEV.",
  {
    vendor: z.string().describe("Vendor name (e.g., 'microsoft', 'apache')"),
    product: z.string().optional().describe("Product name (e.g., 'windows', 'log4j')"),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ vendor, product, limit }) => {
    try {
      const [nvdResult, kevEntries] = await Promise.allSettled([
        getCvesByVendor({ vendor, product, limit }),
        getKevByVendor(vendor, 500),
      ]);

      const cves = nvdResult.status === "fulfilled" ? nvdResult.value.cves.map(formatCveSummary) : [];
      const kevSet = new Set(kevEntries.status === "fulfilled" ? kevEntries.value.map((e) => e.cveID) : []);
      const enrichedCves = cves.map((c) => ({ ...c, inKev: kevSet.has(c.id) }));

      const response = {
        vendor, product: product ?? null,
        totalResults: nvdResult.status === "fulfilled" ? nvdResult.value.totalResults : 0,
        returnedCount: enrichedCves.length,
        kevCount: enrichedCves.filter((c) => c.inKev).length,
        cves: enrichedCves,
        attribution: { nvd: ATTRIBUTION.nvd, kev: ATTRIBUTION.kev },
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }], isError: false };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
