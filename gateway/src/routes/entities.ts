import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "business-entity-mcp";

// GET /api/v1/entities/companies
router.get("/companies", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "entity_search_companies";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.name && { name: String(req.query.name) }),
                ...(req.query.jurisdiction && { jurisdiction: String(req.query.jurisdiction) }),
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

// GET /api/v1/entities/company-details
router.get("/company-details", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "entity_get_company_details";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.companyNumber && { companyNumber: String(req.query.companyNumber) }),
                ...(req.query.jurisdiction && { jurisdiction: String(req.query.jurisdiction) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/entities/sec-companies
router.get("/sec-companies", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "entity_search_sec_companies";
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

export default router;
