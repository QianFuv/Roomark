/**
 * Admin people list: add, import, edit (name, role, admin flag), reset passcode, delete.
 *
 * @module
 */
import * as stylex from "@stylexjs/stylex";
import { useForm } from "@tanstack/react-form";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import { createFileRoute } from "@tanstack/react-router";
import { FileUp, KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { api, errorMessage, fetchClient, type Person } from "../../api/client";
import { useSession } from "../../state/app-store";
import { colors, fonts } from "../../styles/tokens.stylex";
import { Button } from "../../ui/button";
import { SwitchRow } from "../../ui/controls";
import { CORE_FEATURES, DataTable } from "../../ui/data-table";
import { confirmAction } from "../../ui/dialogs";
import { SelectField, TextAreaField, TextField } from "../../ui/field";
import { Badge, Notice, PageHeader, Row, Skeleton, Stack } from "../../ui/layout";
import { Sheet } from "../../ui/sheet";
import { notify } from "../../ui/toast";

export const Route = createFileRoute("/admin/people")({ component: AdminPeoplePage });

type Role = Person["role"];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "teacher", label: "老师" },
  { value: "student", label: "学生" },
  { value: "other", label: "其他" },
];

const ROLE_LABELS: Record<Role, string> = { teacher: "老师", student: "学生", other: "其他" };

const ROLE_ALIASES = new Map<string, Role>([
  ["老师", "teacher"],
  ["教师", "teacher"],
  ["teacher", "teacher"],
  ["学生", "student"],
  ["student", "student"],
  ["其他", "other"],
  ["other", "other"],
]);

const personSchema = z.object({
  name: z.string().trim().min(1, "请填写姓名").max(20, "最多 20 个字"),
  role: z.enum(["teacher", "student", "other"]),
  isAdmin: z.boolean(),
});

const columnHelper = createColumnHelper<typeof CORE_FEATURES, Person>();

const styles = stylex.create({
  toolbar: {
    alignItems: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  search: { flexGrow: 1, maxWidth: 360, minWidth: 200 },
  name: { fontWeight: 600 },
  previewList: {
    color: colors.text,
    fontSize: fonts.sizeSm,
    lineHeight: 1.8,
    maxHeight: 200,
    overflowY: "auto",
  },
});

/** One parsed import line. */
export interface ImportRow {
  name: string;
  role: Role;
}

/**
 * Parse import text: one person per line, `姓名` or `姓名,角色` (comma, tab or space separated).
 *
 * @param text - Pasted text.
 * @returns Unique rows in order.
 */
export function parseImport(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const [rawName = "", rawRole = ""] = line.split(/[,，\t]+|\s{2,}/).map((part) => part.trim());

    if (rawName === "" || seen.has(rawName)) continue;

    seen.add(rawName);
    rows.push({ name: rawName.slice(0, 20), role: ROLE_ALIASES.get(rawRole.toLowerCase()) ?? "student" });
  }

  return rows;
}

/**
 * Admin people page.
 *
 * @returns The page.
 */
