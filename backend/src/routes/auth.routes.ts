import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../services/auth.service";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  organizationName: z.string().min(2).max(120),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export function authRouter(auth: AuthService) {
  const r = Router();

  r.post("/auth/register", async (req, res) => {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
    }
    try {
      const result = await auth.register(parsed.data);
      return res.status(201).json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao registrar";
      return res.status(400).json({ error: msg });
    }
  });

  r.post("/auth/login", async (req, res) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
    }
    try {
      const result = await auth.login(parsed.data);
      return res.json(result);
    } catch {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }
  });

  return r;
}
