import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";

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

function currentYear(): number {
    return new Date().getFullYear();
}

// ---------------------------------------------------------------------------
// NHTSA types
// ---------------------------------------------------------------------------

interface NhtsaRecallResult {
    NHTSACampaignNumber: string;
    Manufacturer: string;
    Make: string;
    Model: string;
    ModelYear: string;
    Component: string;
    Summary: string;
    Consequence: string;
    Remedy: string;
    ReportReceivedDate: string;
    ParkIt: boolean;
    ParkOutSide: boolean;
}

interface NhtsaRecallsResponse {
    Count: number;
    results: NhtsaRecallResult[];
}

interface NhtsaMake {
    makeId: number;
    makeName: string;
    modelYear: number;
}

interface NhtsaMakesResponse {
    count: number;
    results: NhtsaMake[];
}

// ---------------------------------------------------------------------------
// FDA types
// ---------------------------------------------------------------------------

interface FdaEnforcementResult {
    recall_number: string;
    classification: string;
    status: string;
    recalling_firm: string;
    city: string;
    state: string;
    product_description: string;
    reason_for_recall: string;
    recall_initiation_date: string;
}

interface FdaEnforcementResponse {
    meta: { results: { total: number } };
    results: FdaEnforcementResult[];
}

// ---------------------------------------------------------------------------
// CFPB types
// ---------------------------------------------------------------------------

interface CfpbSource {
    complaint_id: string;
    date_received: string;
    company: string;
    product: string;
    issue: string;
    state: string;
    company_response: string;
    complaint_what_happened: string;
}

interface CfpbHit {
    _source: CfpbSource;
}

interface CfpbResponse {
    hits: {
        total: { value: number } | number;
        hits: CfpbHit[];
    };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
    name: "us-safety-recalls-mcp",
    version: "1.0.0",
});

// ----- Tool 1: NHTSA Vehicle Recalls ------------------------------------------

mcpServer.registerTool(
    "safety_search_vehicle_recalls",
    {
        title: "Search Vehicle Safety Recalls",
        description:
            "Search NHTSA vehicle safety recalls by make, model, and year. " +
            "Returns recall campaigns with details on affected vehicles, defect summary, " +
            "consequences, and remedies.",
        inputSchema: {
            make: z
                .string()
                .optional()
                .describe("Vehicle make (e.g., 'FORD', 'TOYOTA')"),
            model: z
                .string()
                .optional()
                .describe("Vehicle model (e.g., 'F-150', 'CAMRY')"),
            modelYear: z
                .number()
                .int()
                .min(1966)
                .max(2027)
                .optional()
                .describe("Model year (default: current year)"),
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
            const year = params.modelYear ?? currentYear();

            // If no make/model provided, return list of makes with recalls
            if (!params.make && !params.model) {
                const url = `https://api.nhtsa.gov/products/vehicle/makes?modelYear=${year}&issueType=r`;
                const data = await fetchJson<NhtsaMakesResponse>({
                    url,
                    label: "NHTSA Makes",
                });

                const makes = data.results.map((m) => ({
                    makeId: m.makeId,
                    makeName: m.makeName,
                    modelYear: m.modelYear,
                }));

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    message: `Found ${makes.length} makes with recalls for model year ${year}. Provide a specific make and model for detailed recall information.`,
                                    totalMakes: makes.length,
                                    makes,
                                },
                                null,
                                2
                            ),
                        },
                    ],
                };
            }

            const make = encodeURIComponent(params.make ?? "");
            const model = encodeURIComponent(params.model ?? "");
            const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${make}&model=${model}&modelYear=${year}`;
            const data = await fetchJson<NhtsaRecallsResponse>({
                url,
                label: "NHTSA Recalls",
            });

            const recalls = data.results.map((r) => ({
                nhtsaCampaignNumber: r.NHTSACampaignNumber,
                manufacturer: r.Manufacturer,
                make: r.Make,
                model: r.Model,
                modelYear: r.ModelYear,
                component: r.Component,
                summary: r.Summary,
                consequence: r.Consequence,
                remedy: r.Remedy,
                reportReceivedDate: r.ReportReceivedDate,
                parkIt: r.ParkIt,
                parkOutside: r.ParkOutSide,
            }));

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalRecalls: data.Count,
                                recalls,
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

// ----- Tool 2: FDA Product Recalls -------------------------------------------

mcpServer.registerTool(
    "safety_search_fda_recalls",
    {
        title: "Search FDA Product Recalls",
        description:
            "Search FDA enforcement actions (recalls) for drugs, food, or medical devices. " +
            "Returns recall classification, recalling firm, product description, and reason.",
        inputSchema: {
            productType: z
                .enum(["drug", "food", "device"])
                .optional()
                .default("drug")
                .describe("FDA product category: 'drug', 'food', or 'device'"),
            searchText: z
                .string()
                .optional()
                .describe(
                    "Free-text search across recall reason and product description"
                ),
            classification: z
                .string()
                .optional()
                .describe(
                    "Recall classification: 'Class I', 'Class II', or 'Class III'"
                ),
            status: z
                .string()
                .optional()
                .describe("Recall status, e.g. 'Ongoing', 'Completed', 'Terminated'"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(100)
                .optional()
                .default(20)
                .describe("Number of results to return (default 20, max 100)"),
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
            const productType = params.productType ?? "drug";
            const limit = params.limit ?? 20;

            // Build the search query parts
            const searchParts: string[] = [];
            if (params.searchText) {
                searchParts.push(
                    `(reason_for_recall:"${params.searchText}"+product_description:"${params.searchText}")`
                );
            }
            if (params.classification) {
                searchParts.push(
                    `classification:"${params.classification}"`
                );
            }
            if (params.status) {
                searchParts.push(`status:"${params.status}"`);
            }

            const searchQuery = searchParts.length > 0
                ? `&search=${searchParts.join("+AND+")}`
                : "";

            const url = `https://api.fda.gov/${productType}/enforcement.json?limit=${limit}${searchQuery}`;

            const data = await fetchJson<FdaEnforcementResponse>({
                url,
                label: "FDA Enforcement",
            });

            const recalls = data.results.map((r) => ({
                recallNumber: r.recall_number,
                productType,
                classification: r.classification,
                status: r.status,
                recallingFirm: r.recalling_firm,
                city: r.city,
                state: r.state,
                productDescription: r.product_description,
                reasonForRecall: r.reason_for_recall,
                recallInitiationDate: r.recall_initiation_date,
            }));

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalResults: data.meta.results.total,
                                returnedCount: recalls.length,
                                recalls,
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

