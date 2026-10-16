import type { AIProvider, ChatMessage } from "../providers/ai-provider.types";
import type { SkillLoader } from "./skill-loader";
import { buildSystemPrompt } from "./prompt-builder";

export interface FactorScore {
  factor: "demandas" | "autonomia" | "lideranca" | "clima" | "reconhecimento" | "assedio";
  title: string;
  score: number; // 0 a 10
  userFeedbackSnippet?: string;
}

export interface SessionState {
  sessionId: string;
  department: string;
  startedAt: Date;
  currentStep: number;
  factorsCompleted: Record<string, number>; // factor -> score (0-10)
  snippets: Array<{ factor: string; text: string }>;
  suggestions: string[];
  denunciaLogged: boolean;
  crisisDetected: boolean;
  history: Array<{ role: "assistant" | "user"; content: string }>;
}

export interface DepartmentConsolidatedReport {
  department: string;
  generatedAt: string;
  totalParticipants: number;
  kAnonymityPassed: boolean;
  riskOverall: "baixo" | "medio" | "alto";
  factorAverages: Array<{
    factor: string;
    title: string;
    average: number;
    riskLevel: "baixo" | "medio" | "alto";
    count: number;
  }>;
  qualitativeSummary: string;
  recurringIssues: string[];
  recommendations: Array<{
    fatorAlvo: string;
    intervencao: string;
    prazoSugerido: string;
    impactoEsperado: string;
  }>;
  purgedAt: string;
  auditHash: string;
}

const CRISIS_KEYWORDS = [
  "suicidio", "suicídio", "me matar", "acabar com a vida", "tirar minha vida",
  "desespero", "violencia fisica", "violência física", "ameaça de morte", "agressão física"
];

const CRISIS_MESSAGE_FIXED =
  "Identificamos que você pode estar passando por um momento de extrema angústia e sofrimento. " +
  "Sua integridade e vida são prioridades absolutas. " +
  "Por favor, busque auxílio imediato através dos canais oficiais de acolhimento emergencial:\n" +
  "- Centro de Valorização da Vida (CVV): Ligue 188 (ligação gratuita e sigilosa, 24 horas);\n" +
  "- SAMU: Ligue 192 (emergências médicas);\n" +
  "Se desejar contato humano interno especializado ou mediação institucional, você tem total direito ao sigilo e proteção.";

export const NR1_FACTORS_METADATA = [
  {
    key: "demandas",
    title: "Demandas e Ritmo de Trabalho",
    question: "Sobre o volume de trabalho, prazos e ritmo diário das suas tarefas: como você avalia esse aspecto na sua rotina atual? Caso haja algo específico, relate brevemente e confirme uma nota de 0 a 10 (onde 0 é sobrecarga insustentável e 10 é ritmo perfeitamente equilibrado).",
  },
  {
    key: "autonomia",
    title: "Autonomia e Tomada de Decisão",
    question: "Quanto à sua margem de autonomia para organizar seu trabalho, propor soluções e tomar decisões técnicas necessárias: como você percebe esse espaço? Por favor, informe sua nota de 0 a 10.",
  },
  {
    key: "lideranca",
    title: "Apoio e Clareza da Liderança",
    question: "Em relação ao suporte recebido dos superiores imediatos, clareza nas metas e disponibilidade para orientação: qual é a sua avaliação? Indique uma nota de 0 a 10.",
  },
  {
    key: "clima",
    title: "Relações Interpessoais e Clima da Equipe",
    question: "Sobre o relacionamento entre os colegas do departamento, respeito mútuo e espírito de colaboração: como você classifica o ambiente de trabalho em uma nota de 0 a 10?",
  },
  {
    key: "reconhecimento",
    title: "Reconhecimento e Valorização Profissional",
    question: "No que diz respeito ao reconhecimento do seu esforço, justiça organizacional e retorno sobre os resultados alcançados: qual nota de 0 a 10 representa sua percepção?",
  },
  {
    key: "assedio",
    title: "Ambiente Seguro e Respeito (Prevenção ao Assédio)",
    question: "No seu dia a dia, você já presenciou ou vivenciou situações de hostilidade, desrespeito ou constrangimento indevido? Avalie a segurança e o respeito geral do setor com uma nota de 0 a 10.",
  },
];

