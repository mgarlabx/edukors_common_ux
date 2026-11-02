import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, normalize, parse, relative, sep } from "node:path";
import { AiError } from "./errors.js";
const inside = (child, parent) => {
    const rel = relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
async function folder(path, what) {
    if (typeof path !== "string" || !isAbsolute(path))
        throw new AiError("INVALID_ARGUMENT", `${what} must be an absolute path`);
    let real;
    try {
        real = await realpath(path);
        if (!(await stat(real)).isDirectory())
            throw new Error("not a folder");
    }
    catch {
        throw new AiError("INVALID_ARGUMENT", `${what} must be an existing folder`);
    }
    // A workspace this broad would confine nothing.
    if (real === parse(real).root || real === (await realpath(homedir()).catch(() => homedir())))
        throw new AiError("INVALID_ARGUMENT", `${what} cannot be the home folder or a drive's root`);
    return real;
}
/** Checks the application's request and settles what the session gets, given the provider's capabilities. */
export async function resolveWorkspace(options, capabilities, reserved) {
    const dir = await folder(options.dir, "workspace.dir");
    // The library's own folders (accounts, sessions) must stay out of reach.
    for (const own of reserved)
        if (inside(own, dir) || inside(dir, own))
            throw new AiError("INVALID_ARGUMENT", "workspace.dir overlaps the library's data folder");
    const readDirs = await Promise.all((options.readDirs ?? []).map((p, i) => folder(p, `workspace.readDirs[${i}]`)));
    const protectedPaths = (options.protect ?? []).map((p) => {
        const rel = typeof p === "string" ? normalize(p).replace(/[\\/]+$/, "") : "";
        if (!rel || rel === "." || isAbsolute(rel) || rel.split(sep).includes(".."))
            throw new AiError("INVALID_ARGUMENT", `workspace.protect entries must be paths inside the workspace: ${String(p)}`);
        return join(dir, rel);
    });
    return { dir, readDirs, protectedPaths, web: options.web ?? true, shell: (options.shell ?? true) && capabilities.workspaceShell };
}
