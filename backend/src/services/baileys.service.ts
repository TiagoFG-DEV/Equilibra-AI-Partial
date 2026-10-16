import path from "node:path";
import fs from "node:fs";
import pino from "pino";
import QRCode from "qrcode";
import type { WhatsAppService } from "./whatsapp.service";

export type WhatsAppConnectionStatus = "disconnected" | "connecting" | "qr_ready" | "connected";

export class BaileysService {
  private socket: any = null;
  private qrCodeDataUrl: string | null = null;
  private rawQrCode: string | null = null;
  private status: WhatsAppConnectionStatus = "disconnected";
  private connectedPhone: string | null = null;
  private sessionDir: string;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_DELAY_MS = 60_000;

  constructor(private readonly whatsAppService: WhatsAppService) {
    this.sessionDir = path.resolve(process.cwd(), "wa_session");
  }

  public getStatus() {
    return {
      status: this.status,
      connectedPhone: this.connectedPhone,
      hasQr: Boolean(this.qrCodeDataUrl),
      qrCodeDataUrl: this.qrCodeDataUrl,
    };
  }

  /** Calcula delay exponencial com jitter para reconexão segura */
  private getReconnectDelay(): number {
    const base = Math.min(4000 * Math.pow(2, this.reconnectAttempts), this.MAX_RECONNECT_DELAY_MS);
    const jitter = Math.random() * 2000;
    return Math.floor(base + jitter);
  }