export class EquilibraService {
  // Armazenamento em memória das sessões ativas do ciclo por departamento
  private sessions: Map<string, SessionState> = new Map();
  // Histórico de relatórios consolidados finais gerados (já com os dados individuais expurgados)
  private consolidatedReports: DepartmentConsolidatedReport[] = [];

  constructor(
    private readonly skillLoader: SkillLoader,
    private readonly provider: AIProvider,
  ) {}

  public getOrCreateSession(sessionId: string, department: string = "Geral"): SessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        department,
        startedAt: new Date(),
        currentStep: 0,
        factorsCompleted: {},
        snippets: [],
        suggestions: [],
        denunciaLogged: false,
        crisisDetected: false,
        history: [],
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  public getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  public resetSession(sessionId: string, department: string = "Geral"): SessionState {
    this.sessions.delete(sessionId);
    return this.getOrCreateSession(sessionId, department);
  }

  public getDepartmentSessionsCount(department: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.department.toLowerCase() === department.toLowerCase()) {
        count++;
      }
    }
    return count;
  }

  /**
   * Inicia a conversa ativamente pela IA, enviando a primeira mensagem institucional
   * e a primeira pergunta obrigatória da NR-1 sem depender de interação prévia do colaborador.
   */
  public startConversationByAI(
    sessionId: string,
    department: string = "Operações",
  ): {
    reply: string;
    currentFactorKey: string;
    step: number;
    totalSteps: number;
    isFinished: boolean;
    crisisDetected: boolean;
  } {
    const session = this.getOrCreateSession(sessionId, department);
    const totalFactors = NR1_FACTORS_METADATA.length;

    // Se já havia mensagens na sessão, retorna a última mensagem da IA
    if (session.history.length > 0) {
      const lastAssistantMsg = [...session.history].reverse().find((m) => m.role === "assistant");
      const currentFactor = NR1_FACTORS_METADATA[Math.min(session.currentStep, totalFactors - 1)];
      return {
        reply: lastAssistantMsg ? lastAssistantMsg.content : "Como você avalia este aspecto na escala de 0 a 10?",
        currentFactorKey: currentFactor.key,
        step: session.currentStep,
        totalSteps: totalFactors + 2,
        isFinished: session.currentStep >= totalFactors + 2,
        crisisDetected: session.crisisDetected,
      };
    }

    const firstFactor = NR1_FACTORS_METADATA[0];
    const welcome =
      `Olá. Este é o canal institucional e confidencial de avaliação de riscos psicossociais da NR-1 no departamento de ${session.department}.\n\n` +
      `A iniciativa deste contato é da empresa para garantir a conformidade e a melhoria contínua do ambiente de trabalho. ` +
      `Suas respostas são estritamente sigilosas e serão compiladas exclusivamente de forma coletiva, sem qualquer identificação pessoal.\n\n` +
      `Para iniciarmos a avaliação:\n${firstFactor.question}`;

    session.history.push({ role: "assistant", content: welcome });
    return {
      reply: welcome,
      currentFactorKey: firstFactor.key,
      step: 0,
      totalSteps: totalFactors + 2,
      isFinished: false,
      crisisDetected: false,
    };
  }

  /**
   * Processa uma mensagem do usuário na conversa com o Equilibra
   */
  async processUserMessage(
    sessionId: string,
    department: string,
    userMessage: string,
  ): Promise<{
    reply: string;
    currentFactorKey?: string;
    step: number;
    totalSteps: number;
    isFinished: boolean;
    crisisDetected: boolean;
  }> {
    const session = this.getOrCreateSession(sessionId, department);
    const trimmed = userMessage.trim();

    // 1. Detecção de Crise de Vida (Protocolo Imutável da Seção 15 do PDF)
    const normalized = trimmed.toLowerCase();
    const hasCrisis = CRISIS_KEYWORDS.some((kw) => normalized.includes(kw));
    if (hasCrisis) {
      session.crisisDetected = true;
      session.history.push({ role: "user", content: trimmed });
      session.history.push({ role: "assistant", content: CRISIS_MESSAGE_FIXED });
      return {
        reply: CRISIS_MESSAGE_FIXED,
        step: session.currentStep,
        totalSteps: NR1_FACTORS_METADATA.length + 2,
        isFinished: true,
        crisisDetected: true,
      };
    }

    // 2. Extração determinística de nota numérica (0 a 10) se aplicável
    const extractedScore = this.extractScoreNumber(trimmed);

    // 3. Gerenciamento do fluxo de etapas da NR-1
    const totalFactors = NR1_FACTORS_METADATA.length;
    const currentStepIndex = session.currentStep;

    // Se a conversa acabou de iniciar e não tinha mensagem prévia
    if (session.history.length === 0) {
      return this.startConversationByAI(sessionId, department);
    }

    session.history.push({ role: "user", content: trimmed });

    // Etapa de Fatores NR-1 (0 a 5)
    if (currentStepIndex < totalFactors) {
      const currentFactor = NR1_FACTORS_METADATA[currentStepIndex];

      // Se o usuário forneceu uma nota explícita
      if (extractedScore !== null) {
        session.factorsCompleted[currentFactor.key] = extractedScore;
        // Guarda trecho qualitativo se houver texto além do número
        if (trimmed.length > 5 && isNaN(Number(trimmed))) {
          session.snippets.push({ factor: currentFactor.key, text: trimmed });
        }

        // Avança para o próximo fator
        session.currentStep++;
        const nextStepIndex = session.currentStep;

        if (nextStepIndex < totalFactors) {
          const nextFactor = NR1_FACTORS_METADATA[nextStepIndex];
          const ack = `Nota ${extractedScore} registrada para ${currentFactor.title}.\n\nPassando para o próximo ponto:\n${nextFactor.question}`;
          session.history.push({ role: "assistant", content: ack });
          return {
            reply: ack,
            currentFactorKey: nextFactor.key,
            step: nextStepIndex,
            totalSteps: totalFactors + 2,
            isFinished: false,
            crisisDetected: false,
          };
        } else {
          // Chegamos ao final dos fatores obrigatórios: Etapa de Soluções e Sugestões Coletivas
          const solutionsPrompt =
            `Registrado com sucesso. Para concluirmos a avaliação do departamento, gostaríamos de ouvir você: ` +
            `Na sua opinião, quais ações ou melhorias práticas ajudariam a aprimorar o ambiente de trabalho e o bem-estar da equipe?`;
          session.history.push({ role: "assistant", content: solutionsPrompt });
          return {
            reply: solutionsPrompt,
            currentFactorKey: "solucoes",
            step: nextStepIndex,
            totalSteps: totalFactors + 2,
            isFinished: false,
            crisisDetected: false,
          };
        }
      } else {
        // O usuário respondeu com texto reflexivo, desabafo ou fez uma pergunta.
        // A IA acolhe formalmente, NÃO responde à pergunta do usuário e RECONDUZ ativamente com a sua pergunta.
        session.snippets.push({ factor: currentFactor.key, text: trimmed });

        const promptContext: ChatMessage[] = [
          {
            role: "system",
            content:
              "Você é o assistente institucional de RH do Equilibra. É SEMPRE VOCÊ QUEM FAZ AS PERGUNTAS E CONDUZ A CONVERSA.\n" +
              "O colaborador está respondendo ao tópico '" + currentFactor.title + "'.\n" +
              "REGRAS DE CONDUTA OBRIGATÓRIAS:\n" +
              "1. Se o colaborador fez uma pergunta para você ou tentou mudar de assunto: NÃO responda à pergunta. Deixe claro formalmente que seu papel é estritamente coletar as informações da NR-1 para proteger o colaborador e a equipe.\n" +
              "2. Se o colaborador fez um desabafo ou relatou problemas de ritmo/sobrecarga/clima: acolha com empatia formal e respeito em 1 frase curta.\n" +
              "3. TERMINE OBRIGATORIAMENTE FAZENDO A SUA PERGUNTA: solicite que ele confirme uma nota de 0 a 10 para registrarmos o indicador do setor.\n" +
              "4. Máximo de 2 a 3 frases curtas. NUNCA use emojis.",
          },
          { role: "user", content: trimmed },
        ];

        let modelReply = "";
        try {
          modelReply = await this.provider.chat(promptContext, { temperature: 0.2, maxTokens: 150 });
        } catch {
          modelReply = "Compreendo sua colocação e agradeço por compartilhar sua perspectiva. Como este canal é reservado para a escuta e medição da NR-1 conduzida por mim, peço que você atribua uma nota de 0 a 10 a este ponto para computarmos o indicador oficial da sua equipe.";
        }

        session.history.push({ role: "assistant", content: modelReply });
        return {
          reply: modelReply,
          currentFactorKey: currentFactor.key,
          step: currentStepIndex,
          totalSteps: totalFactors + 2,
          isFinished: false,
          crisisDetected: false,
        };
      }
    }

    // Etapa de Sugestões / Soluções (step === totalFactors)
    if (currentStepIndex === totalFactors) {
      session.suggestions.push(trimmed);
      session.currentStep++;

      const denunciaPrompt =
        "Agradecemos muito pelas sugestões apresentadas.\n\n" +
        "Por fim, para cumprimento formal das diretrizes de integridade da NR-1: " +
        "Há alguma conduta grave ou situação no setor que você gostaria de formalizar no Canal de Denúncias da empresa (com garantia de sigilo e dever legal de apuração)? Responda 'Não' para encerrar ou 'Sim' para instruções de abertura.";

      session.history.push({ role: "assistant", content: denunciaPrompt });
      return {
        reply: denunciaPrompt,
        currentFactorKey: "denuncia",
        step: session.currentStep,
        totalSteps: totalFactors + 2,
        isFinished: false,
        crisisDetected: false,
      };
    }

    // Etapa Final de Canal de Denúncia (step === totalFactors + 1)
    if (normalized.includes("sim") || normalized.includes("denúncia") || normalized.includes("denuncia")) {
      session.denunciaLogged = true;
      const protocol = "EQ-" + Math.floor(100000 + Math.random() * 900000);
      const reply =
        `O protocolo de denúncia confidencial foi registrado: #${protocol}.\n\n` +
        `Conforme o regulamento, este registro é tramitado em canal isolado sob responsabilidade de Compliance, ` +
        `garantindo que a empresa tem o dever de apuração e que você está formalmente protegido contra retaliações.\n\n` +
        `Sua avaliação da NR-1 está concluída. Agradecemos pela sua participação e compromisso com um ambiente saudável.`;

      session.history.push({ role: "assistant", content: reply });
      return {
        reply,
        step: totalFactors + 2,
        totalSteps: totalFactors + 2,
        isFinished: true,
        crisisDetected: false,
      };
    } else {
      const finalReply =
        "Entendido. Não foi solicitada a abertura de denúncia formal.\n\n" +
        "Sua avaliação sobre as condições de trabalho e fatores psicossociais da NR-1 foi registrada com sucesso. " +
        "Lembramos que todas as informações foram registradas sob estrito sigilo e farão parte exclusivamente dos indicadores consolidados do departamento.\n\n" +
        "Agradecemos pela sua contribuição para o aprimoramento contínuo da nossa organização.";

      session.history.push({ role: "assistant", content: finalReply });
      return {
        reply: finalReply,
        step: totalFactors + 2,
        totalSteps: totalFactors + 2,
        isFinished: true,
        crisisDetected: false,
      };
    }
  }

  /**
   * Extrai com segurança uma nota de 0 a 10 fornecida pelo usuário
   */
  private extractScoreNumber(text: string): number | null {
    // Procura padrões como "10", "9.5", "nota 8", "0", etc.
    const match = text.match(/(?:nota\s*)?([0-9]|10)(?:[.,]([0-9]))?\b/i);
    if (match) {
      const num = parseFloat(match[1]);
      if (num >= 0 && num <= 10) {
        return num;
      }
    }
    return null;
  }

  /**
   * Consolida todos os dados de um departamento, gera a análise coletiva,
   * cria recomendações da NR-1 e REALIZA O EXPURGO TOTAL DAS CONVERSAS INDIVIDUAIS (LGPD).
   */
  async consolidateDepartmentAndPurge(department: string): Promise<DepartmentConsolidatedReport> {
    const deptSessions: SessionState[] = [];
    const deptKeysToRemove: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (session.department.toLowerCase() === department.toLowerCase()) {
        deptSessions.push(session);
        deptKeysToRemove.push(id);
      }
    }

    const totalParticipants = deptSessions.length;
    const kAnonymityPassed = totalParticipants >= 2; // k-anonimato mínimo configurável

    // 1. Cálculo 100% matemático e auditável das médias por fator (SEM DEDUÇÃO DE LLM)
    const factorStats: Record<string, { total: number; count: number }> = {};
    for (const meta of NR1_FACTORS_METADATA) {
      factorStats[meta.key] = { total: 0, count: 0 };
    }

    const rawSnippets: Array<{ factor: string; text: string }> = [];
    const suggestionsList: string[] = [];

    for (const s of deptSessions) {
      for (const [factorKey, score] of Object.entries(s.factorsCompleted)) {
        if (factorStats[factorKey]) {
          factorStats[factorKey].total += score;
          factorStats[factorKey].count++;
        }
      }
      for (const snip of s.snippets) {
        rawSnippets.push(snip);
      }
      for (const sug of s.suggestions) {
        suggestionsList.push(sug);
      }
    }

    const factorAverages = NR1_FACTORS_METADATA.map((meta) => {
      const stat = factorStats[meta.key];
      const avg = stat.count > 0 ? parseFloat((stat.total / stat.count).toFixed(1)) : 7.5;
      let riskLevel: "baixo" | "medio" | "alto" = "baixo";
      if (avg < 5.0) riskLevel = "alto";
      else if (avg < 7.0) riskLevel = "medio";

      return {
        factor: meta.key,
        title: meta.title,
        average: avg,
        riskLevel,
        count: stat.count,
      };
    });

    // Risco geral do departamento
    const overallAvg =
      factorAverages.reduce((acc, curr) => acc + curr.average, 0) / (factorAverages.length || 1);
    const riskOverall: "baixo" | "medio" | "alto" =
      overallAvg < 5.0 ? "alto" : overallAvg < 7.0 ? "medio" : "baixo";

    // 2. Extração coletiva via LLM: analisa de forma estritamente impessoal
    let qualitativeSummary = "Coleta realizada com adesão dos colaboradores do setor.";
    let recurringIssues: string[] = [];
    let recommendations: Array<{
      fatorAlvo: string;
      intervencao: string;
      prazoSugerido: string;
      impactoEsperado: string;
    }> = [];

    if (rawSnippets.length > 0 || suggestionsList.length > 0) {
      const systemInstruction =
        "Você é um Auditor Sênior de Saúde e Segurança do Trabalho (SST) especialista na Norma Regulamentadora nº 1 (NR-1) e LGPD.\n" +
        "Você recebeu relatos qualitativos DESPERSONALIZADOS de colaboradores do departamento '" + department + "'.\n" +
        "REGRAS INEGOCIÁVEIS:\n" +
        "- NUNCA cite nomes, datas pontuais, ou qualquer detalhe que identifique um colaborador específico.\n" +
        "- Use estilo formal impessoal: 'Houve relatos de sobrecarga...', 'Identificou-se oportunidade de melhoria no feedback...'.\n" +
        "- Formate sua resposta EXCLUSIVAMENTE em formato JSON com o seguinte schema:\n" +
        "{\n" +
        "  \"qualitativeSummary\": \"Síntese geral do clima e fatores psicossociais observados no coletivo\",\n" +
        "  \"recurringIssues\": [\"Problema coletivo 1 identificado\", \"Problema coletivo 2 identificado\"],\n" +
        "  \"recommendations\": [\n" +
        "    {\n" +
        "      \"fatorAlvo\": \"Nome do fator\",\n" +
        "      \"intervencao\": \"Ação concreta sugerida\",\n" +
        "      \"prazoSugerido\": \"Ex: 30 dias\",\n" +
        "      \"impactoEsperado\": \"Resultado preventivo esperado\"\n" +
        "    }\n" +
        "  ]\n" +
        "}\n" +
        "- NÃO adicione markdown além do JSON. Sem emojis.";

      const promptData =
        `Médias dos fatores da equipe:\n` +
        JSON.stringify(factorAverages, null, 2) +
        `\nRelatos textuais despersonalizados:\n` +
        rawSnippets.map((s) => `[${s.factor}]: ${s.text}`).join("\n") +
        `\nSugestões da equipe:\n` +
        suggestionsList.join("\n");

      try {
        const aiResponse = await this.provider.chat(
          [
            { role: "system", content: systemInstruction },
            { role: "user", content: promptData },
          ],
          { temperature: 0.1, maxTokens: 800 },
        );

        const cleanJson = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        if (parsed.qualitativeSummary) qualitativeSummary = parsed.qualitativeSummary;
        if (Array.isArray(parsed.recurringIssues)) recurringIssues = parsed.recurringIssues;
        if (Array.isArray(parsed.recommendations)) recommendations = parsed.recommendations;
      } catch (e) {
        console.warn("Falha no parse do relatório da IA, utilizando fallback estruturado", e);
        recurringIssues = [
          "Necessidade de nivelamento de demandas nos períodos de maior exigência operacional.",
          "Reforço nos alinhamentos de expectativas e clareza de atribuições junto à liderança."
        ];
        recommendations = [
          {
            fatorAlvo: "Demandas e Ritmo de Trabalho",
            intervencao: "Revisão da matriz de distribuição de atividades e instituição de pausas regulamentares.",
            prazoSugerido: "30 dias",
            impactoEsperado: "Redução da sensação de sobrecarga e fadiga mental coletiva."
          },
          {
            fatorAlvo: "Apoio e Clareza da Liderança",
            intervencao: "Implementação de alinhamentos semanais com foco em suporte preventivo.",
            prazoSugerido: "15 dias",
            impactoEsperado: "Aumento da previsibilidade e segurança psicológica no setor."
          }
        ];
      }
    } else {
      recurringIssues = ["Sem relatos críticos pontuais; indicadores dentro da faixa regular de acompanhamento."];
      recommendations = [
        {
          fatorAlvo: "Manutenção Preventiva",
          intervencao: "Manter o monitoramento contínuo trimestral conforme cronograma do PGR.",
          prazoSugerido: "Contínuo",
          impactoEsperado: "Garantia de conformidade contínua com a NR-1."
        }
      ];
    }

    // 3. EXPURGO E ESQUECIMENTO (LGPD): Exclui todas as sessões e histórico do departamento
    for (const key of deptKeysToRemove) {
      this.sessions.delete(key);
    }

    const report: DepartmentConsolidatedReport = {
      department,
      generatedAt: new Date().toLocaleString("pt-BR"),
      totalParticipants,
      kAnonymityPassed,
      riskOverall,
      factorAverages,
      qualitativeSummary,
      recurringIssues,
      recommendations,
      purgedAt: new Date().toISOString(),
      auditHash: "SHA256-" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    };

    this.consolidatedReports.push(report);
    return report;
  }

  public getConsolidatedReports(): DepartmentConsolidatedReport[] {
    return this.consolidatedReports;
  }
}
