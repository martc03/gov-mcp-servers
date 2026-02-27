import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "public-health-mcp";

// GET /api/v1/health/cdc-data
router.get("/cdc-data", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "health_get_cdc_data";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.datasetId && { datasetId: String(req.query.datasetId) }),
                ...(req.query.query && { query: String(req.query.query) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
                ...(req.query.offset && { offset: Number(req.query.offset) }),
                ...(req.query.orderBy && { orderBy: String(req.query.orderBy) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/health/who-indicator
router.get("/who-indicator", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "health_get_who_indicator";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.indicatorCode && { indicatorCode: String(req.query.indicatorCode) }),
                ...(req.query.country && { country: String(req.query.country) }),
                ...(req.query.year && { year: Number(req.query.year) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/health/who-indicators
router.get("/who-indicators", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "health_list_who_indicators";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
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
