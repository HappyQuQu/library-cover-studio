/** Keep the canvas visible even when a viewport is smaller than the editor's old fixed panels. */
export function calculateFitZoom(viewWidth: number, viewHeight: number, width: number, height: number): number {
  const scale = Math.min(Math.max(1, viewWidth - 48) / width, Math.max(1, viewHeight - 48) / height, 1);
  return Math.max(0.01, Math.floor(scale * 100) / 100);
}
