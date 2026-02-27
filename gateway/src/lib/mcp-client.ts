/**
 * MCP Client — sends tool calls to MCP server standby URLs.
 *
 * Each MCP server runs on Apify standby mode and exposes POST /mcp.
 * We send a JSON-RPC style request with method "tools/call" and
 * parse the MCP response to extract the JSON data.
 */

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";
const APIFY_TOKEN = process.env.APIFY_TOKEN || "";
const APIFY_USER_ID = process.env.APIFY_USER_ID || "QsMoAGCMaBq3PyofF";

// Map of MCP server names to their Apify actor IDs
const MCP_ACTOR_IDS: Record<string, string> = {
    "us-safety-recalls-mcp": "jUz9vhAagqYhYUS6b",
    "natural-disaster-intel-mcp": "IoiOhZLHxApBJDdb2",
    "federal-financial-intel-mcp": "8n9OTUhW3edDmxCdQ",
    "immigration-travel-mcp": "4mszur30oWvLBudby",
    "environmental-compliance-mcp": "2qQ9d5j6jz8sxnUll",
    "gov-contracts-mcp": "12KQ6Z6RgGF9PYox4",
    "court-records-mcp": "mcwBIzz80BhZWii6H",
    "public-health-mcp": "jRduNQ6KzGAuzp6eU",
    "business-entity-mcp": "qagGwj2oggueK3DNl",
    "regulatory-monitor-mcp": "KQBu1U4O87k5Fkug1",
    "grant-finder-mcp": "v10P33X6mfLiJNZ1A",
    "competitive-intel-mcp": "zaEkpuNazzRUzNett",
    "cybersecurity-vuln-mcp": "TCeaSEcGKAqAD0Lea",
};

function getStandbyUrl(serverName: string): string {
    const actorId = MCP_ACTOR_IDS[serverName];
    if (!actorId) {
        throw new Error(`Unknown MCP server: ${serverName}`);
    }
    return `https://${actorId}.apify.actor/mcp`;
}

interface McpToolCallParams {
    serverName: string;
    toolName: string;
    args: Record<string, unknown>;
}

interface McpContentBlock {
    type: string;
    text?: string;
}

interface McpToolResult {
    content: McpContentBlock[];
    isError?: boolean;
    structuredContent?: unknown;
}

export async function callMcpTool({ serverName, toolName, args }: McpToolCallParams): Promise<unknown> {
    const url = getStandbyUrl(serverName);

    // Inject gateway token to bypass per-call billing on the MCP server
    const argsWithToken = GATEWAY_SECRET
        ? { ...args, _gatewayToken: GATEWAY_SECRET }
        : args;

    const body = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
            name: toolName,
            arguments: argsWithToken,
        },
    };

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
    };
    if (APIFY_TOKEN) {
        headers["Authorization"] = `Bearer ${APIFY_TOKEN}`;
    }

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`MCP server ${serverName} returned ${response.status}: ${text.slice(0, 500)}`);
    }

    const contentType = response.headers.get("content-type") || "";

    // Handle SSE responses — parse last JSON-RPC message from the event stream
    let json: { result?: McpToolResult; error?: { message: string; code?: number } };

    if (contentType.includes("text/event-stream")) {
        const text = await response.text();
        const lines = text.split("\n");
        let lastData = "";
        for (const line of lines) {
            if (line.startsWith("data: ")) {
                lastData = line.slice(6);
            }
        }
        if (!lastData) {
            throw new Error(`MCP server ${serverName} returned empty SSE stream`);
        }
        json = JSON.parse(lastData);
    } else {
        json = await response.json() as typeof json;
    }

    if (json.error) {
        throw new Error(`MCP error: ${json.error.message}`);
    }

    const result = json.result;
    if (!result) {
        throw new Error("MCP server returned no result");
    }

    if (result.isError) {
        const errorText = result.content?.[0]?.text || "Unknown MCP tool error";
        throw new Error(errorText);
    }

    // If structured content exists, return it directly
    if (result.structuredContent) {
        return result.structuredContent;
    }

    // Otherwise parse the text content as JSON
    const textBlock = result.content?.find((c) => c.type === "text");
    if (textBlock?.text) {
        try {
            return JSON.parse(textBlock.text);
        } catch {
            return { rawText: textBlock.text };
        }
    }

    return result.content;
}
