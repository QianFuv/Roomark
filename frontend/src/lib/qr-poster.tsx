/**
 * Door QR poster rendering: one canvas drawing routine used for the live preview and for the
 * 300 dpi PNG / PDF export.
 *
 * @module
 */
import { changeDpiBlob } from "changedpi";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/** Poster layout. */
export type PosterLayout = "a4" | "a5" | "qr";

/** Export file format. */
export type PosterFormat = "png" | "pdf";

/** Content of a poster. */
export interface PosterContent {
  roomName: string;
  location: string;
  url: string;
  /** `YYYY-MM-DD` of the token rotation, printed as the QR version. */
  versionDate: string;
}

/** Canvas size in pixels. */
export interface PixelSize {
  width: number;
  height: number;
}

/** Export resolution. */
export const EXPORT_DPI = 300;

/** Paper size per layout in millimetres (width, height). */
const PAGE_SIZES_MM: Record<PosterLayout, readonly [number, number]> = {
  a4: [210, 297],
  a5: [148, 210],
  qr: [80, 80],
};

const FONT_STACK =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif';

/** Call to action printed under the QR code. */
const CALL_TO_ACTION = "扫码查看空闲 · 预约";

/**
 * Pixel size of a layout at a resolution.
 *
 * @param layout - Layout.
 * @param dpi - Dots per inch.
 * @returns Width and height in pixels.
 */
export function pixelSize(layout: PosterLayout, dpi: number): PixelSize {
  const [widthMm, heightMm] = PAGE_SIZES_MM[layout];

  return { width: Math.round((widthMm / 25.4) * dpi), height: Math.round((heightMm / 25.4) * dpi) };
}

/**
 * Largest font size (px) at which a text fits a width.
 *
 * @param context - Canvas context.
 * @param text - Text.
 * @param maxWidth - Available width.
 * @param maxSize - Upper bound.
 * @param weight - Font weight.
 * @returns The font size.
 */
function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  weight: number,
): number {
  let size = maxSize;

  context.font = `${weight} ${size}px ${FONT_STACK}`;

  const measured = context.measureText(text).width;

  if (measured > maxWidth) size = Math.floor((size * maxWidth) / measured);

  return size;
}

/**
 * Draw a QR code as crisp squares.
 *
 * @param context - Canvas context.
 * @param text - Encoded text.
 * @param left - X of the top-left corner (quiet zone included).
 * @param top - Y of the top-left corner.
 * @param size - Edge length including a 4-module quiet zone.
 */
function drawQr(
  context: CanvasRenderingContext2D,
  text: string,
  left: number,
  top: number,
  size: number,
): void {
  const code = QRCode.create(text, { errorCorrectionLevel: "M" });
  const modules = code.modules.size;
  const quiet = 4;
  const cell = size / (modules + quiet * 2);

  context.fillStyle = "#ffffff";
  context.fillRect(left, top, size, size);
  context.fillStyle = "#000000";

  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (code.modules.data[row * modules + column] === 1) {
        const x = left + (column + quiet) * cell;
        const y = top + (row + quiet) * cell;

        context.fillRect(Math.floor(x), Math.floor(y), Math.ceil(cell + (x % 1)), Math.ceil(cell + (y % 1)));
      }
    }
  }
}

/**
 * Draw a poster onto a canvas, resizing it to the layout at the given resolution.
 *
 * @param canvas - Target canvas.
 * @param layout - Layout.
 * @param content - Poster content.
 * @param dpi - Dots per inch.
 */
