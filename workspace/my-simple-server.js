#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Crée le serveur MCP
const server = new McpServer({ name: "bunnies-mcp-js", version: "0.1.0" });

// Déclare un tool "echo"
server.registerTool(
  "echo",
  {
    title: "Echo Tool",
    description: "Renvoie le texte fourni",
    inputSchema: { text: z.string() }
  },
  async ({ text }) => ({
    content: [{ type: "text", text: `pong: ${text}` }]
  })
);

// ⚠️ Pas de console.log sur stdout (ça casse le protocole)
console.error("[bunnies-mcp-js] starting…");

// Démarre le transport STDIO
const transport = new StdioServerTransport();
await server.connect(transport);
