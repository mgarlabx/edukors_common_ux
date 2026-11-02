import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { AiCliError } from "../../errors.js";
import { type ActivityPhase, type Usage } from "../../events.js";
/**
 * Claude Code's messages, as what a turn needs. This file has no SDK runtime
 * import, so it is tested on its own (test/claude.test.ts). Messages of a
 * subagent (`parent_tool_use_id`) are not the conversation's own and are
 * ignored, except for the result, which always belongs to the turn.
 */
export type ClaudeAction = {
    kind: "sessionId";
    id: string;
} | {
    kind: "text";
    text: string;
} | {
    kind: "activity";
    phase: ActivityPhase;
} | {
    kind: "usage";
    usage: Omit<Usage, "observedAt">;
}
/** A failure reported mid-turn; the turn ends with it unless it recovers. */
 | {
    kind: "error";
    error: AiCliError;
} | {
    kind: "end";
    outcome: "completed" | "cancelled";
} | {
    kind: "fail";
    error: AiCliError;
};
/** Claude Code's error names on a message, as stable codes. */
export declare function claudeError(name: string, detail?: string): AiCliError;
export declare function interpret(msg: SDKMessage): ClaudeAction[];
