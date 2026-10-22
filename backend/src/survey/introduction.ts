// Regra principal: texto fixo do servidor, sem depender do modelo ou do roteiro.
export const AI_INTRODUCTION = 'Olá! Sou o assistente virtual do Equilibra e utilizo inteligência artificial. Vou conversar com você sobre sua rotina de trabalho e como ela pode afetar sua saúde e bem-estar. Sua participação é voluntária e suas respostas são tratadas de forma confidencial. Esta pesquisa contribui para melhorar seu ambiente e suas condições de trabalho. Responda com sinceridade, sem informar nomes ou outros dados que identifiquem pessoas.';
export function openingMessage(privacyNotice: string): string {
  return `${AI_INTRODUCTION}\n\n${privacyNotice}\n\nResponda participar para iniciar ou sair para recusar. Você também pode enviar ajuda ou meus dados.`;
}
