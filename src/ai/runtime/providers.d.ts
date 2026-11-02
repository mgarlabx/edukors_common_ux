import type { ProviderAdapter } from "./provider.js";
/**
 * The providers the hosts offer (desktop/host.mjs, tools/dev-host.mjs), in the
 * order a provider menu shows them. `fake` adds the deterministic test provider.
 */
export declare function bundledProviders(options?: {
    fake?: boolean;
}): ProviderAdapter[];
