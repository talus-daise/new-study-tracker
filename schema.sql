-- 学習タイプ（宿題・自学・通信など、ユーザーが追加/編集可能）
CREATE TABLE IF NOT EXISTS study_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4C6EF5',
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 学習記録（1件 = ある日に、あるタイプで学習した記録）
CREATE TABLE IF NOT EXISTS study_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- 'YYYY-MM-DD'
  type_id INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  content TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (type_id) REFERENCES study_types(id)
);

CREATE INDEX IF NOT EXISTS idx_records_date ON study_records(date);

-- 初期の学習タイプ（後からアプリのUIで自由に追加・編集できます）
INSERT INTO study_types (name, color, sort_order) VALUES
  ('宿題', '#D9694F', 1),
  ('自学', '#2E8C82', 2),
  ('通信', '#6E8F5D', 3);
