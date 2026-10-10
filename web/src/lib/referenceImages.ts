export interface ReferenceImage { id: string; name: string; dataUrl: string }
export const MAX_REFERENCE_IMAGES = 3;

/** Keep visual detail while keeping three references within the API request limit. */
export async function prepareReferenceImage(file: File): Promise<ReferenceImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if (file.size > 10 * 1024 * 1024) throw new Error('单张参考图不能超过 10 MB');
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('图片无法读取，请重新选择'); }
  try {
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理图片');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.65, 0.45]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length < 2 * 1024 * 1024 * 4 / 3) return { id:crypto.randomUUID(), name:file.name || '粘贴的参考图', dataUrl };
    }
    throw new Error('压缩后的图片仍然过大，请缩小图片后上传');
  } finally { bitmap.close(); }
}
