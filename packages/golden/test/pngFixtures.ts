import { PNG } from "pngjs";

export type Rgba = [number, number, number, number];

export function solidPng(width: number, height: number, rgba: Rgba): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) png.data.set(rgba, i * 4);
  return PNG.sync.write(png);
}

export function withPixel(source: Buffer, x: number, y: number, rgba: Rgba): Buffer {
  const png = PNG.sync.read(source);
  png.data.set(rgba, (y * png.width + x) * 4);
  return PNG.sync.write(png);
}

export function pngSize(source: Uint8Array): { width: number; height: number } {
  const png = PNG.sync.read(Buffer.from(source));
  return { width: png.width, height: png.height };
}
