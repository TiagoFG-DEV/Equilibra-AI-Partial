import fs from "node:fs/promises";
import path from "node:path";
import { safeParseSkillJson, type SkillDefinition } from "@model/core";

const SKILL_SUFFIX = ".skill.json";

export class SkillLoader {
  constructor(private readonly skillsDir: string) {}

  private resolvePath(skillKey: string): string {
    const safeKey = skillKey.replace(/[^a-zA-Z0-9-_]/g, "");
    return path.join(this.skillsDir, `${safeKey}${SKILL_SUFFIX}`);
  }

  async listSkillKeys(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith(SKILL_SUFFIX))
        .map((e) => e.name.replace(SKILL_SUFFIX, ""));
    } catch {
      return [];
    }
  }

  async load(skillKey: string): Promise<SkillDefinition | null> {
    const file = this.resolvePath(skillKey);
    try {
      const raw = await fs.readFile(file, "utf-8");
      const json = JSON.parse(raw) as unknown;
      const parsed = safeParseSkillJson(json);
      if (!parsed.success) {
        console.error(`Skill inválida: ${skillKey}`, parsed.error.flatten());
        return null;
      }
      return parsed.data;
    } catch (e) {
      console.error(`Falha ao carregar skill ${skillKey}`, e);
      return null;
    }
  }
}
