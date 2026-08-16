/**
 * Minimal type declarations for `utif` (pure-JS TIFF decoder).
 *
 * The package ships no types. Declaring the three functions the sheet renderer
 * actually calls — rather than `declare module "utif"`, which would make the
 * whole thing `any` — keeps the decode path type-checked.
 */
declare module "utif" {
  /** One Image File Directory: a single page inside a (possibly multi-page) TIFF. */
  export interface IFD {
    width: number;
    height: number;
    [tag: string]: unknown;
  }

  /** Read the directory structure. One entry per page; does not decode pixels. */
  export function decode(buffer: ArrayBuffer | Uint8Array): IFD[];

  /** Decode one page's pixel data into the given IFD, in place. */
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: IFD): void;

  /** Convert a decoded IFD to RGBA bytes, 4 per pixel. */
  export function toRGBA8(ifd: IFD): Uint8Array;

  const UTIF: {
    decode: typeof decode;
    decodeImage: typeof decodeImage;
    toRGBA8: typeof toRGBA8;
  };
  export default UTIF;
}
