import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface AttackMapping {
  cveId: string;
  techniques: Array<{
    id: string;
    name: string;
    tactic?: string;
  }>;
}

const mappingIndex = new Map<string, AttackMapping["techniques"]>();
let loaded = false;

function loadMappings(): void {
  if (loaded) return;

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const dataPath = resolve(__dirname, "../../data/kev-attack-mapping.json");
    const raw = readFileSync(dataPath, "utf-8");
    const entries = JSON.parse(raw) as Array<{
      cveId: string;
      techniques: AttackMapping["techniques"];
    }>;

    for (const entry of entries) {
      mappingIndex.set(entry.cveId.toUpperCase(), entry.techniques);
    }
  } catch {
    // Mapping file may be empty or missing — that's OK
  }

  loaded = true;
}

export function getAttackTechniques(
  cveId: string,
): AttackMapping["techniques"] {
  loadMappings();
  return mappingIndex.get(cveId.toUpperCase()) ?? [];
}
