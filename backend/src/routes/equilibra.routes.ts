import { Router, Request, Response } from "express";
import { z } from "zod";
import type { EquilibraService } from "../services/equilibra.service";

const MessageBodySchema = z.object({
  sessionId: z.string().min(1).default("colaborador-1"),
  department: z.string().min(1).default("Operações"),
  message: z.string(),
});

const ResetBodySchema = z.object({
  sessionId: z.string().min(1),
  department: z.string().optional().default("Operações"),
});

const ConsolidateBodySchema = z.object({
  department: z.string().min(1).default("Operações"),
});

export function equilibraRouter(service: EquilibraService): Router {
  const router = Router();

  // Iniciar conversa ativamente pela IA (sem o usuário precisar falar nada)
  router.post("/start", (req: Request, res: Response) => {
    const { sessionId = "colab-1", department = "Operações" } = req.body || {};
    try {
      const response = service.startConversationByAI(sessionId, department);
      return res.json({
        ok: true,
        sessionId,
        department,
        ...response,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao iniciar conversa";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Envio de mensagem no chat da NR-1
  router.post("/message", async (req: Request, res: Response) => {
    const parseResult = MessageBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Payload inválido", details: parseResult.error.flatten() });
    }

    const { sessionId, department, message } = parseResult.data;

    try {
      const response = await service.processUserMessage(sessionId, department, message);
      return res.json({
        ok: true,
        sessionId,
        department,
        ...response,
      });
    } catch (e) {
      console.error("Erro no processamento da mensagem do Equilibra:", e);
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Reiniciar a sessão de um colaborador
  router.post("/reset", (req: Request, res: Response) => {
    const parseResult = ResetBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Payload inválido" });
    }

    const { sessionId, department } = parseResult.data;
    const session = service.resetSession(sessionId, department);
    return res.json({ ok: true, session });
  });

  // Consultar contagem de participantes acumulados no ciclo
  router.get("/status", (req: Request, res: Response) => {
    const department = (req.query.department as string) || "Operações";
    const count = service.getDepartmentSessionsCount(department);
    return res.json({
      department,
      activeSessionsCount: count,
      kAnonymityStatus: count >= 2 ? "Atingido para consolidação" : "Aguardando mais participantes (mínimo 2)",
    });
  });

  // Consolidar ciclo do departamento, extrair dados coletivos e expurgar registros
  router.post("/consolidate", async (req: Request, res: Response) => {
    const parseResult = ConsolidateBodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Departamento é obrigatório" });
    }

    const { department } = parseResult.data;

    try {
      const report = await service.consolidateDepartmentAndPurge(department);
      return res.json({
        ok: true,
        report,
      });
    } catch (e) {
      console.error("Erro ao consolidar departamento:", e);
      const msg = e instanceof Error ? e.message : "Erro ao consolidar";
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // Listar relatórios consolidados gerados
  router.get("/reports", (_req: Request, res: Response) => {
    const reports = service.getConsolidatedReports();
    return res.json({ ok: true, reports });
  });

  return router;
}
