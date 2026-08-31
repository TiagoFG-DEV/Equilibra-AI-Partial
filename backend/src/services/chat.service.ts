import { evaluateDomainGate, type SkillDefinition } from "@model/core";
import type { AIProvider, ChatMessage } from "../providers/ai-provider.types";
import { buildSystemPrompt } from "./prompt-builder";
import type { SkillLoader } from "./skill-loader";

export type ChatRequest = {
  skillKey: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  stream?: boolean;
};

export type ChatResult =
  | { ok: true; content: string; blocked: false }
  | { ok: true; content: string; blocked: true; reason: string }
  | { ok: false; error: string };

export class ChatService {
  constructor(
    private readonly skills: SkillLoader,
    private readonly provider: AIProvider,
  ) {}

  private lastUserMessage(messages: ChatRequest["messages"]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return messages[i].content;
    }
    return null;
  }

  async complete(req: ChatRequest): Promise<ChatResult> {
    const skill = await this.skills.load(req.skillKey);
    if (!skill) {
      return { ok: false, error: "Skill não encontrada" };
    }

    const lastUser = this.lastUserMessage(req.messages);
    if (!lastUser) {
      return { ok: false, error: "Mensagem do usuário ausente" };
    }

    const gate = evaluateDomainGate(lastUser, skill);
    if (!gate.allowed) {
      return {
        ok: true,
        content: skill.fallback_message,
        blocked: true,
        reason: gate.reason,
      };
    }

    const system: ChatMessage = { role: "system", content: buildSystemPrompt(skill) };
    const history: ChatMessage[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const options = {
      temperature: skill.limits?.temperature,
      maxTokens: skill.limits?.max_tokens,
    };

    try {
      const content = await this.provider.chat([system, ...history], options);
      return { ok: true, content, blocked: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro no provider";
      return { ok: false, error: msg };
    }
  }

  async *stream(req: ChatRequest): AsyncGenerator<string, void, void> {
    const skill = await this.skills.load(req.skillKey);
    if (!skill) {
      throw new Error("Skill não encontrada");
    }

    const lastUser = this.lastUserMessage(req.messages);
    if (!lastUser) {
      throw new Error("Mensagem do usuário ausente");
    }

    const gate = evaluateDomainGate(lastUser, skill);
    if (!gate.allowed) {
      yield skill.fallback_message;
      return;
    }

    const system: ChatMessage = { role: "system", content: buildSystemPrompt(skill) };
    const history: ChatMessage[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const options = {
      temperature: skill.limits?.temperature,
      maxTokens: skill.limits?.max_tokens,
    };

    for await (const chunk of this.provider.stream([system, ...history], options)) {
      yield chunk;
    }
  }
}
