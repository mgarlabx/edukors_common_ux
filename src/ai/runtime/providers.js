import { createClaudeProvider } from "./providers/claude/adapter.js";
import { createCodexProvider } from "./providers/codex/adapter.js";
import { createFakeProvider } from "./testing/fakeProvider.js";
/**
 * The providers the hosts offer (desktop/host.mjs, tools/dev-host.mjs), in the
 * order a provider menu shows them. `fake` adds the deterministic test provider.
 */
export function bundledProviders(options = {}) {
    const providers = [createClaudeProvider(), createCodexProvider()];
    if (options.fake)
        providers.push(createFakeProvider());
    return providers;
}
