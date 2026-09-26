import jwt from 'jsonwebtoken';
import { Rol } from '../prisma/generated/prisma/client';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

export interface TokenPayload {
  userId: number;
  tenantId: number;
  tenantName: string;
  username: string;
  nombre: string;
  apellido: string;
  role: Rol;
  aprobado: boolean;
  authVersion?: number;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    if (!payload.aprobado || !Number.isSafeInteger(payload.userId) || payload.userId <= 0) return null;
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { activo: true, aprobado: true, tenantId: true, rol: true, authVersion: true },
    });
    // Check every request: suspension and password changes also revoke old tokens.
    // Tokens issued before this migration belong to version zero only.
    if (!user?.activo || !user.aprobado || user.tenantId !== payload.tenantId ||
        user.rol !== payload.role || user.authVersion !== (payload.authVersion ?? 0)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hasRole(userRole: Rol, allowedRoles: Rol[]): boolean {
  return allowedRoles.includes(userRole);
}