export function renderPoster(
  canvas: HTMLCanvasElement,
  layout: PosterLayout,
  content: PosterContent,
  dpi: number,
): void {
  const { width, height } = pixelSize(layout, dpi);

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (context === null) return;

  const mm = dpi / 25.4;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "alphabetic";

  if (layout === "qr") {
    const footer = 9 * mm;
    const qrSize = Math.min(width, height - footer);

    drawQr(context, content.url, (width - qrSize) / 2, 0, qrSize);
    context.fillStyle = "#111111";
    context.textAlign = "left";
    context.font = `700 ${fitFontSize(context, content.roomName, width * 0.55, 4.2 * mm, 700)}px ${FONT_STACK}`;
    context.fillText(content.roomName, 4 * mm, height - 3.2 * mm);
    context.textAlign = "right";
    context.fillStyle = "#666666";
    context.font = `400 ${2.4 * mm}px ${FONT_STACK}`;
    context.fillText(`二维码版本 ${content.versionDate}`, width - 4 * mm, height - 3.2 * mm);

    return;
  }

  const margin = (layout === "a4" ? 18 : 13) * mm;
  const contentWidth = width - margin * 2;

  const nameSize = fitFontSize(
    context,
    content.roomName,
    contentWidth,
    (layout === "a4" ? 30 : 22) * mm,
    800,
  );

  let cursor = margin + nameSize * 0.9;

  context.fillStyle = "#111111";
  context.font = `800 ${nameSize}px ${FONT_STACK}`;
  context.fillText(content.roomName, width / 2, cursor);

  if (content.location !== "") {
    const locationSize = (layout === "a4" ? 7 : 5) * mm;

    cursor += nameSize * 0.32 + locationSize * 1.3;
    context.fillStyle = "#555555";
    context.font = `500 ${fitFontSize(context, content.location, contentWidth, locationSize, 500)}px ${FONT_STACK}`;
    context.fillText(content.location, width / 2, cursor);
  }

  const ctaSize = (layout === "a4" ? 11 : 8) * mm;
  const urlSize = (layout === "a4" ? 3.2 : 2.6) * mm;
  const footerTop = height - margin - urlSize * 3;
  const qrSize = Math.min(contentWidth * 0.86, footerTop - cursor - ctaSize * 3.2 - 10 * mm);
  const qrTop = cursor + (footerTop - cursor - qrSize - ctaSize * 2.2) / 2;

  drawQr(context, content.url, (width - qrSize) / 2, qrTop, qrSize);

  context.fillStyle = "#111111";
  context.font = `700 ${fitFontSize(context, CALL_TO_ACTION, contentWidth, ctaSize, 700)}px ${FONT_STACK}`;
  context.fillText(CALL_TO_ACTION, width / 2, qrTop + qrSize + ctaSize * 1.5);

  context.fillStyle = "#777777";
  context.font = `400 ${fitFontSize(context, content.url, contentWidth, urlSize, 400)}px ${FONT_STACK}`;
  context.fillText(content.url, width / 2, height - margin - urlSize * 1.8);

  context.textAlign = "right";
  context.fillStyle = "#888888";
  context.font = `400 ${urlSize}px ${FONT_STACK}`;
  context.fillText(`二维码版本 ${content.versionDate}`, width - margin * 0.6, height - margin * 0.45);
}

/**
 * Render a poster at 300 dpi and encode it.
 *
 * @param layout - Layout.
 * @param format - PNG or PDF.
 * @param content - Poster content.
 * @returns File data and MIME type.
 */
export async function exportPoster(
  layout: PosterLayout,
  format: PosterFormat,
  content: PosterContent,
): Promise<{ blob: Blob; mimeType: string }> {
  const canvas = document.createElement("canvas");

  renderPoster(canvas, layout, content, EXPORT_DPI);

  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error("生成图片失败")) : resolve(blob)), "image/png");
  });

  if (format === "png") return { blob: await changeDpiBlob(png, EXPORT_DPI), mimeType: "image/png" };

  const [widthMm, heightMm] = PAGE_SIZES_MM[layout];

  const pdf = new jsPDF({
    unit: "mm",
    format: [widthMm, heightMm],
    orientation: widthMm > heightMm ? "landscape" : "portrait",
    compress: true,
  });

  pdf.setProperties({ title: `${content.roomName} 门口二维码`, creator: "Roomark" });
  pdf.addImage(new Uint8Array(await png.arrayBuffer()), "PNG", 0, 0, widthMm, heightMm, undefined, "FAST");

  return { blob: pdf.output("blob"), mimeType: "application/pdf" };
}

/**
 * Suggested export file name.
 *
 * @param roomName - Room name.
 * @param layout - Layout.
 * @param format - Format.
 * @param versionDate - QR version date.
 * @returns File name.
 */
export function posterFileName(
  roomName: string,
  layout: PosterLayout,
  format: PosterFormat,
  versionDate: string,
): string {
  const layoutLabel = layout === "a4" ? "A4" : layout === "a5" ? "A5" : "二维码";
  const safeName = roomName.replace(/[\\/:*?"<>|]+/g, "_");

  return `${safeName}-${layoutLabel}-${versionDate}.${format}`;
}
