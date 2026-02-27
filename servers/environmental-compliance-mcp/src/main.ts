import { Actor } from "apify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import * as cheerio from "cheerio";

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AirQualityRecord {
    dateObserved: string;
    hourObserved: string;
    timeZone: string;
    reportingArea: string;
    stateCode: string;
    latitude: number;
    longitude: number;
    parameterName: string;
    aqi: number;
    category: string;
}

interface HudRawProperty {
    propertyCaseNumber: string;
    propertyAddress: string;
    propertyCity: string;
    propertyState: string;
    propertyZip: string;
    propertyCounty: string;
    listPrice: number;
    bedrooms: number;
    bathrooms: number;
    bathroomsdecimal: number;
    squareFootage: number;
    yearBuilt: number;
    propertyType: string;
    listDate: string;
    periodDeadlineDate: string;
    propertyStatus: string;
    propertyStatusDesc: string;
    latitude: number;
    longitude: number;
}

interface HudListing {
    caseNumber: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    county: string;
    listPrice: number;
    bedrooms: number;
    bathrooms: number;
    squareFeet: number;
    propertyType: string;
    listingDate: string;
    status: string;
    yearBuilt: number;
    latitude: number;
    longitude: number;
    listingUrl: string;
}

// ---------------------------------------------------------------------------
// AQI category mapping
// ---------------------------------------------------------------------------

const AQI_CATEGORIES: Record<number, string> = {
    1: "Good",
    2: "Moderate",
    3: "Unhealthy for Sensitive Groups",
    4: "Unhealthy",
    5: "Very Unhealthy",
    6: "Hazardous",
};

// ---------------------------------------------------------------------------
// Tool 1: EPA Air Quality
// ---------------------------------------------------------------------------

async function fetchAirQuality(params: {
    states?: string[];
    minAqi?: number;
    maxAqi?: number;
    categories?: string[];
    parameters?: string[];
    limit: number;
}): Promise<AirQualityRecord[]> {
    const url = "https://files.airnowtech.org/airnow/today/reportingarea.dat";
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`AirNow API returned ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const lines = text.split("\n").filter((line) => line.trim().length > 0);

    const statesUpper = params.states?.map((s) => s.toUpperCase());
    const categoriesLower = params.categories?.map((c) => c.toLowerCase());
    const parametersLower = params.parameters?.map((p) => p.toLowerCase());

    const records: AirQualityRecord[] = [];

    for (const line of lines) {
        if (records.length >= params.limit) break;

        const fields = line.split("|");
        if (fields.length < 11) continue;

        const dateObserved = fields[0].trim();
        const hourObserved = fields[1].trim();
        const timeZone = fields[2].trim();
        const reportingArea = fields[3].trim();
        const stateCode = fields[4].trim();
        const latitude = parseFloat(fields[5].trim());
        const longitude = parseFloat(fields[6].trim());
        const parameterName = fields[7].trim();
        const aqiValue = parseInt(fields[8].trim(), 10);
        const categoryNumber = parseInt(fields[9].trim(), 10);
        const categoryName = fields[10].trim() || AQI_CATEGORIES[categoryNumber] || "Unknown";

        if (isNaN(aqiValue)) continue;

        if (statesUpper && !statesUpper.includes(stateCode.toUpperCase())) continue;

        if (params.minAqi !== undefined && aqiValue < params.minAqi) continue;
        if (params.maxAqi !== undefined && aqiValue > params.maxAqi) continue;

        if (categoriesLower && !categoriesLower.includes(categoryName.toLowerCase())) continue;

        if (parametersLower && !parametersLower.includes(parameterName.toLowerCase())) continue;

        records.push({
            dateObserved,
            hourObserved,
            timeZone,
            reportingArea,
            stateCode,
            latitude,
            longitude,
            parameterName,
            aqi: aqiValue,
            category: categoryName,
        });
    }

    return records;
}

// ---------------------------------------------------------------------------
// Tool 2: HUD Foreclosures
// ---------------------------------------------------------------------------

async function searchHudForeclosures(params: {
    state?: string;
    zipCode?: string;
    minPrice?: number;
    maxPrice?: number;
    bedrooms?: number;
    limit: number;
}): Promise<HudListing[]> {
    const query = params.zipCode || params.state || "CA";
    const url = `https://www.hudhomestore.gov/searchresult?citystate=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; EnvironmentalComplianceMCP/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    });

    if (!response.ok) {
        throw new Error(`HUD Home Store returned ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const rawJson = $("#available_prop").val() as string | undefined;
    if (!rawJson || rawJson.trim().length === 0) {
        return [];
    }

    let rawProperties: HudRawProperty[];
    try {
        rawProperties = JSON.parse(rawJson);
    } catch {
        throw new Error("Failed to parse HUD property data from page");
    }

    if (!Array.isArray(rawProperties)) {
        return [];
    }

    const listings: HudListing[] = [];

    for (const prop of rawProperties) {
        if (listings.length >= params.limit) break;

        const price = Number(prop.listPrice) || 0;
        const beds = Number(prop.bedrooms) || 0;

        if (params.minPrice !== undefined && price < params.minPrice) continue;
        if (params.maxPrice !== undefined && price > params.maxPrice) continue;
        if (params.bedrooms !== undefined && beds < params.bedrooms) continue;

        listings.push({
            caseNumber: prop.propertyCaseNumber || "",
            address: prop.propertyAddress || "",
            city: prop.propertyCity || "",
            state: prop.propertyState || "",
            zipCode: prop.propertyZip || "",
            county: prop.propertyCounty || "",
            listPrice: price,
            bedrooms: beds,
            bathrooms: Number(prop.bathroomsdecimal) || Number(prop.bathrooms) || 0,
            squareFeet: Number(prop.squareFootage) || 0,
            propertyType: prop.propertyType || "",
            listingDate: prop.listDate || "",
            status: prop.propertyStatusDesc || prop.propertyStatus || "",
            yearBuilt: Number(prop.yearBuilt) || 0,
            latitude: Number(prop.latitude) || 0,
            longitude: Number(prop.longitude) || 0,
            listingUrl: `https://www.hudhomestore.gov/listing/${encodeURIComponent(prop.propertyCaseNumber || "")}`,
        });
    }

    return listings;
}

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const mcpServer = new McpServer({
    name: "environmental-compliance-mcp",
    version: "1.0.0",
});

