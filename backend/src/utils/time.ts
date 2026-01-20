/**
 * Get local timezone ISO string (e.g., 2026-01-20T10:12:00+08:00)
 * Instead of UTC-based toISOString() which returns 2026-01-20T02:12:00.000Z
 */
export function getLocalISOString(): string {
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const minutes = String(Math.abs(offset) % 60).padStart(2, '0');

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}:${minutes}`;
}

/**
 * Get local timestamp for filename (e.g., 2026-01-20T10-12-00)
 */
export function getLocalTimestampForFile(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    const second = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hour}-${minute}-${second}`;
}
