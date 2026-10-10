import path from 'path';
import fs from 'fs';

// Root data directory (absolute)
export const DATA_DIR = path.resolve(process.cwd(), 'data');

// Subdirectories
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');
export const DB_DIR = path.join(DATA_DIR, 'db');
export const COVERS_DIR = path.join(DATA_DIR, 'covers');
export const TASK_HISTORY_DIR = path.join(DATA_DIR, 'task-history');
export const POSTERS_DIR = path.join(DATA_DIR, 'posters');
export const THUMBNAILS_DIR = path.join(DATA_DIR, 'thumbnails');
export const FONTS_DIR = path.join(UPLOADS_DIR, 'fonts');
export const TEMP_DIR = path.join(DATA_DIR, 'temp');

// Files
export const LOG_FILE = path.join(LOGS_DIR, 'app.log');
export const DB_FILE = path.join(DB_DIR, 'data.sqlite');

/**
 * Ensure all required data directories exist
 */
export function ensureDataDirs() {
    const dirs = [
        DATA_DIR,
        UPLOADS_DIR,
        LOGS_DIR,
        DB_DIR,
        COVERS_DIR,
        TASK_HISTORY_DIR,
        POSTERS_DIR,
        THUMBNAILS_DIR,
        FONTS_DIR,
        TEMP_DIR
    ];

    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}