function AdminPeoplePage() {
  const people = api.useQuery("get", "/api/admin/people");
  const session = useSession();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Person | "new">();
  const [isImporting, setIsImporting] = useState(false);
  const normalized = query.trim().toLowerCase();
  const data = (people.data ?? []).filter((person) => person.name.toLowerCase().includes(normalized));

  /**
   * Reset a passcode after confirmation.
   *
   * @param person - The person.
   */
  async function resetPasscode(person: Person): Promise<void> {
    if (!(await confirmAction(`重置「${person.name}」的口令？`, "重置口令", undefined))) return;

    const result = await fetchClient.POST("/api/admin/people/{id}/reset-passcode", {
      params: { path: { id: person.id } },
    });

    await people.refetch();

    if (result.data === undefined) notify("error", "重置失败", errorMessage(result.error));
    else notify("success", "已重置口令", `${person.name}下次登录时重新设置`);
  }

  /**
   * Delete a person after confirmation.
   *
   * @param person - The person.
   */
  async function remove(person: Person): Promise<void> {
    if (!(await confirmAction(`删除「${person.name}」？`, "删除", "已有的预约和统计会保留"))) return;

    const result = await fetchClient.DELETE("/api/admin/people/{id}", {
      params: { path: { id: person.id } },
    });

    await people.refetch();

    if (result.data === undefined) notify("error", "删除失败", errorMessage(result.error));
    else notify("success", `已删除${person.name}`);
  }

  const columns = columnHelper.columns([
    columnHelper.accessor("name", {
      header: "姓名",
      cell: (info) => <span {...stylex.props(styles.name)}>{info.getValue()}</span>,
    }),
    columnHelper.accessor("role", { header: "身份", cell: (info) => ROLE_LABELS[info.getValue()] }),
    columnHelper.accessor("isAdmin", {
      header: "管理员",
      cell: (info) => (info.getValue() ? <Badge tone="info">管理员</Badge> : null),
    }),
    columnHelper.accessor("hasPasscode", {
      header: "口令",
      cell: (info) => (info.getValue() ? <Badge tone="free">已设置</Badge> : <Badge>未设置</Badge>),
    }),
    columnHelper.display({
      id: "actions",
      header: "操作",
      cell: (info) => {
        const person = info.row.original;

        return (
          <Row gap="xs" isNoWrap>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`编辑${person.name}`}
              icon={<Pencil size={16} aria-hidden />}
              onClick={() => setEditing(person)}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`重置${person.name}的口令`}
              disabled={!person.hasPasscode}
              icon={<KeyRound size={16} aria-hidden />}
              onClick={() => void resetPasscode(person)}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`删除${person.name}`}
              disabled={person.id === session?.person.id}
              icon={<Trash2 size={16} aria-hidden />}
              onClick={() => void remove(person)}
            />
          </Row>
        );
      },
    }),
  ]);

  const table = useTable({ features: CORE_FEATURES, columns, data });

  return (
    <Stack gap="lg">
      <PageHeader title="名单" />
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.search)}>
          <TextField label="搜索" type="search" value={query} onValueChange={setQuery} placeholder="姓名" />
        </div>
        <Row gap="sm">
          <Button icon={<FileUp size={18} aria-hidden />} onClick={() => setIsImporting(true)}>
            批量导入
          </Button>
          <Button
            variant="primary"
            icon={<UserPlus size={18} aria-hidden />}
            onClick={() => setEditing("new")}
          >
            添加
          </Button>
        </Row>
      </div>
      {people.data === undefined ? (
        people.isError ? (
          <Notice tone="busy">{errorMessage(people.error)}</Notice>
        ) : (
          <Skeleton height={320} />
        )
      ) : (
        <DataTable
          table={table}
          caption="名单"
          emptyText={normalized === "" ? "名单是空的" : "没有匹配的名字"}
        />
      )}
      <Sheet
        isOpen={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={editing === "new" ? "添加到名单" : "编辑"}
      >
        {editing === undefined ? null : (
          <PersonForm
            key={editing === "new" ? "new" : editing.id}
            person={editing === "new" ? undefined : editing}
            isSelf={editing !== "new" && editing.id === session?.person.id}
            onDone={() => {
              setEditing(undefined);
              void people.refetch();
            }}
          />
        )}
      </Sheet>
      <Sheet isOpen={isImporting} onOpenChange={setIsImporting} title="批量导入">
        {isImporting ? (
          <ImportForm
            onDone={() => {
              setIsImporting(false);
              void people.refetch();
            }}
          />
        ) : null}
      </Sheet>
    </Stack>
  );
}

/**
 * Add / edit a person.
 *
 * @param props - Form props.
 * @param props.person - Person to edit, or `undefined` to add.
 * @param props.isSelf - Editing yourself (cannot drop your own admin flag here).
 * @param props.onDone - Called after saving.
 * @returns The form.
 */
