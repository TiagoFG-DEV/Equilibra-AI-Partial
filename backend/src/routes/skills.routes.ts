import { Router } from "express";
import type { SkillLoader } from "../services/skill-loader";

export function skillsRouter(skills: SkillLoader) {
  const r = Router();
  r.get("/skills", async (_req, res) => {
    const keys = await skills.listSkillKeys();
    res.json({ skills: keys });
  });
  return r;
}
