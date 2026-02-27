import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

const USER_AGENT = "apify-disaster-mcp/1.0";
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// ---------------------------------------------------------------------------
// Helper: build FEMA OData $filter string
// ---------------------------------------------------------------------------
function buildFemaFilter(params: {
    states?: string[];
    incidentTypes?: string[];
    yearFrom?: number;
    yearTo?: number;
}): string {
    const clauses: string[] = [];

    if (params.states && params.states.length > 0) {
        const stateClauses = params.states.map((s) => `state eq '${s.toUpperCase()}'`);
        clauses.push(`(${stateClauses.join(" or ")})`);
    }

    if (params.incidentTypes && params.incidentTypes.length > 0) {
        const typeClauses = params.incidentTypes.map((t) => `incidentType eq '${t}'`);
        clauses.push(`(${typeClauses.join(" or ")})`);
    }

    if (params.yearFrom) {
        clauses.push(`declarationDate ge '${params.yearFrom}-01-01T00:00:00.000Z'`);
    }

    if (params.yearTo) {
        clauses.push(`declarationDate le '${params.yearTo}-12-31T23:59:59.999Z'`);
    }

    return clauses.join(" and ");
}

// ---------------------------------------------------------------------------
// Helper: build NWS alert query params
// ---------------------------------------------------------------------------
function buildNwsParams(params: {
    states?: string[];
    severity?: string;
    urgency?: string;
    eventTypes?: string[];
    limit: number;
}): URLSearchParams {
    const qp = new URLSearchParams();
    qp.set("status", "actual");
    qp.set("limit", String(params.limit));

    if (params.states && params.states.length > 0) {
        qp.set("area", params.states.join(","));
    }
    if (params.severity) {
        qp.set("severity", params.severity);
    }
    if (params.urgency) {
        qp.set("urgency", params.urgency);
    }
    if (params.eventTypes && params.eventTypes.length > 0) {
        qp.set("event", params.eventTypes.join(","));
    }

    return qp;
}

