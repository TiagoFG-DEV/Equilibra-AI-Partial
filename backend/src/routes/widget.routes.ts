import { Router } from "express";
import { z } from "zod";
import cors from "cors";
import type { ChatService } from "../services/chat.service";
import type { SkillLoader } from "../services/skill-loader";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12_000),
});

const WidgetChatBodySchema = z.object({
  skillKey: z.string().min(1).max(120),
  messages: z.array(MessageSchema).min(1).max(50),
});

export function widgetRouter(chat: ChatService, skillLoader: SkillLoader) {
  const r = Router();
  r.use(cors({ origin: "*" })); // Widget precisa ser consumido por sites externos livremente


  // Endpoint para descobrir informações da IA (Nome, Fallback)
  r.get("/info", async (req, res) => {
    const skillKey = req.query.skillKey as string;
    if (!skillKey) {
      return res.status(400).json({ error: "skillKey is required" });
    }

    try {
      const skill = await skillLoader.load(skillKey);
      return res.json({
        name: skill.identity?.display_name || skill.name,
        fallback_message: skill.fallback_message,
        themeColor: "#0056b3" // Configuração visual pode ser estendida via JSON
      });
    } catch (e) {
      return res.status(404).json({ error: "Skill não encontrada no servidor." });
    }
  });

  // Endpoint público de chat em stream
  r.post("/chat/stream", async (req, res) => {
    const parsed = WidgetChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const payload = parsed.data;

    const writeSse = (data: unknown) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      let full = "";
      for await (const chunk of chat.stream({
        skillKey: payload.skillKey,
        messages: payload.messages,
      })) {
        full += chunk;
        writeSse({ type: "token", chunk });
      }
      writeSse({ type: "done", full });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "stream_error";
      writeSse({ type: "error", message: msg });
    } finally {
      res.end();
    }
  });

  return r;
}
