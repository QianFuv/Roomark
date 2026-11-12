/**
 * Bind a room on this device: scan the door QR code (Android) or paste its link.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardPaste, ScanLine } from "lucide-react";
import { useState } from "react";

import { platform } from "../../platform/platform";
import { rememberRoom } from "../../state/app-store";
import { Button } from "../../ui/button";
import { TextField } from "../../ui/field";
import { Stack } from "../../ui/layout";
import { notify } from "../../ui/toast";

/** Room reference found in a QR link. */
export interface RoomLink {
  slug: string;
  token: string;
}

/**
 * Parse a door QR link such as `https://rooms.example.com/r/9070?k=abc`.
 *
 * @param text - Scanned or pasted text.
 * @returns The room reference, or `undefined` if the text is not a room link.
 */
export function parseRoomLink(text: string): RoomLink | undefined {
  try {
    const url = new URL(text.trim(), "https://placeholder.invalid");
    const match = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
    const token = url.searchParams.get("k");

    if (match?.[1] === undefined || token === null || token === "") return undefined;

    return { slug: decodeURIComponent(match[1]), token };
  } catch {
    return undefined;
  }
}

const styles = stylex.create({
  root: { maxWidth: 420, width: "100%" },
});

/**
 * Scan and paste actions.
 *
 * @returns The actions.
 */
export function ScanRoomActions() {
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string>();
  const [isScanning, setIsScanning] = useState(false);
  const host = platform();

  /**
   * Bind a room from text.
   *
   * @param text - Link text.
   */
  function bind(text: string): void {
    const parsed = parseRoomLink(text);

    if (parsed === undefined) {
      setError("这不是会议室二维码的链接");

      return;
    }

    rememberRoom(parsed.slug, parsed.token);
    void navigate({ to: "/r/$slug", params: { slug: parsed.slug } });
  }

  return (
    <div {...stylex.props(styles.root)}>
      <Stack gap="md">
        {host.canScan ? (
          <Button
            variant="primary"
            size="lg"
            isFullWidth
            isLoading={isScanning}
            icon={<ScanLine size={20} aria-hidden />}
            onClick={() => {
              setIsScanning(true);
              void host
                .scanQr()
                .then(bind)
                .catch(() => notify("error", "没有识别到二维码", "请对准门口的二维码重新拍照"))
                .finally(() => setIsScanning(false));
            }}
          >
            扫码绑定
          </Button>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            bind(link);
          }}
        >
          <Stack gap="sm">
            <TextField
              label="粘贴二维码链接"
              placeholder="https://…/r/会议室?k=…"
              value={link}
              onValueChange={(value) => {
                setLink(value);
                setError(undefined);
              }}
              error={error}
              inputMode="url"
              autoComplete="off"
            />
            <Button
              type="submit"
              variant="secondary"
              isFullWidth
              disabled={link.trim() === ""}
              icon={<ClipboardPaste size={18} aria-hidden />}
            >
              打开会议室
            </Button>
          </Stack>
        </form>
      </Stack>
    </div>
  );
}
