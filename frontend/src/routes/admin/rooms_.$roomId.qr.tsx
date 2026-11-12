/**
 * QR export: live preview of the door poster; A4 / A5 / QR-only layouts; PNG (300 dpi) or PDF.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Download } from "lucide-react";
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
import { parseZoned } from "../../lib/time";
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
    alignItems: "start",
    display: "grid",
    gap: 16,
    gridTemplateColumns: { default: "minmax(0, 1fr)", [media.desktop]: "minmax(0, 1fr) 360px" },
  },
  stage: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.large,
    display: "flex",
    justifyContent: "center",
    minHeight: 360,
    padding: { default: 16, [media.tablet]: 32 },
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
  back: {
    alignItems: "center",
    color: colors.primaryText,
    display: "inline-flex",
    fontSize: fonts.sizeMd,
    gap: 4,
    minHeight: 44,
  },
  facts: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.7, wordBreak: "break-all" },
  label: { color: colors.text, fontSize: fonts.sizeSm, fontWeight: 600 },
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
          versionDate: parseZoned(qr.data.tokenRotatedAt).toPlainDate().toString(),
        };

  useEffect(() => {
    if (canvasRef.current === null || content === undefined) return;

    renderPoster(canvasRef.current, layout, content, PREVIEW_DPI);
  }, [content, layout]);

  if (qr.isError) {
    return (
      <Stack gap="md">
        <BackLink />
        <Notice tone="busy" title="无法生成二维码">
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
      const fileName = posterFileName(content.roomName, layout, format, content.versionDate);
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
      <BackLink />
      <PageHeader
        title={`导出二维码${room === undefined ? "" : ` · ${room.name}`}`}
        subtitle="打印后贴在会议室门口，扫码即可查看空闲并预约。"
      />
      <div {...stylex.props(styles.layout)}>
        <div {...stylex.props(styles.stage)}>
          {content === undefined ? (
            <Skeleton height={420} width="300px" />
          ) : (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`${LAYOUT_LABELS[layout]}预览：${content.roomName}，${content.url}`}
              {...stylex.props(styles.paper)}
            />
          )}
        </div>
        <Card>
          <Stack gap="lg">
            <Stack gap="xs">
              <span {...stylex.props(styles.label)}>版式</span>
              <Segmented
                label="版式"
                value={layout}
                isFullWidth
                options={(["a4", "a5", "qr"] as const).map((value) => ({
                  value,
                  label: LAYOUT_LABELS[value],
                }))}
                onValueChange={setLayout}
              />
            </Stack>
            <Stack gap="xs">
              <span {...stylex.props(styles.label)}>格式</span>
              <Segmented
                label="格式"
                value={format}
                isFullWidth
                options={[
                  { value: "pdf", label: "PDF", hint: "适合打印" },
                  { value: "png", label: "PNG", hint: "300 dpi 图片" },
                ]}
                onValueChange={setFormat}
              />
            </Stack>
            {content === undefined ? null : (
              <p {...stylex.props(styles.facts)}>
                尺寸 {size.width}×{size.height} 像素（{EXPORT_DPI} dpi）
                <br />
                二维码版本 {content.versionDate}
                <br />
                链接 {content.url}
              </p>
            )}
            <Notice tone="warning" title="二维码等同于访问权限">
              拿到二维码的人都能查看这间会议室。如果二维码外泄，可以在房间列表里「更换二维码」。
            </Notice>
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

/**
 * Link back to the room list.
 *
 * @returns The link.
 */
function BackLink() {
  return (
    <Link to="/admin/rooms" {...stylex.props(styles.back)}>
      <ArrowLeft size={18} aria-hidden />
      返回房间列表
    </Link>
  );
}
