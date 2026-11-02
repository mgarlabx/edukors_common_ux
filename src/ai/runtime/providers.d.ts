import type { ProviderAdapter } from "./provider.js";
/**
 * The adapters the bundled executables (`edukors-ai`, `edukors-ai-host`)
 * offer, in the order a provider menu shows them. `--fake` adds the
 * deterministic test provider.
 */
export declare function bundledProviders(options?: {
    fake?: boolean;
}): ProviderAdapter[];
