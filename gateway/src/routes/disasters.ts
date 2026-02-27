import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "natural-disaster-intel-mcp";

// GET /api/v1/disasters/fema-declarations
router.get("/fema-declarations", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "disaster_search_fema_declarations";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.states && { states: String(req.query.states) }),
                ...(req.query.incidentTypes && { incidentTypes: String(req.query.incidentTypes) }),
                ...(req.query.yearFrom && { yearFrom: Number(req.query.yearFrom) }),
                ...(req.query.yearTo && { yearTo: Number(req.query.yearTo) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/disasters/weather-alerts
router.get("/weather-alerts", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "disaster_get_weather_alerts";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.states && { states: String(req.query.states) }),
                ...(req.query.severity && { severity: String(req.query.severity) }),
                ...(req.query.urgency && { urgency: String(req.query.urgency) }),
                ...(req.query.eventTypes && { eventTypes: String(req.query.eventTypes) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/disasters/earthquakes
router.get("/earthquakes", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "disaster_search_earthquakes";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.minMagnitude && { minMagnitude: Number(req.query.minMagnitude) }),
                ...(req.query.maxMagnitude && { maxMagnitude: Number(req.query.maxMagnitude) }),
                ...(req.query.startDate && { startDate: String(req.query.startDate) }),
                ...(req.query.endDate && { endDate: String(req.query.endDate) }),
                ...(req.query.alertLevel && { alertLevel: String(req.query.alertLevel) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

export default router;
