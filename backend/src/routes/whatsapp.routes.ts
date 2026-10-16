import { Router, Request, Response } from "express";
import { z } from "zod";
import type { WhatsAppService } from "../services/whatsapp.service";
import type { AppEnv } from "../config/env";

const SimulateBodySchema = z.object({
  phoneNumber: z.string().min(8).default("+5511999998888"),
  department: z.string().default("Operações"),
  message: z.string().default(""),
});

const InviteBodySchema = z.object({
  phoneNumber: z.string().min(8).default("+5511999998888"),
  department: z.string().default("Operações"),
});

import type { BaileysService } from "../services/baileys.service";

export function whatsAppRouter(
  service: WhatsAppService,
  env: AppEnv,
  baileysService?: BaileysService,
): Router {
  const router = Router();

  /**
   * Consulta do Status e QR Code do WhatsApp Real (Baileys)
   */
  router.get("/qr", (_req: Request, res: Response) => {
    if (!baileysService) {
      return res.status(400).json({ ok: false, error: "Serviço Baileys não configurado." });
    }
    return res.json({ ok: true, ...baileysService.getStatus() });
  });

  /**
   * Inicializar Pareamento por QR Code
   */
  router.post("/connect", async (_req: Request, res: Response) => {
    if (!baileysService) {
      return res.status(400).json({ ok: false, error: "Serviço Baileys não configurado." });
    }
    await baileysService.init();
    return res.json({ ok: true, message: "Iniciando geração de QR Code..." });
  });

  /**
   * Desconectar do WhatsApp
   */
  router.post("/disconnect", async (_req: Request, res: Response) => {
    if (!baileysService) {
      return res.status(400).json({ ok: false, error: "Serviço Baileys não configurado." });
    }
    await baileysService.logout();
    return res.json({ ok: true, message: "WhatsApp desconectado com sucesso." });
  });

  /**
   * 1. HANDSHAKE OFICIAL DA META CLOUD API (GET /webhook)
   * A Meta chama este endpoint para validar a URL do Webhook nas configurações do aplicativo.
   */
  router.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
      console.log("Handshake do Webhook da Meta WhatsApp validado com sucesso.");
      return res.status(200).send(challenge);
    }

    console.warn("Falha de validação no token do Webhook da Meta WhatsApp.");
    return res.status(403).json({ error: "Token de verificação inválido." });
  });

  /**
   * 2. RECEPTOR DE MENSAGENS OFICIAIS DA META (POST /webhook)
   * Recebe mensagens enviadas por colaboradores via WhatsApp real.
   */
  router.post("/webhook", async (req: Request, res: Response) => {
    // A Meta exige resposta 200 rápida imediata
    res.status(200).json({ status: "received" });

    try {
      const body = req.body;
      if (body?.object === "whatsapp_business_account" && Array.isArray(body?.entry)) {
        for (const entry of body.entry) {
          for (const change of entry.changes || []) {
            const value = change.value;
            if (Array.isArray(value?.messages)) {
              for (const msg of value.messages) {
                const from = msg.from; // Número de telefone do remetente
                let userText = "";

                if (msg.type === "text") {
                  userText = msg.text?.body || "";
                } else if (msg.type === "interactive") {
                  // Respostas por botões interativos da Meta
                  userText =
                    msg.interactive?.button_reply?.title ||
                    msg.interactive?.button_reply?.id ||
                    "";
                }

                if (from && userText) {
                  await service.handleInboundMessage(from, userText);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Erro ao processar mensagem do Webhook Meta:", err);
    }
  });

  /**
   * 3. SIMULADOR E TESTES DE WHATSAPP (POST /simulate)
   * Permite testar o comportamento do WhatsApp em tempo real sem precisar de túnel ngrok.
   */
  router.post("/simulate", async (req: Request, res: Response) => {
    const parsed = SimulateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
    }

    const { phoneNumber, message, department } = parsed.data;

    try {
      const result = await service.handleInboundMessage(phoneNumber, message, department);
      return res.json({
        ok: true,
        phoneNumber,
        department,
        ...result,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * 4. DISPARO DE CONVITE ATIVO (POST /invite)
   * O sistema da empresa envia a primeira mensagem ativa ao colaborador.
   */
  router.post("/invite", async (req: Request, res: Response) => {
    const parsed = InviteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Payload inválido" });
    }

    const { phoneNumber, department } = parsed.data;
    const inviteText = service.getInvitationMessage(department);
    await service.sendWhatsAppMessage(phoneNumber, inviteText);

    return res.json({
      ok: true,
      phoneNumber,
      department,
      inviteText,
    });
  });

  /**
   * 5. LOG DE MENSAGENS ENVIADAS (GET /log)
   */
  router.get("/log", (_req: Request, res: Response) => {
    return res.json({ ok: true, logs: service.getOutboundLog() });
  });

  return router;
}
