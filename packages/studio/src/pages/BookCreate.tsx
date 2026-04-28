import { useEffect, useMemo, useRef, useState } from "react";
import type { BookCreationDraft } from "@actalk/inkos-core";
import { fetchJson, useApi } from "../hooks/use-api";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import { useColors } from "../hooks/use-colors";

interface Nav {
  toDashboard: () => void;
  toBook: (id: string) => void;
}

interface GenreInfo {
  readonly id: string;
  readonly name: string;
  readonly source: "project" | "builtin";
  readonly language: "zh" | "en";
}

interface GenresResponse {
  readonly genres: ReadonlyArray<GenreInfo>;
}

interface FsRoot {
  readonly name: string;
  readonly path: string;
}

interface FsListResponse {
  readonly path: string;
  readonly parent: string | null;
  readonly directories: ReadonlyArray<FsRoot>;
}

interface FolderImportResponse {
  readonly path: string;
  readonly count: number;
  readonly totalWords?: number;
  readonly text: string;
  readonly files: ReadonlyArray<{
    readonly name: string;
    readonly chapterNumber: number;
    readonly title?: string;
    readonly wordCount?: number;
  }>;
}

interface PlatformOption {
  readonly value: string;
  readonly label: string;
}

export interface DraftSummaryRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

interface InteractionSessionResponse {
  readonly session?: {
    readonly activeBookId?: string;
    readonly creationDraft?: BookCreationDraft;
  };
  readonly activeBookId?: string;
}

interface AgentResponse {
  readonly response?: string;
  readonly error?: string;
  readonly session?: {
    readonly activeBookId?: string;
    readonly creationDraft?: BookCreationDraft;
  };
}

interface PlatformCopy {
  readonly idleTitle: string;
  readonly idleBody: string;
  readonly promptLabel: string;
  readonly promptPlaceholder: string;
  readonly promptPlaceholderFollowup: string;
  readonly submit: string;
  readonly submitting: string;
  readonly create: string;
  readonly creating: string;
  readonly discard: string;
  readonly draftHeading: string;
  readonly missingHeading: string;
  readonly missingHint: string;
  readonly syncedHint: string;
  readonly helperTitle: string;
  readonly helperBody: string;
  readonly createMode: string;
  readonly importMode: string;
  readonly importTitle: string;
  readonly importBody: string;
  readonly importBookTitle: string;
  readonly importGenre: string;
  readonly importPlatform: string;
  readonly importLanguage: string;
  readonly importChapterWords: string;
  readonly importTargetChapters: string;
  readonly importSplitRegex: string;
  readonly importSplitHint: string;
  readonly importText: string;
  readonly importTextHint: string;
  readonly chooseFolder: string;
  readonly readFolder: string;
  readonly readingFolder: string;
  readonly folderReadQueued: string;
  readonly folderReadSuccess: string;
  readonly chooseCurrentFolder: string;
  readonly folderCurrent: string;
  readonly folderImported: string;
  readonly folderEmpty: string;
  readonly importSubmit: string;
  readonly importing: string;
  readonly importQueued: string;
  readonly importVerifying: string;
  readonly importEntering: string;
  readonly importSuccess: string;
  readonly importMissing: string;
}

const PLATFORMS_ZH: ReadonlyArray<PlatformOption> = [
  { value: "tomato", label: "番茄小说" },
  { value: "qidian", label: "起点中文网" },
  { value: "feilu", label: "飞卢" },
  { value: "other", label: "其他" },
];

const PLATFORMS_EN: ReadonlyArray<PlatformOption> = [
  { value: "royal-road", label: "Royal Road" },
  { value: "kindle-unlimited", label: "Kindle Unlimited" },
  { value: "scribble-hub", label: "Scribble Hub" },
  { value: "other", label: "Other" },
];

