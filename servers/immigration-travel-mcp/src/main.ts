import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import * as cheerio from "cheerio";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FetchJsonOptions {
    url: string;
    label: string;
}

async function fetchJson<T = unknown>({ url, label }: FetchJsonOptions): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
            `${label} API returned ${response.status}: ${body.slice(0, 300)}`
        );
    }
    return (await response.json()) as T;
}

async function fetchHtml({ url, label }: FetchJsonOptions): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
            `${label} returned ${response.status}: ${body.slice(0, 300)}`
        );
    }
    return await response.text();
}

function parseMonths(text: string): number | null {
    const match = text.match(/(\d+\.?\d*)\s*Month/i);
    if (match) {
        return parseFloat(match[1]);
    }
    return null;
}

// ---------------------------------------------------------------------------
// Visa wait times types
// ---------------------------------------------------------------------------

interface VisaWaitRecord {
    city: string;
    visaCategory: string;
    waitType: string;
    waitTime: string;
    waitTimeMonths: number | null;
}

// ---------------------------------------------------------------------------
// Border wait times types
// ---------------------------------------------------------------------------

interface BwtLane {
    update_time: string;
    operational_status: string;
    delay_minutes: number;
    lanes_open: number;
}

interface BwtLaneGroup {
    maximum_lanes: number;
    standard_lanes: BwtLane;
    FAST_lanes: BwtLane;
    NEXUS_SENTRI_lanes: BwtLane;
    ready_lanes: BwtLane;
}

interface BwtPort {
    port_number: string;
    border: string;
    port_name: string;
    crossing_name: string;
    hours: string;
    port_status: string;
    commercial_vehicle_lanes: BwtLaneGroup;
    passenger_vehicle_lanes: BwtLaneGroup;
    pedestrian_lanes: BwtLaneGroup;
}

interface BorderWaitRecord {
    portName: string;
    crossingName: string;
    border: string;
    laneType: string;
    laneCategory: string;
    operationalStatus: string;
    delayMinutes: number;
    lanesOpen: number;
    lastUpdated: string;
}

// ---------------------------------------------------------------------------
// FAA airport delay types
// ---------------------------------------------------------------------------

interface FaaGroundDelay {
    avgDelay: string;
    maxDelay: string;
    reason: string;
    startTime: string;
    endTime: string;
}

interface FaaGroundStop {
    endTime: string;
    reason: string;
}

interface FaaAirportClosure {
    text: string;
    startTime: string;
    endTime: string;
}

interface FaaArrivalDelay {
    minDelay: string;
    maxDelay: string;
    trend: string;
    reason: string;
}

interface FaaDepartureDelay {
    minDelay: string;
    maxDelay: string;
    trend: string;
    reason: string;
}

interface FaaDeicing {
    text: string;
}

interface FaaAirportEvent {
    airportId: string;
    airportLongName: string;
    latitude: number;
    longitude: number;
    groundDelay: FaaGroundDelay | null;
    groundStop: FaaGroundStop | null;
    airportClosure: FaaAirportClosure | null;
    arrivalDelay: FaaArrivalDelay | null;
    departureDelay: FaaDepartureDelay | null;
    deicing: FaaDeicing | null;
}

interface AirportDelayRecord {
    airportCode: string;
    airportName: string;
    delayType: string;
    status: string;
    reason: string;
    avgDelay: string | null;
    maxDelay: string | null;
    startTime: string | null;
    endTime: string | null;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
    name: "immigration-travel-mcp",
    version: "1.0.0",
});

// ----- Tool 1: US Visa Wait Times -------------------------------------------

mcpServer.registerTool(
    "travel_get_visa_wait_times",
    {
        title: "Get US Visa Wait Times",
        description:
            "Scrapes the US State Department's global visa wait times page. " +
            "Returns wait times by embassy city for B1/B2, Student, Employment, and Crew/Transit visas. " +
            "Filter by city name or visa category.",
        inputSchema: {
            city: z
                .string()
                .optional()
                .describe("Filter by embassy city name (partial match)"),
            visaCategory: z
                .string()
                .optional()
                .describe(
                    "Filter by category: B1/B2, Student (F,M,J), Employment (H,L,O,P,Q), Crew/Transit (C,D,C1/D)"
                ),
            _gatewayToken: z.string().optional().describe("Internal gateway token"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    },
    async (params) => {
        if (!params._gatewayToken || params._gatewayToken !== GATEWAY_SECRET) {
            await Actor.charge({ eventName: "tool-request" });
        }

        try {
            const url =
                "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/global-visa-wait-times.html";
            const html = await fetchHtml({ url, label: "State Dept Visa Wait Times" });
            const $ = cheerio.load(html);

            const columnMap: Array<{ index: number; category: string; waitType: string }> = [
                { index: 1, category: "B1/B2", waitType: "Average Wait Time" },
                { index: 2, category: "B1/B2", waitType: "Next Available Appointment" },
                { index: 3, category: "Student (F,M,J)", waitType: "Next Available Appointment" },
                { index: 4, category: "Employment (H,L,O,P,Q)", waitType: "Next Available Appointment" },
                { index: 5, category: "Crew/Transit (C,D,C1/D)", waitType: "Next Available Appointment" },
            ];

            const records: VisaWaitRecord[] = [];

            $("table tr").each((_rowIdx, row) => {
                const cells = $(row).find("td");
                if (cells.length < 6) return;

                const cityText = $(cells[0]).text().trim();
                if (!cityText) return;

                for (const col of columnMap) {
                    const cellText = $(cells[col.index]).text().trim();
                    if (!cellText) continue;

                    records.push({
                        city: cityText,
                        visaCategory: col.category,
                        waitType: col.waitType,
                        waitTime: cellText,
                        waitTimeMonths: parseMonths(cellText),
                    });
                }
            });

            let filtered = records;

            if (params.city) {
                const cityLower = params.city.toLowerCase();
                filtered = filtered.filter((r) =>
                    r.city.toLowerCase().includes(cityLower)
                );
            }

            if (params.visaCategory) {
                const catLower = params.visaCategory.toLowerCase();
                filtered = filtered.filter((r) =>
                    r.visaCategory.toLowerCase().includes(catLower)
                );
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalRecords: filtered.length,
                                records: filtered,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify({ error: message }),
                    },
                ],
                isError: true,
            };
        }
    }
);

