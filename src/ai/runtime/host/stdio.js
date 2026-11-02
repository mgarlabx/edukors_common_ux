import { readLines } from "../platform/process.js";
import { createHostDispatcher } from "./dispatcher.js";
export { HOST_PROTOCOL_VERSION } from "./dispatcher.js";
/**
 * The application-host protocol over a pipe, one JSON object per line (see
 * dispatcher.js for the messages). Nothing else is written to the output;
 * diagnostics go to stderr.
 */
export function runStdioHost({ ai, input, output, toolTimeoutMs = 120_000, methods }) {
    const dispatcher = createHostDispatcher({ ai, toolTimeoutMs, methods, send: (msg) => output.write(JSON.stringify(msg) + "\n") });
    readLines(input, (line) => {
        if (!line.trim())
            return;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            ai.diagnostics.scoped("host").warn("ignored an invalid message", { line: line.slice(0, 200) });
            return;
        }
        dispatcher.receive(parsed);
    });
    const closed = new Promise((resolve) => {
        input.on("end", () => void dispatcher.close().then(resolve));
    });
    return { closed };
}
