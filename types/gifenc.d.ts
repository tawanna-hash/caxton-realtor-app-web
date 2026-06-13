// types/gifenc.d.ts
//
// Minimal type declarations for the `gifenc` package, which ships
// JavaScript only. We don't depend on @types/gifenc because it doesn't
// exist on npm. The surface area we use is small — just GIFEncoder
// (writer), quantize (palette), and applyPalette (re-map RGBA to
// palette indices).

declare module 'gifenc' {
  export interface GIFEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export interface GIFEncoderInstance {
    writeHeader(): void;
    writeFrame(
      index: Uint8Array | Uint8ClampedArray,
      width: number,
      height: number,
      options?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
        repeat?: number;
        first?: boolean;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(opts?: GIFEncoderOptions): GIFEncoderInstance;

  export type QuantizeFormat = 'rgba4444' | 'rgb444' | 'rgb565' | 'rgba565';

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: QuantizeFormat; oneBitAlpha?: boolean | number; clearAlpha?: boolean; clearAlphaThreshold?: number; clearAlphaColor?: number },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: QuantizeFormat,
  ): Uint8Array;
}
