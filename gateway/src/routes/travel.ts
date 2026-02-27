import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "immigration-travel-mcp";

// GET /api/v1/travel/visa-wait-times
router.get("/visa-wait-times", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "travel_get_visa_wait_times";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.country && { country: String(req.query.country) }),
                ...(req.query.visaCategory && { visaCategory: String(req.query.visaCategory) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/travel/border-wait-times
router.get("/border-wait-times", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "travel_get_border_wait_times";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.borderPort && { borderPort: String(req.query.borderPort) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/travel/airport-delays
router.get("/airport-delays", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "travel_get_airport_delays";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.airport && { airport: String(req.query.airport) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

export default router;
