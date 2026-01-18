import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { users } from '../config/schema.js';
import { eq } from 'drizzle-orm';
import { generateToken, generateRefreshToken, createError } from '../middleware/index.js';

// 验证 Schema
export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100)
});

export const loginSchema = z.object({
  username: z.string(),
  password: z.string()
});

// 注册
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;

    // 检查用户是否存在
    const existing = db.select().from(users).where(eq(users.username, username)).get();
    if (existing) {
      return next(createError('Username already exists', 400, 'USER_EXISTS'));
    }

    // 创建用户
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    const id = uuidv4();

    db.insert(users).values({
      id,
      username,
      passwordHash,
      role: 'user',
      createdAt: now,
      updatedAt: now
    }).run();

    // 生成 Token
    const token = generateToken({ userId: id, username, role: 'user' });
    const refreshToken = generateRefreshToken({ userId: id, username, role: 'user' });

    res.status(201).json({
      user: { id, username, role: 'user' },
      token,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
}

// 登录
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;

    // 查找用户
    const user = db.select().from(users).where(eq(users.username, username)).get();
    if (!user) {
      return next(createError('Invalid credentials', 401, 'INVALID_CREDENTIALS'));
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return next(createError('Invalid credentials', 401, 'INVALID_CREDENTIALS'));
    }

    // 生成 Token
    const token = generateToken({ userId: user.id, username: user.username, role: user.role || 'user' });
    const refreshToken = generateRefreshToken({ userId: user.id, username: user.username, role: user.role || 'user' });

    res.json({
      user: { id: user.id, username: user.username, role: user.role },
      token,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
}

// 获取当前用户
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return next(createError('Unauthorized', 401, 'UNAUTHORIZED'));
    }

    const user = db.select().from(users).where(eq(users.id, req.user.userId)).get();
    if (!user) {
      return next(createError('User not found', 404, 'USER_NOT_FOUND'));
    }

    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt
    });
  } catch (error) {
    next(error);
  }
}
