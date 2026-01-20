import fs from 'fs';
import path from 'path';

const FONTS_DIR = 'backend/data/uploads/fonts'; // Adjusted to the absolute data path if needed, but let's check current uploads

const targetDirs = ['backend/uploads/fonts', 'backend/data/uploads/fonts'];

function optimizeDir(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);
    console.log(`Scanning ${dir}...`);

    files.forEach(file => {
        // Check if filename contains typical mojibake characters (non-ASCII range that looks like Latin1)
        if (/[\u0080-\u00ff]/.test(file)) {
            try {
                const decodedName = Buffer.from(file, 'latin1').toString('utf8');
                if (decodedName !== file) {
                    const oldPath = path.join(dir, file);
                    const newPath = path.join(dir, decodedName);

                    if (fs.existsSync(newPath)) {
                        console.log(`[SKIP] Already exists: ${decodedName}`);
                    } else {
                        fs.renameSync(oldPath, newPath);
                        console.log(`[FIXED] ${file} -> ${decodedName}`);
                    }
                }
            } catch (err) {
                console.error(`[ERROR] Failed to convert ${file}:`, err.message);
            }
        }
    });
}

targetDirs.forEach(optimizeDir);
console.log('Optimization complete.');
