// Node.js 20+, somente backend: nunca exponha a chave no navegador.
export class EquilibraClient {
  constructor(baseUrl, apiKey) {
    this.base = baseUrl.replace(/\/$/, '') + '/api/v1';
    this.key = apiKey;
  }
  async request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const response = await fetch(this.base + path, {
      method, signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message || 'API indisponível');
      error.status = response.status; error.code = data.error?.code; error.requestId = data.error?.requestId;
      throw error;
    }
    return data;
  }
  createSurvey(focusId, expectedParticipants, idempotencyKey) {
    if (!idempotencyKey) throw new Error('Gere e persista uma chave por solicitação de criação');
    return this.request('/surveys', { method: 'POST', body: { focusId, expectedParticipants }, idempotencyKey });
  }
  start(cycleId, participantToken) { return this.request(`/surveys/${encodeURIComponent(cycleId)}/start`, { method: 'POST', body: { participantToken } }); }
  message(cycleId, participantToken, messageId, text) { return this.request(`/surveys/${encodeURIComponent(cycleId)}/messages`, { method: 'POST', body: { participantToken, messageId, text } }); }
  report(cycleId) { return this.request(`/surveys/${encodeURIComponent(cycleId)}/report`); }
}
