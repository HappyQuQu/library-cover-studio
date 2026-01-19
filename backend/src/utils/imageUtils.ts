import sharp from 'sharp';

export async function isBlackImage(
    buffer: Buffer,
    options: {
        threshold?: number;   // RGB threshold (0-255), defaults to 5
        ratio?: number;       // Ratio of black pixels to consider image "black" (0-1), defaults to 0.98
        sampleStep?: number;  // Sampling step for performance, defaults to 4
    } = {}
): Promise<boolean> {
    const {
        threshold = 5,
        ratio = 0.98,
        sampleStep = 4
    } = options;

    try {
        const img = sharp(buffer);
        const { width, height } = await img.metadata();

        if (!width || !height) return true;

        // Convert to raw RGBA pixel data
        const raw = await img
            .ensureAlpha()
            .raw()
            .toBuffer();

        let blackCount = 0;
        let total = 0;

        for (let y = 0; y < height; y += sampleStep) {
            for (let x = 0; x < width; x += sampleStep) {
                const idx = (y * width + x) * 4;

                // Safety check for index out of bounds
                if (idx + 3 >= raw.length) continue;

                const r = raw[idx];
                const g = raw[idx + 1];
                const b = raw[idx + 2];
                const a = raw[idx + 3];

                // Ignore fully transparent pixels
                if (a === 0) continue;

                total++;
                if (r <= threshold && g <= threshold && b <= threshold) {
                    blackCount++;
                }
            }
        }

        // If total visible pixels is 0 (all transparent), consider it "black" (empty)
        if (total === 0) return true;

        return (blackCount / total) >= ratio;
    } catch (err) {
        console.error('Error analyzing image pixels:', err);
        // If we can't analyze it, assume it's invalid/black to be safe, or just let it pass?
        // User wants to filter OUT bad images. If sharp fails, it's likely a bad image.
        return true;
    }
}
