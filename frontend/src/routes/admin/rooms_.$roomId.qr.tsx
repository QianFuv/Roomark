/**
 * QR export: live preview of the door poster; A4 / A5 / QR-only layouts; PNG (300 dpi) or PDF.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, errorMessage } from "../../api/client";
import {
  EXPORT_DPI,
  exportPoster,
  pixelSize,
  posterFileName,
  renderPoster,
  type PosterContent,
  type PosterFormat,
  type PosterLayout,
} from "../../lib/qr-poster";
import { platform } from "../../platform/platform";
import { colors, fonts, media, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Card, EmptyState, Notice, PageHeader, Skeleton, Stack } from "../../ui/layout";
import { Segmented } from "../../ui/segmented";
import { notify } from "../../ui/toast";

export const Route = createFileRoute("/admin/rooms_/$roomId/qr")({ component: QrExportPage });

const LAYOUT_LABELS: Record<PosterLayout, string> = { a4: "A4 海报", a5: "A5 海报", qr: "仅二维码" };

const PREVIEW_DPI = 96;

const styles = stylex.create({
  layout: {
    alignItems: "stretch",
    display: "grid",
    gap: 16,
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.wide]: "minmax(0, 1fr) 360px" },
  },
  stage: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.large,
    display: "flex",
    justifyContent: "center",
    minHeight: 360,
    padding: { default: 16, [media.narrow]: 32 },
  },
  paper: {
    backgroundColor: "#ffffff",
    boxShadow: `0 10px 40px ${colors.shadowStrong}`,
    display: "block",
    height: "auto",
    maxHeight: "70dvh",
    maxWidth: "100%",
    objectFit: "contain",
  },
  facts: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.7, wordBreak: "break-all" },
});

/**
 * QR export page.
 *
 * @returns The page.
 */
function QrExportPage() {
  const { roomId } = Route.useParams();
  const id = Number(roomId);
  const rooms = api.useQuery("get", "/api/admin/rooms");
  const qr = api.useQuery("get", "/api/admin/rooms/{id}/qr", { params: { path: { id } } }, { retry: false });
  const room = (rooms.data ?? []).find((item) => item.id === id);
  const [layout, setLayout] = useState<PosterLayout>("a4");
  const [format, setFormat] = useState<PosterFormat>("pdf");
  const [isExporting, setIsExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const content: PosterContent | undefined =
    room === undefined || qr.data === undefined
      ? undefined
      : {
          roomName: room.name,
          location: room.location,
          url: qr.data.url,
          code: qr.data.code,
        };

  useEffect(() => {
    if (canvasRef.current === null || content === undefined) return;

    renderPoster(canvasRef.current, layout, content, PREVIEW_DPI);
  }, [content, layout]);

  if (qr.isError) {
    return (
      <Stack gap="md">
        <Notice tone="busy" title="二维码生成失败">
          {errorMessage(qr.error)}
        </Notice>
      </Stack>
    );
  }

  if (rooms.data !== undefined && room === undefined) {
    return <EmptyState title="找不到这个房间" />;
  }

  const size = pixelSize(layout, EXPORT_DPI);

  /** Render at full resolution and deliver the file. */
  async function download(): Promise<void> {
    if (content === undefined) return;

    setIsExporting(true);

    try {
      const { blob, mimeType } = await exportPoster(layout, format, content);
      const fileName = posterFileName(content.roomName, layout, format);
      const result = await platform().saveFile(fileName, mimeType, blob);

      if (result.saved) notify("success", "已导出", result.path ?? fileName);
    } catch {
      notify("error", "导出失败", "请重试");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Stack gap="lg">
      <PageHeader title={`导出二维码${room === undefined ? "" : ` · ${room.name}`}`} />
      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.stage)}>
          {content === undefined ? (
            <Skeleton height={420} width="300px" />
          ) : (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${LAYOUT_LABELS[layout]}预览：${content.roomName}，房间码 ${content.code}`}
              {...stylex.props(styles.paper)}
            />
          )}
        </div>
        <Card>
          <Stack gap="lg">
            <Segmented
              label="版式"
              value={layout}
              isFullWidth
              options={(["a4", "a5", "qr"] as const).map((value) => ({ value, label: LAYOUT_LABELS[value] }))}
              onValueChange={setLayout}
            />
            <Segmented
              label="格式"
              value={format}
              isFullWidth
              options={[
                { value: "pdf", label: "PDF" },
                { value: "png", label: `PNG · ${EXPORT_DPI} dpi` },
              ]}
              onValueChange={setFormat}
            />
            {content === undefined ? null : (
              <p {...stylex.props(styles.facts)}>
                {size.width}×{size.height} 像素 · 房间码 {content.code}
              </p>
            )}
            <Button
              variant="primary"
              size="xl"
              isFullWidth
              isLoading={isExporting}
              disabled={content === undefined}
              icon={<Download size={20} aria-hidden />}
              onClick={() => void download()}
            >
              {platform().kind === "web" ? "下载" : "保存"} {format.toUpperCase()}
            </Button>
          </Stack>
        </Card>
      </div>
    </Stack>
  );
}
