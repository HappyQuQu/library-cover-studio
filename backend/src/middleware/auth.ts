import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler.js';

import { users } from '../config/schema.js';
import { db } from '../config/database.js';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-me';

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  let token: string | undefined;

  // 1. 尝试从 Authorization Header 获取
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. 尝试从 Query Parameter 获取 (用于 <img> 标签直接请求)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return next(createError('No token provided', 401, 'NO_TOKEN'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // 验证用户是否在数据库中存在 (防止数据库重置后 Token 依然有效但关联失败)
    const user = db.select().from(users).where(eq(users.id, decoded.userId)).get() as any;
    if (!user) {
      return next(createError('User not found or database reset', 401, 'USER_NOT_FOUND'));
    }

    // 确保从数据库获取最新的角色，防止 Token 中的角色过期
    req.user = {
      ...decoded,
      role: user.role
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(createError('Token expired', 401, 'TOKEN_EXPIRED'));
    }
    return next(createError('Invalid token', 401, 'INVALID_TOKEN'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError('Unauthorized', 401, 'UNAUTHORIZED'));
    }

    if (!roles.includes(req.user.role)) {
      return next(createError('Forbidden', 403, 'FORBIDDEN'));
    }

    next();
  };
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any
  });
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any
  });
}
