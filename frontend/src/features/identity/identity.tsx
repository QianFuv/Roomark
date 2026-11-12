/**
 * Identity flow: pick a name from the preset list (or add yourself), then set or enter the
 * personal passcode. Any write action calls {@link requestSession} first.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { createStore, useSelector } from "@tanstack/react-store";
import { Check, ChevronRight, Search, UserPlus } from "lucide-react";
import { useState } from "react";

import { api, asProblem, errorMessage, fetchClient, type Person } from "../../api/client";
import { formatClock, minutesBetween, nowZoned, parseZoned } from "../../lib/time";
import { appStore, setSession, type StoredSession } from "../../state/app-store";
import { colors, fonts, radii } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { TextField } from "../../ui/field";
import { Badge, EmptyState, Notice, Skeleton, Stack } from "../../ui/layout";
import { PasscodeInput, type PasscodeLength } from "../../ui/passcode";
import { Segmented } from "../../ui/segmented";
import { Sheet } from "../../ui/sheet";
import { notify } from "../../ui/toast";

interface IdentityRequest {
  roomSlug?: string | undefined;
  resolvers: ((session: StoredSession | undefined) => void)[];
}

const identityStore = createStore<{ request?: IdentityRequest | undefined }>({});

const ROLE_LABELS: Record<Person["role"], string> = { teacher: "老师", student: "学生", other: "其他" };

const LENGTH_KEY_PREFIX = "roomark.passcodeLength.";

/**
 * Resolve with the current session, asking the user to identify themselves when there is none.
 *
 * @param roomSlug - Room whose people list to show (any room the device has a token for).
 * @returns The session, or `undefined` if the user cancelled.
 */