function PersonForm({
  person,
  isSelf,
  onDone,
}: {
  person: Person | undefined;
  isSelf: boolean;
  onDone: () => void;
}) {
  const [error, setError] = useState<string>();

  const form = useForm({
    defaultValues: {
      name: person?.name ?? "",
      role: person?.role ?? "student",
      isAdmin: person?.isAdmin ?? false,
    },
    validators: { onSubmit: personSchema },
    onSubmit: async ({ value }) => {
      setError(undefined);

      const body = { name: value.name.trim(), role: value.role, isAdmin: value.isAdmin };

      const result =
        person === undefined
          ? await fetchClient.POST("/api/admin/people", { body })
          : await fetchClient.PATCH("/api/admin/people/{id}", { params: { path: { id: person.id } }, body });

      if (result.data === undefined) {
        setError(errorMessage(result.error));

        return;
      }

      notify("success", person === undefined ? `已添加${body.name}` : "已保存");
      onDone();
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <Stack gap="lg">
        <form.Field name="name">
          {(field) => (
            <TextField
              label="姓名"
              value={field.state.value}
              onValueChange={(next) => field.handleChange(next)}
              error={field.state.meta.errors[0]?.message}
              autoFocus
            />
          )}
        </form.Field>
        <form.Field name="role">
          {(field) => (
            <SelectField
              label="身份"
              value={field.state.value}
              options={ROLE_OPTIONS}
              onValueChange={(next) => field.handleChange(next)}
            />
          )}
        </form.Field>
        <form.Field name="isAdmin">
          {(field) => (
            <SwitchRow
              label="管理员"
              hint={isSelf ? "不能取消自己的管理员身份" : undefined}
              isChecked={field.state.value}
              isDisabled={isSelf}
              onCheckedChange={(next) => field.handleChange(next)}
            />
          )}
        </form.Field>
        {error === undefined ? null : <Notice tone="busy">{error}</Notice>}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" variant="primary" size="lg" isFullWidth isLoading={isSubmitting}>
              {person === undefined ? "添加" : "保存"}
            </Button>
          )}
        </form.Subscribe>
      </Stack>
    </form>
  );
}

/**
 * Paste-to-import form with a preview.
 *
 * @param props - Form props.
 * @param props.onDone - Called after importing.
 * @returns The form.
 */
function ImportForm({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const rows = parseImport(text);

  return (
    <Stack gap="lg">
      <TextAreaField
        label="每行一个人"
        value={text}
        onValueChange={setText}
        rows={8}
        placeholder={"张老师,老师\n李四,学生\n王五"}
        description="姓名,身份（老师 / 学生 / 其他，可省略，默认学生）；已有的名字会跳过"
      />
      {rows.length === 0 ? null : (
        <Notice tone="info" title={`将导入 ${rows.length} 人`}>
          <div {...stylex.props(styles.previewList)}>
            {rows.map((row) => `${row.name}（${ROLE_LABELS[row.role]}）`).join("、")}
          </div>
        </Notice>
      )}
      {error === undefined ? null : <Notice tone="busy">{error}</Notice>}
      <Button
        variant="primary"
        size="lg"
        isFullWidth
        isLoading={isSubmitting}
        disabled={rows.length === 0}
        onClick={() => {
          setIsSubmitting(true);
          void fetchClient
            .POST("/api/admin/people/import", {
              body: { people: rows.map((row) => ({ ...row, isAdmin: false })) },
            })
            .then((result) => {
              setIsSubmitting(false);

              if (result.data === undefined) {
                setError(errorMessage(result.error));

                return;
              }

              notify("success", `已导入 ${result.data?.length ?? rows.length} 人`);
              onDone();
            });
        }}
      >
        导入 {rows.length} 人
      </Button>
    </Stack>
  );
}
