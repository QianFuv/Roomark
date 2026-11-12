/**
 * Tests for parsing door QR links.
 *
 * @module
 */
import { describe, expect, test } from "vite-plus/test";

import { parseRoomLink } from "./scan-room";

describe("parseRoomLink", () => {
  test("given a door QR link when parsed then slug and token are returned", () => {
    expect(parseRoomLink("https://rooms.example.com/r/9070?k=abc123")).toEqual({
      slug: "9070",
      token: "abc123",
    });
  });

  test("given text that is not a room link when parsed then nothing is returned", () => {
    expect(parseRoomLink("https://rooms.example.com/me")).toBeUndefined();
    expect(parseRoomLink("https://rooms.example.com/r/9070")).toBeUndefined();
  });
});
