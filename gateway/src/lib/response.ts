export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    meta: {
        tool: string;
        latencyMs: number;
        source: string;
    };
}

export function successResponse<T>(data: T, tool: string, latencyMs: number, source: string): ApiResponse<T> {
    return {
        success: true,
        data,
        meta: { tool, latencyMs, source },
    };
}

export function errorResponse(error: string, tool: string, latencyMs: number, source: string): ApiResponse {
    return {
        success: false,
        error,
        meta: { tool, latencyMs, source },
    };
}