// ----- Tool 2: Border Wait Times --------------------------------------------

mcpServer.registerTool(
    "travel_get_border_wait_times",
    {
        title: "Get Border Crossing Wait Times",
        description:
            "Fetches real-time US border crossing wait times from the CBP API. " +
            "Returns delay information for commercial, passenger, and pedestrian lanes " +
            "at Canadian and Mexican border ports of entry.",
        inputSchema: {
            border: z
                .enum(["Canadian Border", "Mexican Border"])
                .optional()
                .describe("Filter by border: 'Canadian Border' or 'Mexican Border'"),
            portName: z
                .string()
                .optional()
                .describe("Filter by port name (partial match)"),
            laneType: z
                .enum(["commercial", "passenger", "pedestrian"])
                .optional()
                .describe("Filter by lane type: 'commercial', 'passenger', or 'pedestrian'"),
            _gatewayToken: z.string().optional().describe("Internal gateway token"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    },
    async (params) => {
        if (!params._gatewayToken || params._gatewayToken !== GATEWAY_SECRET) {
            await Actor.charge({ eventName: "tool-request" });
        }

        try {
            const url = "https://bwt.cbp.gov/api/waittimes";
            const ports = await fetchJson<BwtPort[]>({ url, label: "CBP Border Wait Times" });

            const laneTypeMap: Record<string, keyof Pick<BwtPort, "commercial_vehicle_lanes" | "passenger_vehicle_lanes" | "pedestrian_lanes">> = {
                commercial: "commercial_vehicle_lanes",
                passenger: "passenger_vehicle_lanes",
                pedestrian: "pedestrian_lanes",
            };

            const laneCategories = ["standard_lanes", "FAST_lanes", "NEXUS_SENTRI_lanes", "ready_lanes"] as const;

            const laneCategoryLabels: Record<string, string> = {
                standard_lanes: "Standard",
                FAST_lanes: "FAST",
                NEXUS_SENTRI_lanes: "NEXUS/SENTRI",
                ready_lanes: "Ready Lanes",
            };

            const records: BorderWaitRecord[] = [];

            const laneTypesToProcess = params.laneType
                ? [params.laneType]
                : (["commercial", "passenger", "pedestrian"] as const);

            for (const port of ports) {
                if (params.border && port.border !== params.border) continue;
                if (params.portName && !port.port_name.toLowerCase().includes(params.portName.toLowerCase())) continue;

                for (const lt of laneTypesToProcess) {
                    const groupKey = laneTypeMap[lt];
                    const group = port[groupKey];
                    if (!group) continue;

                    for (const cat of laneCategories) {
                        const lane = group[cat] as BwtLane;
                        if (!lane) continue;

                        records.push({
                            portName: port.port_name,
                            crossingName: port.crossing_name,
                            border: port.border,
                            laneType: lt,
                            laneCategory: laneCategoryLabels[cat],
                            operationalStatus: lane.operational_status,
                            delayMinutes: lane.delay_minutes,
                            lanesOpen: lane.lanes_open,
                            lastUpdated: lane.update_time,
                        });
                    }
                }
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalRecords: records.length,
                                records,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify({ error: message }),
                    },
                ],
                isError: true,
            };
        }
    }
);

// ----- Tool 3: FAA Airport Delays -------------------------------------------

