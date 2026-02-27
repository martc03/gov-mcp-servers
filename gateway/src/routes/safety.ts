import { Router, type Request, type Response } from "express";
import { callMcpTool } from "../lib/mcp-client.js";
import { successResponse, errorResponse } from "../lib/response.js";

const router = Router();
const SERVER = "us-safety-recalls-mcp";

// GET /api/v1/safety/vehicle-recalls
router.get("/vehicle-recalls", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "safety_search_vehicle_recalls";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.make && { make: String(req.query.make) }),
                ...(req.query.model && { model: String(req.query.model) }),
                ...(req.query.modelYear && { modelYear: Number(req.query.modelYear) }),
            },
        });
        res.json(successResponse(data, tool, Date.now() - start, SERVER));
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(502).json(errorResponse(msg, tool, Date.now() - start, SERVER));
    }
});

// GET /api/v1/safety/fda-recalls
router.get("/fda-recalls", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "safety_search_fda_recalls";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.productType && { productType: String(req.query.productType) }),
                ...(req.query.searchText && { searchText: String(req.query.searchText) }),
                ...(req.query.classification && { classification: String(req.query.classification) }),
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

// GET /api/v1/safety/consumer-complaints
router.get("/consumer-complaints", async (req: Request, res: Response) => {
    const start = Date.now();
    const tool = "safety_search_consumer_complaints";
    try {
        const data = await callMcpTool({
            serverName: SERVER,
            toolName: tool,
            args: {
                ...(req.query.company && { company: String(req.query.company) }),
                ...(req.query.product && { product: String(req.query.product) }),
                ...(req.query.state && { state: String(req.query.state) }),
                ...(req.query.dateFrom && { dateFrom: String(req.query.dateFrom) }),
                ...(req.query.dateTo && { dateTo: String(req.query.dateTo) }),
                ...(req.query.searchText && { searchText: String(req.query.searchText) }),
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
