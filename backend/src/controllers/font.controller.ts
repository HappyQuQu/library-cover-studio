import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { FONTS_DIR } from '../config/paths.js';
import { createError } from '../middleware/errorHandler.js';
import { customFonts } from '../services/templateFonts.service.js';

const fontsDir = FONTS_DIR;

// Get list of uploaded fonts
export async function getFonts(_req: Request, res: Response, next: NextFunction) {
    try {
        if (!fs.existsSync(fontsDir)) {
            return res.json({ fonts: [] });
        }

        res.json({ fonts: customFonts() });
    } catch (error) {
        next(error);
    }
}

// Upload a new font
export async function uploadFont(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No font file uploaded' });
        }

        // Fix encoding for originalname (multer default is latin1)
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const fontName = path.basename(originalName, path.extname(originalName));

        res.json({
            message: 'Font uploaded successfully',
            font: {
                filename: req.file.filename,
                name: fontName,
                size: req.file.size,
                url: `/api/uploads/fonts/${encodeURIComponent(req.file.filename)}`
            }
        });
    } catch (error) {
        next(error);
    }
}

// Delete a font
export async function deleteFont(req: Request, res: Response, next: NextFunction) {
    try {
        const filename = String(req.params.filename);
        if (filename !== path.basename(filename) || /[\\/\x00-\x1f]/.test(filename)
            || !['.ttf', '.otf', '.woff', '.woff2'].includes(path.extname(filename).toLowerCase())) {
            throw createError('Invalid font filename', 400, 'INVALID_FONT_FILENAME');
        }
        const filePath = path.resolve(fontsDir, filename);
        if (path.dirname(filePath) !== path.resolve(fontsDir)) {
            throw createError('Invalid font path', 400, 'INVALID_FONT_FILENAME');
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Font not found' });
        }

        const stat = fs.lstatSync(filePath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw createError('Invalid font file', 400, 'INVALID_FONT_FILE');
        fs.unlinkSync(filePath);
        res.json({ message: 'Font deleted successfully' });
    } catch (error) {
        next(error);
    }
}
