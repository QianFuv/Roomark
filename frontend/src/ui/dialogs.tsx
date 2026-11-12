/**
 * Promise-based confirmation and choice dialogs, shown in the shared {@link Sheet} overlay.
 *
 * Call {@link confirmAction} or {@link chooseAction} from anywhere; render {@link DialogHost} once.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { createStore, useSelector } from "@tanstack/react-store";
import { useState, type ReactNode } from "react";

import { colors, space } from "../styles/tokens.stylex";
import { Button, type ButtonVariant } from "./button";
import { Sheet } from "./sheet";
import { text } from "./typography";

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
  /** Give the dialog its own history entry so back closes it (off while a navigation waits on it). */
  isHistoryEntry: boolean;
  resolve: (value: string | undefined) => void;
}

const dialogStore = createStore<{ request?: DialogRequest | undefined }>({});

/**
 * Ask the user to pick one of several actions.
 *
 * @param title - Dialog title.
 * @param options - Choices (first is the primary action).
 * @param description - Extra explanation.
 * @param isHistoryEntry - Let back close the dialog; turn off when a navigation waits on the answer.
 * @returns The chosen value, or `undefined` if cancelled.
 */
export function chooseAction<Value extends string>(
  title: string,
  options: ChoiceOption<Value>[],
  description?: ReactNode,
  isHistoryEntry = true,
): Promise<Value | undefined> {
  return new Promise((resolve) => {
    dialogStore.state.request?.resolve(undefined);
    dialogStore.setState(() => ({
      request: {
        title,
        description,
        options,
        cancelLabel: "取消",
        isHistoryEntry,
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
 * @param isHistoryEntry - Let back close the dialog; turn off when a navigation waits on the answer.
 * @returns `true` when confirmed.
 */
export async function confirmAction(
  title: string,
  confirmLabel: string,
  description?: ReactNode,
  isDestructive = true,
  isHistoryEntry = true,
): Promise<boolean> {
  const choice = await chooseAction(
    title,
    [{ value: "confirm", label: confirmLabel, variant: isDestructive ? "danger" : "primary" }],
    description,
    isHistoryEntry,
  );

  return choice === "confirm";
}

const styles = stylex.create({
  actions: { display: "flex", flexDirection: "column", gap: space.controlGap, marginTop: space.xs },
  optionHint: { color: colors.textMuted },
  optionLabel: { alignItems: "center", display: "flex", flexDirection: "column" },
});

/**
 * Renders the pending confirmation or choice dialog in the shared overlay window (a drawer on
 * mobile, a centered modal from 768 px).
 *
 * @returns The dialog host.
 */
export function DialogHost() {
  const request = useSelector(dialogStore, (state) => state.request);
  const [shown, setShown] = useState(request);

  if (request !== undefined && request !== shown) setShown(request);

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
    <Sheet
      isAlert
      isOpen={request !== undefined}
      isHistoryEntry={request?.isHistoryEntry ?? false}
      onOpenChange={(open) => {
        if (!open) settle(undefined);
      }}
      title={shown?.title}
      description={shown?.description}
    >
      <div {...stylex.props(styles.actions)}>
        {(shown?.options ?? []).map((option, index) => (
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
                <span {...stylex.props(text.meta, styles.optionHint)}>{option.description}</span>
              )}
            </span>
          </Button>
        ))}
        <Button size="lg" isFullWidth variant="ghost" onClick={() => settle(undefined)}>
          {shown?.cancelLabel ?? "取消"}
        </Button>
      </div>
    </Sheet>
  );
}