  public async init(): Promise<void> {
    try {
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }

      // Import dinâmico para compatibilidade ESM/CommonJS completa
      const baileys = await import("@whiskeysockets/baileys");

      // Resolve o nome correto da função nos diferentes builds do Baileys
      const makeWASocket: any =
        (baileys as any).makeWASocket ||
        (baileys as any).default?.makeWASocket ||
        (baileys as any).default;

      const {
        DisconnectReason,
        useMultiFileAuthState,
        fetchLatestBaileysVersion,
      } = baileys as any;

      if (typeof makeWASocket !== "function") {
        throw new Error("makeWASocket não encontrado no pacote @whiskeysockets/baileys instalado.");
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

      // Tenta buscar a versão mais recente online; em redes restritas usa fallback seguro
      let version: [number, number, number] = [2, 3000, 1015901307];
      try {
        const result = await Promise.race([
          fetchLatestBaileysVersion(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 8000)
          ),
        ]) as { version: [number, number, number] };
        version = result.version;
        console.log(`[Baileys] Versao do protocolo WhatsApp Web: ${version.join(".")}`);
      } catch {
        console.warn("[Baileys] Nao foi possivel buscar versao mais recente. Usando versao de fallback.");
      }

      this.status = "connecting";
      this.reconnectAttempts++;

      this.socket = makeWASocket({
        version,
        logger: pino({ level: "silent" }) as any,
        auth: state,
        printQRInTerminal: true,
        browser: ["Equilibra RH", "Chrome", "120.0.0"],
        // Timeouts estendidos para redes corporativas com proxy/firewall
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
        retryRequestDelayMs: 2_500,
        maxMsgRetryCount: 3,
        // Desabilita sincronizacao historica para conexao mais rapida
        syncFullHistory: false,
        fireInitQueries: true,
        generateHighQualityLinkPreview: false,
        // Evita erros de certificado em redes com proxy de inspecao SSL
        agent: undefined,
      });

      this.socket.ev.on("creds.update", saveCreds);

      this.socket.ev.on("connection.update", async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.rawQrCode = qr;
          this.status = "qr_ready";
          this.reconnectAttempts = 0; // QR chegou, reset do contador
          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              scale: 8,
              color: { dark: "#000000", light: "#ffffff" },
            });
            console.log("\n=======================================================");
            console.log("NOVO QR CODE GERADO PARA CONEXAO DO WHATSAPP REAL.");
            console.log("Acesse: http://localhost:4000/conectar-whatsapp.html");
            console.log("=======================================================\n");
          } catch (e) {
            console.error("Erro ao gerar QR Code Data URL:", e);
          }
        }

        if (connection === "close") {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const reason = (lastDisconnect?.error as any)?.message || "desconhecido";

          console.log(`[Baileys] Conexao encerrada. StatusCode: ${statusCode} | Motivo: ${reason}`);

          // Codigos que indicam logout definitivo — nao reconectar
          const isLoggedOut =
            statusCode === DisconnectReason?.loggedOut ||
            statusCode === 401 ||
            statusCode === 403;

          this.status = "disconnected";
          this.connectedPhone = null;
          this.qrCodeDataUrl = null;

          // Fecha o socket antigo para liberar recursos
          try {
            this.socket?.ev?.removeAllListeners?.();
            this.socket?.end?.();
          } catch {
            // silencioso
          }
          this.socket = null;

          if (isLoggedOut) {
            console.log("[Baileys] Sessao encerrada definitivamente (logout). Limpando sessao salva...");
            this.clearSession();
          } else {
            const delay = this.getReconnectDelay();
            console.log(`[Baileys] Reconectando em ${(delay / 1000).toFixed(1)}s (tentativa ${this.reconnectAttempts})...`);
            setTimeout(() => this.init(), delay);
          }
        } else if (connection === "open") {
          this.reconnectAttempts = 0;
          this.status = "connected";
          this.qrCodeDataUrl = null;
          this.connectedPhone = this.socket?.user?.id?.split(":")[0] || "Conectado";

          console.log("\n=======================================================");
          console.log("WHATSAPP REAL CONECTADO COM SUCESSO AO EQUILIBRA IA.");
          console.log(`Numero conectado: ${this.connectedPhone}`);
          console.log("Qualquer mensagem recebida neste numero sera respondida.");
          console.log("=======================================================\n");
        }
      });

      // Escuta mensagens recebidas em tempo real
      this.socket.ev.on("messages.upsert", async ({ messages, type }: any) => {
        if (type !== "notify") return;

        for (const msg of messages) {
          // Ignora mensagens enviadas pelo proprio bot ou de status/broadcast
          if (msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.includes("@broadcast") || remoteJid.includes("@g.us")) {
            // Foco exclusivo no contato 1-para-1 do colaborador, ignorando grupos
            continue;
          }

          // Extrai o texto da mensagem (suporta varios tipos)
          const text =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.buttonsResponseMessage?.selectedButtonId ||
            msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            "";

          if (!text) continue;

          console.log(`[WhatsApp Real] Mensagem recebida de ${remoteJid}: ${text.substring(0, 80)}...`);

          try {
            const result = await this.whatsAppService.handleInboundMessage(remoteJid, text);

            if (result.replyText) {
              await this.sendMessage(remoteJid, result.replyText);
            }
          } catch (err) {
            console.error("Erro ao processar mensagem recebida:", err);
          }
        }
      });
    } catch (error) {
      console.error("[Baileys] Falha critica ao inicializar conexao:", error);
      this.status = "disconnected";

      const delay = this.getReconnectDelay();
      console.log(`[Baileys] Tentando reinicializar em ${(delay / 1000).toFixed(1)}s...`);
      setTimeout(() => this.init(), delay);
    }
  }

  /**
   * Envia uma mensagem de texto via Baileys para um contato no WhatsApp
   */
  public async sendMessage(jid: string, text: string): Promise<boolean> {
    if (!this.socket || this.status !== "connected") {
      console.warn("[Baileys] Envio bloqueado: WhatsApp nao esta conectado.");
      return false;
    }

    try {
      const targetJid = jid.includes("@") ? jid : `${jid.replace(/\D/g, "")}@s.whatsapp.net`;
      await this.socket.sendMessage(targetJid, { text });
      console.log(`[WhatsApp Real] Mensagem enviada para ${targetJid}.`);
      return true;
    } catch (e) {
      console.error("[Baileys] Erro ao despachar mensagem:", e);
      return false;
    }
  }

  /**
   * Remove a sessao salva em disco (necessario apos logout ou para novo pareamento)
   */
  private clearSession(): void {
    if (fs.existsSync(this.sessionDir)) {
      try {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
        console.log("[Baileys] Diretorio de sessao removido.");
      } catch (e) {
        console.error("[Baileys] Erro ao remover diretorio de sessao:", e);
      }
    }
  }

  /**
   * Desconecta, limpa a sessao e reinicia para novo pareamento via QR
   */
  public async logout(): Promise<void> {
    console.log("[Baileys] Efetuando logout e limpando sessao...");
    try {
      if (this.socket) {
        await this.socket.logout();
        this.socket.ev?.removeAllListeners?.();
      }
    } catch {
      // silencioso — o socket pode ja estar fechado
    }

    this.status = "disconnected";
    this.connectedPhone = null;
    this.qrCodeDataUrl = null;
    this.socket = null;
    this.reconnectAttempts = 0;

    this.clearSession();
    setTimeout(() => this.init(), 2000);
  }
}
