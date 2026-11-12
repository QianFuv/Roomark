/**
 * Bind a room on this device: type its 6-character room code (or paste the door QR link), or
 * scan the door QR code on Android.
 *
 * @module
 */
import { OTPField } from "@base-ui/react/otp-field";
import * as stylex from "@stylexjs/stylex";
import { useNavigate } from "@tanstack/react-router";
import { ScanLine } from "lucide-react";
import { useId, useState } from "react";

import { asProblem, errorMessage, fetchClient } from "../../api/client";
import { platform } from "../../platform/platform";
import { rememberRoom, rememberRoomName } from "../../state/app-store";
import { colors, fonts, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { Stack } from "../../ui/layout";
import { notify } from "../../ui/toast";

/** Characters a room code may contain (no 0/O/1/I/L). */
const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Every room code has exactly this many characters. */
const ROOM_CODE_LENGTH = 6;

const NOT_IN_ALPHABET = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, "g");

/**
 * Normalise typed or pasted text into room-code characters: a pasted QR link yields its `k`
 * parameter, letters are upper-cased and anything outside the alphabet is dropped. Idempotent.
 *
 * @param text - Typed or pasted text.
 * @returns Room-code characters (not clamped).
 */
export function normalizeRoomCode(text: string): string {
  const fromLink = /[?&]k=([^&#\s]+)/i.exec(text)?.[1];
  let raw = text;

  if (fromLink !== undefined) {
    try {
      raw = decodeURIComponent(fromLink);
    } catch {
      raw = fromLink;
    }
  }

  return raw.toUpperCase().replace(NOT_IN_ALPHABET, "");
}

/** Outcome of {@link resolveRoomCode}. */
export type ResolveOutcome = { kind: "ok"; slug: string; name: string } | { kind: "error"; message: string };

/**
 * Look a room code up on the server.
 *
 * @param code - The 6-character code.
 * @returns The room, or a short message.
 */
async function resolveRoomCode(code: string): Promise<ResolveOutcome> {
  const result = await fetchClient.POST("/api/room-codes/resolve", { body: { code } });

  if (result.data !== undefined) return { kind: "ok", slug: result.data.slug, name: result.data.name };

  const problemCode = asProblem(result.error)?.code;

  if (problemCode === "room_code_invalid") return { kind: "error", message: "没有这个房间码，请核对" };

  if (problemCode === "rate_limited") return { kind: "error", message: "试得太频繁，请稍后再试" };

  return { kind: "error", message: errorMessage(result.error) };
}

const styles = stylex.create({
  root: { maxWidth: 400, width: "100%" },
  field: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
  label: { color: colors.text, fontSize: fonts.sizeMd, fontWeight: 600 },
  slots: { display: "flex", gap: 8, width: "100%" },
  slot: {
    backgroundColor: colors.surface,
    borderColor: { default: colors.borderStrong, ":focus": colors.primary },
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1.5,
    color: colors.text,
    flexBasis: 0,
    flexGrow: 1,
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: 700,
    height: 52,
    minWidth: 0,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 0,
    textAlign: "center",
    textTransform: "uppercase",
  },
  slotInvalid: { borderColor: colors.busy },
  message: { color: colors.busy, fontSize: fonts.sizeSm, lineHeight: 1.5 },
  pending: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.5 },
});

/**
 * Six room-code boxes that upper-case input, accept a pasted code or QR link, and submit when
 * full.
 *
 * @param props - Input props.
 * @param props.onBound - Called with the slug after the room is stored on this device.
 * @param props.isAutoFocus - Focus the first box on mount.
 * @returns The input.
 */
export function RoomCodeInput({
  onBound,
  isAutoFocus = false,
}: {
  onBound: (slug: string) => void;
  isAutoFocus?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const [isChecking, setIsChecking] = useState(false);

  /**
   * Resolve a complete code and bind the room.
   *
   * @param code - The code.
   */
  async function submit(code: string): Promise<void> {
    setIsChecking(true);
    setError(undefined);

    const outcome = await resolveRoomCode(code);

    setIsChecking(false);

    if (outcome.kind === "error") {
      setError(outcome.message);
      setValue("");

      return;
    }

    rememberRoom(outcome.slug, code);
    rememberRoomName(outcome.slug, outcome.name);
    onBound(outcome.slug);
  }

  return (
    <div {...stylex.props(styles.field)}>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        房间码
      </label>
      <OTPField.Root
        id={id}
        length={ROOM_CODE_LENGTH}
        validationType="none"
        normalizeValue={normalizeRoomCode}
        inputMode="text"
        autoComplete="off"
        value={value}
        disabled={isChecking}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onValueChange={(next) => {
          setValue(next);
          setError(undefined);
        }}
        onValueComplete={(next) => void submit(next)}
        {...stylex.props(styles.slots)}
      >
        {Array.from({ length: ROOM_CODE_LENGTH }, (_unused, index) => (
          <OTPField.Input
            key={index}
            autoFocus={isAutoFocus && index === 0}
            autoCapitalize="characters"
            spellCheck={false}
            aria-label={index === 0 ? undefined : `房间码第 ${index + 1} 位，共 ${ROOM_CODE_LENGTH} 位`}
            {...stylex.props(styles.slot, error !== undefined && styles.slotInvalid)}
          />
        ))}
      </OTPField.Root>
      {error === undefined ? (
        isChecking ? (
          <p role="status" {...stylex.props(styles.pending)}>
            正在查找…
          </p>
        ) : null
      ) : (
        <p id={`${id}-error`} role="alert" {...stylex.props(styles.message)}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Room-code entry plus, on Android, 扫码绑定. Opens the room once it is bound.
 *
 * @param props - Action props.
 * @param props.isAutoFocus - Focus the code input on mount.
 * @returns The actions.
 */
export function ScanRoomActions({ isAutoFocus = false }: { isAutoFocus?: boolean }) {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const host = platform();

  /**
   * Open a bound room.
   *
   * @param slug - Room slug.
   */
  function open(slug: string): void {
    void navigate({ to: "/r/$slug", params: { slug } });
  }

  /**
   * Bind from a scanned QR link by resolving its code.
   *
   * @param text - Scanned text.
   */
  async function bindScanned(text: string): Promise<void> {
    const code = normalizeRoomCode(text).slice(0, ROOM_CODE_LENGTH);
    const outcome = code.length === ROOM_CODE_LENGTH ? await resolveRoomCode(code) : undefined;

    if (outcome?.kind !== "ok") {
      notify("error", "不是会议室二维码", outcome?.message);

      return;
    }

    rememberRoom(outcome.slug, code);
    rememberRoomName(outcome.slug, outcome.name);
    open(outcome.slug);
  }

  return (
    <div {...stylex.props(styles.root)}>
      <Stack gap="lg">
        <RoomCodeInput onBound={open} isAutoFocus={isAutoFocus} />
        {host.canScan ? (
          <Button
            variant="secondary"
            size="lg"
            isFullWidth
            isLoading={isScanning}
            icon={<ScanLine size={20} aria-hidden />}
            onClick={() => {
              setIsScanning(true);
              void host
                .scanQr()
                .then(bindScanned)
                .catch(() => notify("error", "没有识别到二维码", "对准门口的二维码再试一次"))
                .finally(() => setIsScanning(false));
            }}
          >
            扫码绑定
          </Button>
        ) : null}
      </Stack>
    </div>
  );
}
