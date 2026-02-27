import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "cybersecurity-vuln-mcp";

// GET /api/v1/cyber/cve/:cveId
router.get("/cve/:cveId", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "vuln_lookup_cve";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                cveId: req.params.cveId,
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/cyber/search
router.get("/search", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "vuln_search";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.keyword && { keyword: String(req.query.keyword) }),
                ...(req.query.severity && { severity: String(req.query.severity) }),
                ...(req.query.pubStartDate && { pubStartDate: String(req.query.pubStartDate) }),
                ...(req.query.pubEndDate && { pubEndDate: String(req.query.pubEndDate) }),
                ...(req.query.hasKev !== undefined && { hasKev: req.query.hasKev === "true" }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/cyber/kev/latest
router.get("/kev/latest", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "vuln_kev_latest";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.days && { days: Number(req.query.days) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/cyber/kev/due-soon
router.get("/kev/due-soon", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "vuln_kev_due_soon";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.days && { days: Number(req.query.days) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/cyber/epss/top
router.get("/epss/top", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "vuln_epss_top";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.threshold && { threshold: Number(req.query.threshold) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/cyber/trending
router.get("/trending", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "vuln_trending";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.days && { days: Number(req.query.days) }),
                ...(req.query.severity && { severity: String(req.query.severity) }),
                ...(req.query.limit && { limit: Number(req.query.limit) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/cyber/vendor/:vendor
router.get("/vendor/:vendor", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "vuln_by_vendor";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                vendor: req.params.vendor,
                ...(req.query.product && { product: String(req.query.product) }),
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
