import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "federal-financial-intel-mcp";

// GET /api/v1/finance/sec-filings
router.get("/sec-filings", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "finance_search_sec_filings";
    try {
        const args: Record<string, unknown> = {};
        if (req.query.searchText) args.searchText = String(req.query.searchText);
        if (req.query.formTypes) args.formTypes = String(req.query.formTypes).split(",");
        if (req.query.dateFrom) args.dateFrom = String(req.query.dateFrom);
        if (req.query.dateTo) args.dateTo = String(req.query.dateTo);
        if (req.query.limit) args.limit = Number(req.query.limit);

        const data = await callMcpTool({ serverName: SERVER, toolName: tool, args });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/finance/employment-stats
router.get("/employment-stats", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "finance_get_employment_stats";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.seriesId && { seriesId: String(req.query.seriesId) }),
                ...(req.query.year && { year: Number(req.query.year) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/finance/crop-prices
router.get("/crop-prices", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "finance_get_crop_prices";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.commodity && { commodity: String(req.query.commodity) }),
                ...(req.query.state && { state: String(req.query.state) }),
                ...(req.query.year && { year: Number(req.query.year) }),
                ...(req.query.statistic && { statistic: String(req.query.statistic) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

export default router;