const PAGE_COPY: Record<"zh" | "en", PlatformCopy> = {
  zh: {
    idleTitle: "从一句模糊想法开始",
    idleBody: "直接描述题材、世界观、主角、核心冲突，或告诉我你想先改哪一块。共享草案会在 TUI 和 Studio Chat 之间同步。",
    promptLabel: "继续打磨这本书",
    promptPlaceholder: "例如：我想写个港风商战悬疑，主角先做灰产再洗白。",
    promptPlaceholderFollowup: "例如：世界观改成近未来港口城；女主不要太早出场；卷一先查账再砸场。",
    submit: "更新草案",
    submitting: "处理中…",
    create: "按当前草案建书",
    creating: "创建中…",
    discard: "丢弃草案",
    draftHeading: "当前 foundation 草案",
    missingHeading: "还缺这些关键信息",
    missingHint: "这些字段未必都要一次填满，但缺得太多时不要急着建书。",
    syncedHint: "这份草案和 TUI / Studio Chat 共享。",
    helperTitle: "建议这样推进",
    helperBody: "先定世界观和主角，再定核心冲突、简介和卷一方向。想看当前草案时，可以在 TUI 里用 /draft。",
    createMode: "新建原创书籍",
    importMode: "导入已有小说",
    importTitle: "把已有小说导入成书",
    importBody: "适合已经有章节正文的项目。系统会先创建书籍项目，再导入章节，并反向生成真相文件、章节摘要、人物/伏笔等长期知识，之后可以继续写作、审计、修订和导出。",
    importBookTitle: "书名",
    importGenre: "题材",
    importPlatform: "平台",
    importLanguage: "语言",
    importChapterWords: "每章目标字数",
    importTargetChapters: "预计总章数",
    importSplitRegex: "章节切分正则（可选）",
    importSplitHint: "留空时默认按“第X章”切分。已有分章标题建议直接留空。",
    importText: "已有小说全文 / 多章节文本",
    importTextHint: "把已有章节全文粘贴到这里，或点击“选择目录”从本地章节文件夹自动读取并解析所有文章。",
    chooseFolder: "选择章节目录",
    readFolder: "自动解析目录文章",
    readingFolder: "解析中…",
    folderReadQueued: "正在读取目录文章：章节较多时可能需要等待一会儿，请勿重复点击。",
    folderReadSuccess: "目录解析完成",
    chooseCurrentFolder: "选择当前目录",
    folderCurrent: "当前目录",
    folderImported: "已从目录读取章节",
    folderEmpty: "该目录下没有找到文件名像“第X章”的 .md/.txt 章节文件。",
    importSubmit: "创建并导入已有小说",
    importing: "导入中…",
    importQueued: "已提交导入任务：正在处理长篇文本，请勿关闭页面。章节较多时可能需要等待一会儿。",
    importVerifying: "导入已返回，正在检查书籍是否已写入书库…",
    importEntering: "书籍已确认存在，正在进入书籍页面…",
    importSuccess: "导入完成，已创建书籍并导入章节。",
    importMissing: "请填写书名并粘贴已有小说文本。",
  },
  en: {
    idleTitle: "Start from a rough idea",
    idleBody: "Describe the genre, world, protagonist, and core conflict. The shared draft stays in sync across TUI and Studio Chat.",
    promptLabel: "Refine this book",
    promptPlaceholder: "Example: I want a harbor-noir business thriller about a fixer trying to go legit.",
    promptPlaceholderFollowup: "Example: move the world to a near-future port city; delay the heroine; make volume one about chasing ledgers first.",
    submit: "Update draft",
    submitting: "Working…",
    create: "Create book from draft",
    creating: "Creating…",
    discard: "Discard draft",
    draftHeading: "Current foundation draft",
    missingHeading: "Still missing",
    missingHint: "You do not need every field immediately, but do not create the book while the foundation is still vague.",
    syncedHint: "This draft is shared with TUI and Studio Chat.",
    helperTitle: "Recommended flow",
    helperBody: "Lock the world and protagonist first, then settle the conflict, blurb, and volume-one direction. In TUI, use /draft to inspect the same draft.",
    createMode: "Create original book",
    importMode: "Import existing novel",
    importTitle: "Import an existing novel as a book",
    importBody: "Use this when chapters already exist. Studio creates the book project first, then imports chapters and reverse-engineers truth files, summaries, characters, hooks, and long-term knowledge for future writing, auditing, revision, and export.",
    importBookTitle: "Title",
    importGenre: "Genre",
    importPlatform: "Platform",
    importLanguage: "Language",
    importChapterWords: "Target words per chapter",
    importTargetChapters: "Target chapters",
    importSplitRegex: "Chapter split regex (optional)",
    importSplitHint: "Leave blank to split by default chapter headings such as 第X章 / Chapter X.",
    importText: "Existing novel text / chapters",
    importTextHint: "Paste existing chapters here, or click Choose Folder to read a local chapter directory.",
    chooseFolder: "Choose Folder",
    readFolder: "Read folder chapters",
    readingFolder: "Reading…",
    folderReadQueued: "Reading folder chapters. Large folders can take a while; please do not click repeatedly.",
    folderReadSuccess: "Folder parsing complete",
    chooseCurrentFolder: "Choose current folder",
    folderCurrent: "Current folder",
    folderImported: "Chapters loaded from folder",
    folderEmpty: "No .md/.txt chapter files with names like 第X章 were found in this folder.",
    importSubmit: "Create and import novel",
    importing: "Importing…",
    importQueued: "Import task submitted. Processing a long manuscript may take a while; please keep this page open.",
    importVerifying: "Import returned. Verifying that the book exists in the library…",
    importEntering: "Book verified. Opening the book page…",
    importSuccess: "Import complete. The book has been created and chapters were imported.",
    importMissing: "Please enter a title and paste existing novel text.",
  },
};

