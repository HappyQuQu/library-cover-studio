import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { LOG_FILE } from '../config/paths.js';

/**
 * Get historical logs from app.log
 * Returns the last 200 lines of logs parsed as JSON objects
 */
export async function getLogs(_req: Request, res: Response, next: NextFunction) {
    try {
        if (!fs.existsSync(LOG_FILE)) {
            return res.json([]);
        }

        const content = fs.readFileSync(LOG_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim() !== '');

        // Take the last 200 lines
        const lastLines = lines.slice(-200);

        const parsedLogs = lastLines.map(line => {
            // Format: [timestamp] [LEVEL] message
            const match = line.match(/^\[(.*?)\] \[(.*?)\] (.*)$/);
            if (match) {
                return {
                    timestamp: match[1],
                    level: match[2].toLowerCase(),
                    message: match[3]
                };
            }
            // Fallback for non-matching lines
            return {
                timestamp: new Date().toLocaleTimeString(),
                level: 'info',
                message: line
            };
        });

        res.json(parsedLogs);
    } catch (error) {
        next(error);
    }
}
