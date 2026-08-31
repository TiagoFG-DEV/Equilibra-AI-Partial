import type { NextFunction, Request, Response } from "express";
import type { AuthService, JwtPayload } from "../services/auth.service";

export type AuthedRequest = Request & { auth?: JwtPayload };

export function requireAuth(auth: AuthService) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token ausente" });
    }
    const token = header.slice("Bearer ".length).trim();
    try {
      req.auth = auth.verifyToken(token);
      return next();
    } catch {
      return res.status(401).json({ error: "Token inválido" });
    }
  };
}
