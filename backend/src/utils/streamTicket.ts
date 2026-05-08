import crypto from 'crypto';

interface Ticket {
  userId: string;
  role: string;
  expiresAt: number;
}

const TICKET_TTL_MS = 60_000; // 60s
const tickets = new Map<string, Ticket>();

// 周期性清理过期 ticket（防内存增长）
setInterval(() => {
  const now = Date.now();
  for (const [id, t] of tickets.entries()) {
    if (t.expiresAt < now) tickets.delete(id);
  }
}, 30_000).unref?.();

export function issueStreamTicket(userId: string, role: string): string {
  const id = crypto.randomBytes(24).toString('base64url');
  tickets.set(id, { userId, role, expiresAt: Date.now() + TICKET_TTL_MS });
  return id;
}

/**
 * Consume a ticket. Single-use — returns the payload and deletes it.
 * Returns null if missing, expired, or already used.
 */
export function consumeStreamTicket(id: string): { userId: string; role: string } | null {
  const t = tickets.get(id);
  if (!t) return null;
  tickets.delete(id);
  if (t.expiresAt < Date.now()) return null;
  return { userId: t.userId, role: t.role };
}
