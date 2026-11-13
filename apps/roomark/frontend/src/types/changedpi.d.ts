/**
 * Type declarations for `changedpi` (writes the pHYs/JFIF density without re-encoding).
 *
 * @module
 */
declare module "changedpi" {
  /**
   * Set the resolution metadata of a PNG or JPEG blob.
   *
   * @param blob - Image blob.
   * @param dpi - Dots per inch.
   * @returns The updated blob.
   */
  export function changeDpiBlob(blob: Blob, dpi: number): Promise<Blob>;
}
