/**
 * Trims `history` (oldest-first [{role, content}, ...] turns) so that
 * system + history + newMessage fits under maxTokens, dropping the oldest
 * turns first and leaving a one-line marker in their place - so a long-lived
 * chat degrades gracefully instead of silently truncating mid-conversation
 * or erroring once the client's history grows past the model's window.
 */
export async function buildBoundedMessages(
  anthropicClient,
  { model, system, history = [], newMessage, maxTokens = 4000 }
) {
  let trimmed = [...history];
  let droppedCount = 0;

  while (true) {
    const candidateMessages = [
      ...(droppedCount > 0
        ? [{ role: 'user', content: `[${droppedCount} earlier turn(s) omitted for length]` }]
        : []),
      ...trimmed,
      { role: 'user', content: newMessage },
    ];

    const { input_tokens } = await anthropicClient.messages.countTokens({
      model,
      system,
      messages: candidateMessages,
    });

    if (input_tokens <= maxTokens || trimmed.length === 0) {
      return candidateMessages;
    }

    trimmed = trimmed.slice(2); // drop the oldest user+assistant pair
    droppedCount++;
  }
}
