import { Router, type RequestHandler } from 'express';
import type { WhatsAppPairingService } from '../services/whatsapp-pairing.service';

export const localPairingOnly: RequestHandler = (req, res, next) => {
  const address = req.socket.remoteAddress;
  const origin = req.get('origin');
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address || '') ||
      (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
    res.status(403).json({ error: 'Pareamento disponível somente no computador local e na mesma origem.' }); return;
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function pairingRouter(service: WhatsAppPairingService) {
  const router = Router(); router.use(localPairingOnly);
  router.get('/status', (_req, res) => res.json(service.getStatus()));
  router.post('/connect', async (_req, res) => {
    await service.connect(); res.json(service.getStatus());
  });
  router.post('/disconnect', async (_req, res, next) => {
    try { await service.disconnect(); res.json(service.getStatus()); } catch (e) { next(e); }
  });
  return router;
}
