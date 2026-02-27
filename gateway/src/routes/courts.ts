import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "court-records-mcp";

// GET /api/v1/courts/opinions
router.get("/opinions", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "court_search_opinions";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.query && { query: String(req.query.query) }),
                ...(req.query.court && { court: String(req.query.court) }),
                ...(req.query.dateAfter && { dateAfter: String(req.query.dateAfter) }),
                ...(req.query.dateBefore && { dateBefore: String(req.query.dateBefore) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/courts/dockets
router.get("/dockets", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "court_search_dockets";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.query && { query: String(req.query.query) }),
                ...(req.query.court && { court: String(req.query.court) }),
                ...(req.query.dateAfter && { dateAfter: String(req.query.dateAfter) }),
                ...(req.query.dateBefore && { dateBefore: String(req.query.dateBefore) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/courts/judges
router.get("/judges", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "court_search_judges";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.name && { name: String(req.query.name) }),
                ...(req.query.court && { court: String(req.query.court) }),
                ...(req.query.politicalAffiliation && { politicalAffiliation: String(req.query.politicalAffiliation) }),
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
