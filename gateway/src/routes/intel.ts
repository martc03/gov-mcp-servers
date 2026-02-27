import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "competitive-intel-mcp";

// GET /api/v1/intel/company-filings
router.get("/company-filings", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "intel_company_filings";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.companyName && { companyName: String(req.query.companyName) }),
                ...(req.query.formType && { formType: String(req.query.formType) }),
                ...(req.query.dateFrom && { dateFrom: String(req.query.dateFrom) }),
                ...(req.query.dateTo && { dateTo: String(req.query.dateTo) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/intel/company-news
router.get("/company-news", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "intel_company_news";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.companyName && { companyName: String(req.query.companyName) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/intel/company-contracts
router.get("/company-contracts", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "intel_company_contracts";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.companyName && { companyName: String(req.query.companyName) }),
                ...(req.query.awardType && { awardType: String(req.query.awardType) }),
                ...(req.query.dateFrom && { dateFrom: String(req.query.dateFrom) }),
                ...(req.query.dateTo && { dateTo: String(req.query.dateTo) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/intel/company-profile
router.get("/company-profile", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "intel_company_profile";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.companyName && { companyName: String(req.query.companyName) }),
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
