import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readStoryFrame,
  readVolumeMap,
  readRoleCards,
  readCharacterContext,
  readCurrentStateWithFallback,
  isNewLayoutBook,
  isCurrentStateSeedPlaceholder,
} from "../utils/outline-paths.js";

describe("outline-paths", () => {
  let bookDir: string;

  beforeEach(async () => {
    bookDir = await mkdtemp(join(tmpdir(), "inkos-test-book-"));
    await mkdir(join(bookDir, "story"), { recursive: true });
  });

  afterEach(async () => {
    await rm(bookDir, { recursive: true, force: true });
  });

  // --- isNewLayoutBook ---

  it("isNewLayoutBook returns false when outline/story_frame.md is missing", async () => {
    expect(await isNewLayoutBook(bookDir)).toBe(false);
  });

  it("isNewLayoutBook returns true when outline/story_frame.md exists", async () => {
    await mkdir(join(bookDir, "story", "outline"), { recursive: true });
    await writeFile(join(bookDir, "story", "outline", "story_frame.md"), "# frame", "utf-8");
    expect(await isNewLayoutBook(bookDir)).toBe(true);
  });

  // --- readStoryFrame ---

  it("readStoryFrame prefers new path when present", async () => {
    await mkdir(join(bookDir, "story", "outline"), { recursive: true });
    await writeFile(join(bookDir, "story", "outline", "story_frame.md"), "段落式内容", "utf-8");
    await writeFile(join(bookDir, "story", "story_bible.md"), "legacy content", "utf-8");
    expect(await readStoryFrame(bookDir)).toBe("段落式内容");
  });

  it("readStoryFrame falls back to legacy story_bible.md when new path missing", async () => {
    await writeFile(join(bookDir, "story", "story_bible.md"), "legacy 条目式", "utf-8");
    expect(await readStoryFrame(bookDir)).toBe("legacy 条目式");
  });

  it("readStoryFrame returns fallback placeholder when both paths missing", async () => {
    expect(await readStoryFrame(bookDir, "(未创建)")).toBe("(未创建)");
  });

  // --- readVolumeMap ---

  it("readVolumeMap falls back to legacy volume_outline.md", async () => {
    await writeFile(join(bookDir, "story", "volume_outline.md"), "legacy 卷大纲", "utf-8");
    expect(await readVolumeMap(bookDir)).toBe("legacy 卷大纲");
  });

  it("readVolumeMap prefers new path", async () => {
    await mkdir(join(bookDir, "story", "outline"), { recursive: true });
    await writeFile(join(bookDir, "story", "outline", "volume_map.md"), "段落式卷大纲", "utf-8");
    await writeFile(join(bookDir, "story", "volume_outline.md"), "legacy", "utf-8");
    expect(await readVolumeMap(bookDir)).toBe("段落式卷大纲");
  });

  // --- readRoleCards ---

  it("readRoleCards returns empty when roles/ dir missing", async () => {
    expect(await readRoleCards(bookDir)).toEqual([]);
  });

  it("readRoleCards reads major/minor role files", async () => {
    const majorDir = join(bookDir, "story", "roles", "主要角色");
    const minorDir = join(bookDir, "story", "roles", "次要角色");
    await mkdir(majorDir, { recursive: true });
    await mkdir(minorDir, { recursive: true });
    await writeFile(join(majorDir, "林辞.md"), "主角内容", "utf-8");
    await writeFile(join(minorDir, "配角A.md"), "配角内容", "utf-8");
    const cards = await readRoleCards(bookDir);
    expect(cards.length).toBe(2);
    const major = cards.find((c) => c.name === "林辞");
    const minor = cards.find((c) => c.name === "配角A");
    expect(major).toMatchObject({ tier: "major", name: "林辞", content: "主角内容" });
    expect(minor).toMatchObject({ tier: "minor", name: "配角A", content: "配角内容" });
  });

  // --- readCharacterContext ---

  it("readCharacterContext renders role cards when present", async () => {
    const majorDir = join(bookDir, "story", "roles", "主要角色");
    await mkdir(majorDir, { recursive: true });
    await writeFile(join(majorDir, "林辞.md"), "林辞的描写", "utf-8");
    const result = await readCharacterContext(bookDir);
    expect(result).toContain("林辞");
    expect(result).toContain("主要角色");
  });

  it("readCharacterContext falls back to legacy character_matrix.md", async () => {
    await writeFile(join(bookDir, "story", "character_matrix.md"), "legacy 角色矩阵", "utf-8");
    const result = await readCharacterContext(bookDir);
    expect(result).toBe("legacy 角色矩阵");
  });

  // --- readCurrentStateWithFallback ---

  it("readCurrentStateWithFallback returns real content when not a seed", async () => {
    await writeFile(
      join(bookDir, "story", "current_state.md"),
      "# 当前状态\n\n林辞已经到达京城，正在调查失踪案。",
      "utf-8",
    );
    const result = await readCurrentStateWithFallback(bookDir);
    expect(result).toContain("林辞已经到达京城");
  });

  it("readCurrentStateWithFallback derives initial state from roles when seed placeholder", async () => {
    await writeFile(
      join(bookDir, "story", "current_state.md"),
      "建书时占位，运行时由 consolidator 每章追加。",
      "utf-8",
    );
    const majorDir = join(bookDir, "story", "roles", "主要角色");
    await mkdir(majorDir, { recursive: true });
    await writeFile(
      join(majorDir, "林辞.md"),
      "## 当前现状\n\n刚从边关回到京城，尚未与旧友重逢。",
      "utf-8",
    );
    const result = await readCurrentStateWithFallback(bookDir);
    expect(result).toContain("林辞");
    expect(result).toContain("初始状态");
  });

  // --- isCurrentStateSeedPlaceholder ---

  it("isCurrentStateSeedPlaceholder returns true for empty or seed text", () => {
    expect(isCurrentStateSeedPlaceholder("")).toBe(true);
    expect(isCurrentStateSeedPlaceholder("  ")).toBe(true);
    expect(isCurrentStateSeedPlaceholder("建书时占位，运行时追加")).toBe(true);
    expect(isCurrentStateSeedPlaceholder("Seeded at book creation")).toBe(true);
  });

  it("isCurrentStateSeedPlaceholder returns false for real content", () => {
    expect(isCurrentStateSeedPlaceholder("# 状态\n\n林辞已经出发，目标是西域。这是一段很长的内容。".repeat(10))).toBe(false);
  });
});
