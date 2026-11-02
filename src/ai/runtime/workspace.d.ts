import type { Capabilities, Workspace } from "./provider.js";
/**
 * A folder the agent works in with the provider's own file, web and (where
 * a sandbox confines them) command tools: the application's document folder,
 * for an editor whose documents are folders of files.
 */
export interface WorkspaceOptions {
    /** Absolute path of an existing folder: the agent's working directory. */
    dir: string;
    /** Absolute paths of existing folders the agent may read, such as copies of attachments. */
    readDirs?: string[];
    /** Paths relative to `dir` the agent may read but not write: the application's own files. */
    protect?: string[];
    /** Web search and fetch. Default true. */
    web?: boolean;
    /** Commands, confined to the workspace. Default true; never where the provider has no sandbox (`workspaceShell`). */
    shell?: boolean;
}
/** Checks the application's request and settles what the session gets, given the provider's capabilities. */
export declare function resolveWorkspace(options: WorkspaceOptions, capabilities: Capabilities, reserved: string[]): Promise<Workspace>;
