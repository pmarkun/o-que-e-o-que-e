import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export function openDatabase(dataDirectory) {
  mkdirSync(dataDirectory, { recursive: true })
  const databasePath = path.join(dataDirectory, 'oqueeoquee.sqlite')
  const db = new DatabaseSync(databasePath)

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      definition TEXT NOT NULL,
      references_json TEXT NOT NULL,
      generator_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      definition TEXT NOT NULL,
      author TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('generated', 'suggestion', 'revision')),
      status TEXT NOT NULL CHECK (status IN ('published', 'pending', 'rejected')),
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT
    );

    CREATE INDEX IF NOT EXISTS versions_entry_created_idx
      ON versions(entry_id, created_at DESC);
  `)

  const versionColumns = new Set(
    db.prepare('PRAGMA table_info(versions)').all().map((column) => String(column.name)),
  )
  if (!versionColumns.has('reviewed_at')) db.exec('ALTER TABLE versions ADD COLUMN reviewed_at TEXT')
  if (!versionColumns.has('reviewed_by')) db.exec('ALTER TABLE versions ADD COLUMN reviewed_by TEXT')

  const entryColumns = new Set(
    db.prepare('PRAGMA table_info(entries)').all().map((column) => String(column.name)),
  )
  if (!entryColumns.has('generator_version')) {
    db.exec('ALTER TABLE entries ADD COLUMN generator_version INTEGER NOT NULL DEFAULT 1')
  }

  return db
}

export function createEntryRepository(db) {
  const findStatement = db.prepare(`
    SELECT id, slug, title, definition, references_json, created_at, updated_at
    FROM entries WHERE slug = ?
  `)
  const insertEntryStatement = db.prepare(`
    INSERT INTO entries (slug, title, definition, references_json, generator_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const generationStateStatement = db.prepare(`
    SELECT
      e.generator_version,
      (
        SELECT kind FROM versions
        WHERE entry_id = e.id AND status = 'published'
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) AS latest_kind,
      (
        SELECT author FROM versions
        WHERE entry_id = e.id AND status = 'published'
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) AS latest_author
    FROM entries e WHERE e.slug = ?
  `)
  const updateGeneratedEntryStatement = db.prepare(`
    UPDATE entries
    SET title = ?, definition = ?, references_json = ?, generator_version = ?, updated_at = ?
    WHERE id = ?
  `)
  const deleteGeneratedVersionsStatement = db.prepare(`
    DELETE FROM versions
    WHERE entry_id = ? AND author = 'Gemini' AND kind IN ('generated', 'revision')
  `)
  const insertVersionStatement = db.prepare(`
    INSERT INTO versions (entry_id, definition, author, kind, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const historyStatement = db.prepare(`
    SELECT id, definition, author, kind, status, created_at
    FROM versions WHERE entry_id = ? AND status != 'rejected'
    ORDER BY created_at DESC, id DESC
  `)
  const pendingSuggestionsStatement = db.prepare(`
    SELECT
      v.id,
      v.entry_id,
      v.definition AS proposed_definition,
      v.author,
      v.status,
      v.created_at,
      e.slug,
      e.title,
      e.definition AS current_definition
    FROM versions v
    JOIN entries e ON e.id = v.entry_id
    WHERE v.kind = 'suggestion' AND v.status = 'pending'
    ORDER BY v.created_at ASC, v.id ASC
  `)
  const suggestionStatement = db.prepare(`
    SELECT
      v.id,
      v.entry_id,
      v.definition AS proposed_definition,
      v.author,
      v.status,
      v.created_at,
      e.slug,
      e.title,
      e.definition AS current_definition
    FROM versions v
    JOIN entries e ON e.id = v.entry_id
    WHERE v.id = ? AND v.kind = 'suggestion'
  `)
  const reviewSuggestionStatement = db.prepare(`
    UPDATE versions
    SET status = ?, reviewed_at = ?, reviewed_by = ?
    WHERE id = ? AND status = 'pending'
  `)
  const publishEntryStatement = db.prepare(`
    UPDATE entries SET definition = ?, updated_at = ? WHERE id = ?
  `)

  function deserialize(row) {
    if (!row) return null
    return {
      id: Number(row.id),
      slug: String(row.slug),
      title: String(row.title),
      definition: String(row.definition),
      references: JSON.parse(String(row.references_json)),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }
  }

  return {
    findBySlug(slug) {
      return deserialize(findStatement.get(slug))
    },

    needsRegeneration(slug, generationVersion) {
      const state = generationStateStatement.get(slug)
      if (!state) return true
      const isGenerated = state.latest_kind === 'generated' || (
        state.latest_kind === 'revision' && state.latest_author === 'Gemini'
      )
      return Number(state.generator_version) < generationVersion && isGenerated
    },

    saveGenerated(slug, generated, generationVersion, { preserveHistory = false } = {}) {
      const existing = this.findBySlug(slug)
      if (existing && !this.needsRegeneration(slug, generationVersion)) return existing

      const now = new Date().toISOString()
      db.exec('BEGIN IMMEDIATE')
      try {
        if (existing) {
          updateGeneratedEntryStatement.run(
            generated.title,
            generated.definition,
            JSON.stringify(generated.references),
            generationVersion,
            now,
            existing.id,
          )
          if (!preserveHistory) deleteGeneratedVersionsStatement.run(existing.id)
          insertVersionStatement.run(
            existing.id,
            generated.definition,
            'Gemini',
            preserveHistory ? 'revision' : 'generated',
            'published',
            now,
          )
          db.exec('COMMIT')
          return this.findBySlug(slug)
        }

        const result = insertEntryStatement.run(
          slug,
          generated.title,
          generated.definition,
          JSON.stringify(generated.references),
          generationVersion,
          now,
          now,
        )
        insertVersionStatement.run(
          Number(result.lastInsertRowid),
          generated.definition,
          'Gemini',
          'generated',
          'published',
          now,
        )
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        if (!String(error).includes('UNIQUE constraint failed')) throw error
      }
      return this.findBySlug(slug)
    },

    addSuggestion(entryId, definition, author) {
      const now = new Date().toISOString()
      const result = insertVersionStatement.run(
        entryId,
        definition,
        author || null,
        'suggestion',
        'pending',
        now,
      )
      return {
        id: Number(result.lastInsertRowid),
        status: 'pending',
        createdAt: now,
      }
    },

    getHistory(entryId) {
      const rows = historyStatement.all(entryId)
      const currentPublished = rows.find((row) => row.status === 'published')
      return rows.map((row) => ({
        id: Number(row.id),
        definition: String(row.definition),
        author: row.author ? String(row.author) : null,
        kind: String(row.kind),
        status: String(row.status),
        createdAt: String(row.created_at),
        isCurrent: Number(row.id) === Number(currentPublished?.id),
      }))
    },

    listPendingSuggestions() {
      return pendingSuggestionsStatement.all().map(deserializeSuggestion)
    },

    reviewSuggestion(suggestionId, decision, reviewer) {
      const suggestion = deserializeSuggestion(suggestionStatement.get(suggestionId))
      if (!suggestion || suggestion.status !== 'pending') return null
      const now = new Date().toISOString()
      db.exec('BEGIN IMMEDIATE')
      try {
        const status = decision === 'approve' ? 'published' : 'rejected'
        const result = reviewSuggestionStatement.run(status, now, reviewer, suggestionId)
        if (Number(result.changes) !== 1) {
          db.exec('ROLLBACK')
          return null
        }
        if (decision === 'approve') {
          publishEntryStatement.run(suggestion.proposedDefinition, now, suggestion.entryId)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return { ...suggestion, status: decision === 'approve' ? 'published' : 'rejected', reviewedAt: now }
    },
  }
}

function deserializeSuggestion(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    entryId: Number(row.entry_id),
    slug: String(row.slug),
    title: String(row.title),
    currentDefinition: String(row.current_definition),
    proposedDefinition: String(row.proposed_definition),
    author: row.author ? String(row.author) : null,
    status: String(row.status),
    createdAt: String(row.created_at),
  }
}
