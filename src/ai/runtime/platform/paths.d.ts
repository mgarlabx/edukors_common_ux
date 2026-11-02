/**
 * The per-OS-user EDUKORS data directory, shared by every EDUKORS application
 * on this computer. Resolved by platform convention; `EDUKORS_AI_DATA_DIR`
 * overrides it (tests, portable installs).
 */
export declare function defaultDataDir(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform): string;
/** Stable, filesystem-safe key for an arbitrary document identifier. */
export declare const documentKey: (documentId: string) => string;
export declare class DataPaths {
    readonly root: string;
    /** Always absolute: provider processes run in other working directories. */
    constructor(root: string);
    get registryFile(): string;
    get locksDir(): string;
    /** Stored relative to the root in the registry, so the root may move. */
    accountHomeRelative(accountId: string): string;
    resolve(relative: string): string;
    sessionDir(appId: string, documentId: string, accountId: string): string;
}