export function pickValidValue(current: string, available: ReadonlyArray<string>): string {
  if (current && available.includes(current)) {
    return current;
  }
  return available[0] ?? "";
}

export function defaultChapterWordsForLanguage(language: "zh" | "en"): string {
  return language === "en" ? "2000" : "3000";
}

export function platformOptionsForLanguage(language: "zh" | "en"): ReadonlyArray<PlatformOption> {
  return language === "en" ? PLATFORMS_EN : PLATFORMS_ZH;
}

export function resolveDraftInstruction(input: string, hasDraft: boolean): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  return hasDraft ? trimmed : `/new ${trimmed}`;
}

export function canCreateFromDraft(draft?: BookCreationDraft): boolean {
  if (!draft) {
    return false;
  }
  if (draft.readyToCreate) {
    return true;
  }
  return Boolean(
    draft.title?.trim()
      && draft.genre?.trim()
      && typeof draft.targetChapters === "number"
      && typeof draft.chapterWordCount === "number",
  );
}

export function buildCreationDraftSummary(
  draft: BookCreationDraft,
  language: "zh" | "en",
): ReadonlyArray<DraftSummaryRow> {
  const rows = language === "en"
    ? [
        draft.title ? { key: "title", label: "Title", value: draft.title } : undefined,
        draft.worldPremise ? { key: "worldPremise", label: "World", value: draft.worldPremise } : undefined,
        draft.protagonist ? { key: "protagonist", label: "Protagonist", value: draft.protagonist } : undefined,
        draft.conflictCore ? { key: "conflictCore", label: "Core Conflict", value: draft.conflictCore } : undefined,
        draft.volumeOutline ? { key: "volumeOutline", label: "Volume Direction", value: draft.volumeOutline } : undefined,
        draft.blurb ? { key: "blurb", label: "Blurb", value: draft.blurb } : undefined,
        draft.nextQuestion ? { key: "nextQuestion", label: "Next", value: draft.nextQuestion } : undefined,
      ]
    : [
        draft.title ? { key: "title", label: "书名", value: draft.title } : undefined,
        draft.worldPremise ? { key: "worldPremise", label: "世界观", value: draft.worldPremise } : undefined,
        draft.protagonist ? { key: "protagonist", label: "主角", value: draft.protagonist } : undefined,
        draft.conflictCore ? { key: "conflictCore", label: "核心冲突", value: draft.conflictCore } : undefined,
        draft.volumeOutline ? { key: "volumeOutline", label: "卷纲方向", value: draft.volumeOutline } : undefined,
        draft.blurb ? { key: "blurb", label: "简介", value: draft.blurb } : undefined,
        draft.nextQuestion ? { key: "nextQuestion", label: "下一步", value: draft.nextQuestion } : undefined,
      ];

  return rows.filter((row): row is DraftSummaryRow => Boolean(row));
}

interface WaitForBookReadyOptions {
  readonly fetchBook?: (bookId: string) => Promise<unknown>;
  readonly fetchStatus?: (bookId: string) => Promise<{ status: string; error?: string }>;
  readonly maxAttempts?: number;
  readonly delayMs?: number;
  readonly waitImpl?: (ms: number) => Promise<void>;
}

const DEFAULT_BOOK_READY_MAX_ATTEMPTS = 120;
const DEFAULT_BOOK_READY_DELAY_MS = 250;
const CREATION_DRAFT_SYNC_INTERVAL_MS = 2500;

