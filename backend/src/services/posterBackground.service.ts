import sharp from 'sharp';

export interface PosterBackground { blur?: number; dim?: number; source?: 'poster' | 'backdrop' }

/** The first selected media poster supplies the colors; expand before blurring to avoid dark edges. */
export async function renderPosterBackground(poster: Buffer, width: number, height: number, settings: PosterBackground): Promise<sharp.OverlayOptions> {
  const blur = Math.max(0, Math.min(150, Number.isFinite(settings.blur) ? settings.blur! : 60)) * width / 1920;
  const dim = Math.max(0, Math.min(.8, Number.isFinite(settings.dim) ? settings.dim! : .35));
  const padding = Math.ceil(blur * 3);
  let image = sharp(poster).rotate().resize(width + padding * 2, height + padding * 2, { fit: 'cover' }).flatten({ background: '#202020' });
  if (blur > 0) image = image.blur(Math.max(.3, blur));
  const input = await image.extract({ left: padding, top: padding, width, height }).png().toBuffer();
  const darkened = dim > 0 ? await sharp(input).composite([{ input: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="black" opacity="${dim}"/></svg>`
  ) }]).png().toBuffer() : input;
  return { input: darkened, left: 0, top: 0 };
}
