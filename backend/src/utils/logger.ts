import fs from 'fs';
import { Response } from 'express';
import { LOG_FILE } from '../config/paths.js';

// Log levels
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
}

// Clients connected via SSE
const sseClients: Response[] = [];

/**
 * Add a client to the SSE subscribers
 */
export function addLogClient(res: Response) {
    sseClients.push(res);
    // Remove client when connection closes
    res.on('close', () => {
        const index = sseClients.indexOf(res);
        if (index !== -1) {
            sseClients.splice(index, 1);
        }
    });
}

/**
 * Write log to file
 */
function writeToFile(entry: LogEntry) {
    const line = `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}\n`;
    // Use appendFileSync for startup logs to ensure they are captured before process might crash
    // or just regular appendFile for better performance on high volume
    fs.appendFile(LOG_FILE, line, (err) => {
        if (err) console.error('Failed to write to log file:', err);
    });
}

/**
 * Broadcast log to all connected SSE clients
 */
function broadcastToClients(entry: LogEntry) {
    const data = JSON.stringify(entry);
    sseClients.forEach(client => {
        try {
            client.write(`data: ${data}\n\n`);
        } catch (e) {
            // Ignore failed writes to disconnected clients (res.on('close') handles cleanup)
        }
    });
}

/**
 * Main logger function
 */
export function log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toLocaleTimeString();

    // Format message if args present
    let formattedMessage = message;
    if (args.length > 0) {
        formattedMessage += ' ' + args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
    }

    const entry: LogEntry = {
        timestamp,
        level,
        message: formattedMessage
    };

    // 1. Console Transport
    const consoleMsg = `[${timestamp}] [${level.toUpperCase()}] ${formattedMessage}`;
    if (level === 'error') console.error(consoleMsg);
    else if (level === 'warn') console.warn(consoleMsg);
    else console.log(consoleMsg);

    // 2. File Transport
    writeToFile(entry);

    // 3. SSE Transport
    broadcastToClients(entry);
}

export const logger = {
    info: (msg: string, ...args: any[]) => log('info', msg, ...args),
    warn: (msg: string, ...args: any[]) => log('warn', msg, ...args),
    error: (msg: string, ...args: any[]) => log('error', msg, ...args),
    debug: (msg: string, ...args: any[]) => log('debug', msg, ...args),
    stream: {
        write: (message: string) => {
            // Trim to avoid trailing newlines in file/broadcast
            const trimmed = message.trim();
            if (trimmed) {
                // Log to file and broadcast, but skip console to avoid duplicates from morgan
                const timestamp = new Date().toLocaleTimeString();
                const entry: LogEntry = {
                    timestamp,
                    level: 'info',
                    message: trimmed
                };
                writeToFile(entry);
                broadcastToClients(entry);
            }
        }
    }
};
