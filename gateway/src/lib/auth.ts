import type { Request, Response, NextFunction } from "express";

const RAPIDAPI_PROXY_SECRET = process.env.RAPIDAPI_PROXY_SECRET || "";

export function validateRapidApi(req: Request, res: Response, next: NextFunction): void {
    // Allow health checks without auth
    if (req.path === "/" || req.path === "/health") {
        next();
        return;
    }

    // In development or if no secret configured, skip validation
    if (!RAPIDAPI_PROXY_SECRET) {
        next();
        return;
    }

    const proxySecret = req.headers["x-rapidapi-proxy-secret"] as string | undefined;
    if (proxySecret !== RAPIDAPI_PROXY_SECRET) {
        res.status(403).json({
            success: false,
            error: "Forbidden: Invalid RapidAPI proxy secret",
        });
        return;
    }

    next();
}
