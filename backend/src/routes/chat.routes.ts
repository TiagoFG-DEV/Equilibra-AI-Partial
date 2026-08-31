import { Router } from "express";
import { z } from "zod";
import type { ChatService } from "../services/chat.service";
import { requireAuth, type AuthedRequest } from "../middleware/auth";
import type { AuthService } from "../services/auth.service";
import { prisma } from "../lib/prisma";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(12_000),
});

const ChatBodySchema = z.object({
  skillKey: z.string().min(1).max(120),
  messages: z.array(MessageSchema).min(1).max(50),
  conversationId: z.string().uuid().optional(),
  botId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
});

export function chatRouter(chat: ChatService, authService: AuthService) {
  const r = Router();
  const auth = requireAuth(authService);

  r.post("/chat", auth, async (req: AuthedRequest, res) => {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
    }

    const { stream, ...payload } = parsed.data;
    if (stream) {
      return res.status(400).json({ error: "Use POST /api/chat/stream para SSE" });
    }

    const result = await chat.complete({
      skillKey: payload.skillKey,
      messages: payload.messages,
    });

    if (!result.ok) {
      return res.status(502).json({ error: result.error });
    }

    if (payload.conversationId && req.auth) {
      await persistMessages(
        payload.conversationId,
        req.auth.sub,
        payload.messages,
        result.content,
      );
    }

    return res.json({
      content: result.content,
      blocked: result.blocked,
      reason: "reason" in result ? result.reason : undefined,
    });
  });

  r.post("/chat/stream", auth, async (req: AuthedRequest, res) => {
    const parsed = ChatBodySchema.safeParse(req.body);
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

      if (payload.conversationId && req.auth) {
        await persistMessages(
          payload.conversationId,
          req.auth.sub,
          payload.messages,
          full,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "stream_error";
      writeSse({ type: "error", message: msg });
    } finally {
      res.end();
    }
  });

  return r;
}

async function persistMessages(
  conversationId: string,
  userId: string,
  userMessages: Array<{ role: string; content: string }>,
  assistantText: string,
) {
  const convo = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!convo) return;

  const lastUser = [...userMessages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    await prisma.message.create({
      data: {
        conversationId,
        role: "user",
        content: lastUser.content,
      },
    });
  }
  await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: assistantText,
    },
  });
}
