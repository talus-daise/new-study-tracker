-- 学習記録機能とタスク管理機能の連携用マイグレーション
-- 既にデプロイ済みのDBに対して1回だけ実行してください（新規構築の場合はschema.sqlだけでOK）
--
--   npx wrangler d1 execute study-tracker-db --local  --file=migrations/0002_link_tasks_to_records.sql
--   npx wrangler d1 execute study-tracker-db --remote --file=migrations/0002_link_tasks_to_records.sql

ALTER TABLE study_records ADD COLUMN task_id INTEGER REFERENCES tasks(id);
CREATE INDEX IF NOT EXISTS idx_records_task ON study_records(task_id);
