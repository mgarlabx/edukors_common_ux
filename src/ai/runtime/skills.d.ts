import type { ToolSpec } from "./tools.js";
/**
 * The application's skills: a folder of `<folder>/SKILL.md`, each with a YAML
 * frontmatter naming and describing it. Claude Code loads them natively; for
 * providers that would need a shell to read them (Codex), the library serves
 * them through `read_skill` instead.
 */
export interface SkillInfo {
    folder: string;
    name: string;
    description: string;
}
/** `name` and `description` from a SKILL.md frontmatter: one-line values, quoted or not, and folded blocks. */
export declare function frontmatter(text: string): Record<string, string>;
export declare function listSkills(dir: string): SkillInfo[];
/**
 * A file of one skill, `SKILL.md` by default. The path must stay inside that
 * skill's folder, links included.
 */
export declare function readSkillFile(dir: string, skill: string, file?: string): string;
export declare const READ_SKILL_TOOL = "read_skill";
export declare const readSkillSpec: ToolSpec;
/** What the model is told about the skills when it cannot load them natively. */
export declare function skillsInstructions(skills: SkillInfo[]): string;
