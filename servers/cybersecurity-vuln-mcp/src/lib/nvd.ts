import { TtlCache } from "./cache.js";

const NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const NVD_API_KEY = process.env.NVD_API_KEY || "";

// Rate limiting: 5 req/30s without key, 50 req/30s with key
const THROTTLE_MS = NVD_API_KEY ? 600 : 6000;
let lastRequestTime = 0;

const cveCache = new TtlCache<NvdCveItem>(60 * 60 * 1000); // 1 hour

export interface NvdCveItem {
  id: string;
  sourceIdentifier?: string;
  published?: string;
  lastModified?: string;
  vulnStatus?: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31?: Array<{
      type?: string;
      cvssData?: {
        version?: string;
        vectorString?: string;
        baseScore?: number;
        baseSeverity?: string;
        attackVector?: string;
        attackComplexity?: string;
        privilegesRequired?: string;
        userInteraction?: string;
        scope?: string;
        confidentialityImpact?: string;
        integrityImpact?: string;
        availabilityImpact?: string;
      };
      exploitabilityScore?: number;
      impactScore?: number;
    }>;
    cvssMetricV2?: Array<{
      cvssData?: {
        baseScore?: number;
        vectorString?: string;
      };
    }>;
  };
  weaknesses?: Array<{
    type?: string;
    description?: Array<{ lang: string; value: string }>;
  }>;
  configurations?: unknown;
  references?: Array<{ url: string; source?: string; tags?: string[] }>;
}

interface NvdApiResponse {
  resultsPerPage: number;
  startIndex: number;
  totalResults: number;
  vulnerabilities: Array<{ cve: NvdCveItem }>;
}

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < THROTTLE_MS) {
    await new Promise((r) => setTimeout(r, THROTTLE_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function nvdFetch(params: URLSearchParams): Promise<NvdApiResponse> {
  await throttle();

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (NVD_API_KEY) {
    headers["apiKey"] = NVD_API_KEY;
  }

  const url = `${NVD_BASE}?${params.toString()}`;
  const response = await fetch(url, { headers });

  if (response.status === 403) {
    throw new Error("NVD rate limit exceeded. Try again in 30 seconds.");
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`NVD API returned ${response.status}: ${body.slice(0, 300)}`);
  }

  return (await response.json()) as NvdApiResponse;
}

export async function getCveById(cveId: string): Promise<NvdCveItem | null> {
  const cached = cveCache.get(cveId);
  if (cached) return cached;

  const params = new URLSearchParams({ cveId });
  const data = await nvdFetch(params);

  const cve = data.vulnerabilities?.[0]?.cve ?? null;
  if (cve) {
    cveCache.set(cveId, cve);
  }
  return cve;
}

export interface NvdSearchParams {
  keyword?: string;
  severity?: string;
  pubStartDate?: string;
  pubEndDate?: string;
  limit?: number;
}

export async function searchCves(opts: NvdSearchParams): Promise<{
  totalResults: number;
  cves: NvdCveItem[];
}> {
  const params = new URLSearchParams();

  if (opts.keyword) {
    params.set("keywordSearch", opts.keyword);
  }
  if (opts.severity) {
    params.set("cvssV3Severity", opts.severity.toUpperCase());
  }
  if (opts.pubStartDate) {
    params.set("pubStartDate", opts.pubStartDate);
  }
  if (opts.pubEndDate) {
    params.set("pubEndDate", opts.pubEndDate);
  }

  const limit = Math.min(opts.limit ?? 20, 50);
  params.set("resultsPerPage", String(limit));

  const data = await nvdFetch(params);

  const cves = data.vulnerabilities.map((v) => v.cve);
  for (const cve of cves) {
    cveCache.set(cve.id, cve);
  }

  return { totalResults: data.totalResults, cves };
}

export interface NvdTrendingParams {
  days?: number;
  severity?: string;
  limit?: number;
}

export async function getTrendingCves(opts: NvdTrendingParams): Promise<{
  totalResults: number;
  cves: NvdCveItem[];
}> {
  const days = opts.days ?? 3;
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const startStr = start.toISOString().replace(/\.\d{3}Z$/, ".000");
  const endStr = now.toISOString().replace(/\.\d{3}Z$/, ".000");

  return searchCves({
    severity: opts.severity ?? "CRITICAL",
    pubStartDate: startStr,
    pubEndDate: endStr,
    limit: opts.limit,
  });
}

export interface NvdVendorParams {
  vendor: string;
  product?: string;
  limit?: number;
}

export async function getCvesByVendor(opts: NvdVendorParams): Promise<{
  totalResults: number;
  cves: NvdCveItem[];
}> {
  const params = new URLSearchParams();

  // NVD uses virtualMatchString for CPE-based vendor search
  let cpeMatch = `cpe:2.3:*:${opts.vendor.toLowerCase()}`;
  if (opts.product) {
    cpeMatch += `:${opts.product.toLowerCase()}`;
  }
  cpeMatch += `:*`;
  params.set("virtualMatchString", cpeMatch);

  const limit = Math.min(opts.limit ?? 20, 50);
  params.set("resultsPerPage", String(limit));

  const data = await nvdFetch(params);

  const cves = data.vulnerabilities.map((v) => v.cve);
  for (const cve of cves) {
    cveCache.set(cve.id, cve);
  }

  return { totalResults: data.totalResults, cves };
}
