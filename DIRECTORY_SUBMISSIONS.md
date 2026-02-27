# MCP Directory Submission Guide

All content below is ready to copy-paste into each directory's submission form.

---

## Status Tracker

- [x] **GitHub Monorepo** — https://github.com/martc03/gov-mcp-servers
- [x] **awesome-mcp-servers** — PR #2459 submitted (https://github.com/punkpeye/awesome-mcp-servers/pull/2459)
- [x] **mcp.so** — Issue #587 submitted (https://github.com/chatmcp/mcpso/issues/587)
- [ ] **mcpservers.org** — Web form (see below)
- [ ] **PulseMCP** — Web form (see below)
- [ ] **Glama.ai** — Add Server button (see below)
- [ ] **Smithery.ai** — CLI login required (see below)
- [ ] **Official MCP Registry** — mcp-publisher CLI (see below)

---

## 1. mcpservers.org (Web Form)

URL: https://mcpservers.org/submit

Submit the TOP 3 servers individually (most impactful categories):

### Submission A — Cybersecurity Vulnerability Intel
- **Server Name**: Cybersecurity Vulnerability Intel MCP
- **Short Description**: Real-time CVE lookup, CISA KEV alerts, EPSS exploitation probability, and MITRE ATT&CK mappings. 7 tools powered by NIST NVD 2.0, CISA, and FIRST.org APIs.
- **Link**: https://github.com/martc03/gov-mcp-servers/tree/main/servers/cybersecurity-vuln-mcp
- **Category**: other (or security if available)
- **Contact Email**: codee.mcpdev@gmail.com

### Submission B — US Safety Recalls
- **Server Name**: US Safety Recalls MCP
- **Short Description**: Search NHTSA vehicle recalls and FDA food/drug recalls in real-time. 4 tools for product safety monitoring by AI agents.
- **Link**: https://github.com/martc03/gov-mcp-servers/tree/main/servers/us-safety-recalls-mcp
- **Category**: other
- **Contact Email**: codee.mcpdev@gmail.com

### Submission C — Natural Disaster Intel
- **Server Name**: Natural Disaster Intel MCP
- **Short Description**: FEMA disaster declarations, NOAA severe weather alerts, and USGS earthquake data. 4 tools for real-time disaster monitoring.
- **Link**: https://github.com/martc03/gov-mcp-servers/tree/main/servers/natural-disaster-intel-mcp
- **Category**: other
- **Contact Email**: codee.mcpdev@gmail.com

---

## 2. PulseMCP (Web Form)

URL: https://www.pulsemcp.com/submit

- **Type**: MCP Server
- **URL**: https://github.com/martc03/gov-mcp-servers

(PulseMCP accepts a repo URL and indexes all servers from it)

---

## 3. Glama.ai

URL: https://glama.ai/mcp/servers → Click "Add Server"

Submit the GitHub repo URL:
- **URL**: https://github.com/martc03/gov-mcp-servers

If it asks for individual servers, submit the cybersecurity one first:
- **URL**: https://github.com/martc03/gov-mcp-servers/tree/main/servers/cybersecurity-vuln-mcp

---

## 4. Smithery.ai (CLI)

Requires browser login first:
```bash
npx @smithery/cli auth login
```

Then publish:
```bash
cd ~/gov-mcp-servers/servers/cybersecurity-vuln-mcp
npx @smithery/cli mcp publish -n martc03/cybersecurity-vuln-mcp
```

Repeat for other servers:
```bash
cd ~/gov-mcp-servers/servers/us-safety-recalls-mcp
npx @smithery/cli mcp publish -n martc03/us-safety-recalls-mcp

cd ~/gov-mcp-servers/servers/natural-disaster-intel-mcp
npx @smithery/cli mcp publish -n martc03/natural-disaster-intel-mcp
```

---

## 5. Official MCP Registry

Install publisher CLI:
```bash
npx @anthropic/mcp-publisher init
```

Then register each server with its GitHub URL. Documentation at:
https://modelcontextprotocol.io/docs/registry

---

## 6. Community Posts (Do After Directory Submissions)

### Reddit r/ClaudeAI
Title: "I built 13 MCP servers for US government data — cybersecurity, safety recalls, disasters, and more"
Body: Share the GitHub repo link + brief description of what each tier does.

### Reddit r/cybersecurity
Title: "Open-source MCP server for CVE lookup with NIST NVD, CISA KEV, EPSS, and ATT&CK data"
Body: Focus on the cybersecurity server specifically.

### Claude Developers Discord (#showcase)
Link: https://discord.gg/claudedev
Share the GitHub repo with a brief description.

### Dev.to Article
Title: "Building 13 MCP Servers for Government Data: From CVE Lookups to Disaster Alerts"
Focus on the technical journey and how MCP works.
