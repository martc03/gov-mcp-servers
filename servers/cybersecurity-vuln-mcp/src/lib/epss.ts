import { TtlCache } from "./cache.js";

const EPSS_BASE = "https://api.first.org/data/v1/epss";

const epssCache = new TtlCache<EpssScore>(24 * 60 * 60 * 1000); // 24 hours

export interface EpssScore {
  cve: string;
  epss: number;
  percentile: number;
  date: string;
}

interface EpssApiResponse {
  status: string;
  "status-code": number;
  version: string;
  total: number;
  offset: number;
  limit: number;
  data: Array<{
    cve: string;
    epss: string;
    percentile: string;
    date: string;
  }>;
}

export async function getEpssByCve(cveId: string): Promise<EpssScore | null> {
  const cached = epssCache.get(cveId);
  if (cached) return cached;

  const url = `${EPSS_BASE}?cve=${encodeURIComponent(cveId)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`EPSS API returned ${response.status}`);
  }

  const data = (await response.json()) as EpssApiResponse;
  const entry = data.data?.[0];
  if (!entry) return null;

  const score: EpssScore = {
    cve: entry.cve,
    epss: parseFloat(entry.epss),
    percentile: parseFloat(entry.percentile),
    date: entry.date,
  };

  epssCache.set(cveId, score);
  return score;
}

export async function getTopEpss(
  threshold: number,
  limit: number,
): Promise<EpssScore[]> {
  const params = new URLSearchParams({
    order: "!epss",
    "epss-gt": String(threshold),
    limit: String(Math.min(limit, 100)),
  });

  const url = `${EPSS_BASE}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`EPSS API returned ${response.status}`);
  }

  const data = (await response.json()) as EpssApiResponse;

  return (data.data ?? []).map((entry) => ({
    cve: entry.cve,
    epss: parseFloat(entry.epss),
    percentile: parseFloat(entry.percentile),
    date: entry.date,
  }));
}
