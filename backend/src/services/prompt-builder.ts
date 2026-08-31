import type { SkillDefinition } from "@model/core";

/**
 * Monta o system prompt a partir da skill (CD do agente).
 * Inclui guardrails de tom e proibições pedidas no MODEL.
 */
export function buildSystemPrompt(skill: SkillDefinition): string {
  const tone = skill.tone?.style ?? "claro e direto, humano sem parecer robô";
  const depth = skill.behavior?.depth ?? "balanced";
  const rules = skill.response_rules.length
    ? skill.response_rules.map((r) => `- ${r}`).join("\n")
    : "- Seja objetivo e útil; evite enrolação.";

  const styleBlock = [
    "Estilo de resposta (Síntese Técnica Prioritária):",
    "- Seja extretamente objetivo e útil; evite qualquer tipo de enrolação introdutória.",
    "- Entregue as informações técnicas e os detalhes profundos PRIMEIRO, de forma sintetizada.",
    "- Natural e humano, sem linguagem robótica, porém focado em velocidade de leitura.",
    "- Se não tiver certeza, NÃO INVENTE. Use sua ferramenta de busca na web para extrair a informação real ou diga que não sabe.",
  ].join("\n");

  const domainBlock = [
    "Domínio (Especialização):",
    `- Você é: ${skill.role}`,
    `- Especialização: ${skill.description}`,
    `- Tópicos permitidos (âncoras): ${skill.allowed_topics.join(", ") || "(definidos pela skill)"}`,
    skill.blocked_topics.length
      ? `- Nunca aborde ou aconselhe sobre: ${skill.blocked_topics.join(", ")}`
      : "",
    skill.behavior?.refuse_out_of_domain
      ? "- Se a pergunta estiver fora do domínio acima, recuse de forma EDUCADA, HUMANIZADA e VARIADA. Nunca use uma frase padrão robótica. Explique brevemente o motivo de não poder responder."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const standardActionsBlock = [
    "Ações Padrão de Interação Humana (Sempre Permitidas):",
    "- Responda naturalmente a saudações humanas (ex: Bom dia, Como vai, Hello world).",
    "- Responda a perguntas sobre a sua identidade reforçando o seu papel e especialização.",
    "- Você tem total permissão para acatar pedidos de formatação de texto (ex: 'resuma isso', 'seja mais objetivo', 'detalhe mais', 'explique de outra forma').",
    "- IMPORTANTE: Esta flexibilidade para formatação e educação não anula as regras de restrição de temas. Assuntos totalmente desconexos do domínio ainda devem ser recusados de forma humanizada.",
  ].join("\n");

  const searchBlock = [
    "Pesquisa na Web / Ferramentas:",
    "- Você DEVE usar sua ferramenta de BUSCA NA WEB (Google Search) se não souber a resposta ou se precisar investigar se um assunto ambíguo tem relação com a sua área.",
    "- Após pesquisar, processe a informação: se fizer parte do seu domínio ou for assunto humano, responda de forma técnica. Se a pesquisa confirmar que é um assunto fora da área (como política, fofoca, etc.), recuse humanizadamente.",
  ].join("\n");

  return [
    `# ${skill.name}`,
    "",
    "## Identidade",
    skill.prompt,
    skill.internal_instructions ? `\n### Instruções internas\n${skill.internal_instructions}` : "",
    "",
    "## Tom",
    `Tom desejado: ${tone}. Profundidade: ${depth}.`,
    styleBlock,
    "",
    "## Regras de resposta",
    rules,
    "",
    domainBlock,
    standardActionsBlock,
    searchBlock,
    "",
    "## Formato Obrigatório",
    "- Responda preferencialmente em tópicos curtos (bullet-points).",
    "- Evite respostas longas em formato de livro. Vá direto aos dados técnicos essenciais.",
    skill.response_style?.max_paragraphs
      ? `Limite absoluto: até ${skill.response_style.max_paragraphs} parágrafos curtos.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
