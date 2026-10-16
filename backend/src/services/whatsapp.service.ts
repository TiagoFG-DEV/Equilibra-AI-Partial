import crypto from "node:crypto";
import type { AppEnv } from "../config/env";
import type { EquilibraService } from "./equilibra.service";

export type ConsentStatus = "PENDING" | "GRANTED" | "REFUSED" | "PAUSED";

export interface IdentityVaultRecord {
  blindIndex: string; // HMAC-SHA256 do telefone
  anonSessionId: string; // ID opaco usado na IA e nas respostas
  phoneEncrypted: string; // Apenas para despacho de volta
  department: string;
  shift: string;
  consent: ConsentStatus;
  consentDate?: string;
  lastInteractionAt: Date;
}

export interface InboundMessageResult {
  handled: boolean;
  replyText?: string;
  anonSessionId?: string;
  commandExecuted?: string;
  consentStatus?: ConsentStatus;
}

export class WhatsAppService {
  // Cofre de Identidade Isolado (Seção 17.1 do PDF)
  // Guarda apenas a correlação entre o índice cego e a sessão anônima
  private identityVault: Map<string, IdentityVaultRecord> = new Map();

  // Histórico de mensagens simuladas / disparadas para visualização no simulador
  private outboundLog: Array<{ to: string; text: string; timestamp: Date; via: "meta_api" | "simulator" }> = [];

  constructor(
    private readonly env: AppEnv,
    private readonly equilibraService: EquilibraService,
  ) {}

  /**
   * Gera o índice cego determinístico via HMAC-SHA256 (Seção 17.1 do PDF).
   * O telefone real nunca vai para o motor de IA ou domínio de respostas.
   */
  public generateBlindIndex(phoneNumber: string): string {
    const normalizedPhone = phoneNumber.replace(/\D/g, "");
    return crypto
      .createHmac("sha256", this.env.JWT_SECRET)
      .update(normalizedPhone)
      .digest("hex");
  }

  /**
   * Resolve ou registra o colaborador no cofre de identidade
   */
  public getOrCreateIdentity(
    phoneNumber: string,
    department: string = "Operações",
    shift: string = "Diurno",
  ): IdentityVaultRecord {
    const blindIndex = this.generateBlindIndex(phoneNumber);
    let record = this.identityVault.get(blindIndex);

    if (!record) {
      const anonSessionId = "anon-" + crypto.randomUUID().substring(0, 8);
      record = {
        blindIndex,
        anonSessionId,
        phoneEncrypted: phoneNumber, // mantido apenas no cofre de mensageria
        department,
        shift,
        consent: "PENDING",
        lastInteractionAt: new Date(),
      };
      this.identityVault.set(blindIndex, record);
    }

    record.lastInteractionAt = new Date();
    return record;
  }

  /**
   * Mensagem padrão de Convite Ativo e Consentimento (Seção 7.1 do PDF)
   */
  public getInvitationMessage(department: string): string {
    return (
      `Olá. Este é o canal oficial de saúde e segurança do trabalho da sua empresa em parceria com o Equilibra, ` +
      `para acompanhamento contínuo dos fatores psicossociais da Norma Regulamentadora nº 1 (NR-1) no departamento de ${department}.\n\n` +
      `Sua participação é estritamente voluntária e protegida pela LGPD. Suas respostas individuais NUNCA serão vistas por gestores ou pela empresa: ` +
      `apenas indicadores coletivos do setor são gerados, com expurgo automático das conversas.\n\n` +
      `Para iniciar, por favor responda com o número da opção desejada:\n` +
      `1. Participar da avaliação confidencial\n` +
      `2. Saber mais sobre como protegemos sua privacidade\n` +
      `3. Não participar`
    );
  }

