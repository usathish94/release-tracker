import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listMatches, getMatch } from '../services/matchService.js';

/** Builds a fresh MCP server instance exposing this app's match data as tools. */
export function createMatchMcpServer() {
  const server = new McpServer({ name: 'release-tracker-mcp', version: '1.0.0' });

  server.registerTool(
    'list_matches',
    {
      title: 'List cricket matches',
      description: 'List tracked cricket matches, optionally filtered by status.',
      inputSchema: {
        status: z
          .enum(['live', 'completed', 'upcoming'])
          .optional()
          .describe('Filter to only matches in this status'),
      },
    },
    async ({ status }) => {
      const matches = await listMatches(status);
      return { content: [{ type: 'text', text: JSON.stringify(matches) }] };
    }
  );

  server.registerTool(
    'get_match',
    {
      title: 'Get one cricket match',
      description: 'Get full details (teams, score, status, venue) for one match by its id.',
      inputSchema: { matchId: z.string().describe('The match id, as returned by list_matches') },
    },
    async ({ matchId }) => {
      const match = await getMatch(matchId);
      if (!match) {
        return { content: [{ type: 'text', text: `No match found with id ${matchId}` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(match) }] };
    }
  );

  return server;
}
