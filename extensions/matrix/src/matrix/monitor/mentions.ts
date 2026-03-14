import { getMatrixRuntime } from "../../runtime.js";

// Type for room message content with mentions
type MessageContentWithMentions = {
  msgtype: string;
  body: string;
  "m.mentions"?: {
    user_ids?: string[];
    room?: boolean;
  };
};

export function resolveMentions(params: {
  content: MessageContentWithMentions;
  userId?: string | null;
  text?: string;
  mentionRegexes: RegExp[];
}) {
  const mentions = params.content["m.mentions"];
  const mentionedUsers = Array.isArray(mentions?.user_ids)
    ? new Set(mentions.user_ids)
    : new Set<string>();

  const wasMentioned =
    Boolean(mentions?.room) ||
    (params.userId ? mentionedUsers.has(params.userId) : false) ||
    getMatrixRuntime().channel.mentions.matchesMentionPatterns(
      params.text ?? "",
      params.mentionRegexes,
    );

  return { wasMentioned, hasExplicitMention: Boolean(mentions) };
}

/**
 * Strip Matrix mention prefix from message text so slash commands can be matched.
 * Handles both MXID format (@user:server) and display name mentions.
 */
export function stripMatrixMentionForCommand(
  text: string,
  selfUserId: string | null | undefined,
  mentionRegexes: RegExp[],
): string {
  let result = text;

  // Strip @userid:server at start (Matrix MXID format)
  if (selfUserId) {
    const escaped = selfUserId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`^${escaped}\\s*`, "i"), "");
  }

  // Strip display name mentions (from mentionRegexes) at start
  for (const re of mentionRegexes) {
    const startRe = new RegExp(`^(?:${re.source})\\s*`, re.flags);
    const before = result;
    result = result.replace(startRe, "");
    if (result !== before) break; // Only strip the first match
  }

  return result.trim();
}