  /**
   * Processa uma mensagem recebida via WhatsApp (seja por Webhook da Meta ou pelo Simulador)
   */
  async handleInboundMessage(
    phoneNumber: string,
    rawText: string,
    departmentFallback: string = "Operações",
  ): Promise<InboundMessageResult> {
    const record = this.getOrCreateIdentity(phoneNumber, departmentFallback);
    const text = rawText.trim();
    const lower = text.toLowerCase();

    // 1. COMANDOS PERMANENTES (Seção 7.4 do PDF)
    // Podem ser disparados a qualquer momento pelo colaborador
    if (lower === "ajuda") {
      const helpMsg =
        `Comandos permanentes disponíveis neste canal:\n\n` +
        `- "meus dados": Exibe o que a empresa cadastrou sobre sua área e turno;\n` +
        `- "apagar": Exclui sua memória individual imediatamente sob a LGPD;\n` +
        `- "pausar": Suspende convites de pesquisas por 30 dias;\n` +
        `- "sair": Revoga seu consentimento e encerra o contato definitivo;\n` +
        `- "ajuda": Reexibe estas opções.\n\n` +
        `Para suporte humano institucional com o DPO da plataforma, solicite neste canal.`;

      await this.sendWhatsAppMessage(record.phoneEncrypted, helpMsg);
      return { handled: true, replyText: helpMsg, commandExecuted: "ajuda" };
    }

    if (lower === "meus dados") {
      const dataMsg =
        `Transparência LGPD — Dados cadastrados vinculados ao seu setor:\n\n` +
        `- Departamento / Área: ${record.department}\n` +
        `- Faixa de Turno: ${record.shift}\n` +
        `- Status de Consentimento: ${record.consent}\n` +
        `- Identificador no motor de IA: Pseudonimizado (${record.anonSessionId})\n\n` +
        `Nenhum texto livre ou dado sensível pessoal é exibido no painel da empresa.`;

      await this.sendWhatsAppMessage(record.phoneEncrypted, dataMsg);
      return { handled: true, replyText: dataMsg, commandExecuted: "meus dados" };
    }

    if (lower === "apagar") {
      this.equilibraService.resetSession(record.anonSessionId, record.department);
      record.consent = "PENDING";
      const purgeMsg =
        `Direito de Eliminação Atendido (Art. 18 - LGPD):\n\n` +
        `A memória individual e todas as mensagens transitórias da sua sessão foram permanentemente excluídas dos nossos servidores. ` +
        `Seu consentimento foi reiniciado.`;

      await this.sendWhatsAppMessage(record.phoneEncrypted, purgeMsg);
      return { handled: true, replyText: purgeMsg, commandExecuted: "apagar" };
    }

    if (lower === "pausar") {
      record.consent = "PAUSED";
      const pauseMsg =
        `Os convites e mensagens de acompanhamento foram pausados temporariamente. ` +
        `Você não receberá lembretes deste ciclo. Para reativar quando quiser, basta enviar "participar".`;

      await this.sendWhatsAppMessage(record.phoneEncrypted, pauseMsg);
      return { handled: true, replyText: pauseMsg, commandExecuted: "pausar" };
    }

    if (lower === "sair") {
      record.consent = "REFUSED";
      const exitMsg =
        `Seu consentimento foi revogado com sucesso e o tratamento de dados foi encerrado. ` +
        `Você não receberá novas mensagens. Agradecemos pela sua atenção.`;

      await this.sendWhatsAppMessage(record.phoneEncrypted, exitMsg);
      return { handled: true, replyText: exitMsg, commandExecuted: "sair" };
    }

    // 2. FLUXO DE CONSENTIMENTO INICIAL (Seção 7.1 do PDF)
    if (record.consent === "PENDING" || record.consent === "PAUSED") {
      if (lower === "1" || lower.includes("participar") || lower === "sim") {
        record.consent = "GRANTED";
        record.consentDate = new Date().toISOString();

        // O colaborador consentiu: a IA agora toma a iniciativa e faz a primeira pergunta da NR-1
        const aiStart = this.equilibraService.startConversationByAI(record.anonSessionId, record.department);
        const reply =
          `Consentimento registrado com sucesso.\n\n` +
          aiStart.reply;

        await this.sendWhatsAppMessage(record.phoneEncrypted, reply);
        return { handled: true, replyText: reply, consentStatus: "GRANTED" };
      } else if (lower === "2" || lower.includes("saber mais") || lower.includes("privacidade")) {
        const privacyDetails =
          `Como protegemos sua privacidade:\n\n` +
          `1. O RH nunca vê o que você escreveu nem quem você é;\n` +
          `2. As notas só são publicadas em grupos de no mínimo 5 pessoas (k-anonimato);\n` +
          `3. Os relatos individuais são expurgados da memória após a compilação do relatório coletivo;\n` +
          `4. A qualquer momento você pode usar os comandos "meus dados" ou "apagar".\n\n` +
          `Deseja iniciar sua avaliação?\n` +
          `Responda "1" para Participar ou "3" para Não participar.`;

        await this.sendWhatsAppMessage(record.phoneEncrypted, privacyDetails);
        return { handled: true, replyText: privacyDetails, consentStatus: "PENDING" };
      } else if (lower === "3" || lower.includes("não participar") || lower.includes("recusar")) {
        record.consent = "REFUSED";
        const refuseMsg =
          `Respeitamos sua decisão. Seu registro foi marcado como recusa e você não receberá mais mensagens sobre este ciclo. ` +
          `Caso queira participar em outro momento, basta enviar "participar".`;

        await this.sendWhatsAppMessage(record.phoneEncrypted, refuseMsg);
        return { handled: true, replyText: refuseMsg, consentStatus: "REFUSED" };
      } else {
        // Envia o convite inicial se não escolheu uma das 3 opções
        const invite = this.getInvitationMessage(record.department);
        await this.sendWhatsAppMessage(record.phoneEncrypted, invite);
        return { handled: true, replyText: invite, consentStatus: "PENDING" };
      }
    }

    if (record.consent === "REFUSED") {
      if (lower.includes("participar") || lower === "1") {
        record.consent = "GRANTED";
        record.consentDate = new Date().toISOString();
        const aiStart = this.equilibraService.startConversationByAI(record.anonSessionId, record.department);
        await this.sendWhatsAppMessage(record.phoneEncrypted, aiStart.reply);
        return { handled: true, replyText: aiStart.reply, consentStatus: "GRANTED" };
      }
      return {
        handled: true,
        replyText: `Seu canal está desativado por opção anterior. Para participar novamente, envie "participar".`,
      };
    }

    // 3. FLUXO REGULAR DE CONVERSA COM A IA DA NR-1 (Consentimento Ativo)
    const result = await this.equilibraService.processUserMessage(
      record.anonSessionId,
      record.department,
      text,
    );

    await this.sendWhatsAppMessage(record.phoneEncrypted, result.reply);
    return {
      handled: true,
      replyText: result.reply,
      anonSessionId: record.anonSessionId,
    };
  }

