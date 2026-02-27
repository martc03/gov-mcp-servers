import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "grant-finder-mcp";

// GET /api/v1/grants/opportunities
router.get("/opportunities", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "grants_search_opportunities";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.keyword && { keyword: String(req.query.keyword) }),
                ...(req.query.status && { status: String(req.query.status) }),
                ...(req.query.agency && { agency: String(req.query.agency) }),
                ...(req.query.fundingCategory && { fundingCategory: String(req.query.fundingCategory) }),
                ...(req.query.fundingInstrument && { fundingInstrument: String(req.query.fundingInstrument) }),
                ...(req.query.eligibility && { eligibility: String(req.query.eligibility) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
                ...(req.query.offset && { offset: Number(req.query.offset) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/grants/opportunity/:opportunityId
router.get("/opportunity/:opportunityId", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "grants_get_opportunity";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                opportunityId: req.params.opportunityId,
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/grants/by-agency
router.get("/by-agency", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "grants_search_by_agency";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.agencyCode && { agencyCode: String(req.query.agencyCode) }),
                ...(req.query.status && { status: String(req.query.status) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/grants/filter-options
router.get("/filter-options", async (_req: Request, res: Response) => {
    const start = Date.now();
    const tool = "grants_get_filter_options";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {},
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

export default router;
