// Regra principal: texto fixo do servidor, sem depender do modelo ou do roteiro.
export const AI_INTRODUCTION = 'Olá! Sou o Equilibra, um agente de inteligência artificial a serviço da sua empresa. Vou conduzir uma pesquisa com você sobre as condições de trabalho para apoiar a identificação de riscos ocupacionais. Sua participação é voluntária.';
export function openingMessage(privacyNotice: string): string {
  return `${AI_INTRODUCTION}\n\n${privacyNotice}\n\nResponda participar para iniciar ou sair para recusar. Você também pode enviar ajuda ou meus dados.`;
}