  private baileysService?: any;

  public setBaileysService(baileys: any) {
    this.baileysService = baileys;
  }

  /**
   * Envia uma mensagem via WhatsApp.
   * 1. Se o WhatsApp estiver conectado via Baileys (QR Code), envia diretamente pelo socket do aparelho.
   * 2. Se as credenciais da Meta Cloud API estiverem configuradas no .env, faz a requisição oficial via Graph API.
   * 3. Caso contrário, registra no log para o simulador web.
   */
  public async sendWhatsAppMessage(toPhone: string, text: string): Promise<boolean> {
    // 1. Prioriza envio via Baileys se o celular estiver conectado
    if (this.baileysService && this.baileysService.getStatus().status === "connected") {
      this.outboundLog.push({ to: toPhone, text, timestamp: new Date(), via: "meta_api" });
      return this.baileysService.sendMessage(toPhone, text);
    }

    const hasMetaCreds = Boolean(
      this.env.WHATSAPP_PHONE_NUMBER_ID && this.env.WHATSAPP_ACCESS_TOKEN,
    );

    if (hasMetaCreds) {
      try {
        const url = `https://graph.facebook.com/${this.env.WHATSAPP_API_VERSION}/${this.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
        const payload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: toPhone.replace(/\D/g, ""),
          type: "text",
          text: { preview_url: false, body: text },
        };

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.env.WHATSAPP_ACCESS_TOKEN}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error("Erro na API da Meta WhatsApp:", res.status, errText);
        }

        this.outboundLog.push({ to: toPhone, text, timestamp: new Date(), via: "meta_api" });
        return res.ok;
      } catch (err) {
        console.error("Exceção ao enviar para Meta WhatsApp API:", err);
      }
    }

    // Fallback gracioso para modo simulador
    this.outboundLog.push({ to: toPhone, text, timestamp: new Date(), via: "simulator" });
    return true;
  }

  public getOutboundLog() {
    return this.outboundLog;
  }
}
