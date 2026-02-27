import { TtlCache } from "./cache.js";

const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

const catalogCache = new TtlCache<KevCatalog>(2 * 60 * 60 * 1000); // 2 hours
const CACHE_KEY = "kev-catalog";

export interface KevEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
  knownRansomwareCampaignUse: string;
  notes: string;
}

interface KevCatalog {
  title: string;
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: KevEntry[];
}

async function loadCatalog(): Promise<KevCatalog> {
  const cached = catalogCache.get(CACHE_KEY);
  if (cached) return cached;

  const response = await fetch(KEV_URL, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`CISA KEV returned ${response.status}`);
  }

  const catalog = (await response.json()) as KevCatalog;
  catalogCache.set(CACHE_KEY, catalog);
  return catalog;
}

export async function lookupCve(cveId: string): Promise<KevEntry | null> {
  const catalog = await loadCatalog();
  return (
    catalog.vulnerabilities.find(
      (v) => v.cveID.toUpperCase() === cveId.toUpperCase(),
    ) ?? null
  );
}

export async function getLatestKevEntries(
  days: number,
  limit: number,
): Promise<KevEntry[]> {
  const catalog = await loadCatalog();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return catalog.vulnerabilities
    .filter((v) => v.dateAdded >= cutoffStr)
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    .slice(0, limit);
}

export async function getDueSoonEntries(
  days: number,
  limit: number,
): Promise<KevEntry[]> {
  const catalog = await loadCatalog();
  const now = new Date().toISOString().slice(0, 10);
  const future = new Date();
  future.setDate(future.getDate() + days);
  const futureStr = future.toISOString().slice(0, 10);

  return catalog.vulnerabilities
    .filter((v) => v.dueDate >= now && v.dueDate <= futureStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, limit);
}

export async function getKevByVendor(
  vendor: string,
  limit: number,
): Promise<KevEntry[]> {
  const catalog = await loadCatalog();
  const vendorLower = vendor.toLowerCase();

  return catalog.vulnerabilities
    .filter((v) => v.vendorProject.toLowerCase().includes(vendorLower))
    .sort((a, b) => b.dateAdded.localeCompare(a.dateAdded))
    .slice(0, limit);
}
