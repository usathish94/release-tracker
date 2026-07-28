import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listMatches, getMatch } from '../services/matchService.js';
import { retrieveGlossaryEntries } from '../services/ragService.js';
import { broadcastTestPayload } from '../services/webhookDispatcher.js';

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

  // RAG tool: answers rules questions ("what's a follow-on?") by retrieving
  // from src/data/cricketGlossary.js instead of the model guessing from
  // general knowledge. See src/services/ragService.js.
  server.registerTool(
    'explain_cricket_rule',
    {
      title: 'Explain a cricket rule',
      description:
        'Retrieves the relevant rule(s) from this app\'s cricket glossary for a rules question ' +
        '(e.g. LBW, DLS, follow-on, powerplay, super over, no-ball). Prefer this over general ' +
        'knowledge or web search for rules questions - it grounds the answer in a fixed reference.',
      inputSchema: { query: z.string().describe('The rules question, in the user\'s own words') },
    },
    async ({ query }) => {
      const entries = retrieveGlossaryEntries(query);
      if (entries.length === 0) {
        return { content: [{ type: 'text', text: 'No matching entry in the glossary for this query.' }] };
      }
      return { content: [{ type: 'text', text: entries.map((e) => `[${e.id}] ${e.text}`).join('\n\n') }] };
    }
  );

  // Side-effecting tool: sends real HTTP requests to third-party subscriber
  // URLs. The MCP server itself has no notion of "approval" - that's
  // enforced one layer up, by whichever caller decides whether to actually
  // invoke this tool. See TOOLS_REQUIRING_APPROVAL in assistantService.js.
  server.registerTool(
    'broadcast_webhook_test',
    {
      title: 'Broadcast a test webhook',
      description:
        'Sends a real test webhook delivery to every subscriber for a match (or every global ' +
        'subscriber, if the match has none). This makes real HTTP requests to third-party URLs - ' +
        'only call this when a human has explicitly asked for a test broadcast.',
      inputSchema: { matchId: z.string().describe('The match id to broadcast a test webhook for') },
    },
    async ({ matchId }) => {
      const result = await broadcastTestPayload(matchId);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  return server;
}
