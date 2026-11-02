// Common additions to the runtime: attached files, and native actions put to the application. Run: node --test
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "./vitest-shim.mjs";
import { setup, connectedAccount, textOf } from "./helpers.mjs";
import { nativeAction } from "../../src/ai/runtime/providers/claude/adapter.js";

describe("attached files", () => {
    it("are saved for the agent, listed after the request, and leave the request's words unchanged", async () => {
        const { ai, events } = await setup();
        const account = await connectedAccount(ai);
        const session = await ai.openSession({ accountId: account.id, documentId: "d" });
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
        const result = await session.send("olá", { requestId: "r", attachments: [{ name: "../figura 1.png", mimeType: "image/png", data: png }, { name: "notas.md", data: Buffer.from("# Notas") }] });
        expect(result.status).toBe("completed");
        expect(textOf(events, "r")).toContain("Echo: olá");
        // The paths are in the session's attachments folder, with safe names.
        const paths = [...session.lastAttachmentsForTest].map((a) => a.path);
        expect(paths.length).toBe(2);
        expect(paths[0]).toMatch(/attachments[\\/]r[\\/]figura 1\.png$/);
        expect(await readFile(paths[0])).toEqual(png);
        expect(await readFile(paths[1], "utf8")).toBe("# Notas");
    });
});

describe("native actions", () => {
    const workspace = { dir: "/w/deck", readDirs: [], protectedPaths: [], web: true, shell: true };
    it("describes commands and file changes, and nothing for reading or the web", () => {
        expect(nativeAction(workspace, "Bash", { command: "ls -la", description: "List" })).toEqual({ action: "command", tool: "Bash", command: "ls -la", description: "List" });
        expect(nativeAction(workspace, "Edit", { file_path: "notes.md" })).toMatchObject({ action: "edit", path: "/w/deck/notes.md", relativePath: "notes.md" });
        expect(nativeAction(workspace, "Write", { file_path: "/w/deck/new-file-that-does-not-exist.md" })).toMatchObject({ action: "create" });
        expect(nativeAction(workspace, "Read", { file_path: "notes.md" })).toBe(null);
        expect(nativeAction(workspace, "WebSearch", { query: "x" })).toBe(null);
    });
    it("are put to the application's authorizer, which decides", async () => {
        const asked = [];
        const { ai } = await setup();
        const account = await connectedAccount(ai);
        const session = await ai.openSession({ accountId: account.id, documentId: "d", authorize: (request) => (asked.push(request), request.command === "rm -rf x" ? { allow: false, message: "No." } : { allow: true }) });
        const turn = session.newTurn("t");
        session.turn = turn;
        const sink = session.sinkFor(turn);
        expect(await sink.authorizeNative({ action: "command", tool: "Bash", command: "ls" })).toEqual({ allow: true });
        expect(await sink.authorizeNative({ action: "command", tool: "Bash", command: "rm -rf x" })).toEqual({ allow: false, message: "No." });
        expect(asked.map((r) => [r.kind, r.command, r.requestId])).toEqual([["native", "ls", "t"], ["native", "rm -rf x", "t"]]);
        // The turn was made by hand: end it, so the session can close.
        session.finish(turn, "completed");
    });
});
