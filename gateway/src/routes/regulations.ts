import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "regulatory-monitor-mcp";

// GET /api/v1/regulations/documents
router.get("/documents", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "reg_search_documents";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.term && { term: String(req.query.term) }),
                ...(req.query.documentType && { documentType: String(req.query.documentType) }),
                ...(req.query.agency && { agency: String(req.query.agency) }),
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

// GET /api/v1/regulations/document/:documentNumber
router.get("/document/:documentNumber", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "reg_get_document";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                documentNumber: req.params.documentNumber,
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/regulations/public-inspection
router.get("/public-inspection", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "reg_search_public_inspection";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.agency && { agency: String(req.query.agency) }),
                ...(req.query.documentType && { documentType: String(req.query.documentType) }),
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

// GET /api/v1/regulations/agencies
router.get("/agencies", async (_req: Request, res: Response) => {
    const start = Date.now();
    const tool = "reg_list_agencies";
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
