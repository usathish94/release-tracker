import { Router } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMatchMcpServer } from '../mcp/matchMcpServer.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const mcpRouter = Router();

// Stateless MCP over Streamable HTTP: one server+transport per request, no
// session persisted between calls. Simple to run behind Render, at the cost
// of not supporting server-initiated notifications between requests.
mcpRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const server = createMatchMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  })
);

mcpRouter.get('/', (req, res) => {
  res.status(405).json({ error: 'Method not allowed. This MCP endpoint is stateless: POST only.' });
});

mcpRouter.delete('/', (req, res) => {
  res.status(405).json({ error: 'Method not allowed. This MCP endpoint is stateless: POST only.' });
});
