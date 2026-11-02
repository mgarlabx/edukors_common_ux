import { accessSync, constants, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { commonBinDirs } from "./env.js";
import { runCommand } from "./process.js";
function isExecutable(path, platform) {
    try {
        if (!statSync(path).isFile())
            return false;
        if (platform !== "win32")
            accessSync(path, constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
export async function findExecutable(options) {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const explicit = options.override ?? (options.envVar ? env[options.envVar] : undefined);
    if (explicit)
        return isAbsolute(explicit) && isExecutable(explicit, platform) ? explicit : null;
    const exts = platform === "win32" ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean).map((e) => e.toLowerCase()) : [""];
    const pathVar = Object.entries(env).find(([k]) => k.toUpperCase() === "PATH")?.[1] ?? "";
    const dirs = [...pathVar.split(platform === "win32" ? ";" : ":"), ...(options.extraDirs ?? []), ...commonBinDirs(platform, env)].filter(Boolean);
    for (const dir of dirs)
        for (const name of options.names)
            for (const ext of exts) {
                const candidate = join(dir, name + ext);
                if (isExecutable(candidate, platform))
                    return candidate;
            }
    if (platform !== "win32" && options.loginShell !== false) {
        const shell = env.SHELL || (platform === "darwin" ? "/bin/zsh" : "/bin/sh");
        for (const name of options.names) {
            if (!/^[\w.-]+$/.test(name))
                continue;
            const result = await runCommand({ file: shell, args: ["-lc", `command -v ${name}`], env: { ...env }, timeoutMs: 8_000 }).catch(() => null);
            const found = result?.stdout.trim().split("\n").find(Boolean);
            if (found && isAbsolute(found) && isExecutable(found, platform))
                return found;
        }
    }
    return null;
}
/** The first `x.y.z` in the output of `<executable> --version`. */
export async function readVersion(file, args = ["--version"], env) {
    const result = await runCommand({ file, args, env, timeoutMs: 10_000 }).catch(() => null);
    if (!result)
        return undefined;
    return `${result.stdout}\n${result.stderr}`.match(/\d+\.\d+\.\d+/)?.[0];
}
/** Compares dotted numeric versions; pre-release suffixes are ignored. */
export function compareVersions(a, b) {
    const pa = a.split(/[.+-]/).slice(0, 3).map(Number);
    const pb = b.split(/[.+-]/).slice(0, 3).map(Number);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0)
            return Math.sign(d);
    }
    return 0;
}
