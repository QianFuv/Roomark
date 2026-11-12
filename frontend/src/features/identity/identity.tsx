/**
 * Identity flow: pick a name from the preset list (or add yourself), then set or enter the
 * personal passcode. Any write action calls {@link requestSession} first.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { createStore, useSelector } from "@tanstack/react-store";
import { ChevronRight, RotateCcw, Search, UserPlus } from "lucide-react";
import { useState } from "react";

import { api, asProblem, errorMessage, fetchClient, serverUrl, type Person } from "../../api/client";
import { overlayHistorySettled } from "../../app/overlay-history";
import { formatClock, minutesBetween, nowZoned, parseZoned } from "../../lib/time";
import { appStore, setSession, type StoredSession } from "../../state/app-store";
import { colors, fonts, media, radii, sizes, space } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { TextField } from "../../ui/field";
import { ICON_SIZE } from "../../ui/icon";
import { Badge, EmptyState, Notice, Skeleton, Stack } from "../../ui/layout";
import { PASSCODE_LENGTH, PasscodeInput } from "../../ui/passcode";
import { HelpHint } from "../../ui/help-hint";
import { Sheet } from "../../ui/sheet";
import { notify } from "../../ui/toast";
import { text } from "../../ui/typography";

interface IdentityRequest {
  roomSlug?: string | undefined;
  /** `switch`: replace the current identity; cancelling keeps it. */
  mode: "login" | "switch";
  resolvers: ((session: StoredSession | undefined) => void)[];
}

const identityStore = createStore<{ request?: IdentityRequest | undefined }>({});

const ROLE_LABELS: Record<Person["role"], string> = { teacher: "老师", student: "学生", other: "其他" };

/**
 * Resolve with the current session, asking the user to identify themselves when there is none.
 *
 * @param roomSlug - Room whose people list to show (any room the device has a token for).
 * @returns The session, or `undefined` if the user cancelled.
 */
export function requestSession(roomSlug?: string): Promise<StoredSession | undefined> {
  const existing = appStore.state.session;

  if (existing !== undefined) return Promise.resolve(existing);

  return openIdentitySheet("login", roomSlug);
}

/**
 * Open the identity sheet to become someone else, right where the user is. Cancelling keeps the
 * current identity; choosing another one replaces it and signs the old session out.
 *
 * @returns The new session, or `undefined` if the user cancelled.
 */
export function switchIdentity(): Promise<StoredSession | undefined> {
  return openIdentitySheet("switch");
}

/**
 * Show the identity sheet (or join the request already showing).
 *
 * @param mode - Sign in or switch.
 * @param roomSlug - Room whose people list to show.
 * @returns The session, or `undefined` if cancelled.
 */
function openIdentitySheet(
  mode: IdentityRequest["mode"],
  roomSlug?: string,
): Promise<StoredSession | undefined> {
  return new Promise((resolve) => {
    identityStore.setState((state) => ({
      request: {
        roomSlug: roomSlug ?? state.request?.roomSlug ?? fallbackRoomSlug(),
        mode: state.request?.mode ?? mode,
        resolvers: [...(state.request?.resolvers ?? []), resolve],
      },
    }));
  });
}

/**
 * Any room this device knows, preferring the last viewed one.
 *
 * @returns A slug or `undefined`.
 */
function fallbackRoomSlug(): string | undefined {
  const { lastRoomSlug, rooms } = appStore.state;

  if (lastRoomSlug !== undefined && rooms[lastRoomSlug] !== undefined) return lastRoomSlug;

  return Object.keys(rooms)[0];
}

/**
 * Log out on the server and forget the session on this device.
 *
 * @returns A promise that settles after logout.
 */
export async function logout(): Promise<void> {
  await fetchClient.DELETE("/api/sessions/current").catch(() => undefined);
  setSession(undefined);
}

/**
 * Close the identity sheet and settle all waiting callers.
 *
 * @param session - The new session, or `undefined` when cancelled.
 */
function settleRequest(session: StoredSession | undefined): void {
  const request = identityStore.state.request;

  identityStore.setState(() => ({}));
  window.setTimeout(() => {
    void overlayHistorySettled().then(() => request?.resolvers.forEach((resolve) => resolve(session)));
  }, 0);
}

/**
 * Store a fresh session and finish the flow.
 *
 * @param session - Session from the API.
 */
