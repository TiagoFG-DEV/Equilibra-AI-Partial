import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import type { AuthService } from "../services/auth.service";

const CreateConversationSchema = z.object({
  skillKey: z.string().min(1).max(120),
  title: z.string().max(200).optional(),
});

async function ensureBot(tenantId: string, skillKey: string) {
  const existing = await prisma.bot.findFirst({ where: { tenantId, skillKey } });
  if (existing) return existing;
  return prisma.bot.create({
    data: {
      tenantId,
      skillKey,
      name: `Bot: ${skillKey}`,
    },
  });
}

export function conversationsRouter(authService: AuthService) {
  const r = Router();
  const auth = requireAuth(authService);

  r.post("/conversations", auth, async (req: AuthedRequest, res) => {
    const parsed = CreateConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
    }
    if (!req.auth?.tenantId) {
      return res.status(400).json({ error: "Tenant não associado ao usuário" });
    }

    const bot = await ensureBot(req.auth.tenantId, parsed.data.skillKey);
    const convo = await prisma.conversation.create({
      data: {
        botId: bot.id,
        userId: req.auth.sub,
        title: parsed.data.title ?? null,
      },
    });

    return res.status(201).json({ id: convo.id, botId: bot.id, skillKey: parsed.data.skillKey });
  });

  return r;
}
