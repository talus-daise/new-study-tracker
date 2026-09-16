-- 学習タイプ（宿題・自学・通信など、ユーザーが追加/編集可能）
-- is_test_type = 1 のタイプは「テスト対策」として扱われ、テスト期間機能の判定に使われる
CREATE TABLE IF NOT EXISTS study_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#4C6EF5',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_test_type INTEGER NOT NULL DEFAULT 0
);

-- テスト日（1件 = テストの日付。その2週間前からの学習でテスト期間機能を判定する）
CREATE TABLE IF NOT EXISTS test_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  label TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 学習記録（1件 = ある日に、あるタイプで学習した記録）
-- task_id はタスク管理機能との連携用：タスク完了/中断時にその場で記録した学習時間を紐づける（任意・NULL可）
CREATE TABLE IF NOT EXISTS study_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,              -- 'YYYY-MM-DD'
  type_id INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  content TEXT DEFAULT '',
  task_id INTEGER REFERENCES tasks(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (type_id) REFERENCES study_types(id)
);

CREATE INDEX IF NOT EXISTS idx_records_date ON study_records(date);
CREATE INDEX IF NOT EXISTS idx_records_task ON study_records(task_id);

-- 日記（1件 = ある日の日記本文。1日1件、上書き保存）
CREATE TABLE IF NOT EXISTS diary_entries (
  date TEXT PRIMARY KEY,            -- 'YYYY-MM-DD'
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- タスク（宿題・提出物・自由タスクをまとめて管理）
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('homework', 'submission', 'free')),
  due_date TEXT,                     -- YYYY-MM-DD、締切なしタスクはNULL可
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  postponed_count INTEGER NOT NULL DEFAULT 0,
  last_seen_date TEXT,               -- Todayに最後に表示された日付（先延ばし回数の計測用）
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

-- 固定学習ブロック（曜日×時間帯）
CREATE TABLE IF NOT EXISTS study_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=日曜
  start_time TEXT NOT NULL,          -- HH:MM
  end_time TEXT NOT NULL,            -- HH:MM
  label TEXT
);

-- 持ち物チェックリスト（日にち指定で手動入力）
CREATE TABLE IF NOT EXISTS belongings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,                -- YYYY-MM-DD 持っていく日
  item_name TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_belongings_date ON belongings(date);

-- タスク達成ストリーク（タスク完了 or 持ち物全チェックで加算。学習ストリークとは別カウント）
CREATE TABLE IF NOT EXISTS task_streak (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_count INTEGER NOT NULL DEFAULT 0,
  longest_count INTEGER NOT NULL DEFAULT 0,
  last_completed_date TEXT
);

INSERT OR IGNORE INTO task_streak (id, current_count, longest_count) VALUES (1, 0, 0);

-- 初期の学習タイプ（後からアプリのUIで自由に追加・編集できます）
-- 「テスト」は is_test_type = 1 とし、テスト期間機能（ハイライト・限定ストリーク）の対象にする
INSERT INTO study_types (name, color, sort_order, is_test_type) VALUES
  ('宿題', '#D9694F', 1, 0),
  ('自学', '#2E8C82', 2, 0),
  ('通信', '#6E8F5D', 3, 0),
  ('テスト', '#7C5C9E', 4, 1);
