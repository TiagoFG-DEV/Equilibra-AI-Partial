(function() {
  // Encontra a tag script que carregou este arquivo para pegar os metadados
  const scripts = document.getElementsByTagName('script');
  let currentScript = null;
  
  for (let i = 0; i < scripts.length; i++) {
    if (scripts[i].src.includes('widget.js')) {
      currentScript = scripts[i];
      break;
    }
  }

  if (!currentScript) {
    console.error('SaaS Chatbot Widget: Tag script não encontrada.');
    return;
  }

  const skillKey = currentScript.getAttribute('data-skill');
  if (!skillKey) {
    console.error('SaaS Chatbot Widget: Atributo data-skill não encontrado na tag script.');
    return;
  }

  // URL do backend deduzida pela origem do próprio script
  const backendUrl = new URL(currentScript.src).origin;
  
  let botInfo = {
    name: 'Assistente',
    fallback_message: 'Desculpe, ocorreu um erro.'
  };

  let messageHistory = [];

  // ==========================================
  // MODO HEADLESS: Buscando os elementos do DOM do cliente
  // ==========================================
  const containerEl = document.querySelector('[data-saas-container]');
  const inputEl = document.querySelector('[data-saas-input]');
  const sendBtn = document.querySelector('[data-saas-send]');
  const messagesDiv = document.querySelector('[data-saas-messages]');
  
  const tplUser = document.querySelector('[data-saas-template-user]');
  const tplAi = document.querySelector('[data-saas-template-ai]');

  if (!containerEl || !inputEl || !sendBtn || !messagesDiv || !tplUser || !tplAi) {
    console.error('SaaS Chatbot Widget: Elementos "data-saas-*" obrigatórios não encontrados no HTML.');
    return;
  }

  // Ocultar os templates originais
  tplUser.style.display = 'none';
  tplAi.style.display = 'none';

  function appendMessage(role, text) {
    // Clonar o template correto de acordo com a origem da mensagem
    const template = role === 'user' ? tplUser : tplAi;
    const clone = template.cloneNode(true);
    
    // Tornar o clone visível
    clone.style.display = '';
    clone.removeAttribute('data-saas-template-user');
    clone.removeAttribute('data-saas-template-ai');
    clone.setAttribute('data-saas-message-role', role);

    // Inserir o texto onde houver a marcação data-saas-content (ou no proprio elemento pai se não tiver filho)
    const contentTarget = clone.querySelector('[data-saas-content]') || clone;
    contentTarget.innerText = text;

    messagesDiv.appendChild(clone);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return contentTarget;
  }

  // Obter informacoes do backend
  fetch(`${backendUrl}/api/widget/info?skillKey=${skillKey}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        appendMessage('assistant', data.error);
        return;
      }
      botInfo = data;
      appendMessage('assistant', `Olá! Eu sou ${botInfo.name}. Como posso ajudar?`);
      inputEl.disabled = false;
      sendBtn.disabled = false;
    })
    .catch(err => {
      appendMessage('assistant', "Erro ao conectar com o servidor.");
    });

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text) return;

    appendMessage('user', text);
    messageHistory.push({ role: 'user', content: text });
    
    inputEl.value = '';
    inputEl.disabled = true;
    sendBtn.disabled = true;

    // Adiciona o balão da IA "digitando..."
    const replyTextEl = appendMessage('assistant', '...');

    try {
      const response = await fetch(`${backendUrl}/api/widget/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillKey,
          messages: messageHistory
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        replyTextEl.innerText = errorData.error || botInfo.fallback_message;
        messageHistory.push({ role: 'assistant', content: replyTextEl.innerText });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      replyTextEl.innerText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'token') {
                fullText += parsed.chunk;
                replyTextEl.innerText = fullText;
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
              }
            } catch (e) {}
          }
        }
      }
      messageHistory.push({ role: 'assistant', content: fullText });

    } catch (e) {
      replyTextEl.innerText = botInfo.fallback_message;
      messageHistory.push({ role: 'assistant', content: botInfo.fallback_message });
    } finally {
      inputEl.disabled = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

})();
