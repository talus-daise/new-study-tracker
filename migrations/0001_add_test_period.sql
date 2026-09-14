-- テスト期間機能の追加（既にデプロイ済みのDBに対して1回だけ実行してください）
-- 実行例: npx wrangler d1 execute study-tracker-db --remote --file=migrations/0001_add_test_period.sql

ALTER TABLE study_types ADD COLUMN is_test_type INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS test_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  label TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 「テスト」という名前のタイプがまだ無ければ、テスト対策用として追加しておく
INSERT INTO study_types (name, color, sort_order, is_test_type)
SELECT 'テスト', '#7C5C9E', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM study_types), 1
WHERE NOT EXISTS (SELECT 1 FROM study_types WHERE name = 'テスト');
