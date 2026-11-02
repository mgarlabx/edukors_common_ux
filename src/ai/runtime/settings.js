/**
 * What an editor's settings screen needs, safe to bundle for a browser or
 * webview: no Node modules are imported from here.
 */
export { parseMcpConfig } from "./mcp/config.js";
export { TOOL_SERVER_NAME } from "./constants.js";
export { PROVIDER_CATALOG, installationCommand } from "./providerCatalog.js";
