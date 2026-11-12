/**
 * Promise-based confirmation and choice dialogs (Animate UI alert dialog on Base UI).
 *
 * Call {@link confirmAction} or {@link chooseAction} from anywhere; render {@link DialogHost} once.
 *
 * @module
 */
import { AlertDialog } from "@animate-ui/react/primitives/base-ui/alert-dialog";
import * as stylex from "@stylexjs/stylex";
import { createStore, useSelector } from "@tanstack/react-store";
import type { ReactNode } from "react";

import { colors, fonts, media, radii } from "../styles/tokens.stylex";
import { Button, type ButtonVariant } from "./button";

/** One button of a choice dialog. */
export interface ChoiceOption<Value extends string> {
  value: Value;
  label: string;
  description?: string;
  variant?: ButtonVariant;
}

/** Request shown by the host. */
interface DialogRequest {
  title: string;
  description?: ReactNode;
  options: ChoiceOption<string>[];
  cancelLabel: string;
  resolve: (value: string | undefined) => void;
}

const dialogStore = createStore<{ request?: DialogRequest | undefined }>({});

/**
 * Ask the user to pick one of several actions.
 *
 * @param title - Dialog title.
 * @param options - Choices (first is the primary action).
 * @param description - Extra explanation.
 * @returns The chosen value, or `undefined` if cancelled.
 */
export function chooseAction<Value extends string>(
  title: string,
  options: ChoiceOption<Value>[],
  description?: ReactNode,
): Promise<Value | undefined> {
  return new Promise((resolve) => {
    dialogStore.state.request?.resolve(undefined);
    dialogStore.setState(() => ({
      request: {
        title,
        description,
        options,
        cancelLabel: "取消",
        resolve: (value) => resolve(options.find((option) => option.value === value)?.value),
      },
    }));
  });
}

/**
 * Ask the user to confirm an action.
 *
 * @param title - Dialog title, e.g. `取消这次预约？`.
 * @param confirmLabel - Label of the confirming button.
 * @param description - Extra explanation.
 * @param isDestructive - Style the confirm button as dangerous.
 * @returns `true` when confirmed.
 */
export async function confirmAction(
  title: string,
  confirmLabel: string,
  description?: ReactNode,
  isDestructive = true,
): Promise<boolean> {
  const choice = await chooseAction(
    title,
    [{ value: "confirm", label: confirmLabel, variant: isDestructive ? "danger" : "primary" }],
    description,
  );

  return choice === "confirm";
}

const styles = stylex.create({
  backdrop: { backgroundColor: colors.scrim, inset: 0, position: "fixed", zIndex: 60 },
  popup: {
    backgroundColor: colors.surface,
    borderRadius: radii.extraLarge,
    bottom: { default: 12, [media.tablet]: "auto" },
    boxShadow: `0 20px 60px ${colors.shadowStrong}`,
    color: colors.text,
    display: "flex",
    flexDirection: "column",
    fontFamily: fonts.sans,
    gap: 12,
    insetInline: { default: 12, [media.tablet]: "auto" },
    left: { default: null, [media.tablet]: "50%" },
    maxWidth: { default: null, [media.tablet]: 440 },
    outline: "none",
    padding: 20,
    position: "fixed",
    top: { default: "auto", [media.tablet]: "30%" },
    translate: { default: null, [media.tablet]: "-50% 0" },
    width: { default: "auto", [media.tablet]: "100%" },
    zIndex: 60,
  },
  title: { fontSize: fonts.sizeLg, fontWeight: 700, lineHeight: 1.4 },
  description: { color: colors.textMuted, fontSize: fonts.sizeMd, lineHeight: 1.6 },
  actions: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 },
  optionHint: { color: colors.textMuted, fontSize: fonts.sizeXs, fontWeight: 400 },
  optionLabel: { alignItems: "center", display: "flex", flexDirection: "column", gap: 2 },
});

/**
 * Renders the pending confirmation or choice dialog.
 *
 * @returns The dialog host.
 */
export function DialogHost() {
  const request = useSelector(dialogStore, (state) => state.request);

  /**
   * Close the dialog and settle its promise.
   *
   * @param value - The chosen value.
   */
  function settle(value: string | undefined): void {
    request?.resolve(value);
    dialogStore.setState(() => ({}));
  }

  return (
    <AlertDialog.Root
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) settle(undefined);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop {...stylex.props(styles.backdrop)} />
        <AlertDialog.Popup from="bottom" {...stylex.props(styles.popup)}>
          <AlertDialog.Title {...stylex.props(styles.title)}>{request?.title}</AlertDialog.Title>
          {request?.description === undefined ? null : (
            <AlertDialog.Description {...stylex.props(styles.description)}>
              {request.description}
            </AlertDialog.Description>
          )}
          <div {...stylex.props(styles.actions)}>
            {(request?.options ?? []).map((option, index) => (
              <Button
                key={option.value}
                size="lg"
                isFullWidth
                variant={option.variant ?? (index === 0 ? "primary" : "secondary")}
                onClick={() => settle(option.value)}
              >
                <span {...stylex.props(styles.optionLabel)}>
                  {option.label}
                  {option.description === undefined ? null : (
                    <span {...stylex.props(styles.optionHint)}>{option.description}</span>
                  )}
                </span>
              </Button>
            ))}
            <AlertDialog.Close render={<Button size="lg" isFullWidth variant="ghost" />}>
              {request?.cancelLabel ?? "取消"}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
