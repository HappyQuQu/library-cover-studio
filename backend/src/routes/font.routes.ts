import { Router } from 'express';
import { uploadFont, getFonts, deleteFont } from '../controllers/font.controller.js';
import { authenticate } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ensure fonts directory exists
const fontsDir = 'uploads/fonts';
if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
}

// Configure multer for font uploads
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, fontsDir);
    },
    filename: (_req, file, cb) => {
        // Use timestamp + original name to avoid conflicts
        const uniqueName = `${Date.now()}-${file.originalname}`;
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
            cb(new Error('Only font files (.ttf, .otf, .woff, .woff2) are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max
    }
});

const router = Router();

// Font management routes - require authentication
router.get('/', authenticate, getFonts);
router.post('/upload', authenticate, upload.single('font'), uploadFont);
router.delete('/:filename', authenticate, deleteFont);

export { router as fontRouter };
