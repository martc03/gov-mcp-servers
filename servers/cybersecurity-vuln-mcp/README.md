# Cybersecurity Vulnerability Intelligence MCP Server

Unified vulnerability intelligence from 4 government data sources in a single MCP server. Get enriched CVE lookups with CVSS scores, active exploitation status, exploitation probability, and ATT&CK techniques — all in one call.

## Data Sources

| Source | What It Provides | Update Frequency |
|--------|-----------------|-----------------|
| **NIST NVD 2.0** | CVE details, CVSS scores, descriptions, references, CWE classifications | Continuous |
| **CISA KEV** | Actively exploited vulnerabilities catalog, remediation deadlines | Daily |
| **FIRST.org EPSS** | Exploitation probability scores (0-1) predicting likelihood of exploitation in next 30 days | Daily |
| **MITRE ATT&CK** | Adversary techniques mapped to CVEs | Quarterly |

## Tools

### `vuln_lookup_cve` — Enriched CVE Lookup (Recommended Start)

The killer feature. Look up any CVE and get intelligence from all 4 sources in a single call.

**Parameters:**
- `cveId` (required): CVE identifier (e.g., `CVE-2021-44228`)

**Returns:** NVD details + CVSS score + KEV exploitation status + EPSS probability + ATT&CK techniques

**Example:** Look up Log4Shell → Get CVSS 10.0, confirmed in CISA KEV, EPSS 0.97 (97th percentile), mapped to T1190 (Exploit Public-Facing Application).

### `vuln_search` — Search CVEs

Search the NVD by keyword, severity, and date range.

**Parameters:**
- `keyword`: Search term (e.g., "apache log4j", "buffer overflow")
- `severity`: LOW, MEDIUM, HIGH, or CRITICAL
- `pubStartDate` / `pubEndDate`: ISO date range
- `hasKev`: If true, only return CVEs in the CISA KEV catalog
- `limit`: Max results (1-50, default 20)

### `vuln_kev_latest` — Recently Exploited Vulnerabilities

Get vulnerabilities recently added to CISA's Known Exploited Vulnerabilities catalog.

**Parameters:**
- `days`: Look back period (default 7)
- `limit`: Max results (default 20)

### `vuln_kev_due_soon` — Upcoming Remediation Deadlines

Get KEV entries with remediation deadlines approaching. Critical for federal compliance.

**Parameters:**
- `days`: Deadline within N days (default 14)
- `limit`: Max results (default 20)

### `vuln_epss_top` — Highest Exploitation Probability

Get CVEs most likely to be exploited in the next 30 days based on EPSS machine learning model.

**Parameters:**
- `threshold`: Minimum EPSS score 0-1 (default 0.7 = 70%)
- `limit`: Max results (default 20)

### `vuln_trending` — Newly Published Critical CVEs

Get recently published high/critical severity CVEs from the NVD.

**Parameters:**
- `days`: Published within last N days (default 3)
- `severity`: Minimum severity level (default CRITICAL)
- `limit`: Max results (default 20)

### `vuln_by_vendor` — Vendor Vulnerability Assessment

Search CVEs for a specific vendor/product. Cross-references with CISA KEV to flag actively exploited issues.

**Parameters:**
- `vendor` (required): Vendor name (e.g., "microsoft", "apache")
- `product`: Narrow by product (e.g., "windows", "log4j")
- `limit`: Max results (default 20)

## Use Cases

- **Vulnerability triage**: Look up a CVE and instantly know if it's actively exploited, its EPSS score, and what ATT&CK techniques apply
- **Patch prioritization**: Combine KEV status + EPSS scores to prioritize remediation
- **Compliance tracking**: Monitor upcoming CISA KEV remediation deadlines
- **Threat intelligence**: Track trending CVEs and newly weaponized vulnerabilities
- **Vendor risk assessment**: Assess a vendor's vulnerability exposure and active exploitation status

## Attribution

- This product uses data from the NVD API but is not endorsed or certified by the NVD.
- EPSS data provided by FIRST.org (https://www.first.org/epss/).
- ATT&CK is a registered trademark of The MITRE Corporation. Licensed under Apache 2.0.
- CISA Known Exploited Vulnerabilities Catalog — US Government public domain.
