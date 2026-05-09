import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPlatanusMcpServer } from "./createServer";

const server = createPlatanusMcpServer();

const transport = new StdioServerTransport();
await server.connect(transport);
