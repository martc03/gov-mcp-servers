import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "environmental-compliance-mcp";

// GET /api/v1/environment/air-quality
router.get("/air-quality", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "env_get_air_quality";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.states && { states: String(req.query.states) }),
                ...(req.query.minAqi && { minAqi: Number(req.query.minAqi) }),
                ...(req.query.maxAqi && { maxAqi: Number(req.query.maxAqi) }),
                ...(req.query.categories && { categories: String(req.query.categories) }),
                ...(req.query.parameters && { parameters: String(req.query.parameters) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/environment/hud-foreclosures
router.get("/hud-foreclosures", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "env_search_hud_foreclosures";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.state && { state: String(req.query.state) }),
                ...(req.query.county && { county: String(req.query.county) }),
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