export async function waitForBookReady(
  bookId: string,
  options: WaitForBookReadyOptions = {},
): Promise<void> {
  const fetchBook = options.fetchBook ?? ((id: string) => fetchJson(`/books/${id}`));
  const fetchStatus = options.fetchStatus ?? ((id: string) => fetchJson<{ status: string; error?: string }>(`/books/${id}/create-status`));
  const maxAttempts = options.maxAttempts ?? DEFAULT_BOOK_READY_MAX_ATTEMPTS;
  const delayMs = options.delayMs ?? DEFAULT_BOOK_READY_DELAY_MS;
  const waitImpl = options.waitImpl ?? ((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }));

  let lastError: unknown;
  let lastKnownStatus: string | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await fetchBook(bookId);
      return;
    } catch (error) {
      lastError = error;
      try {
        const status = await fetchStatus(bookId);
        lastKnownStatus = status.status;
        if (status.status === "error") {
          throw new Error(status.error ?? `Book "${bookId}" failed to create`);
        }
      } catch (statusError) {
        if (statusError instanceof Error && statusError.message !== "404 Not Found") {
          throw statusError;
        }
      }
      if (attempt === maxAttempts - 1) {
        if (lastKnownStatus === "creating") {
          break;
        }
        throw error;
      }
      await waitImpl(delayMs);
    }
  }

  if (lastKnownStatus === "creating") {
    throw new Error(`Book "${bookId}" is still being created. Wait a moment and refresh.`);
  }

  throw lastError instanceof Error ? lastError : new Error(`Book "${bookId}" was not ready`);
}

export async function waitForImportedBookReady(bookId: string, expectedImportedCount?: number): Promise<void> {
  await waitForBookReady(bookId, {
    fetchBook: async (id: string) => {
      const data = await fetchJson<{ chapters?: ReadonlyArray<unknown> }>(`/books/${id}`);
      const actualCount = data.chapters?.length ?? 0;
      if (actualCount <= 0) {
        throw new Error(`Book "${id}" exists, but no chapters were found after import.`);
      }
      if (typeof expectedImportedCount === "number" && expectedImportedCount > 0 && actualCount < expectedImportedCount) {
        throw new Error(`Book "${id}" imported ${actualCount}/${expectedImportedCount} chapters.`);
      }
      return data;
    },
    fetchStatus: async () => ({ status: "creating" }),
    maxAttempts: 60,
    delayMs: 500,
  });
}

