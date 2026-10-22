'use strict';
const form = document.getElementById('connection-form');
const key = document.getElementById('key');
const status = document.getElementById('status');
const area = document.getElementById('qr-area');
const qr = document.getElementById('qr');
const connect = document.getElementById('connect');
const disconnect = document.getElementById('disconnect');
let timer;
let busy = false;
const labels = { disconnected: 'Desconectado', connecting: 'Conectando…', qr_ready: 'Leia o QR Code no celular', connected: 'WhatsApp conectado' };
function render(data) {
  status.textContent = data.error || labels[data.status] || 'Aguardando conexão';
  area.hidden = !data.qrCodeDataUrl;
  if (data.qrCodeDataUrl && data.qrCodeDataUrl.startsWith('data:image/png;base64,')) qr.src = data.qrCodeDataUrl;
  else qr.removeAttribute('src');
  disconnect.disabled = data.status === 'disconnected';
  connect.disabled = data.status !== 'disconnected';
}
async function request(action, method = 'GET') {
  const response = await fetch('/api/whatsapp/connection/' + action, {
    method, cache: 'no-store', headers: { Authorization: 'Bearer ' + key.value.trim() }
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'Chave de acesso inválida.' : 'Não foi possível acessar a conexão. Verifique o servidor.');
  const data = await response.json(); render(data); return data;
}
async function poll() {
  clearTimeout(timer);
  try { const data = await request('status'); if (data.status !== 'disconnected') timer = setTimeout(poll, 2500); }
  catch (error) { status.textContent = error.message; connect.disabled = false; }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return; busy = true; connect.disabled = true; status.textContent = 'Preparando conexão…';
  try { await request('connect', 'POST'); await poll(); }
  catch (error) { status.textContent = error.message; connect.disabled = false; }
  finally { busy = false; }
});
disconnect.addEventListener('click', async () => {
  if (busy) return; busy = true; disconnect.disabled = true; clearTimeout(timer);
  try { await request('disconnect', 'POST'); }
  catch (error) { status.textContent = error.message; disconnect.disabled = false; }
  finally { busy = false; }
});
window.addEventListener('pagehide', () => { clearTimeout(timer); key.value = ''; });