export function requestSession(roomSlug?: string): Promise<StoredSession | undefined> {
  const existing = appStore.state.session;

  if (existing !== undefined) return Promise.resolve(existing);

  return new Promise((resolve) => {
    identityStore.setState((state) => ({
      request: {
        roomSlug: roomSlug ?? state.request?.roomSlug ?? fallbackRoomSlug(),
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
  request?.resolvers.forEach((resolve) => resolve(session));
}

/**
 * Store a fresh session and finish the flow.
 *
 * @param session - Session from the API.
 * @param length - Passcode length used, remembered per person on this device.
 */
function completeSession(session: StoredSession, length: PasscodeLength): void {
  setSession(session);
  rememberLength(session.person.id, length);
  notify("success", `你好，${session.person.name}`);
  settleRequest(session);
}

/**
 * Remember which passcode length a person uses on this device.
 *
 * @param personId - Person id.
 * @param length - Passcode length.
 */
function rememberLength(personId: number, length: PasscodeLength): void {
  try {
    localStorage.setItem(`${LENGTH_KEY_PREFIX}${personId}`, String(length));
  } catch {
    notify("info", "此设备无法保存设置");
  }
}

/**
 * Passcode length last used by a person on this device.
 *
 * @param personId - Person id.
 * @returns The length, or `undefined` if unknown.
 */
function rememberedLength(personId: number): PasscodeLength | undefined {
  try {
    const value = localStorage.getItem(`${LENGTH_KEY_PREFIX}${personId}`);

    return value === "6" ? 6 : value === "4" ? 4 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Message for a locked account.
 *
 * @param lockedUntil - Timestamp until which the person is locked.
 * @returns Chinese message with remaining minutes.
 */
function lockedMessage(lockedUntil: string | undefined): string {
  if (lockedUntil === undefined || lockedUntil === "") return "口令连续错误次数过多，请 15 分钟后再试";

  const minutes = Math.max(1, minutesBetween(nowZoned(), parseZoned(lockedUntil)));

  return `口令连续错误次数过多，已暂时锁定。请在 ${formatClock(lockedUntil)} 后再试（约 ${minutes} 分钟）`;
}

type Step =
  | { kind: "pick" }
  | { kind: "login"; person: Person }
  | { kind: "claim"; person: Person }
  | { kind: "custom" }
  | { kind: "manual" };

const styles = stylex.create({
  list: { display: "flex", flexDirection: "column", gap: 6 },
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
    gap: 10,
    minHeight: 56,
    outline: { default: "none", ":focus-visible": `3px solid ${colors.focusRing}` },
    paddingInline: 14,
    textAlign: "start",
    width: "100%",
  },
  personName: { flexGrow: 1, fontSize: fonts.sizeLg, fontWeight: 600 },
  chevron: { color: colors.textSubtle, flexShrink: 0 },
  whoami: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    display: "flex",
    fontSize: fonts.sizeLg,
    fontWeight: 700,
    gap: 8,
    paddingBlock: 12,
    paddingInline: 14,
  },
  hint: { color: colors.textMuted, fontSize: fonts.sizeSm, lineHeight: 1.6 },
  linkButton: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: colors.primaryText,
    cursor: "pointer",
    fontFamily: fonts.sans,
    fontSize: fonts.sizeMd,
    fontWeight: 600,
    minHeight: 44,
    padding: 0,
    textAlign: "start",
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
      title="你是谁？"
      description="选择你的名字并输入个人口令，之后在此设备上会自动记住你。"
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
        roomSlug={roomSlug}
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
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </Stack>
      ) : people.isError ? (
        <Notice tone="warning" title="名单加载失败">
          {errorMessage(people.error)}
          <div>
            <button type="button" onClick={onManual} {...stylex.props(styles.linkButton)}>
              直接输入姓名和口令
            </button>
          </div>
        </Notice>
      ) : matches.length === 0 ? (
        <EmptyState icon={<Search size={28} aria-hidden />} title="没有找到这个名字">
          <p {...stylex.props(styles.hint)}>如果你不在名单里，可以添加自己的名字。</p>
        </EmptyState>
      ) : (
        <ul aria-label="名单" {...stylex.props(styles.list)}>
          {matches.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => onPick(person)} {...stylex.props(styles.personButton)}>
                <span {...stylex.props(styles.personName)}>{person.name}</span>
                <Badge>{ROLE_LABELS[person.role]}</Badge>
                {person.hasPasscode ? null : <Badge tone="info">首次使用</Badge>}
                <ChevronRight size={18} aria-hidden {...stylex.props(styles.chevron)} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="soft"
        size="lg"
        isFullWidth
        icon={<UserPlus size={18} aria-hidden />}
        onClick={onCustom}
      >
        我不在名单里
      </Button>
    </Stack>
  );
}

/**
 * Header showing who is being identified.
 *
 * @param props - Header props.
 * @param props.name - The name.
 * @param props.onBack - Change the name.
 * @returns The header.
 */
function Whoami({ name, onBack }: { name: string; onBack?: (() => void) | undefined }) {
  return (
    <Stack gap="xs">
      <div {...stylex.props(styles.whoami)}>{name}</div>
      {onBack === undefined ? null : (
        <button type="button" onClick={onBack} {...stylex.props(styles.linkButton)}>
          不是我，换一个名字
        </button>
      )}
    </Stack>
  );
}

/**
 * Length chooser shared by the passcode steps.
 *
 * @param props - Chooser props.
 * @param props.length - Current length.
 * @param props.onLengthChange - Length setter.
 * @returns The chooser.
 */
export function LengthChooser({
  length,
  onLengthChange,
}: {
  length: PasscodeLength;
  onLengthChange: (length: PasscodeLength) => void;
}) {
  return (
    <Segmented
      label="口令位数"
      value={length === 4 ? "4" : "6"}
      options={[
        { value: "4", label: "4 位数字" },
        { value: "6", label: "6 位数字" },
      ]}
      onValueChange={(value) => onLengthChange(value === "6" ? 6 : 4)}
    />
  );
}

/**
 * Enter the passcode of a claimed name.
 *
 * @param props - Step props.
 * @param props.person - The person.
 * @param props.roomSlug - Room context.
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
  roomSlug: string | undefined;
  onBack: () => void;
  onNeedsClaim: () => void;
}) {
  const remembered = rememberedLength(person.id);
  const [length, setLength] = useState<PasscodeLength>(remembered ?? 4);
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
      completeSession(result.data, length);

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

    setError(problem?.code === "invalid_passcode" ? "口令不正确，请重试" : errorMessage(result.error));
  }

  return (
    <Stack gap="lg">
      <Whoami name={person.name} onBack={onBack} />
      {isLocked ? (
        <Notice tone="busy" title="暂时无法登录" isLive>
          {error}
        </Notice>
      ) : (
        <>
          <LengthChooser
            length={length}
            onLengthChange={(next) => {
              setLength(next);
              setPasscode("");
            }}
          />
          <PasscodeInput
            label="输入你的口令"
            length={length}
            value={passcode}
            onValueChange={setPasscode}
            onComplete={(value) => {
              if (remembered === length) void submit(value);
            }}
            error={error}
            isDisabled={isSubmitting}
            isAutoFocus
          />
          <Button
            variant="primary"
            size="lg"
            isFullWidth
            isLoading={isSubmitting}
            disabled={passcode.length !== length}
            onClick={() => void submit(passcode)}
          >
            确认
          </Button>
          <p {...stylex.props(styles.hint)}>忘记口令？请联系管理员重置。连续输错 5 次会锁定 15 分钟。</p>
        </>
      )}
    </Stack>
  );
}

/**
 * Choose a passcode by entering it twice.
 *
 * @param props - Component props.
 * @param props.onSubmit - Called with the confirmed passcode and its length.
 * @param props.isSubmitting - Disable input while saving.
 * @param props.submitError - Error from the server.
 * @returns The passcode setter.
 */
export function NewPasscode({
  onSubmit,
  isSubmitting,
  submitError,
}: {
  onSubmit: (passcode: string, length: PasscodeLength) => void;
  isSubmitting: boolean;
  submitError: string | undefined;
}) {
  const [length, setLength] = useState<PasscodeLength>(4);
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [mismatch, setMismatch] = useState<string>();

  return (
    <Stack gap="lg">
      <LengthChooser
        length={length}
        onLengthChange={(next) => {
          setLength(next);
          setFirst("");
          setSecond("");
          setIsConfirming(false);
          setMismatch(undefined);
        }}
      />
      {isConfirming ? (
        <PasscodeInput
          key="confirm"
          label="再输入一次确认"
          length={length}
          value={second}
          onValueChange={setSecond}
          onComplete={(value) => {
            if (value === first) {
              onSubmit(value, length);

              return;
            }

            setMismatch("两次输入不一致，请重新设置");
            setFirst("");
            setSecond("");
            setIsConfirming(false);
          }}
          error={submitError}
          isDisabled={isSubmitting}
          isAutoFocus
        />
      ) : (
        <PasscodeInput
          key="first"
          label="设置你的口令"
          length={length}
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
        <Stack gap="sm">
          <Button
            variant="primary"
            size="lg"
            isFullWidth
            isLoading={isSubmitting}
            disabled={second.length !== length}
            icon={<Check size={18} aria-hidden />}
            onClick={() => {
              if (second === first) onSubmit(second, length);
              else setMismatch("两次输入不一致，请重新设置");
            }}
          >
            完成
          </Button>
          <Button
            variant="ghost"
            isFullWidth
            onClick={() => {
              setFirst("");
              setSecond("");
              setIsConfirming(false);
            }}
          >
            重新设置
          </Button>
        </Stack>
      ) : null}
      <p {...stylex.props(styles.hint)}>口令只用数字。之后在任何设备上选择这个名字都需要输入它。</p>
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
      <Whoami name={person.name} onBack={onBack} />
      <Notice tone="info" title="第一次使用这个名字">
        设置一个 4 位或 6 位数字口令，用来证明是你本人。
      </Notice>
      <NewPasscode
        isSubmitting={isSubmitting}
        submitError={error}
        onSubmit={(passcode, length) => {
          setIsSubmitting(true);
          void fetchClient
            .POST("/api/people/{id}/claim", {
              params: { path: { id: person.id }, query: roomSlug === undefined ? {} : { room: roomSlug } },
              body: { passcode },
            })
            .then((result) => {
              setIsSubmitting(false);

              if (result.data !== undefined) completeSession(result.data, length);
              else if (asProblem(result.error)?.code === "already_claimed") {
                setError("这个名字刚刚被设置了口令，请返回后直接输入口令");
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
      <Stack gap="lg">
        <TextField
          label="你的名字"
          placeholder="例如：王小明"
          value={name}
          onValueChange={setName}
          maxLength={20}
          autoFocus
          error={error}
          description="其他人会在预约上看到这个名字。"
        />
        <Button
          variant="primary"
          size="lg"
          isFullWidth
          disabled={trimmed.length === 0}
          onClick={() => {
            setError(undefined);
            setIsNameConfirmed(true);
          }}
        >
          下一步
        </Button>
        <Button variant="ghost" isFullWidth onClick={onBack}>
          返回名单
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Whoami name={trimmed} onBack={() => setIsNameConfirmed(false)} />
      <NewPasscode
        isSubmitting={isSubmitting}
        submitError={undefined}
        onSubmit={(passcode, length) => {
          setIsSubmitting(true);
          void fetchClient
            .POST("/api/people", {
              params: { query: roomSlug === undefined ? {} : { room: roomSlug } },
              body: { name: trimmed, passcode },
            })
            .then((result) => {
              setIsSubmitting(false);

              if (result.data !== undefined) {
                completeSession(result.data, length);

                return;
              }

              setError(
                asProblem(result.error)?.code === "name_taken"
                  ? "这个名字已经有人使用，请换一个或从名单中选择"
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
 * Type a name and passcode (used when no room list is available, and on the admin entry).
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
  const [length, setLength] = useState<PasscodeLength>(4);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  /** Try to log in. */
  async function submit(): Promise<void> {
    setIsSubmitting(true);
    setError(undefined);

    const result = await fetchClient.POST("/api/sessions", { body: { name: name.trim(), passcode } });

    setIsSubmitting(false);

    if (result.data !== undefined) {
      if (onSuccess === undefined) completeSession(result.data, length);
      else {
        setSession(result.data);
        rememberLength(result.data.person.id, length);
        onSuccess(result.data);
      }

      return;
    }

    const problem = asProblem(result.error);

    setPasscode("");

    if (problem?.status === 423) setError(lockedMessage(problem.lockedUntil));
    else if (problem?.code === "passcode_not_set")
      setError("这个名字还没有设置口令，请扫描会议室二维码后在名单中选择它");
    else if (problem?.code === "invalid_passcode") setError("姓名或口令不正确");
    else setError(errorMessage(result.error));
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Stack gap="lg">
        <TextField label="姓名" value={name} onValueChange={setName} autoComplete="username" required />
        <LengthChooser
          length={length}
          onLengthChange={(next) => {
            setLength(next);
            setPasscode("");
          }}
        />
        <PasscodeInput
          label="口令"
          length={length}
          value={passcode}
          onValueChange={setPasscode}
          error={error}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          isFullWidth
          isLoading={isSubmitting}
          disabled={name.trim() === "" || passcode.length !== length}
        >
          登录
        </Button>
        {onBack === undefined ? null : (
          <Button variant="ghost" isFullWidth onClick={onBack}>
            返回名单
          </Button>
        )}
      </Stack>
    </form>
  );
}