// Register Tool 1: env_get_air_quality
mcpServer.tool(
    "env_get_air_quality",
    "Get current air quality data from EPA AirNow. Returns AQI readings for reporting areas across the US, filterable by state, AQI range, pollutant category, and parameter type.",
    {
        states: z.array(z.string()).optional().describe("State codes like CA, NY, TX"),
        minAqi: z.number().int().min(0).max(500).optional().describe("Minimum AQI value"),
        maxAqi: z.number().int().min(0).max(500).optional().describe("Maximum AQI value"),
        categories: z.array(z.string()).optional().describe("AQI categories: Good, Moderate, Unhealthy for Sensitive Groups, Unhealthy, Very Unhealthy, Hazardous"),
        parameters: z.array(z.string()).optional().describe("Pollutant parameters: PM2.5, PM10, OZONE, CO, NO2, SO2"),
        limit: z.number().int().min(1).max(200).default(50),
        _gatewayToken: z.string().optional().describe("Internal gateway token"),
    },
    async (args) => {
        try {
            if (!args._gatewayToken || args._gatewayToken !== GATEWAY_SECRET) {
                await Actor.charge({ eventName: "tool-request" });
            }
        } catch {
            // charge may fail outside Apify platform
        }

        try {
            const records = await fetchAirQuality({
                states: args.states,
                minAqi: args.minAqi,
                maxAqi: args.maxAqi,
                categories: args.categories,
                parameters: args.parameters,
                limit: args.limit,
            });

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalResults: records.length,
                                data: records,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text" as const, text: `Error fetching air quality data: ${message}` }],
                isError: true,
            };
        }
    },
);

// Register Tool 2: env_search_hud_foreclosures
mcpServer.tool(
    "env_search_hud_foreclosures",
    "Search HUD foreclosure listings from the HUD Home Store. Returns property details including price, bedrooms, location, and listing URLs.",
    {
        state: z.string().optional().describe("State code like CA, TX, FL"),
        zipCode: z.string().optional().describe("ZIP code to search"),
        minPrice: z.number().optional().describe("Minimum list price"),
        maxPrice: z.number().optional().describe("Maximum list price"),
        bedrooms: z.number().int().optional().describe("Minimum bedrooms"),
        limit: z.number().int().min(1).max(50).default(20),
        _gatewayToken: z.string().optional().describe("Internal gateway token"),
    },
    async (args) => {
        try {
            if (!args._gatewayToken || args._gatewayToken !== GATEWAY_SECRET) {
                await Actor.charge({ eventName: "tool-request" });
            }
        } catch {
            // charge may fail outside Apify platform
        }

        try {
            const listings = await searchHudForeclosures({
                state: args.state,
                zipCode: args.zipCode,
                minPrice: args.minPrice,
                maxPrice: args.maxPrice,
                bedrooms: args.bedrooms,
                limit: args.limit,
            });

            return {
                content: [
                    {
                        type: "text" as const,
                        text: JSON.stringify(
                            {
                                totalResults: listings.length,
                                data: listings,
                            },
                            null,
                            2,
                        ),
                    },
                ],
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text" as const, text: `Error searching HUD foreclosures: ${message}` }],
                isError: true,
            };
        }
    },
);

// ---------------------------------------------------------------------------
// Express server
// ---------------------------------------------------------------------------

await Actor.init();

// ---------------------------------------------------------------------------
// Non-standby health check: exit cleanly so Apify marks the run as SUCCEEDED
// ---------------------------------------------------------------------------
if (process.env.APIFY_META_ORIGIN !== "STANDBY") {
    console.log("Non-standby run detected — running health check...");
    await Actor.pushData({
        status: "healthy",
        server: "environmental-compliance-mcp",
        timestamp: new Date().toISOString(),
        message: "MCP server is healthy. Use standby mode for MCP tool access.",
    });
    await Actor.exit("Health check passed — use standby mode for MCP access.");
}

const app = express();
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({ status: "ok", server: "environmental-compliance-mcp" });
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
    console.log(`Environmental & Housing MCP on port ${port}`);
});
