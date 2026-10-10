export type RandomBackgroundStyle = 'soft-mesh' | 'muted-wall' | 'cinema-mesh';

interface BackgroundTemplate {
  width?: number;
  height?: number;
  randomOnGeneration?: boolean;
  randomBackgroundStyle?: string;
  background?: any;
  backgroundColor?: any;
  backgroundImage?: any;
  objects?: any[];
}

function hsl(hue: number, saturation: number, lightness: number) {
  const h = ((hue % 360) + 360) % 360 / 30;
  const l = lightness / 100, a = saturation / 100 * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Keep layout and style fixed; choose a fresh palette for each render, without mutating the saved template. */
export function applyRandomBackground<T extends BackgroundTemplate>(template: T, random = Math.random): T {
  if (!template.randomOnGeneration) return template;
  const result = structuredClone(template);
  const range = (min: number, max: number) => min + random() * (max - min);
  const hue = range(0, 360);
  const width = template.width || 1920, height = template.height || 1080;

  if (template.randomBackgroundStyle === 'soft-mesh') {
    const base = hsl(hue, range(40, 65), range(65, 78));
    const secondHue = hue + range(130, 230);
    const color = hsl(secondHue, range(22, 45), range(48, 64));
    const pale = hsl(secondHue, range(24, 38), range(91, 96));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="a" cx="0" cy="0" r="1" gradientUnits="objectBoundingBox"><stop stop-color="${color}"/><stop offset=".46" stop-color="${pale}" stop-opacity=".92"/><stop offset=".95" stop-color="${base}" stop-opacity="0"/></radialGradient></defs><rect width="${width}" height="${height}" fill="${base}"/><rect width="${width}" height="${height}" fill="url(#a)"/></svg>`;
    result.background = base;
    result.backgroundImage = { ...template.backgroundImage, type: 'Image', width, height,
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  } else if (template.randomBackgroundStyle === 'cinema-mesh') {
    const base = hsl(hue, range(35, 55), range(25, 36)), glow = hsl(hue + range(-15, 15), range(45, 65), range(53, 65));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="blur"><feGaussianBlur stdDeviation="${width / 12}"/></filter></defs><rect width="${width}" height="${height}" fill="${base}"/><g fill="${glow}" opacity=".32" filter="url(#blur)"><ellipse cx="${width * .13}" cy="${height * .07}" rx="${width * .22}" ry="${height * .35}"/><ellipse cx="${width * .73}" cy="${height * .76}" rx="${width * .36}" ry="${height * .34}"/></g></svg>`;
    result.background = base;
    result.backgroundImage = { ...template.backgroundImage, type: 'Image', width, height,
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
  } else if (template.randomBackgroundStyle === 'muted-wall') {
    const saturation = range(20, 40), lightness = range(36, 50);
    result.background = { type: 'linear', gradientUnits: 'percentage', coords: { x1: 0, y1: 0, x2: 1, y2: 0 },
      colorStops: [{ offset: 0, color: hsl(hue, saturation, lightness) }, { offset: 1, color: hsl(hue, saturation, lightness + range(8, 14)) }] };
    delete result.backgroundImage;
    result.objects = result.objects?.map(object => object.id === 'accent'
      ? { ...object, fill: hsl(hue + range(120, 210), range(45, 70), range(68, 78)) } : object);
  } else {
    // Existing templates without a style keep their original generic random-gradient behavior.
    result.background = generateRandomGradient(random);
    delete result.backgroundImage;
  }
  if ('backgroundColor' in result) result.backgroundColor = result.background;
  return result;
}

export function generateRandomGradient(random = Math.random) {
  const color = () => `hsl(${Math.floor(random() * 360)},${Math.floor(random() * 40) + 40}%,${Math.floor(random() * 40) + 30}%)`;
  const color1 = color(), color2 = color();
  const directions = [{ x1: 0, y1: 0, x2: 1, y2: 1 }, { x1: 0, y1: 0, x2: 0, y2: 1 },
    { x1: 0, y1: 0, x2: 1, y2: 0 }, { x1: 1, y1: 0, x2: 0, y2: 1 }];
  return { type: 'linear', gradientUnits: 'percentage', coords: directions[Math.floor(random() * directions.length)],
    colorStops: [{ offset: 0, color: color1 }, { offset: 1, color: color2 }], offsetX: 0, offsetY: 0 };
}
