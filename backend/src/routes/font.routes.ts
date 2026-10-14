import { Router } from 'express';
import { uploadFont, getFonts, deleteFont } from '../controllers/font.controller.js';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';

import { FONTS_DIR } from '../config/paths.js';

// Configure multer for font uploads
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, FONTS_DIR);
    },
    filename: (_req, file, cb) => {
        // Fix encoding for CJK characters (multer default is latin1)
        const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        // Use timestamp + original name to avoid conflicts
        const uniqueName = `${Date.now()}-${originalName}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const allowedExts = ['.ttf', '.otf', '.woff', '.woff2'];
        if (allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(Object.assign(new Error('Only font files (.ttf, .otf, .woff, .woff2) are allowed'), { code: 'INVALID_FONT_FILE' }));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max
    }
});

const router = Router();

// Font management routes - require authentication
router.get('/', authenticate, getFonts);
router.post('/upload', authenticate, upload.single('font'), uploadFont);
router.delete('/:filename', authenticate, deleteFont);

export { router as fontRouter };
