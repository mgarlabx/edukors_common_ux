import { z } from "zod";
const TOOL_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** A tool whose arguments are described and validated by a zod object schema. */
export function defineTool(definition) {
    const { name, description, input, run } = definition;
    const inputSchema = z.toJSONSchema(input);
    delete inputSchema.$schema;
    return {
        name,
        description,
        inputSchema,
        validate(args) {
            const parsed = input.safeParse(args);
            if (parsed.success)
                return { ok: true, value: parsed.data };
            return { ok: false, message: z.prettifyError(parsed.error) };
        },
        run: (args, context) => run(args, context),
    };
}
export function assertToolNames(tools) {
    const seen = new Set();
    for (const tool of tools) {
        if (!TOOL_NAME.test(tool.name))
            throw new Error(`invalid tool name: ${tool.name}`);
        if (seen.has(tool.name))
            throw new Error(`duplicate tool name: ${tool.name}`);
        seen.add(tool.name);
    }
}
export const toolSpec = ({ name, description, inputSchema }) => ({ name, description, inputSchema });
