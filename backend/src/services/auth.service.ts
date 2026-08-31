import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AppEnv } from "../config/env";
import { prisma } from "../lib/prisma";

export type JwtPayload = {
  sub: string;
  email: string;
  tenantId: string | null;
  role: string;
};

export class AuthService {
  constructor(private readonly env: AppEnv) {}

  signToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.env.JWT_SECRET, {
      expiresIn: this.env.JWT_EXPIRES_IN as any,
    });
  }

  verifyToken(token: string): JwtPayload {
    const decoded = jwt.verify(token, this.env.JWT_SECRET) as JwtPayload;
    return decoded;
  }

  async register(input: { email: string; password: string; organizationName: string }) {
    const email = input.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error("E-mail já cadastrado");
    }

    const slug = input.organizationName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

    const passwordHash = await bcrypt.hash(input.password, 12);

    const tenant = await prisma.tenant.create({
      data: {
        name: input.organizationName.trim(),
        slug: slug || `org-${Date.now()}`,
      },
    });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        tenantId: tenant.id,
        role: "OWNER",
      },
    });

    const token = this.signToken({
      sub: user.id,
      email: user.email,
      tenantId: tenant.id,
      role: user.role,
    });

    return { user: { id: user.id, email: user.email, role: user.role }, tenant, token };
  }

  async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error("Credenciais inválidas");
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new Error("Credenciais inválidas");
    }

    const token = this.signToken({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    });

    return {
      user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenantId },
      token,
    };
  }
}
