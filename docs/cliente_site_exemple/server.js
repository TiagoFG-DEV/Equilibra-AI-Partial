const express = require('express');
const path = require('path');
const app = express();

const PORT = 3000;

// Servir arquivos estáticos (HTML, CSS) do diretório atual
app.use(express.static(path.join(__dirname)));

// Rotas básicas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, 'chat.html'));
});

app.listen(PORT, () => {
    console.log(`Site de Exemplo (Robótica Juvenil) rodando em http://localhost:${PORT}`);
    console.log(`Para testar, acesse http://localhost:${PORT} ou http://localhost:${PORT}/chat.html`);
});
