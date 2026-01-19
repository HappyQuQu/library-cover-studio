import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { db } from '../config/database.js';
import { users } from '../config/schema.js';
import { eq } from 'drizzle-orm';
import { createError } from '../middleware/index.js';

// Schema for creating/updating users
export const createUserSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100),
    role: z.enum(['admin', 'user']).default('user')
});

export const updateUserSchema = z.object({
    role: z.enum(['admin', 'user']).optional(),
    password: z.string().min(6).max(100).optional()
});

// List all users
export async function list(_req: Request, res: Response, next: NextFunction) {
    try {
        const userList = db.select({
            id: users.id,
            username: users.username,
            role: users.role,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt
        }).from(users).all();

        res.json(userList);
    } catch (error) {
        next(error);
    }
}

// Create a new user
export async function create(req: Request, res: Response, next: NextFunction) {
    try {
        const { username, password, role } = req.body;

        const existing = db.select().from(users).where(eq(users.username, username)).get();
        if (existing) {
            return next(createError('Username already exists', 400, 'USER_EXISTS'));
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const now = new Date().toISOString();
        const id = uuidv4();

        db.insert(users).values({
            id,
            username,
            passwordHash,
            role: role || 'user',
            createdAt: now,
            updatedAt: now
        }).run();

        res.status(201).json({
            id,
            username,
            role: role || 'user',
            createdAt: now
        });
    } catch (error) {
        next(error);
    }
}

// Update user (role or password)
export async function update(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;
        const currentUserId = req.user?.userId;
        const currentUserRole = req.user?.role;

        // Validation
        const validation = updateUserSchema.safeParse(req.body);
        if (!validation.success) {
            return next(createError('Invalid input', 400, 'INVALID_INPUT'));
        }
        const { role, password } = validation.data;

        // Permission check: Only admin can edit others
        if (currentUserRole !== 'admin' && currentUserId !== id) {
            return next(createError('Forbidden', 403, 'FORBIDDEN'));
        }

        // Security check: Non-admins cannot change roles
        if (role && currentUserRole !== 'admin') {
            return next(createError('Only admins can change roles', 403, 'FORBIDDEN_ROLE_CHANGE'));
        }

        const existing = db.select().from(users).where(eq(users.id, id as string)).get();
        if (!existing) {
            return next(createError('User not found', 404, 'USER_NOT_FOUND'));
        }

        const updateData: any = { updatedAt: new Date().toISOString() };
        if (role) updateData.role = role;
        if (password) {
            updateData.passwordHash = await bcrypt.hash(password, 12);
        }

        db.update(users).set(updateData).where(eq(users.id, id as string)).run();

        res.json({ message: 'User updated successfully' });
    } catch (error) {
        next(error);
    }
}

// Delete user
export async function remove(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;

        // Prevent deleting self
        if (req.user?.userId === id) {
            return next(createError('Cannot delete yourself', 400, 'CANNOT_DELETE_SELF'));
        }

        const result = db.delete(users).where(eq(users.id, id as string)).run();
        if (result.changes === 0) {
            return next(createError('User not found', 404, 'USER_NOT_FOUND'));
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        next(error);
    }
}