// ----- Tool 3: CFPB Consumer Complaints --------------------------------------

mcpServer.registerTool(
    "safety_search_consumer_complaints",
    {
        title: "Search Consumer Complaints",
        description:
            "Search the CFPB Consumer Complaint Database for complaints against financial companies. " +
            "Returns complaint details including product, issue, company response, and consumer narrative when available.",
        inputSchema: {
            company: z
                .string()
                .optional()
                .describe("Company name to filter by (e.g., 'BANK OF AMERICA')"),
            product: z
                .string()
                .optional()
                .describe(
                    "Financial product type (e.g., 'Mortgage', 'Credit card', 'Student loan')"
                ),
            state: z
                .string()
                .optional()
                .describe("US state abbreviation (e.g., 'CA', 'NY', 'TX')"),
            dateFrom: z
                .string()
                .optional()
                .describe("Start date in YYYY-MM-DD format"),
            dateTo: z
                .string()
                .optional()
                .describe("End date in YYYY-MM-DD format"),
            searchText: z
                .string()
                .optional()
                .describe("Free-text search across complaint narratives"),
            limit: z
                .number()
                .int()
                .min(1)
                .max(100)
                .optional()
                .default(20)
                .describe("Number of results to return (default 20, max 100)"),
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
            const limit = params.limit ?? 20;

            const searchParams = new URLSearchParams({
                size: String(limit),
                frm: "0",
                sort: "created_date_desc",
                no_aggs: "true",
            });

            if (params.company) {
                searchParams.append("company", params.company);
            }
            if (params.product) {
                searchParams.append("product", params.product);
            }
            if (params.state) {
                searchParams.append("state", params.state);
            }
            if (params.dateFrom) {
                searchParams.append("date_received_min", params.dateFrom);
            }
            if (params.dateTo) {
                searchParams.append("date_received_max", params.dateTo);
            }
            if (params.searchText) {
                searchParams.append("search_term", params.searchText);
            }

            const url = `https://www.consumerfinance.gov/data-research/consumer-complaints/search/api/v1/?${searchParams.toString()}`;

            const data = await fetchJson<CfpbResponse>({
                url,
                label: "CFPB Complaints",
            });

            const totalHits =
                typeof data.hits.total === "number"
                    ? data.hits.total
                    : data.hits.total.value;

            const complaints = data.hits.hits.map((hit) => {
                const s = hit._source;
                return {
                    complaintId: s.complaint_id,
                    dateReceived: s.date_received,
                    company: s.company,
                    product: s.product,
                    issue: s.issue,
                    state: s.state,
                    companyResponse: s.company_response,
                    consumerNarrative: s.complaint_what_happened || null,
                };
            });

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalResults: totalHits,
                                returnedCount: complaints.length,
                                complaints,
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
        server: "us-safety-recalls-mcp",
        timestamp: new Date().toISOString(),
        message: "MCP server is healthy. Use standby mode for MCP tool access.",
    });
    await Actor.exit("Health check passed — use standby mode for MCP access.");
}

const app = express();
app.use(express.json());

app.get("/", (_req: Request, res: Response) => {
    res.json({ status: "ok", server: "us-safety-recalls-mcp" });
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
    console.log(`US Safety Recalls MCP server running on port ${port}`);
});
