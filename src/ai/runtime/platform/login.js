import { AiError } from "../errors.js";
import { ManagedProcess, readLines } from "./process.js";
const MAX_OUTPUT = 64 << 10;
export async function runLoginCommand(spec, context, options) {
    const proc = new ManagedProcess(spec);
    const spawnError = new Promise((resolve) => proc.child.once("error", resolve));
    let stdout = "";
    let offered = false;
    const onLine = (line) => {
        if (stdout.length < MAX_OUTPUT)
            stdout += line + "\n";
        if (offered)
            return;
        const url = line.match(options.urlPattern)?.[0];
        if (!url)
            return;
        offered = true;
        // Wait for the code before offering the address: an application may answer at once.
        if (options.acceptsCode && context.login) {
            context.login.code().then((code) => proc.child.stdin.write(`${code}\n`), () => undefined);
        }
        context.login?.prompt({ url, acceptsCode: options.acceptsCode });
    };
    readLines(proc.child.stdout, onLine);
    readLines(proc.child.stderr, onLine);
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        void proc.terminate(500);
    }, options.timeoutMs ?? 10 * 60_000);
    const onAbort = () => void proc.terminate(500);
    context.signal?.addEventListener("abort", onAbort, { once: true });
    const info = await proc.exited;
    clearTimeout(timer);
    context.signal?.removeEventListener("abort", onAbort);
    if (info.code === null && info.signal === null)
        throw new AiError("PROVIDER_START_FAILED", `could not start ${spec.file}`, { cause: await spawnError });
    if (context.signal?.aborted)
        throw new AiError("CANCELLED", "sign-in cancelled");
    return { code: info.code, stdout, stderr: proc.stderr.toString(), timedOut };
}
