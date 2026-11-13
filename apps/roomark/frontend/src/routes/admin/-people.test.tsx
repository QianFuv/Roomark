/**
 * Tests for parsing pasted people lists.
 *
 * @module
 */
import { describe, expect, test } from "vite-plus/test";

import { parseImport } from "./people";

describe("parseImport", () => {
  test("given mixed separators and roles when parsing then rows are unique with mapped roles", () => {
    expect(parseImport("张老师,老师\n李四\t学生\n王五\n张老师，其他\n\n")).toEqual([
      { name: "张老师", role: "teacher" },
      { name: "李四", role: "student" },
      { name: "王五", role: "student" },
    ]);
  });
});
