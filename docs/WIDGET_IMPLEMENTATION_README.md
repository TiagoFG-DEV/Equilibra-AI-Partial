# Manual de Implementação: Widget SaaS Headless

Este guia explica como integrar o chatbot do MODEL em qualquer site usando o modo **Headless**. 

## 1. O que é o modo Headless?
Diferente de widgets comuns, nós não impomos um design. Você cria o HTML e o CSS do seu chat, e nosso script apenas injeta a lógica.

## 2. Como integrar

### Passo 1: Importar o Script
Adicione a tag script no final do seu `<body>`, especificando a **skill** desejada.

```html
<script src="http://localhost:4000/widget.js" data-skill="sua-skill-aqui"></script>
```

### Passo 2: Marcar o seu HTML
O script precisa saber onde estão os elementos. Use os atributos `data-saas-*`:

1.  **`data-saas-container`**: O elemento pai que envolve todo o chat.
2.  **`data-saas-messages`**: Onde as mensagens serão injetadas.
3.  **`data-saas-input`**: O campo de texto (`<input>` ou `<textarea>`).
4.  **`data-saas-send`**: O botão de enviar.

### Passo 3: Criar os Templates
Dentro do container de mensagens, você deve criar dois "esqueletos" que servirão de modelo para as mensagens:

```html
<!-- Template para mensagem do USUÁRIO -->
<div data-saas-template-user style="display:none">
    <div data-saas-content></div> <!-- O texto entrará aqui -->
</div>

<!-- Template para mensagem da IA -->
<div data-saas-template-ai style="display:none">
    <div data-saas-content></div> <!-- O texto entrará aqui -->
</div>
```

## 3. Atributos Disponíveis

| Atributo | Descrição |
|----------|-----------|
| `data-saas-container` | Container principal do chat. |
| `data-saas-messages` | Área onde as mensagens novas serão inseridas. |
| `data-saas-input` | Campo de entrada de texto (desabilitado automaticamente até o bot carregar). |
| `data-saas-send` | Botão de envio (desabilitado automaticamente até o bot carregar). |
| `data-saas-template-user` | Template HTML para a mensagem enviada pelo usuário. |
| `data-saas-template-ai` | Template HTML para a mensagem enviada pela IA. |
| `data-saas-content` | Onde o texto da mensagem será inserido dentro dos templates. |

## 4. Personalização Total
Como o bot usa o seu próprio HTML, você pode usar **qualquer framework CSS** (Tailwind, Bootstrap, ou CSS Puro) para estilizar os balões, cores e animações.

---
*Dica: Veja os exemplos em `/cliente_site_exemple`, `/cliente_culinaria_example` e `/cliente_mecanica_example` para ver implementações com estilos completamente diferentes.*
