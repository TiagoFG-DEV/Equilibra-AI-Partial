// Regra principal: texto fixo do servidor, sem depender do modelo ou do roteiro.
export const AI_INTRODUCTION = 'Olá! Sou o assistente virtual do Equilibra e utilizo inteligência artificial. Vou conversar com você sobre como é sua rotina de trabalho, em uma pesquisa para ajudar a identificar o que pode melhorar no ambiente de trabalho. Sua participação é voluntária.';
export function openingMessage(privacyNotice: string): string {
  return `${AI_INTRODUCTION}\n\n${privacyNotice}\n\nResponda participar para iniciar ou sair para recusar. Você também pode enviar ajuda ou meus dados.`;
}
