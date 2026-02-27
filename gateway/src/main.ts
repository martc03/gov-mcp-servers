import { Actor } from "apify";
import express, { type Request, type Response } from "express";

import { validateRapidApi } from "./lib/auth.js";

import safetyRoutes from "./routes/safety.js";
import disasterRoutes from "./routes/disasters.js";
import financeRoutes from "./routes/finance.js";
import travelRoutes from "./routes/travel.js";
import environmentRoutes from "./routes/environment.js";
import contractsRoutes from "./routes/contracts.js";
import courtsRoutes from "./routes/courts.js";
import healthRoutes from "./routes/health.js";
import regulationsRoutes from "./routes/regulations.js";
import grantsRoutes from "./routes/grants.js";
import entitiesRoutes from "./routes/entities.js";
import intelRoutes from "./routes/intel.js";
import cyberRoutes from "./routes/cyber.js";

await Actor.init();

const app = express();
app.use(express.json());

// RapidAPI proxy secret validation on all API routes
app.use("/api", validateRapidApi);

// Health check
app.get("/", (_req: Request, res: Response) => {
    res.json({
        status: "ok",
        name: "US Government Data API",
        version: "1.0.0",
        endpoints: 45,
        categories: [
            "safety", "disasters", "finance", "travel",
            "environment", "contracts", "courts", "health",
            "regulations", "grants", "entities", "intel",
            "cyber",
        ],
    });
});

app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
});