export function BookCreate({ nav, theme, t, initialMode = "create" }: { nav: Nav; theme: Theme; t: TFunction; initialMode?: "create" | "import" }) {
  const c = useColors(theme);
  const { data: project } = useApi<{ language: string }>("/project");
  const { data: genresData } = useApi<GenresResponse>("/genres");
  const projectLang = (project?.language ?? "zh") as "zh" | "en";
  const copy = PAGE_COPY[projectLang];
  const platformOptions = platformOptionsForLanguage(projectLang);
  const genreOptions = useMemo(
    () => (genresData?.genres ?? []).filter((genre) => genre.language === projectLang),
    [genresData, projectLang],
  );

  const [mode, setMode] = useState<"create" | "import">(initialMode);
  const [draft, setDraft] = useState<BookCreationDraft | undefined>();
  const [input, setInput] = useState("");
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [importTitle, setImportTitle] = useState("");
  const [importGenre, setImportGenre] = useState("");
  const [importPlatform, setImportPlatform] = useState(platformOptions[0]?.value ?? "other");
  const [importLanguage, setImportLanguage] = useState<"zh" | "en">(projectLang);
  const [importChapterWords, setImportChapterWords] = useState(defaultChapterWordsForLanguage(projectLang));
  const [importTargetChapters, setImportTargetChapters] = useState("200");
  const [importSplitRegex, setImportSplitRegex] = useState("");
  const [importText, setImportText] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderRoots, setFolderRoots] = useState<ReadonlyArray<FsRoot>>([]);
  const [folderPath, setFolderPath] = useState("");
  const [folderParent, setFolderParent] = useState<string | null>(null);
  const [folderDirs, setFolderDirs] = useState<ReadonlyArray<FsRoot>>([]);
  const [selectedFolder, setSelectedFolder] = useState("");
  const [importProgress, setImportProgress] = useState<ReadonlyArray<string>>([]);
  const [readingFolder, setReadingFolder] = useState(false);
  const [folderReadStatus, setFolderReadStatus] = useState<string | null>(null);
  const [folderChapterPreview, setFolderChapterPreview] = useState<ReadonlyArray<{
    readonly name: string;
    readonly chapterNumber: number;
    readonly title?: string;
    readonly wordCount?: number;
  }>>([]);
  const [folderTotalWords, setFolderTotalWords] = useState<number | null>(null);
  const importInFlightRef = useRef(false);
  const appendImportProgress = (message: string) => {
    setImportProgress((prev) => [...prev.slice(-5), message]);
    setStatus(message);
  };

  const summaryRows = useMemo(
    () => (draft ? buildCreationDraftSummary(draft, projectLang) : []),
    [draft, projectLang],
  );

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    setImportLanguage(projectLang);
    setImportPlatform(pickValidValue(importPlatform, platformOptions.map((item) => item.value)));
    setImportChapterWords(defaultChapterWordsForLanguage(projectLang));
  }, [projectLang]);

  useEffect(() => {
    if (genreOptions.length > 0) {
      setImportGenre((current) => pickValidValue(current, genreOptions.map((item) => item.id)));
    }
  }, [genreOptions]);

  const refreshDraft = async (): Promise<BookCreationDraft | undefined> => {
    const data = await fetchJson<InteractionSessionResponse>("/interaction/session");
    const nextDraft = data.session?.creationDraft;
    setDraft(nextDraft);
    return nextDraft;
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingDraft(true);
    void refreshDraft()
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDraft(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (submitting || creating) {
      return;
    }

    const timer = setInterval(() => {
      void refreshDraft().catch(() => undefined);
    }, CREATION_DRAFT_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [submitting, creating]);

  const runAgentInstruction = async (instruction: string): Promise<AgentResponse> => {
    return fetchJson<AgentResponse>("/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    });
  };

  const handleDraftSubmit = async () => {
    const instruction = resolveDraftInstruction(input, Boolean(draft));
    if (!instruction) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const data = await runAgentInstruction(instruction);
      setInput("");
      setStatus(data.response ?? null);
      setDraft(data.session?.creationDraft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = async () => {
    if (!canCreateFromDraft(draft)) {
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const data = await runAgentInstruction("/create");
      const bookId = data.session?.activeBookId;
      if (!bookId) {
        throw new Error(projectLang === "zh" ? "创建完成后没有返回书籍 ID。" : "Create succeeded but no book id was returned.");
      }
      setStatus(data.response ?? null);
      setDraft(undefined);
      await waitForBookReady(bookId);
      nav.toBook(bookId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  };

  const loadFolder = async (path: string) => {
    const data = await fetchJson<FsListResponse>("/fs/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    setFolderPath(data.path);
    setFolderParent(data.parent);
    setFolderDirs(data.directories);
  };

  const openFolderPicker = async () => {
    setError(null);
    const data = await fetchJson<{ roots: ReadonlyArray<FsRoot> }>("/fs/roots");
    setFolderRoots(data.roots);
    const start = selectedFolder || data.roots[0]?.path;
    if (start) {
      await loadFolder(start);
    }
    setFolderDialogOpen(true);
  };

  const chooseCurrentFolder = () => {
    setSelectedFolder(folderPath);
    setFolderReadStatus(null);
    setFolderChapterPreview([]);
    setFolderTotalWords(null);
    setFolderDialogOpen(false);
  };

  const readSelectedFolder = async () => {
    if (readingFolder) {
      return;
    }
    if (!selectedFolder) {
      await openFolderPicker();
      return;
    }
    setError(null);
    setFolderReadStatus(copy.folderReadQueued);
    setReadingFolder(true);
    try {
      const data = await fetchJson<FolderImportResponse>("/import/read-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selectedFolder }),
      });
      if (data.count === 0) {
        setError(copy.folderEmpty);
        setFolderReadStatus(copy.folderEmpty);
        return;
      }
      setImportText(data.text);
      setFolderChapterPreview(data.files);
      setFolderTotalWords(typeof data.totalWords === "number" ? data.totalWords : null);
      if (!importTitle.trim()) {
        const parts = data.path.split(/[\\/]/).filter(Boolean);
        setImportTitle(parts.at(-1) ?? "");
      }
      const wordsSummary = typeof data.totalWords === "number"
        ? ` / ${data.totalWords.toLocaleString(projectLang === "zh" ? "zh-CN" : "en-US")} ${projectLang === "zh" ? "字" : "words"}`
        : "";
      const successMessage = `${copy.folderReadSuccess}: ${data.count} ${projectLang === "zh" ? "章" : "chapters"}${wordsSummary}`;
      setFolderReadStatus(successMessage);
      setStatus(successMessage);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setFolderReadStatus(`${projectLang === "zh" ? "目录解析失败" : "Folder parsing failed"}: ${message}`);
    } finally {
      setReadingFolder(false);
    }
  };

  const handleImportExistingNovel = async () => {
    if (importInFlightRef.current) {
      return;
    }
    if (!importTitle.trim() || !importText.trim()) {
      setError(copy.importMissing);
      return;
    }

    importInFlightRef.current = true;
    setImporting(true);
    setError(null);
    setImportProgress([]);
    appendImportProgress(copy.importQueued);
    try {
      const imported = await fetchJson<{ bookId: string; importedCount?: number; totalWords?: number; nextChapter?: number; alreadyExists?: boolean }>("/books/import-existing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: importTitle.trim(),
          genre: importGenre || genreOptions[0]?.id || "other",
          language: importLanguage,
          platform: importPlatform,
          chapterWordCount: Number(importChapterWords) || Number(defaultChapterWordsForLanguage(importLanguage)),
          targetChapters: Number(importTargetChapters) || 200,
          text: importText,
          splitRegex: importSplitRegex.trim() || undefined,
        }),
      });
      const chapterSummary = typeof imported.importedCount === "number" ? ` (${imported.importedCount} 章)` : "";
      if (imported.alreadyExists) {
        appendImportProgress(`${projectLang === "zh" ? "书籍已存在，已恢复已有导入结果" : "Book already exists; recovered existing import"}${chapterSummary}`);
      } else {
        appendImportProgress(`${copy.importSuccess}${chapterSummary}`);
      }
      appendImportProgress(copy.importVerifying);
      await waitForImportedBookReady(imported.bookId, imported.importedCount);
      appendImportProgress(copy.importEntering);
      nav.toBook(imported.bookId);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      appendImportProgress(`${projectLang === "zh" ? "导入失败" : "Import failed"}: ${message}`);
    } finally {
      importInFlightRef.current = false;
      setImporting(false);
    }
  };

  const handleDiscard = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const data = await runAgentInstruction("/discard");
      setStatus(data.response ?? null);
      setDraft(undefined);
      setInput("");
      await refreshDraft().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={nav.toDashboard} className={c.link}>{t("bread.books")}</button>
        <span className="text-border">/</span>
        <span>{t("bread.newBook")}</span>
      </div>

      <div className="space-y-3">
        <h1 className="font-serif text-3xl">{t("create.title")}</h1>
        <p className="text-sm text-muted-foreground leading-7">{mode === "create" ? copy.idleBody : copy.importBody}</p>
      </div>

      <div className="flex gap-2 rounded-2xl border border-border/60 bg-card/70 p-2 w-fit">
        <button
          onClick={() => { setMode("create"); setError(null); setStatus(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${mode === "create" ? c.btnPrimary : "text-muted-foreground hover:text-foreground"}`}
        >
          {copy.createMode}
        </button>
        <button
          onClick={() => { setMode("import"); setError(null); setStatus(null); }}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${mode === "import" ? c.btnPrimary : "text-muted-foreground hover:text-foreground"}`}
        >
          {copy.importMode}
        </button>
      </div>

      {error && (
        <div className={`border ${c.error} rounded-md px-4 py-3`}>
          {error}
        </div>
      )}

      {status && (
        <div className="border border-primary/20 bg-primary/5 rounded-md px-4 py-3 text-sm text-primary">
          {status}
        </div>
      )}

      {mode === "import" ? (
        <div className="rounded-2xl border border-border/60 bg-card/70 p-5 space-y-5">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
              {copy.importTitle}
            </div>
            <div className="text-xs text-muted-foreground leading-6">
              {copy.importBody}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{copy.importBookTitle}</span>
              <input
                value={importTitle}
                onChange={(event) => setImportTitle(event.target.value)}
                className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm`}
                placeholder={projectLang === "zh" ? "例如：根权限" : "Example: Root Access"}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{copy.importGenre}</span>
              <select
                value={importGenre}
                onChange={(event) => setImportGenre(event.target.value)}
                className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm`}
              >
                {genreOptions.length === 0 ? <option value="other">other</option> : null}
                {genreOptions.map((genre) => (
                  <option key={genre.id} value={genre.id}>{genre.name} ({genre.id})</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{copy.importPlatform}</span>
              <select
                value={importPlatform}
                onChange={(event) => setImportPlatform(event.target.value)}
                className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm`}
              >
                {platformOptions.map((platform) => (
                  <option key={platform.value} value={platform.value}>{platform.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{copy.importLanguage}</span>
              <select
                value={importLanguage}
                onChange={(event) => {
                  const nextLang = event.target.value as "zh" | "en";
                  setImportLanguage(nextLang);
                  setImportChapterWords(defaultChapterWordsForLanguage(nextLang));
                }}
                className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm`}
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{copy.importChapterWords}</span>
              <input
                type="number"
                value={importChapterWords}
                onChange={(event) => setImportChapterWords(event.target.value)}
                className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm`}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-muted-foreground">{copy.importTargetChapters}</span>
              <input
                type="number"
                value={importTargetChapters}
                onChange={(event) => setImportTargetChapters(event.target.value)}
                className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm`}
              />
            </label>
          </div>

          <label className="space-y-2 text-sm block">
            <span className="text-muted-foreground">{copy.importSplitRegex}</span>
            <input
              value={importSplitRegex}
              onChange={(event) => setImportSplitRegex(event.target.value)}
              className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm font-mono`}
              placeholder="第\\s*\\d+\\s*章"
            />
            <span className="block text-xs text-muted-foreground">{copy.importSplitHint}</span>
          </label>

          <div className="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-3">
            <div className="text-xs text-muted-foreground">
              {copy.folderCurrent}: {selectedFolder || "-"}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void openFolderPicker().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))}
                disabled={readingFolder}
                className="px-4 py-2 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {copy.chooseFolder}
              </button>
              <button
                type="button"
                onClick={() => void readSelectedFolder().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))}
                disabled={!selectedFolder || readingFolder}
                className={`px-4 py-2 rounded-md text-sm ${c.btnPrimary} disabled:opacity-40`}
              >
                {readingFolder ? copy.readingFolder : copy.readFolder}
              </button>
            </div>
            {readingFolder && (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
                </div>
                <div className="text-xs text-primary leading-6">
                  {folderReadStatus ?? copy.folderReadQueued}
                </div>
              </div>
            )}
            {!readingFolder && folderReadStatus && (
              <div className={`rounded-xl px-3 py-2 text-xs leading-6 ${error ? "border border-destructive/30 bg-destructive/5 text-destructive" : "border border-primary/20 bg-primary/5 text-primary"}`}>
                {folderReadStatus}
              </div>
            )}
          </div>

          {folderChapterPreview.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-foreground">
                    {projectLang === "zh" ? "解析到的章节" : "Parsed chapters"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {folderChapterPreview.length.toLocaleString(projectLang === "zh" ? "zh-CN" : "en-US")}
                    {projectLang === "zh" ? " 章" : " chapters"}
                    {folderTotalWords !== null
                      ? ` / ${folderTotalWords.toLocaleString(projectLang === "zh" ? "zh-CN" : "en-US")} ${projectLang === "zh" ? "字" : "words"}`
                      : ""}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground text-right leading-5">
                  {projectLang === "zh"
                    ? "这里只显示章节名和字数；全文会在进入书籍后打开章节时显示。"
                    : "Only titles and word counts are shown here. Full text appears inside the book."}
                </div>
              </div>
              <div className="max-h-80 overflow-auto rounded-xl border border-border/50 bg-card/40">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr className="border-b border-border/50">
                      <th className="w-20 px-3 py-2 text-left font-medium">{projectLang === "zh" ? "章序" : "No."}</th>
                      <th className="px-3 py-2 text-left font-medium">{projectLang === "zh" ? "章节名称" : "Chapter title"}</th>
                      <th className="w-28 px-3 py-2 text-right font-medium">{projectLang === "zh" ? "字数" : "Words"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folderChapterPreview.map((chapter) => (
                      <tr key={`${chapter.chapterNumber}-${chapter.name}`} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{chapter.chapterNumber}</td>
                        <td className="px-3 py-2 text-foreground">
                          <div className="line-clamp-1">{chapter.title || chapter.name.replace(/\.(md|txt)$/i, "")}</div>
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {typeof chapter.wordCount === "number" ? chapter.wordCount.toLocaleString(projectLang === "zh" ? "zh-CN" : "en-US") : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {folderChapterPreview.length === 0 && (
            <label className="space-y-2 text-sm block">
              <span className="text-muted-foreground">{copy.importText}</span>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                rows={16}
                className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm leading-7 resize-y font-mono`}
                placeholder={copy.importTextHint}
              />
            </label>
          )}

          <button
            onClick={handleImportExistingNovel}
            disabled={importing || !importTitle.trim() || !importText.trim()}
            className={`px-4 py-3 ${c.btnPrimary} rounded-md disabled:opacity-50 font-medium text-sm`}
          >
            {importing ? copy.importing : copy.importSubmit}
          </button>

          {importing && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4 text-sm text-primary space-y-3">
              <div className="flex items-center gap-2 font-medium">
                <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                {copy.importQueued}
              </div>
              <div className="text-xs text-primary/80 leading-6">
                {projectLang === "zh"
                  ? "系统正在创建书籍、切分章节、写入章节并校验结果。长篇小说章节多时请耐心等待。"
                  : "Studio is creating the book, splitting chapters, writing files, and verifying the result. Large manuscripts can take a while."}
              </div>
            </div>
          )}

          {importProgress.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-4 space-y-2">
              <div className="text-xs font-semibold text-foreground">
                {projectLang === "zh" ? "导入进度" : "Import progress"}
              </div>
              <ol className="space-y-1 text-xs text-muted-foreground leading-6">
                {importProgress.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex gap-2">
                    <span className="text-primary">{index + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-5 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
                {copy.draftHeading}
              </div>
              <div className="text-xs text-muted-foreground">
                {copy.syncedHint}
              </div>
            </div>

            {loadingDraft ? (
              <div className="text-sm text-muted-foreground">{projectLang === "zh" ? "读取共享草案中…" : "Loading shared draft…"}</div>
            ) : draft ? (
              <div className="space-y-4">
                {summaryRows.length > 0 ? (
                  <div className="space-y-3">
                    {summaryRows.map((row) => (
                      <div key={row.key} className="rounded-xl border border-border/50 bg-background/70 px-4 py-3">
                        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{row.label}</div>
                        <div className="mt-1 text-sm leading-7 whitespace-pre-wrap">{row.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {draft.missingFields.length > 0 ? (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-foreground">{copy.missingHeading}</div>
                    <div className="flex flex-wrap gap-2">
                      {draft.missingFields.map((field) => (
                        <span
                          key={field}
                          className="rounded-full border border-border/70 bg-secondary/50 px-3 py-1 text-xs text-muted-foreground"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{copy.missingHint}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/50 px-5 py-6">
                <div className="font-medium">{copy.idleTitle}</div>
                <p className="mt-2 text-sm text-muted-foreground leading-7">
                  {copy.helperBody}
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-5 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold">
                {copy.promptLabel}
              </div>
              <div className="text-xs text-muted-foreground">
                {copy.helperTitle}
              </div>
            </div>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={10}
              className={`w-full ${c.input} rounded-xl px-4 py-3 focus:outline-none text-sm leading-7 resize-y`}
              placeholder={draft ? copy.promptPlaceholderFollowup : copy.promptPlaceholder}
            />

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDraftSubmit}
                disabled={submitting || creating || !input.trim()}
                className={`px-4 py-3 ${c.btnPrimary} rounded-md disabled:opacity-50 font-medium text-sm`}
              >
                {submitting ? copy.submitting : copy.submit}
              </button>
              <button
                onClick={handleCreate}
                disabled={!canCreateFromDraft(draft) || creating || submitting}
                className={`px-4 py-3 rounded-md border border-border bg-secondary text-secondary-foreground disabled:opacity-50 font-medium text-sm`}
              >
                {creating ? copy.creating : copy.create}
              </button>
              <button
                onClick={handleDiscard}
                disabled={!draft || submitting || creating}
                className="px-4 py-3 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/20 disabled:opacity-50 font-medium text-sm"
              >
                {copy.discard}
              </button>
            </div>
          </div>
        </section>
      </div>
      )}
      {folderDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-serif text-2xl">{copy.chooseFolder}</div>
                <div className="mt-1 text-xs text-muted-foreground break-all">{folderPath}</div>
              </div>
              <button
                type="button"
                onClick={() => setFolderDialogOpen(false)}
                className="rounded-md border border-border px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {folderRoots.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => void loadFolder(item.path).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))}
                  className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {item.name}
                </button>
              ))}
            </div>

            <div className="flex justify-between gap-3">
              <button
                type="button"
                disabled={!folderParent}
                onClick={() => folderParent && void loadFolder(folderParent).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                ..
              </button>
              <button
                type="button"
                onClick={chooseCurrentFolder}
                className={`rounded-md px-4 py-2 text-sm ${c.btnPrimary}`}
              >
                {copy.chooseCurrentFolder}
              </button>
            </div>

            <div className="max-h-[420px] overflow-auto space-y-2 rounded-xl border border-border/60 bg-background/40 p-3">
              {folderDirs.length === 0 ? (
                <div className="text-sm text-muted-foreground">{copy.folderEmpty}</div>
              ) : folderDirs.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => void loadFolder(item.path).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-left text-sm hover:border-primary/50"
                >
                  <span>📁 {item.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.path}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
