import jwt from 'jsonwebtoken';
import { Rol } from '../prisma/generated/prisma/client';

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
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    if (!payload.aprobado) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hasRole(userRole: Rol, allowedRoles: Rol[]): boolean {
  return allowedRoles.includes(userRole);
}