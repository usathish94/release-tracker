import { randomUUID } from 'node:crypto';

function logEvent(event) {
  // NDJSON: one structured line per call, greppable now and queryable by any
  // log shipper (Datadog, CloudWatch, etc.) without a schema migration later.
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...event }));
}

/**
 * Wraps an Anthropic client so every messages.create() call made through it
 * logs latency, token/cache usage, and errors as one structured line. Pass a
 * `route` label at each call site so requests are groupable by feature
 * ("match-summary", "assistant-chat") in whatever reads these logs.
 */
export function withTelemetry(anthropicClient) {
  return {
    async create(params, { route } = {}) {
      const requestId = randomUUID();
      const startedAt = performance.now();

      try {
        const response = await anthropicClient.messages.create(params);
        logEvent({
          event: 'claude_request',
          request_id: requestId,
          route,
          model: response.model,
          status: 'ok',
          duration_ms: Math.round(performance.now() - startedAt),
          stop_reason: response.stop_reason,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
        });
        return response;
      } catch (error) {
        logEvent({
          event: 'claude_request',
          request_id: requestId,
          route,
          status: 'error',
          duration_ms: Math.round(performance.now() - startedAt),
          error_type: error.constructor.name,
          error_message: error.message,
        });
        throw error;
      }
    },
  };
}
