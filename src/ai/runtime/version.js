import { createRequire } from "node:module";
/** Edukors Common's version (its package.json), reported to the page and to the providers. */
export const VERSION = createRequire(import.meta.url)("../../../package.json").version;