// Catalog endpoint — lists all available endpoints
app.get("/api/v1", (_req: Request, res: Response) => {
    res.json({
        version: "v1",
        totalEndpoints: 45,
        categories: {
            safety: {
                basePath: "/api/v1/safety",
                endpoints: [
                    { method: "GET", path: "/vehicle-recalls", tool: "safety_search_vehicle_recalls" },
                    { method: "GET", path: "/fda-recalls", tool: "safety_search_fda_recalls" },
                    { method: "GET", path: "/consumer-complaints", tool: "safety_search_consumer_complaints" },
                ],
            },
            disasters: {
                basePath: "/api/v1/disasters",
                endpoints: [
                    { method: "GET", path: "/fema-declarations", tool: "disaster_search_fema_declarations" },
                    { method: "GET", path: "/weather-alerts", tool: "disaster_get_weather_alerts" },
                    { method: "GET", path: "/earthquakes", tool: "disaster_search_earthquakes" },
                ],
            },
            finance: {
                basePath: "/api/v1/finance",
                endpoints: [
                    { method: "GET", path: "/sec-filings", tool: "finance_search_sec_filings" },
                    { method: "GET", path: "/employment-stats", tool: "finance_get_employment_stats" },
                    { method: "GET", path: "/crop-prices", tool: "finance_get_crop_prices" },
                ],
            },
            travel: {
                basePath: "/api/v1/travel",
                endpoints: [
                    { method: "GET", path: "/visa-wait-times", tool: "travel_get_visa_wait_times" },
                    { method: "GET", path: "/border-wait-times", tool: "travel_get_border_wait_times" },
                    { method: "GET", path: "/airport-delays", tool: "travel_get_airport_delays" },
                ],
            },
            environment: {
                basePath: "/api/v1/environment",
                endpoints: [
                    { method: "GET", path: "/air-quality", tool: "env_get_air_quality" },
                    { method: "GET", path: "/hud-foreclosures", tool: "env_search_hud_foreclosures" },
                ],
            },
            contracts: {
                basePath: "/api/v1/contracts",
                endpoints: [
                    { method: "GET", path: "/opportunities", tool: "contracts_search_opportunities" },
                    { method: "GET", path: "/spending", tool: "contracts_search_spending" },
                    { method: "GET", path: "/entity-lookup", tool: "contracts_lookup_entity" },
                ],
            },
            courts: {
                basePath: "/api/v1/courts",
                endpoints: [
                    { method: "GET", path: "/opinions", tool: "court_search_opinions" },
                    { method: "GET", path: "/dockets", tool: "court_search_dockets" },
                    { method: "GET", path: "/judges", tool: "court_search_judges" },
                ],
            },
            health: {
                basePath: "/api/v1/health",
                endpoints: [
                    { method: "GET", path: "/cdc-data", tool: "health_get_cdc_data" },
                    { method: "GET", path: "/who-indicator", tool: "health_get_who_indicator" },
                    { method: "GET", path: "/who-indicators", tool: "health_list_who_indicators" },
                ],
            },
            regulations: {
                basePath: "/api/v1/regulations",
                endpoints: [
                    { method: "GET", path: "/documents", tool: "reg_search_documents" },
                    { method: "GET", path: "/document/:documentNumber", tool: "reg_get_document" },
                    { method: "GET", path: "/public-inspection", tool: "reg_search_public_inspection" },
                    { method: "GET", path: "/agencies", tool: "reg_list_agencies" },
                ],
            },
            grants: {
                basePath: "/api/v1/grants",
                endpoints: [
                    { method: "GET", path: "/opportunities", tool: "grants_search_opportunities" },
                    { method: "GET", path: "/opportunity/:opportunityId", tool: "grants_get_opportunity" },
                    { method: "GET", path: "/by-agency", tool: "grants_search_by_agency" },
                    { method: "GET", path: "/filter-options", tool: "grants_get_filter_options" },
                ],
            },
            entities: {
                basePath: "/api/v1/entities",
                endpoints: [
                    { method: "GET", path: "/companies", tool: "entity_search_companies" },
                    { method: "GET", path: "/company-details", tool: "entity_get_company_details" },
                    { method: "GET", path: "/sec-companies", tool: "entity_search_sec_companies" },
                ],
            },
            intel: {
                basePath: "/api/v1/intel",
                endpoints: [
                    { method: "GET", path: "/company-filings", tool: "intel_company_filings" },
                    { method: "GET", path: "/company-news", tool: "intel_company_news" },
                    { method: "GET", path: "/company-contracts", tool: "intel_company_contracts" },
                    { method: "GET", path: "/company-profile", tool: "intel_company_profile" },
                ],
            },
            cyber: {
                basePath: "/api/v1/cyber",
                endpoints: [
                    { method: "GET", path: "/cve/:cveId", tool: "vuln_lookup_cve" },
                    { method: "GET", path: "/search", tool: "vuln_search" },
                    { method: "GET", path: "/kev/latest", tool: "vuln_kev_latest" },
                    { method: "GET", path: "/kev/due-soon", tool: "vuln_kev_due_soon" },
                    { method: "GET", path: "/epss/top", tool: "vuln_epss_top" },
                    { method: "GET", path: "/trending", tool: "vuln_trending" },
                    { method: "GET", path: "/vendor/:vendor", tool: "vuln_by_vendor" },
                ],
            },
        },
    });
});

// Mount route groups
app.use("/api/v1/safety", safetyRoutes);
app.use("/api/v1/disasters", disasterRoutes);
app.use("/api/v1/finance", financeRoutes);
app.use("/api/v1/travel", travelRoutes);
app.use("/api/v1/environment", environmentRoutes);
app.use("/api/v1/contracts", contractsRoutes);
app.use("/api/v1/courts", courtsRoutes);
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/regulations", regulationsRoutes);
app.use("/api/v1/grants", grantsRoutes);
app.use("/api/v1/entities", entitiesRoutes);
app.use("/api/v1/intel", intelRoutes);
app.use("/api/v1/cyber", cyberRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: "Endpoint not found. GET /api/v1 for available endpoints.",
    });
});

const port = parseInt(process.env.APIFY_ACTOR_STANDBY_PORT || "4321", 10);
app.listen(port, () => {
    console.log(`US Government Data API gateway running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/`);
    console.log(`API catalog:  http://localhost:${port}/api/v1`);
});