// ---------------------------------------------------------------------------
// Helper: build USGS earthquake query params
// ---------------------------------------------------------------------------
function buildUsgsParams(params: {
    minMagnitude?: number;
    maxMagnitude?: number;
    startDate?: string;
    endDate?: string;
    alertLevel?: string;
    limit: number;
}): URLSearchParams {
    const qp = new URLSearchParams();
    qp.set("format", "geojson");
    qp.set("limit", String(params.limit));
    qp.set("orderby", "time");

    if (params.minMagnitude !== undefined) {
        qp.set("minmagnitude", String(params.minMagnitude));
    }
    if (params.maxMagnitude !== undefined) {
        qp.set("maxmagnitude", String(params.maxMagnitude));
    }
    if (params.startDate) {
        qp.set("starttime", params.startDate);
    }
    if (params.endDate) {
        qp.set("endtime", params.endDate);
    }
    if (params.alertLevel) {
        qp.set("alertlevel", params.alertLevel);
    }

    return qp;
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------
const mcpServer = new McpServer({
    name: "natural-disaster-intel-mcp",
    version: "1.0.0",
});

// ---------------------------------------------------------------------------
// Tool 1: FEMA Disaster Declarations
// ---------------------------------------------------------------------------
mcpServer.tool(
    "disaster_search_fema_declarations",
    "Search FEMA disaster declarations by state, incident type, and date range. Returns official federal disaster declaration records.",
    {
        states: z.array(z.string()).optional().describe("State codes like ['CA','NY','TX']"),
        incidentTypes: z.array(z.string()).optional().describe("Incident types like ['Hurricane','Flood','Fire','Tornado']"),
        yearFrom: z.number().int().optional().describe("Start year filter (inclusive)"),
        yearTo: z.number().int().optional().describe("End year filter (inclusive)"),
        limit: z.number().int().min(1).max(100).default(20).describe("Max results to return (1-100, default 20)"),
        _gatewayToken: z.string().optional().describe("Internal gateway token"),
    },
    {
        readOnlyHint: true,
        destructiveHint: false,
    },
    async ({ _gatewayToken, ...params }) => {
        try {
            if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
                await Actor.charge({ eventName: "tool-request" });
            }

            const filter = buildFemaFilter({
                states: params.states,
                incidentTypes: params.incidentTypes,
                yearFrom: params.yearFrom,
                yearTo: params.yearTo,
            });

            const url = new URL("https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries");
            url.searchParams.set("$top", String(params.limit));
            url.searchParams.set("$skip", "0");
            url.searchParams.set("$orderby", "declarationDate desc");
            url.searchParams.set("$inlinecount", "allpages");
            if (filter) {
                url.searchParams.set("$filter", filter);
            }

            const response = await fetch(url.toString(), {
                headers: {
                    Accept: "application/json",
                    "User-Agent": USER_AGENT,
                },
            });

            if (!response.ok) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `FEMA API error: ${response.status} ${response.statusText}`,
                        },
                    ],
                };
            }

            const data = await response.json() as {
                DisasterDeclarationsSummaries: Array<Record<string, unknown>>;
                metadata?: { count?: number };
            };

            const declarations = (data.DisasterDeclarationsSummaries ?? []).map((d: Record<string, unknown>) => ({
                femaDeclarationString: d.femaDeclarationString,
                disasterNumber: d.disasterNumber,
                state: d.state,
                declarationType: d.declarationType,
                declarationDate: d.declarationDate,
                incidentType: d.incidentType,
                declarationTitle: d.declarationTitle,
                incidentBeginDate: d.incidentBeginDate,
                incidentEndDate: d.incidentEndDate,
                county: d.designatedArea,
                femaRegion: d.fipStateCode,
            }));

            const totalCount = data.metadata?.count ?? declarations.length;

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalCount,
                                returned: declarations.length,
                                declarations,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Failed to fetch FEMA declarations: ${message}`,
                    },
                ],
            };
        }
    },
);

// ---------------------------------------------------------------------------
// Tool 2: NOAA/NWS Weather Alerts
// ---------------------------------------------------------------------------
mcpServer.tool(
    "disaster_get_weather_alerts",
    "Get active NOAA/NWS weather alerts by state, severity, and event type. Returns real-time weather warnings, watches, and advisories.",
    {
        states: z.array(z.string()).optional().describe("State codes like ['CA','NY']"),
        severity: z
            .enum(["Extreme", "Severe", "Moderate", "Minor"])
            .optional()
            .describe("Minimum severity level"),
        urgency: z.string().optional().describe("Urgency filter (Immediate, Expected, Future, Past)"),
        eventTypes: z.array(z.string()).optional().describe("Event types like ['Tornado Warning','Flood Watch']"),
        limit: z.number().int().min(1).max(100).default(50).describe("Max results to return (1-100, default 50)"),
        _gatewayToken: z.string().optional().describe("Internal gateway token"),
    },
    {
        readOnlyHint: true,
        destructiveHint: false,
    },
    async ({ _gatewayToken, ...params }) => {
        try {
            if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
                await Actor.charge({ eventName: "tool-request" });
            }

            const qp = buildNwsParams({
                states: params.states,
                severity: params.severity,
                urgency: params.urgency,
                eventTypes: params.eventTypes,
                limit: params.limit,
            });

            const url = `https://api.weather.gov/alerts/active?${qp.toString()}`;

            const response = await fetch(url, {
                headers: {
                    Accept: "application/geo+json",
                    "User-Agent": USER_AGENT,
                },
            });

            if (!response.ok) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `NWS API error: ${response.status} ${response.statusText}`,
                        },
                    ],
                };
            }

            const data = await response.json() as {
                features: Array<{
                    properties: Record<string, unknown>;
                }>;
            };

            const alerts = (data.features ?? []).map((f) => {
                const p = f.properties;
                return {
                    alertId: p.id,
                    event: p.event,
                    severity: p.severity,
                    urgency: p.urgency,
                    certainty: p.certainty,
                    areaDesc: p.areaDesc,
                    headline: p.headline,
                    description: p.description,
                    instruction: p.instruction,
                    onset: p.onset,
                    expires: p.expires,
                    senderName: p.senderName,
                };
            });

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalAlerts: alerts.length,
                                alerts,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Failed to fetch weather alerts: ${message}`,
                    },
                ],
            };
        }
    },
);

// ---------------------------------------------------------------------------
// Tool 3: USGS Earthquake Data
// ---------------------------------------------------------------------------
mcpServer.tool(
    "disaster_search_earthquakes",
    "Search USGS earthquake data by magnitude, date range, and alert level. Returns recent seismic events worldwide.",
    {
        minMagnitude: z.number().min(0).max(10).optional().describe("Minimum magnitude (0-10)"),
        maxMagnitude: z.number().min(0).max(10).optional().describe("Maximum magnitude (0-10)"),
        startDate: z.string().optional().describe("Start date in ISO format (YYYY-MM-DD)"),
        endDate: z.string().optional().describe("End date in ISO format (YYYY-MM-DD)"),
        alertLevel: z
            .enum(["green", "yellow", "orange", "red"])
            .optional()
            .describe("PAGER alert level"),
        limit: z.number().int().min(1).max(500).default(20).describe("Max results to return (1-500, default 20)"),
        _gatewayToken: z.string().optional().describe("Internal gateway token"),
    },
    {
        readOnlyHint: true,
        destructiveHint: false,
    },
    async ({ _gatewayToken, ...params }) => {
        try {
            if (!_gatewayToken || _gatewayToken !== GATEWAY_SECRET) {
                await Actor.charge({ eventName: "tool-request" });
            }

            const qp = buildUsgsParams({
                minMagnitude: params.minMagnitude,
                maxMagnitude: params.maxMagnitude,
                startDate: params.startDate,
                endDate: params.endDate,
                alertLevel: params.alertLevel,
                limit: params.limit,
            });

            const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${qp.toString()}`;

            const response = await fetch(url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": USER_AGENT,
                },
            });

            if (!response.ok) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `USGS API error: ${response.status} ${response.statusText}`,
                        },
                    ],
                };
            }

            const data = await response.json() as {
                metadata?: { count?: number };
                features: Array<{
                    id: string;
                    properties: Record<string, unknown>;
                    geometry: { coordinates: number[] };
                }>;
            };

            const earthquakes = (data.features ?? []).map((f) => {
                const p = f.properties;
                const coords = f.geometry.coordinates;
                const timeMs = p.time as number;

                return {
                    eventId: f.id,
                    title: p.title,
                    magnitude: p.mag,
                    magnitudeType: p.magType,
                    place: p.place,
                    time: new Date(timeMs).toISOString(),
                    longitude: coords[0],
                    latitude: coords[1],
                    depth: coords[2],
                    tsunami: Boolean(p.tsunami),
                    felt: p.felt,
                    alertLevel: p.alert,
                    significance: p.sig,
                };
            });

            const totalCount = data.metadata?.count ?? earthquakes.length;

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalCount,
                                returned: earthquakes.length,
                                earthquakes,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Failed to fetch earthquake data: ${message}`,
                    },
                ],
            };
        }
    },
);

// ---------------------------------------------------------------------------
// Actor + Express bootstrap
// ---------------------------------------------------------------------------
await Actor.init();

// ---------------------------------------------------------------------------
// Non-standby health check: exit cleanly so Apify marks the run as SUCCEEDED
// ---------------------------------------------------------------------------
if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
    console.log("Non-standby run detected — running health check...");
    await Actor.pushData({
        status: "healthy",
        server: "natural-disaster-intel-mcp",
        timestamp: new Date().toISOString(),
        message: "MCP server is healthy. Use standby mode for MCP tool access.",
    });
    await Actor.exit("Health check passed — use standby mode for MCP access.");
}

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({ status: "ok", server: "natural-disaster-intel-mcp" });
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
        if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

app.get("/mcp", (_req, res) => {
    res.status(405).json({ error: "Use POST" });
});

app.delete("/mcp", (_req, res) => {
    res.status(405).json({ error: "Not supported" });
});

const port = parseInt(process.env.APIFY_ACTOR_STANDBY_PORT || "4321", 10);
app.listen(port, () => {
    console.log(`Natural Disaster Intel MCP on port ${port}`);
});
