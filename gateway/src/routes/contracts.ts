import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "gov-contracts-mcp";

// GET /api/v1/contracts/opportunities
router.get("/opportunities", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "contracts_search_opportunities";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.keyword && { keyword: String(req.query.keyword) }),
                ...(req.query.naicsCode && { naicsCode: String(req.query.naicsCode) }),
                ...(req.query.postedFrom && { postedFrom: String(req.query.postedFrom) }),
                ...(req.query.postedTo && { postedTo: String(req.query.postedTo) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/contracts/spending
router.get("/spending", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "contracts_search_spending";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.awardType && { awardType: String(req.query.awardType) }),
                ...(req.query.agency && { agency: String(req.query.agency) }),
                ...(req.query.recipientName && { recipientName: String(req.query.recipientName) }),
                ...(req.query.minAmount && { minAmount: Number(req.query.minAmount) }),
                ...(req.query.maxAmount && { maxAmount: Number(req.query.maxAmount) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/contracts/entity-lookup
router.get("/entity-lookup", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "contracts_lookup_entity";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.entityName && { entityName: String(req.query.entityName) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

export default router;