function completeSession(session: StoredSession): void {
  const previous = appStore.state.session;

  if (previous !== undefined && previous.token !== session.token) {
    void fetch(serverUrl("/api/sessions/current"), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${previous.token}` },
    }).catch(() => undefined);
  }

  setSession(session);
  notify("success", `你好，${session.person.name}`);
  settleRequest(session);
}

/**
 * Message for a locked account.
 *
 * @param lockedUntil - Timestamp until which the person is locked.
 * @returns Chinese message with remaining minutes.
 */
function lockedMessage(lockedUntil: string | undefined): string {
  if (lockedUntil === undefined || lockedUntil === "") return "口令错太多次，15 分钟后再试";

  const minutes = Math.max(1, minutesBetween(nowZoned(), parseZoned(lockedUntil)));

  return `口令错太多次，${formatClock(lockedUntil)} 后再试（约 ${minutes} 分钟）`;
}

type Step =
  | { kind: "pick" }
  | { kind: "login"; person: Person }
  | { kind: "claim"; person: Person }
  | { kind: "custom" }
  | { kind: "manual" };

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: space.xs },
  personButton: {
    alignItems: "center",
    backgroundColor: { default: colors.surface, ":hover": colors.surfaceHover },
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    fontFamily: fonts.sans,
    gap: space.sm,
    minHeight: sizes.controlLarge,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: space.rowPaddingInline,
    textAlign: "start",
    width: "100%",
  },
  personName: { flexGrow: 1 },
  chevron: { color: colors.textSubtle, flexShrink: 0 },
  selected: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    gap: space.md,
    minHeight: 56,
    paddingBottom: space.md,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    color: colors.primaryText,
    display: "inline-flex",
    flexShrink: 0,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  selectedText: { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 },
  selectedName: {
    color: colors.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  selectedTag: { color: colors.textMuted },
  steps: { alignItems: "center", display: "flex", gap: space.xs },
  stepDot: {
    backgroundColor: colors.borderStrong,
    borderRadius: radii.pill,
    height: 6,
    transitionDuration: { default: "160ms", [media.reducedMotion]: "0ms" },
    transitionProperty: "background-color, width",
    width: 6,
  },
  stepDotActive: { backgroundColor: colors.primary, width: 18 },
  stepDotDone: { backgroundColor: colors.primary },
  linkButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.primaryText,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fonts.sans,
    gap: space.xs,
    minHeight: sizes.controlSmall,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    padding: 0,
  },
});

/**
 * The identity bottom sheet. Render once near the root.
 *
 * @returns The sheet.
 */
export function IdentitySheet() {
  const request = useSelector(identityStore, (state) => state.request);
  const isOpen = request !== undefined;

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) settleRequest(undefined);
      }}
      title={request?.mode === "switch" ? "切换身份" : "登录"}
    >
      {isOpen ? <IdentityFlow key={request.roomSlug ?? "none"} roomSlug={request.roomSlug} /> : null}
    </Sheet>
  );
}

/**
 * Steps of the identity flow.
 *
 * @param props - Flow props.
 * @param props.roomSlug - Room for the people list.
 * @returns The current step.
 */
function IdentityFlow({ roomSlug }: { roomSlug: string | undefined }) {
  const [step, setStep] = useState<Step>(roomSlug === undefined ? { kind: "manual" } : { kind: "pick" });

  if (step.kind === "pick" && roomSlug !== undefined) {
    return (
      <PickPerson
        roomSlug={roomSlug}
        onPick={(person) =>
          setStep(person.hasPasscode ? { kind: "login", person } : { kind: "claim", person })
        }
        onCustom={() => setStep({ kind: "custom" })}
        onManual={() => setStep({ kind: "manual" })}
      />
    );
  }

  if (step.kind === "login") {
    return (
      <EnterPasscode
        person={step.person}
        onBack={() => setStep({ kind: "pick" })}
        onNeedsClaim={() => setStep({ kind: "claim", person: step.person })}
      />
    );
  }

  if (step.kind === "claim") {
    return (
      <ClaimPasscode person={step.person} roomSlug={roomSlug} onBack={() => setStep({ kind: "pick" })} />
    );
  }

  if (step.kind === "custom")
    return <CustomName roomSlug={roomSlug} onBack={() => setStep({ kind: "pick" })} />;

  return <ManualLogin onBack={roomSlug === undefined ? undefined : () => setStep({ kind: "pick" })} />;
}

/**
 * Searchable preset list.
 *
 * @param props - Step props.
 * @param props.roomSlug - Room for the token.
 * @param props.onPick - Called with the chosen person.
 * @param props.onCustom - Called for "我不在名单里".
 * @param props.onManual - Called when the list cannot load.
 * @returns The step.
 */
function PickPerson({
  roomSlug,
  onPick,
  onCustom,
  onManual,
}: {
  roomSlug: string;
  onPick: (person: Person) => void;
  onCustom: () => void;
  onManual: () => void;
}) {
  const [query, setQuery] = useState("");
  const people = api.useQuery("get", "/api/people", { params: { query: { room: roomSlug } } });
  const normalized = query.trim().toLowerCase();
  const matches = (people.data ?? []).filter((person) => person.name.toLowerCase().includes(normalized));

  return (
    <Stack gap="md">
      <TextField
        label="搜索姓名"
        type="search"
        placeholder="输入姓名"
        value={query}
        onValueChange={setQuery}
        autoComplete="off"
      />
      {people.isPending ? (
        <Stack gap="sm">
          <Skeleton height={52} />
          <Skeleton height={52} />
          <Skeleton height={52} />
        </Stack>
      ) : people.isError ? (
        <Notice tone="warning" title="名单加载失败">
          {errorMessage(people.error)}
          <div>
            <button type="button" onClick={onManual} {...stylex.props(text.label, styles.linkButton)}>
              直接输入姓名和口令
            </button>
          </div>
        </Notice>
      ) : matches.length === 0 ? (
        <EmptyState icon={<Search size={ICON_SIZE.empty} aria-hidden />} title="名单里没有这个名字" />
      ) : (
        <ul aria-label="名单" {...stylex.props(styles.list)}>
          {matches.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => onPick(person)} {...stylex.props(styles.personButton)}>
                <span {...stylex.props(text.label, styles.personName)}>{person.name}</span>
                <Badge>{ROLE_LABELS[person.role]}</Badge>
                {person.hasPasscode ? null : <Badge tone="info">首次使用</Badge>}
                <ChevronRight aria-hidden {...stylex.props(styles.chevron)} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" isFullWidth icon={<UserPlus aria-hidden />} onClick={onCustom}>
        我不在名单里
      </Button>
    </Stack>
  );
}

/**
 * Compact row naming who is being identified, with an inline change action.
 *
 * @param props - Row props.
 * @param props.name - The name.
 * @param props.tag - Short description under the name.
 * @param props.onChange - Pick another name.
 * @returns The row.
 */
function SelectedPerson({
  name,
  tag,
  onChange,
}: {
  name: string;
  tag: string;
  onChange?: (() => void) | undefined;
}) {
  return (
    <div {...stylex.props(styles.selected)}>
      <span aria-hidden {...stylex.props(text.title, styles.avatar)}>
        {name.slice(0, 1)}
      </span>
      <span {...stylex.props(styles.selectedText)}>
        <span {...stylex.props(text.title, styles.selectedName)}>{name}</span>
        <span {...stylex.props(text.meta, styles.selectedTag)}>{tag}</span>
      </span>
      {onChange === undefined ? null : (
        <Button variant="ghost" size="sm" aria-label="换个名字" onClick={onChange}>
          换人
        </Button>
      )}
    </div>
  );
}

/**
 * Enter the passcode of a claimed name; signs in as soon as six digits are typed.
 *
 * @param props - Step props.
 * @param props.person - The person.
 * @param props.onBack - Go back to the list.
 * @param props.onNeedsClaim - The name turned out to be unclaimed.
 * @returns The step.
 */
function EnterPasscode({
  person,
  onBack,
  onNeedsClaim,
}: {
  person: Person;
  onBack: () => void;
  onNeedsClaim: () => void;
}) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string>();
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Try to log in.
   *
   * @param value - Entered passcode.
   */
  async function submit(value: string): Promise<void> {
    setIsSubmitting(true);
    setError(undefined);

    const result = await fetchClient.POST("/api/sessions", {
      body: { personId: person.id, passcode: value },
    });

    setIsSubmitting(false);

    if (result.data !== undefined) {
      completeSession(result.data);

      return;
    }

    const problem = asProblem(result.error);

    setPasscode("");

    if (problem?.code === "passcode_not_set") {
      onNeedsClaim();

      return;
    }

    if (problem?.status === 423) {
      setIsLocked(true);
      setError(lockedMessage(problem.lockedUntil));

      return;
    }

    setError(problem?.code === "invalid_passcode" ? "口令不对，再试一次" : errorMessage(result.error));
  }

  return (
    <Stack gap="lg">
      <SelectedPerson name={person.name} tag={ROLE_LABELS[person.role]} onChange={onBack} />
      {isLocked ? (
        <Notice tone="busy" title="已锁定" isLive>
          {error}
        </Notice>
      ) : (
        <PasscodeInput
          label={`输入 ${PASSCODE_LENGTH} 位口令`}
          labelAside={<HelpHint topic="口令">忘了口令请找管理员重置。连续输错 5 次会锁定 15 分钟。</HelpHint>}
          value={passcode}
          onValueChange={setPasscode}
          onComplete={(value) => void submit(value)}
          error={error}
          isDisabled={isSubmitting}
          isAutoFocus
        />
      )}
    </Stack>
  );
}

/**
 * Two dots showing the step of setting a passcode.
 *
 * @param props - Indicator props.
 * @param props.isConfirming - Second step active.
 * @returns The indicator.
 */
function StepDots({ isConfirming }: { isConfirming: boolean }) {
  return (
    <span aria-hidden {...stylex.props(styles.steps)}>
      <span {...stylex.props(styles.stepDot, isConfirming ? styles.stepDotDone : styles.stepDotActive)} />
      <span {...stylex.props(styles.stepDot, isConfirming && styles.stepDotActive)} />
    </span>
  );
}

/**
 * Choose a passcode by entering it twice; submits as soon as the second entry matches.
 *
 * @param props - Component props.
 * @param props.onSubmit - Called with the confirmed passcode.
 * @param props.isSubmitting - Disable input while saving.
 * @param props.submitError - Error from the server.
 * @returns The passcode setter.
 */
function NewPasscode({
  onSubmit,
  isSubmitting,
  submitError,
}: {
  onSubmit: (passcode: string) => void;
  isSubmitting: boolean;
  submitError: string | undefined;
}) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [mismatch, setMismatch] = useState<string>();

  /** Start over from the first entry. */
  function restart(): void {
    setFirst("");
    setSecond("");
    setIsConfirming(false);
  }

  return (
    <Stack gap="md">
      <StepDots isConfirming={isConfirming} />
      {isConfirming ? (
        <PasscodeInput
          key="confirm"
          label="再输一次确认"
          value={second}
          onValueChange={setSecond}
          onComplete={(value) => {
            if (value === first) {
              onSubmit(value);

              return;
            }

            setMismatch("两次不一致，请重新设置");
            restart();
          }}
          error={submitError}
          isDisabled={isSubmitting}
          isAutoFocus
        />
      ) : (
        <PasscodeInput
          key="first"
          label={`设置 ${PASSCODE_LENGTH} 位数字口令`}
          labelAside={<HelpHint topic="口令">以后在任何设备上选这个名字，都用这个口令登录。</HelpHint>}
          value={first}
          onValueChange={setFirst}
          onComplete={() => {
            setMismatch(undefined);
            setIsConfirming(true);
          }}
          error={mismatch}
          isAutoFocus
        />
      )}
      {isConfirming ? (
        <button type="button" onClick={restart} {...stylex.props(text.label, styles.linkButton)}>
          <RotateCcw aria-hidden />
          重新设置
        </button>
      ) : null}
    </Stack>
  );
}

/**
 * Claim an unclaimed preset name.
 *
 * @param props - Step props.
 * @param props.person - The person.
 * @param props.roomSlug - Room for the token.
 * @param props.onBack - Go back.
 * @returns The step.
 */
function ClaimPasscode({
  person,
  roomSlug,
  onBack,
}: {
  person: Person;
  roomSlug: string | undefined;
  onBack: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <Stack gap="lg">
      <SelectedPerson name={person.name} tag={`${ROLE_LABELS[person.role]} · 首次使用`} onChange={onBack} />
      <NewPasscode
        isSubmitting={isSubmitting}
        submitError={error}
        onSubmit={(passcode) => {
          setIsSubmitting(true);
          void fetchClient
            .POST("/api/people/{id}/claim", {
              params: { path: { id: person.id }, query: roomSlug === undefined ? {} : { room: roomSlug } },
              body: { passcode },
            })
            .then((result) => {
              setIsSubmitting(false);

              if (result.data !== undefined) completeSession(result.data);
              else if (asProblem(result.error)?.code === "already_claimed") {
                setError("这个名字刚被设了口令，请返回后直接输入口令");
              } else setError(errorMessage(result.error));
            });
        }}
      />
    </Stack>
  );
}

/**
 * Add yourself with a custom name.
 *
 * @param props - Step props.
 * @param props.roomSlug - Room for the token.
 * @param props.onBack - Go back.
 * @returns The step.
 */
function CustomName({ roomSlug, onBack }: { roomSlug: string | undefined; onBack: () => void }) {
  const [name, setName] = useState("");
  const [isNameConfirmed, setIsNameConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const trimmed = name.trim();

  if (!isNameConfirmed) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (trimmed === "") return;

          setError(undefined);
          setIsNameConfirmed(true);
        }}
      >
        <Stack gap="lg">
          <TextField
            label="你的名字"
            placeholder="如：王小明"
            value={name}
            onValueChange={setName}
            maxLength={20}
            autoFocus
            error={error}
          />
          <Stack gap="sm">
            <Button type="submit" variant="primary" size="lg" isFullWidth disabled={trimmed.length === 0}>
              下一步
            </Button>
            <Button variant="ghost" isFullWidth onClick={onBack}>
              返回名单
            </Button>
          </Stack>
        </Stack>
      </form>
    );
  }

  return (
    <Stack gap="lg">
      <SelectedPerson name={trimmed} tag="新名字" onChange={() => setIsNameConfirmed(false)} />
      <NewPasscode
        isSubmitting={isSubmitting}
        submitError={undefined}
        onSubmit={(passcode) => {
          setIsSubmitting(true);
          void fetchClient
            .POST("/api/people", {
              params: { query: roomSlug === undefined ? {} : { room: roomSlug } },
              body: { name: trimmed, passcode },
            })
            .then((result) => {
              setIsSubmitting(false);

              if (result.data !== undefined) {
                completeSession(result.data);

                return;
              }

              setError(
                asProblem(result.error)?.code === "name_taken"
                  ? "这个名字已有人用，换一个或回名单里选"
                  : errorMessage(result.error),
              );
              setIsNameConfirmed(false);
            });
        }}
      />
    </Stack>
  );
}

/**
 * Type a name and passcode (used when no room list is available, and on the admin entry). Signs
 * in as soon as the sixth digit is typed when a name is filled in.
 *
 * @param props - Step props.
 * @param props.onBack - Back to the list, if a list exists.
 * @param props.onSuccess - Called after login instead of completing the identity request.
 * @returns The form.
 */
export function ManualLogin({
  onBack,
  onSuccess,
}: {
  onBack?: (() => void) | undefined;
  onSuccess?: ((session: StoredSession) => void) | undefined;
}) {
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Try to log in.
   *
   * @param value - The passcode.
   */
  async function submit(value: string): Promise<void> {
    if (name.trim() === "" || value.length !== PASSCODE_LENGTH) return;

    setIsSubmitting(true);
    setError(undefined);

    const result = await fetchClient.POST("/api/sessions", { body: { name: name.trim(), passcode: value } });

    setIsSubmitting(false);

    if (result.data !== undefined) {
      if (onSuccess === undefined) completeSession(result.data);
      else {
        setSession(result.data);
        onSuccess(result.data);
      }

      return;
    }

    const problem = asProblem(result.error);

    setPasscode("");

    if (problem?.status === 423) setError(lockedMessage(problem.lockedUntil));
    else if (problem?.code === "passcode_not_set") setError("这个名字还没设口令，请在会议室的名单里选它");
    else if (problem?.code === "invalid_passcode") setError("姓名或口令不对");
    else setError(errorMessage(result.error));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(passcode);
      }}
    >
      <Stack gap="lg">
        <TextField label="姓名" value={name} onValueChange={setName} autoComplete="username" required />
        <PasscodeInput
          label={`${PASSCODE_LENGTH} 位口令`}
          value={passcode}
          onValueChange={setPasscode}
          onComplete={(value) => void submit(value)}
          error={error}
          isDisabled={isSubmitting}
        />
        <Stack gap="sm">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isFullWidth
            isLoading={isSubmitting}
            disabled={name.trim() === "" || passcode.length !== PASSCODE_LENGTH}
          >
            登录
          </Button>
          {onBack === undefined ? null : (
            <Button variant="ghost" isFullWidth onClick={onBack}>
              返回名单
            </Button>
          )}
        </Stack>
      </Stack>
    </form>
  );
}

/**
 * Passcode change: current passcode, then the new one twice.
 *
 * @param props - Component props.
 * @param props.onDone - Close the sheet.
 * @returns The form.
 */
export function ChangePasscodeForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [isCurrentEntered, setIsCurrentEntered] = useState(false);
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isCurrentEntered) {
    return (
      <PasscodeInput
        label="输入当前口令"
        value={current}
        onValueChange={setCurrent}
        onComplete={() => {
          setError(undefined);
          setIsCurrentEntered(true);
        }}
        error={error}
        isAutoFocus
      />
    );
  }

  return (
    <NewPasscode
      isSubmitting={isSubmitting}
      submitError={error}
      onSubmit={(next) => {
        setIsSubmitting(true);
        void fetchClient.PUT("/api/me/passcode", { body: { current, next } }).then((result) => {
          setIsSubmitting(false);

          if (result.data !== undefined) {
            notify("success", "口令已修改");
            onDone();

            return;
          }

          setError(errorMessage(result.error));
          setCurrent("");
          setIsCurrentEntered(false);
        });
      }}
    />
  );
}
