import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { taskLogs } from '../config/schema.js';
import { sql } from 'drizzle-orm';

// Get dashboard stats
export async function getDashboardStats(_req: Request, res: Response, next: NextFunction) {
    try {
        // Get current month's start date in local timezone
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfMonthISO = startOfMonth.toISOString();

        // Sum all itemsProcessed from task_logs where startedAt >= start of month
        const result = db.select({
            totalGenerated: sql<number>`COALESCE(SUM(items_processed), 0)`
        })
            .from(taskLogs)
            .where(sql`started_at >= ${startOfMonthISO}`)
            .get();

        const monthlyGenerated = result?.totalGenerated || 0;

        res.json({
            monthlyGenerated
        });
    } catch (error) {
        next(error);
    }
}
