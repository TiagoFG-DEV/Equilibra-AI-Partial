import path from 'node:path';
import fs from 'node:fs/promises';
import pino from 'pino';
import QRCode from 'qrcode';

/** Pareamento apenas: não lê mensagens nem ativa o motor legado. */
export class WhatsAppPairingService {
  private socket: any;
  private generation = 0;
  private pending: Promise<void> | null = null;
  private status = 'disconnected';
  private qr: string | null = null;
  private error: string | null = null;
  private readonly directory = path.resolve(process.cwd(), 'wa_pairing_session');

  getStatus() { return { status: this.status, qrCodeDataUrl: this.qr, error: this.error }; }

  async connect(): Promise<void> {
    if (this.pending) return this.pending;
    if (this.socket && this.status !== 'disconnected') return;
    const generation = ++this.generation;
    this.status = 'connecting'; this.error = null; this.qr = null;
    this.pending = this.open(generation).finally(() => { this.pending = null; });
    return this.pending;
  }

  private async open(generation: number) {
    try {
      // Conserva import() nativo mesmo com a compilação CommonJS do backend.
      const baileys = await (new Function('return import("@whiskeysockets/baileys")')() as Promise<any>);
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const { state, saveCreds } = await baileys.useMultiFileAuthState(this.directory);
      if (generation !== this.generation) return;
      const makeSocket = baileys.makeWASocket || baileys.default;
      const socket = makeSocket({
        auth: state, logger: pino({ level: 'silent' }),
        browser: ['Equilibra', 'Chrome', '1.0'],
        syncFullHistory: false, shouldSyncHistoryMessage: () => false,
        markOnlineOnConnect: false, connectTimeoutMs: 30000,
      });
      this.socket = socket;
      socket.ev.on('creds.update', () => {
        if (generation === this.generation) saveCreds().catch(() => { this.error = 'Não foi possível salvar a sessão.'; });
      });
      socket.ev.on('connection.update', async (update: any) => {
        if (generation !== this.generation) return;
        if (update.qr) {
          const qr = await QRCode.toDataURL(update.qr, { width: 280, margin: 2 });
          if (generation !== this.generation || this.status === 'connected') return;
          this.qr = qr; this.status = 'qr_ready';
        }
        if (update.connection === 'open') {
          this.status = 'connected'; this.qr = null; this.error = null;
        }
        if (update.connection === 'close') {
          this.status = 'disconnected'; this.qr = null; this.socket = null;
          socket.ev.removeAllListeners();
          // O WhatsApp solicita reinício depois da leitura do QR.
          if (update.lastDisconnect?.error?.output?.statusCode === 515) {
            this.pending = null;
            void this.connect();
          } else {
            this.error = 'Conexão encerrada. Clique em conectar para tentar novamente.';
          }
        }
      });
    } catch {
      if (generation !== this.generation) return;
      this.status = 'disconnected'; this.qr = null;
      this.error = 'Falha ao conectar. Verifique a rede e tente novamente.';
    }
  }

  async disconnect() {
    ++this.generation;
    const socket = this.socket;
    this.socket = null; this.status = 'disconnected'; this.qr = null; this.error = null;
    if (socket) {
      socket.ev.removeAllListeners();
      try { await socket.logout(); } catch { socket.end?.(new Error('Desconexão solicitada')); }
    }
    // Remove somente a pasta fixa, exclusiva de credenciais deste adaptador.
    await fs.rm(this.directory, { recursive: true, force: true });
  }
}
