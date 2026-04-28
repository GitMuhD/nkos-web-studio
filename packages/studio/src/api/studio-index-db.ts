import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { BookConfig } from "@actalk/inkos-core/models/book";
import type { ChapterMeta } from "@actalk/inkos-core/models/chapter";


const require = createRequire(import.meta.url);

export interface StudioIndexedBook extends BookConfig {
  readonly chaptersWritten: number;
  readonly totalWords: number;
}

export class StudioIndexDB {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;

  private constructor(
    private readonly projectRoot: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
  ) {
    this.db = db;
    this.migrate();
  }

  static async open(projectRoot: string): Promise<StudioIndexDB> {
    const dbPath = join(projectRoot, ".inkos", "studio.db");
    await mkdir(dirname(dbPath), { recursive: true });
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    return new StudioIndexDB(projectRoot, db);
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        platform TEXT NOT NULL,
        genre TEXT NOT NULL,
        status TEXT NOT NULL,
        target_chapters INTEGER NOT NULL,
        chapter_word_count INTEGER NOT NULL,
        language TEXT,
        parent_book_id TEXT,
        fanfic_mode TEXT,
        chapters_written INTEGER NOT NULL DEFAULT 0,
        total_words INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chapters (
        book_id TEXT NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        word_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        audit_issues_json TEXT NOT NULL DEFAULT '[]',
        length_warnings_json TEXT NOT NULL DEFAULT '[]',
        review_note TEXT,
        detection_score REAL,
        detection_provider TEXT,
        detected_at TEXT,
        token_usage_json TEXT,
        length_telemetry_json TEXT,
        PRIMARY KEY (book_id, number),
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chapters_book_number ON chapters(book_id, number);
      CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(book_id, status);
    `);
  }

  upsertBook(book: BookConfig, chapters: ReadonlyArray<ChapterMeta> = []): void {
    const chaptersWritten = chapters.length;
    const totalWords = chapters.reduce((sum, chapter) => sum + (chapter.wordCount ?? 0), 0);
    this.db.prepare(`
      INSERT INTO books (
        id, title, platform, genre, status, target_chapters, chapter_word_count,
        language, parent_book_id, fanfic_mode, chapters_written, total_words, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        platform = excluded.platform,
        genre = excluded.genre,
        status = excluded.status,
        target_chapters = excluded.target_chapters,
        chapter_word_count = excluded.chapter_word_count,
        language = excluded.language,
        parent_book_id = excluded.parent_book_id,
        fanfic_mode = excluded.fanfic_mode,
        chapters_written = excluded.chapters_written,
        total_words = excluded.total_words,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      book.id,
      book.title,
      book.platform,
      book.genre,
      book.status,
      book.targetChapters,
      book.chapterWordCount,
      book.language ?? null,
      book.parentBookId ?? null,
      book.fanficMode ?? null,
      chaptersWritten,
      totalWords,
      book.createdAt,
      book.updatedAt,
    );
  }

  replaceChapters(bookId: string, chapters: ReadonlyArray<ChapterMeta>): void {
    this.withTransaction(() => {
      this.db.prepare("DELETE FROM chapters WHERE book_id = ?").run(bookId);
      const insert = this.db.prepare(`
        INSERT INTO chapters (
          book_id, number, title, status, word_count, created_at, updated_at,
          audit_issues_json, length_warnings_json, review_note, detection_score,
          detection_provider, detected_at, token_usage_json, length_telemetry_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const chapter of chapters) {
        insert.run(
          bookId,
          chapter.number,
          chapter.title,
          chapter.status,
          chapter.wordCount ?? 0,
          chapter.createdAt,
          chapter.updatedAt,
          JSON.stringify(chapter.auditIssues ?? []),
          JSON.stringify(chapter.lengthWarnings ?? []),
          chapter.reviewNote ?? null,
          chapter.detectionScore ?? null,
          chapter.detectionProvider ?? null,
          chapter.detectedAt ?? null,
          chapter.tokenUsage ? JSON.stringify(chapter.tokenUsage) : null,
          chapter.lengthTelemetry ? JSON.stringify(chapter.lengthTelemetry) : null,
        );
      }
      const stats = this.db.prepare("SELECT COUNT(*) AS chaptersWritten, COALESCE(SUM(word_count), 0) AS totalWords FROM chapters WHERE book_id = ?").get(bookId) as { chaptersWritten: number; totalWords: number };
      this.db.prepare("UPDATE books SET chapters_written = ?, total_words = ?, updated_at = COALESCE((SELECT MAX(updated_at) FROM chapters WHERE book_id = ?), updated_at) WHERE id = ?")
        .run(stats.chaptersWritten, stats.totalWords, bookId, bookId);
    });
  }

  upsertBookWithChapters(book: BookConfig, chapters: ReadonlyArray<ChapterMeta>): void {
    this.withTransaction(() => {
      this.upsertBook(book, chapters);
      this.replaceChaptersUnsafe(book.id, chapters);
    });
  }

  private replaceChaptersUnsafe(bookId: string, chapters: ReadonlyArray<ChapterMeta>): void {
    this.db.prepare("DELETE FROM chapters WHERE book_id = ?").run(bookId);
    const insert = this.db.prepare(`
      INSERT INTO chapters (
        book_id, number, title, status, word_count, created_at, updated_at,
        audit_issues_json, length_warnings_json, review_note, detection_score,
        detection_provider, detected_at, token_usage_json, length_telemetry_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const chapter of chapters) {
      insert.run(
        bookId,
        chapter.number,
        chapter.title,
        chapter.status,
        chapter.wordCount ?? 0,
        chapter.createdAt,
        chapter.updatedAt,
        JSON.stringify(chapter.auditIssues ?? []),
        JSON.stringify(chapter.lengthWarnings ?? []),
        chapter.reviewNote ?? null,
        chapter.detectionScore ?? null,
        chapter.detectionProvider ?? null,
        chapter.detectedAt ?? null,
        chapter.tokenUsage ? JSON.stringify(chapter.tokenUsage) : null,
        chapter.lengthTelemetry ? JSON.stringify(chapter.lengthTelemetry) : null,
      );
    }
    const stats = this.db.prepare("SELECT COUNT(*) AS chaptersWritten, COALESCE(SUM(word_count), 0) AS totalWords FROM chapters WHERE book_id = ?").get(bookId) as { chaptersWritten: number; totalWords: number };
    this.db.prepare("UPDATE books SET chapters_written = ?, total_words = ?, updated_at = COALESCE((SELECT MAX(updated_at) FROM chapters WHERE book_id = ?), updated_at) WHERE id = ?")
      .run(stats.chaptersWritten, stats.totalWords, bookId, bookId);
  }

  private withTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }


  listBooks(): ReadonlyArray<StudioIndexedBook> {
    const rows = this.db.prepare("SELECT * FROM books ORDER BY updated_at DESC, created_at DESC").all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToBook(row));
  }

  getBook(id: string): StudioIndexedBook | null {
    const row = this.db.prepare("SELECT * FROM books WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToBook(row) : null;
  }

  listChapters(bookId: string): ReadonlyArray<ChapterMeta> {
    const rows = this.db.prepare("SELECT * FROM chapters WHERE book_id = ? ORDER BY number ASC").all(bookId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToChapter(row));
  }

  updateBookConfig(id: string, book: BookConfig): void {
    const chapters = this.listChapters(id);
    this.upsertBook(book, chapters);
  }

  deleteBook(id: string): void {
    this.db.prepare("DELETE FROM books WHERE id = ?").run(id);
  }

  private rowToBook(row: Record<string, unknown>): StudioIndexedBook {
    const book: StudioIndexedBook = {
      id: String(row.id),
      title: String(row.title),
      platform: String(row.platform) as BookConfig["platform"],
      genre: String(row.genre),
      status: String(row.status) as BookConfig["status"],
      targetChapters: Number(row.target_chapters),
      chapterWordCount: Number(row.chapter_word_count),
      chaptersWritten: Number(row.chapters_written ?? 0),
      totalWords: Number(row.total_words ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
    if (row.language) book.language = String(row.language) as "zh" | "en";
    if (row.parent_book_id) book.parentBookId = String(row.parent_book_id);
    if (row.fanfic_mode) book.fanficMode = String(row.fanfic_mode) as BookConfig["fanficMode"];
    return book;
  }

  private rowToChapter(row: Record<string, unknown>): ChapterMeta {
    const chapter: ChapterMeta = {
      number: Number(row.number),
      title: String(row.title),
      status: String(row.status) as ChapterMeta["status"],
      wordCount: Number(row.word_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      auditIssues: this.parseJsonArray(row.audit_issues_json),
      lengthWarnings: this.parseJsonArray(row.length_warnings_json),
    };
    if (row.review_note) chapter.reviewNote = String(row.review_note);
    if (typeof row.detection_score === "number") chapter.detectionScore = row.detection_score;
    if (row.detection_provider) chapter.detectionProvider = String(row.detection_provider);
    if (row.detected_at) chapter.detectedAt = String(row.detected_at);
    if (row.token_usage_json) chapter.tokenUsage = JSON.parse(String(row.token_usage_json));
    if (row.length_telemetry_json) chapter.lengthTelemetry = JSON.parse(String(row.length_telemetry_json));
    return chapter;
  }

  private parseJsonArray(value: unknown): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}
