import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { FONTS_DIR } from '../config/paths.js';

const fontsDir = FONTS_DIR;

// Get list of uploaded fonts
export async function getFonts(_req: Request, res: Response, next: NextFunction) {
    try {
        if (!fs.existsSync(fontsDir)) {
            return res.json({ fonts: [] });
        }

        const files = fs.readdirSync(fontsDir);
        const fonts = files
            .filter(file => ['.ttf', '.otf', '.woff', '.woff2'].includes(path.extname(file).toLowerCase()))
            .map(file => {
                const stats = fs.statSync(path.join(fontsDir, file));
                // Extract font name from filename (remove timestamp prefix and extension)
                const nameParts = file.split('-');
                let originalName = nameParts.length > 1 ? nameParts.slice(1).join('-') : file;

                // Try to fix encoding if it looks like garbled Latin1
                if (/[\u0080-\u00ff]/.test(originalName)) {
                    try {
                        originalName = Buffer.from(originalName, 'latin1').toString('utf8');
                    } catch (e) {
                        // Ignore if conversion fails
                    }
                }

                const fontName = path.basename(originalName, path.extname(originalName));

                return {
                    filename: file,
                    name: fontName,
                    size: stats.size,
                    uploadedAt: stats.mtime,
                    url: `/api/uploads/fonts/${file}`
                };
            });

        res.json({ fonts });
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
                url: `/api/uploads/fonts/${req.file.filename}`
            }
        });
    } catch (error) {
        next(error);
    }
}

// Delete a font
export async function deleteFont(req: Request, res: Response, next: NextFunction) {
    try {
        const filename = req.params.filename;
        const filePath = path.join(fontsDir, String(filename));

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Font not found' });
        }

        fs.unlinkSync(filePath);
        res.json({ message: 'Font deleted successfully' });
    } catch (error) {
        next(error);
    }
}