mcpServer.registerTool(
    "travel_get_airport_delays",
    {
        title: "Get FAA Airport Delays",
        description:
            "Fetches real-time FAA airport delay and event information. " +
            "Returns active ground delays, ground stops, closures, arrival delays, " +
            "departure delays, and deicing events for US airports.",
        inputSchema: {
            airports: z
                .array(z.string())
                .optional()
                .describe("Airport codes like JFK, LAX, ORD"),
            delayTypes: z
                .array(z.string())
                .optional()
                .describe(
                    "Types: Ground Delay, Ground Stop, Closure, Arrival Delay, Departure Delay"
                ),
            _gatewayToken: z.string().optional().describe("Internal gateway token"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    },
    async (params) => {
        if (!params._gatewayToken || params._gatewayToken !== GATEWAY_SECRET) {
            await Actor.charge({ eventName: "tool-request" });
        }

        try {
            const url = "https://nasstatus.faa.gov/api/airport-events";
            const events = await fetchJson<FaaAirportEvent[]>({ url, label: "FAA Airport Events" });

            const airportCodes = params.airports
                ? new Set(params.airports.map((a) => a.toUpperCase()))
                : null;

            const delayTypeSet = params.delayTypes
                ? new Set(params.delayTypes.map((d) => d.toLowerCase()))
                : null;

            const records: AirportDelayRecord[] = [];

            for (const event of events) {
                if (airportCodes && !airportCodes.has(event.airportId.toUpperCase())) continue;

                if (event.groundDelay) {
                    if (!delayTypeSet || delayTypeSet.has("ground delay")) {
                        records.push({
                            airportCode: event.airportId,
                            airportName: event.airportLongName,
                            delayType: "Ground Delay",
                            status: "Active",
                            reason: event.groundDelay.reason,
                            avgDelay: event.groundDelay.avgDelay,
                            maxDelay: event.groundDelay.maxDelay,
                            startTime: event.groundDelay.startTime,
                            endTime: event.groundDelay.endTime,
                        });
                    }
                }

                if (event.groundStop) {
                    if (!delayTypeSet || delayTypeSet.has("ground stop")) {
                        records.push({
                            airportCode: event.airportId,
                            airportName: event.airportLongName,
                            delayType: "Ground Stop",
                            status: "Active",
                            reason: event.groundStop.reason,
                            avgDelay: null,
                            maxDelay: null,
                            startTime: null,
                            endTime: event.groundStop.endTime,
                        });
                    }
                }

                if (event.airportClosure) {
                    if (!delayTypeSet || delayTypeSet.has("closure")) {
                        records.push({
                            airportCode: event.airportId,
                            airportName: event.airportLongName,
                            delayType: "Closure",
                            status: event.airportClosure.text || "Closed",
                            reason: event.airportClosure.text || "Airport Closure",
                            avgDelay: null,
                            maxDelay: null,
                            startTime: event.airportClosure.startTime,
                            endTime: event.airportClosure.endTime,
                        });
                    }
                }

                if (event.arrivalDelay) {
                    if (!delayTypeSet || delayTypeSet.has("arrival delay")) {
                        records.push({
                            airportCode: event.airportId,
                            airportName: event.airportLongName,
                            delayType: "Arrival Delay",
                            status: event.arrivalDelay.trend || "Active",
                            reason: event.arrivalDelay.reason,
                            avgDelay: null,
                            maxDelay: event.arrivalDelay.maxDelay,
                            startTime: null,
                            endTime: null,
                        });
                    }
                }

                if (event.departureDelay) {
                    if (!delayTypeSet || delayTypeSet.has("departure delay")) {
                        records.push({
                            airportCode: event.airportId,
                            airportName: event.airportLongName,
                            delayType: "Departure Delay",
                            status: event.departureDelay.trend || "Active",
                            reason: event.departureDelay.reason,
                            avgDelay: null,
                            maxDelay: event.departureDelay.maxDelay,
                            startTime: null,
                            endTime: null,
                        });
                    }
                }

                if (event.deicing) {
                    if (!delayTypeSet || delayTypeSet.has("deicing")) {
                        records.push({
                            airportCode: event.airportId,
                            airportName: event.airportLongName,
                            delayType: "Deicing",
                            status: "Active",
                            reason: event.deicing.text || "Deicing operations",
                            avgDelay: null,
                            maxDelay: null,
                            startTime: null,
                            endTime: null,
                        });
                    }
                }
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalRecords: records.length,
                                records,
                            },
                            null,
                            2
                        ),
                    },
                ],
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify({ error: message }),
                    },
                ],
                isError: true,
            };
        }
    }
);

// ---------------------------------------------------------------------------
// Express + Actor bootstrap
// ---------------------------------------------------------------------------

await Actor.init();

// ---------------------------------------------------------------------------
// Non-standby health check: exit cleanly so Apify marks the run as SUCCEEDED
// ---------------------------------------------------------------------------
if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
    console.log("Non-standby run detected — running health check...");
    await Actor.pushData({
        status: "healthy",
        server: "immigration-travel-mcp",
        timestamp: new Date().toISOString(),
        message: "MCP server is healthy. Use standby mode for MCP tool access.",
    });
    await Actor.exit("Health check passed — use standby mode for MCP access.");
}

const app = express();
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", server: "immigration-travel-mcp" });
});

app.post("/mcp", async (req: Request, res: Response) => {
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

app.get("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "Use POST for MCP requests" });
});

app.delete("/mcp", (_req: Request, res: Response) => {
    res.status(405).json({ error: "Session management not supported" });
});

const port = parseInt(process.env.APIFY_ACTOR_STANDBY_PORT || "4321", 10);
app.listen(port, () => {
    console.log(`Immigration & Travel MCP server running on port ${port}`);
});
