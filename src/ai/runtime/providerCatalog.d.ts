/** Public installation metadata, safe for renderers: no provider or Node imports. */
export declare const PROVIDER_CATALOG: readonly [{
    readonly id: "claude";
    readonly name: "Claude — Anthropic";
    readonly cli: "Claude Code (CLI)";
    readonly url: "https://code.claude.com/docs/en/quickstart";
}, {
    readonly id: "codex";
    readonly name: "Codex — OpenAI";
    readonly cli: "Codex CLI";
    readonly url: "https://learn.chatgpt.com/docs/codex/cli";
}];
export declare function installationCommand(provider: string, platform: string): string;
