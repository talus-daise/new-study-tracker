// 学習ノート — Cloudflare Workers + D1
// /api/* はJSON API、それ以外は public/ の静的ファイル（ASSETS）を返す。

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/* ==========================================================
   JST（日本時間）の日付・時刻ヘルパー
   Cloudflare Workersのランタイムはタイムゾーンの概念を持たず、
   Dateの各種メソッドはUTC相当になる。タスクの締切判定や
   曜日・時刻の判定は日本の生活リズム基準で行うため、
   ここでJST(UTC+9)に補正してから使う。
   ========================================================== */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function shiftToJST(date) {
  return new Date(date.getTime() + JST_OFFSET_MS);
}

function todayISOInJST(now = new Date()) {
  return shiftToJST(now).toISOString().slice(0, 10);
}

function yesterdayISOInJST(dateISO) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function daysAgoISOInJST(n, now = new Date()) {
  const shifted = shiftToJST(now);
  shifted.setUTCDate(shifted.getUTCDate() - n);
  return shifted.toISOString().slice(0, 10);
}

function diffDaysInJST(dueISO, baseISO) {
  const due = new Date(`${dueISO}T00:00:00Z`);
  const base = new Date(`${baseISO}T00:00:00Z`);
  return Math.round((due.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}

// 'YYYY-MM-DD' に n日を加算/減算した日付文字列を返す（n は負数可）
function addDaysISO(dateISO, n) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function jstWeekday(now = new Date()) {
  return shiftToJST(now).getUTCDay();
}

function jstHHMM(now = new Date()) {
  return shiftToJST(now).toISOString().slice(11, 16);
}

/* ==========================================================
   学習タイプ
   ========================================================== */
async function listTypes(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, color, sort_order FROM study_types ORDER BY sort_order ASC, id ASC"
  ).all();
  return results;
}

async function createType(env, body) {
  const name = (body?.name || "").trim();
  if (!name) throw new Error("学習タイプ名を入力してください");
  const color = COLOR_RE.test(body?.color) ? body.color : "#4C6EF5";
  const next = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM study_types"
  ).first();
  return env.DB.prepare(
    `INSERT INTO study_types (name, color, sort_order) VALUES (?, ?, ?)
     RETURNING id, name, color, sort_order`
  ).bind(name, color, next.n).first();
}

async function updateType(env, id, body) {
  const current = await env.DB.prepare("SELECT * FROM study_types WHERE id = ?").bind(id).first();
  if (!current) throw new Error("学習タイプが見つかりません");
  const name = body?.name !== undefined ? String(body.name).trim() : current.name;
  const color = COLOR_RE.test(body?.color) ? body.color : current.color;
  const sortOrder = Number.isFinite(Number(body?.sort_order)) ? Number(body.sort_order) : current.sort_order;
  await env.DB.prepare(
    "UPDATE study_types SET name = ?, color = ?, sort_order = ? WHERE id = ?"
  ).bind(name, color, sortOrder, id).run();
  return { id: Number(id), name, color, sort_order: sortOrder };
}

async function deleteType(env, id) {
  const used = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM study_records WHERE type_id = ?"
  ).bind(id).first();
  if (used.cnt > 0) throw new Error("このタイプは記録があるため削除できません（先に記録を削除してください）");
  await env.DB.prepare("DELETE FROM study_types WHERE id = ?").bind(id).run();
  return { deleted: true };
}

/* ==========================================================
   学習記録
   ========================================================== */
async function createRecord(env, body) {
  const date = body?.date;
  if (!DATE_RE.test(date || "")) throw new Error("日付はYYYY-MM-DD形式で指定してください");
  const typeId = Number(body?.type_id);
  if (!typeId) throw new Error("学習タイプを選択してください");
  const minutes = Math.max(0, Math.floor(Number(body?.duration_minutes) || 0));
  const content = (body?.content || "").toString().slice(0, 500);
  const taskId = body?.task_id ? Number(body.task_id) || null : null;
  return env.DB.prepare(
    `INSERT INTO study_records (date, type_id, duration_minutes, content, task_id)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id, date, type_id, duration_minutes, content, task_id, created_at`
  ).bind(date, typeId, minutes, content, taskId).first();
}

async function deleteRecord(env, id) {
  await env.DB.prepare("DELETE FROM study_records WHERE id = ?").bind(id).run();
  return { deleted: true };
}

async function recordsForDate(env, date) {
  if (!DATE_RE.test(date || "")) throw new Error("date はYYYY-MM-DD形式で指定してください");
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.date, r.type_id, r.duration_minutes, r.content, r.task_id, r.created_at,
            t.name AS type_name, t.color AS type_color
     FROM study_records r JOIN study_types t ON t.id = r.type_id
     WHERE r.date = ? ORDER BY r.created_at ASC`
  ).bind(date).all();
  return results;
}

async function calendarData(env, year, month) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const { results } = await env.DB.prepare(
    `SELECT r.date, r.type_id, t.color AS type_color, r.duration_minutes
     FROM study_records r JOIN study_types t ON t.id = r.type_id
     WHERE r.date BETWEEN ? AND ?`
  ).bind(start, end).all();

  const byDate = {};
  for (const row of results) {
    const entry = (byDate[row.date] ||= { total_minutes: 0, by_color: {} });
    entry.total_minutes += row.duration_minutes;
    entry.by_color[row.type_color] = (entry.by_color[row.type_color] || 0) + row.duration_minutes;
  }

  // テスト日の情報をマージ（テスト当日は記録が無い日もあるのでここで枠を作る）
  const { results: testRows } = await env.DB.prepare(
    "SELECT date, label FROM test_dates WHERE date BETWEEN ? AND ?"
  ).bind(start, end).all();
  if (testRows.length) {
    const typeIds = await testTypeIds(env);
    const highlighted = await testHighlightDateSet(env, testRows, typeIds);
    for (const row of testRows) {
      const entry = (byDate[row.date] ||= { total_minutes: 0, by_color: {} });
      entry.is_test_day = true;
      entry.test_label = row.label || "";
      entry.is_test_highlight = highlighted.has(row.date);
    }
  }

  // by_color（内部用の集計マップ）をフロント向けの配列に変換して返す
  const out = {};
  for (const [date, entry] of Object.entries(byDate)) {
    out[date] = {
      total_minutes: entry.total_minutes,
      breakdown: Object.entries(entry.by_color).map(([color, minutes]) => ({ color, minutes })),
      ...(entry.is_test_day ? {
        is_test_day: true,
        test_label: entry.test_label,
        is_test_highlight: entry.is_test_highlight,
      } : {}),
    };
  }
  return out;
}

// 指定日から遡って連続で記録がある日数と、その日付一覧を返す。
// 今日まだ記録がなければ、昨日までの連続を数える。
async function computeStreak(env, todayStr) {
  const { results } = await env.DB.prepare(
    "SELECT DISTINCT date FROM study_records ORDER BY date DESC LIMIT 400"
  ).all();
  const dateSet = new Set(results.map((r) => r.date));

  const toStr = (d) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  let cursor = new Date(`${todayStr}T00:00:00Z`);
  if (!dateSet.has(toStr(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const streakDates = [];
  while (dateSet.has(toStr(cursor))) {
    streakDates.push(toStr(cursor));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { count: streakDates.length, dates: streakDates };
}

/* ==========================================================
   テスト期間機能
   テスト日を登録すると、その2週間前(14日前)からテスト当日までが
   「テスト期間」になる。期間中に学習タイプ「テスト」(is_test_type=1)で
   毎日記録すると、テスト期間限定の連続記録日数として数える。
   さらに、テスト当日の前日までの14日間すべてに記録があれば、
   テスト当日をカレンダー上で特別にハイライトする。
   ========================================================== */
const TEST_PREP_DAYS = 14;

async function listTestDates(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, date, label FROM test_dates ORDER BY date ASC"
  ).all();
  return results;
}

async function createTestDate(env, body) {
  const date = body?.date;
  if (!DATE_RE.test(date || "")) throw new Error("日付はYYYY-MM-DD形式で指定してください");
  const label = (body?.label || "").toString().trim().slice(0, 50);
  return env.DB.prepare(
    `INSERT INTO test_dates (date, label) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET label = excluded.label
     RETURNING id, date, label`
  ).bind(date, label).first();
}

async function deleteTestDate(env, id) {
  await env.DB.prepare("DELETE FROM test_dates WHERE id = ?").bind(id).run();
  return { deleted: true };
}

// 「テスト対策」として扱う学習タイプのID一覧
async function testTypeIds(env) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM study_types WHERE is_test_type = 1"
  ).all();
  return results.map((r) => r.id);
}

// 指定した日付範囲内で、テストタイプの記録がある日付の集合を返す
async function studiedTestDateSet(env, typeIds, startISO, endISO) {
  if (!typeIds.length) return new Set();
  const placeholders = typeIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT date FROM study_records WHERE date BETWEEN ? AND ? AND type_id IN (${placeholders})`
  ).bind(startISO, endISO, ...typeIds).all();
  return new Set(results.map((r) => r.date));
}

// テスト日のうち、前日までの14日間すべてにテストタイプの記録があるものの集合（ハイライト対象）
async function testHighlightDateSet(env, testDates, typeIds) {
  const highlighted = new Set();
  if (!typeIds.length) return highlighted;
  for (const td of testDates) {
    const prepStart = addDaysISO(td.date, -TEST_PREP_DAYS);
    const prepEnd = addDaysISO(td.date, -1);
    const studied = await studiedTestDateSet(env, typeIds, prepStart, prepEnd);
    let complete = true;
    let cursor = prepStart;
    for (let i = 0; i < TEST_PREP_DAYS; i++) {
      if (!studied.has(cursor)) { complete = false; break; }
      cursor = addDaysISO(cursor, 1);
    }
    if (complete) highlighted.add(td.date);
  }
  return highlighted;
}

// 表示ページ用：現在の(または直近の)テスト期間の状況をまとめて返す
async function testPeriodStatus(env, todayStr) {
  const testDates = await listTestDates(env);
  const typeIds = await testTypeIds(env);

  const upcoming = testDates.find((td) => td.date >= todayStr) || null;

  let active = null;
  for (const td of testDates) {
    const prepStart = addDaysISO(td.date, -TEST_PREP_DAYS);
    if (todayStr >= prepStart && todayStr <= td.date) { active = td; break; }
  }

  const result = {
    upcoming: upcoming ? { date: upcoming.date, label: upcoming.label } : null,
    active: null,
  };

  if (active && typeIds.length) {
    const prepStart = addDaysISO(active.date, -TEST_PREP_DAYS);
    const studied = await studiedTestDateSet(env, typeIds, prepStart, active.date);

    let cursor = todayStr;
    if (!studied.has(cursor)) cursor = addDaysISO(cursor, -1);
    let streakCount = 0;
    while (cursor >= prepStart && studied.has(cursor)) {
      streakCount += 1;
      cursor = addDaysISO(cursor, -1);
    }

    result.active = {
      date: active.date,
      label: active.label,
      prep_start: prepStart,
      streak_count: streakCount,
      days_until_test: diffDaysInJST(active.date, todayStr),
    };
  }

  return result;
}

/* ==========================================================
   日記
   ========================================================== */
async function getDiary(env, date) {
  if (!DATE_RE.test(date || "")) throw new Error("date はYYYY-MM-DD形式で指定してください");
  const row = await env.DB.prepare(
    "SELECT date, content, updated_at FROM diary_entries WHERE date = ?"
  ).bind(date).first();
  return row || { date, content: "", updated_at: null };
}

async function upsertDiary(env, body) {
  const date = body?.date;
  if (!DATE_RE.test(date || "")) throw new Error("日付はYYYY-MM-DD形式で指定してください");
  const content = (body?.content || "").toString().slice(0, 2000);
  return env.DB.prepare(
    `INSERT INTO diary_entries (date, content, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
     RETURNING date, content, updated_at`
  ).bind(date, content).first();
}

/* ==========================================================
   タスク達成ストリーク（タスク完了・持ち物全チェックで加算）
   学習記録の連続日数（computeStreak）とは別カウント。
   ========================================================== */
async function getTaskStreak(env) {
  const row = await env.DB.prepare("SELECT * FROM task_streak WHERE id = 1").first();
  return row || { current_count: 0, longest_count: 0, last_completed_date: null };
}

async function recordTaskActivity(env, today = todayISOInJST()) {
  const current = await getTaskStreak(env);
  if (current.last_completed_date === today) return current; // 今日はすでに記録済み

  const isConsecutive = current.last_completed_date === yesterdayISOInJST(today);
  const newCurrent = isConsecutive ? current.current_count + 1 : 1;
  const newLongest = Math.max(current.longest_count, newCurrent);

  await env.DB.prepare(
    "UPDATE task_streak SET current_count = ?, longest_count = ?, last_completed_date = ? WHERE id = 1"
  ).bind(newCurrent, newLongest, today).run();

  return { current_count: newCurrent, longest_count: newLongest, last_completed_date: today };
}

/* ==========================================================
   タスク管理（宿題・提出物・自由タスク）
   優先度スコア = 重要度係数（提出物3 > 宿題2 > 自由1）÷ 残り日数。
   締切当日・超過は最優先、締切なしは常に低優先固定。
   ========================================================== */
const TASK_TYPES = ["homework", "submission", "free"];
const TASK_IMPORTANCE = { submission: 3, homework: 2, free: 1 };

function calcPriorityScore(type, dueDate, now = new Date()) {
  const importance = TASK_IMPORTANCE[type] ?? 1;
  if (!dueDate) return importance * 0.5;
  const daysLeft = diffDaysInJST(dueDate, todayISOInJST(now));
  if (daysLeft <= 0) return importance * 100;
  return importance / daysLeft;
}

function daysUntil(dueDate, now = new Date()) {
  if (!dueDate) return null;
  return diffDaysInJST(dueDate, todayISOInJST(now));
}

function withScore(row) {
  return {
    ...row,
    priority_score: calcPriorityScore(row.type, row.due_date),
    days_left: daysUntil(row.due_date),
  };
}

function sortByPriority(rows) {
  return rows.map(withScore).sort((a, b) => b.priority_score - a.priority_score);
}

// タスクに紐づいた学習記録の合計時間（学習記録機能との連携：「このタスクに何分使ったか」を可視化する）
async function studiedMinutesMap(env, taskIds) {
  if (!taskIds.length) return {};
  const placeholders = taskIds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT task_id, SUM(duration_minutes) AS total FROM study_records
     WHERE task_id IN (${placeholders}) GROUP BY task_id`
  ).bind(...taskIds).all();
  const map = {};
  for (const r of results) map[r.task_id] = r.total;
  return map;
}

async function attachStudiedMinutes(env, rows) {
  const map = await studiedMinutesMap(env, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, studied_minutes: map[r.id] || 0 }));
}

async function attachStudiedMinutesOne(env, row) {
  const map = await studiedMinutesMap(env, [row.id]);
  return { ...row, studied_minutes: map[row.id] || 0 };
}

async function listTasks(env, status) {
  const query = status
    ? env.DB.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC").bind(status)
    : env.DB.prepare("SELECT * FROM tasks ORDER BY created_at DESC");
  const { results } = await query.all();
  return sortByPriority(await attachStudiedMinutes(env, results));
}

// Todayホーム：未完了タスクの優先度上位3件。
// 前回表示日から日をまたいでいる未完了タスクは先延ばし回数を加算する。
async function todayTasks(env) {
  const today = todayISOInJST();
  const { results } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status != 'done' ORDER BY created_at DESC"
  ).all();

  for (const t of results) {
    if (t.last_seen_date && t.last_seen_date !== today) {
      await env.DB.prepare(
        "UPDATE tasks SET postponed_count = postponed_count + 1, last_seen_date = ? WHERE id = ?"
      ).bind(today, t.id).run();
      t.postponed_count += 1;
    } else if (!t.last_seen_date) {
      await env.DB.prepare("UPDATE tasks SET last_seen_date = ? WHERE id = ?").bind(today, t.id).run();
    }
    t.last_seen_date = today;
  }

  return sortByPriority(await attachStudiedMinutes(env, results)).slice(0, 3);
}

async function createTask(env, body) {
  const title = (body?.title || "").toString().trim();
  const type = body?.type;
  if (!title) throw new Error("タイトルを入力してください");
  if (!TASK_TYPES.includes(type)) throw new Error("タスクの種類を選んでください");
  const dueDate = body?.due_date || null;
  if (dueDate && !DATE_RE.test(dueDate)) throw new Error("締切日はYYYY-MM-DD形式で指定してください");
  const row = await env.DB.prepare(
    `INSERT INTO tasks (title, type, due_date, status) VALUES (?, ?, ?, 'pending')
     RETURNING *`
  ).bind(title, type, dueDate).first();
  return withScore(await attachStudiedMinutesOne(env, row));
}

async function updateTask(env, id, body) {
  const existing = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first();
  if (!existing) throw new Error("タスクが見つかりません");
  const nextTitle = body?.title !== undefined ? String(body.title).trim() : existing.title;
  const nextDue = body?.due_date !== undefined ? body.due_date : existing.due_date;
  const nextStatus = body?.status !== undefined ? body.status : existing.status;
  const completedAt = nextStatus === "done" ? new Date().toISOString() : existing.completed_at;

  await env.DB.prepare(
    "UPDATE tasks SET title = ?, due_date = ?, status = ?, completed_at = ? WHERE id = ?"
  ).bind(nextTitle, nextDue, nextStatus, completedAt, id).run();

  if (nextStatus === "done" && existing.status !== "done") {
    await recordTaskActivity(env);
  }

  const row = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first();
  return withScore(await attachStudiedMinutesOne(env, row));
}

async function deleteTask(env, id) {
  await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  return { deleted: true };
}

// 集中モード：未完了タスクの中から次に消化すべき1件（最優先）を返す
async function focusQueueNext(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status != 'done' ORDER BY created_at DESC"
  ).all();
  const scored = sortByPriority(await attachStudiedMinutes(env, results));
  return scored[0] || null;
}

/* ==========================================================
   持ち物チェックリスト（日にち指定の手動入力）
   ========================================================== */
async function listBelongings(env, date) {
  if (!DATE_RE.test(date || "")) throw new Error("date はYYYY-MM-DD形式で指定してください");
  const { results } = await env.DB.prepare(
    "SELECT * FROM belongings WHERE date = ? ORDER BY created_at ASC"
  ).bind(date).all();
  return results;
}

async function createBelonging(env, body) {
  const date = body?.date;
  const itemName = (body?.item_name || "").toString().trim();
  if (!DATE_RE.test(date || "")) throw new Error("日付はYYYY-MM-DD形式で指定してください");
  if (!itemName) throw new Error("持ち物の名前を入力してください");
  return env.DB.prepare(
    "INSERT INTO belongings (date, item_name) VALUES (?, ?) RETURNING *"
  ).bind(date, itemName).first();
}

// チェックON/OFF切り替え。その日の全項目がチェック済みになったら達成ストリークを1日分記録
async function toggleBelonging(env, id, checked) {
  const existing = await env.DB.prepare("SELECT * FROM belongings WHERE id = ?").bind(id).first();
  if (!existing) throw new Error("項目が見つかりません");

  await env.DB.prepare("UPDATE belongings SET checked = ? WHERE id = ?").bind(checked ? 1 : 0, id).run();

  if (checked && existing.date === todayISOInJST()) {
    const { results } = await env.DB.prepare(
      "SELECT checked FROM belongings WHERE date = ?"
    ).bind(existing.date).all();
    if (results.length > 0 && results.every((r) => r.checked === 1)) {
      await recordTaskActivity(env);
    }
  }

  return env.DB.prepare("SELECT * FROM belongings WHERE id = ?").bind(id).first();
}

async function deleteBelonging(env, id) {
  await env.DB.prepare("DELETE FROM belongings WHERE id = ?").bind(id).run();
  return { deleted: true };
}

/* ==========================================================
   固定学習ブロック（曜日×時間で設定、開始中を判定）
   ========================================================== */
async function listStudyBlocks(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM study_blocks ORDER BY weekday ASC, start_time ASC"
  ).all();
  return results;
}

async function createStudyBlock(env, body) {
  const weekday = Number(body?.weekday);
  const startTime = body?.start_time;
  const endTime = body?.end_time;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("曜日を指定してください");
  if (!TIME_RE.test(startTime || "") || !TIME_RE.test(endTime || "")) {
    throw new Error("開始・終了時刻はHH:MM形式で指定してください");
  }
  if (startTime >= endTime) throw new Error("終了時刻は開始時刻より後にしてください");
  const label = (body?.label || "").toString().trim().slice(0, 50) || null;
  return env.DB.prepare(
    "INSERT INTO study_blocks (weekday, start_time, end_time, label) VALUES (?, ?, ?, ?) RETURNING *"
  ).bind(weekday, startTime, endTime, label).first();
}

async function deleteStudyBlock(env, id) {
  await env.DB.prepare("DELETE FROM study_blocks WHERE id = ?").bind(id).run();
  return { deleted: true };
}

// 今この瞬間アクティブな学習ブロックを返す（入力ページの通知バナー表示用）
async function currentStudyBlock(env) {
  const weekday = jstWeekday();
  const hhmm = jstHHMM();
  const { results } = await env.DB.prepare(
    "SELECT * FROM study_blocks WHERE weekday = ? ORDER BY start_time ASC"
  ).bind(weekday).all();
  return results.find((b) => b.start_time <= hhmm && hhmm < b.end_time) || null;
}

/* ==========================================================
   週次振り返り（過去7日間：達成率・平均先延ばし回数・種類別完了数）
   ========================================================== */
async function weeklyReview(env) {
  const since = daysAgoISOInJST(7);

  const { results: created } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE created_at >= ?"
  ).bind(since).all();
  const { results: completed } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status = 'done' AND completed_at >= ?"
  ).bind(since).all();

  const allInWindow = created || [];
  const doneInWindow = completed || [];

  const completionRate = allInWindow.length > 0 ? doneInWindow.length / allInWindow.length : null;
  const avgPostponed = allInWindow.length > 0
    ? allInWindow.reduce((sum, t) => sum + t.postponed_count, 0) / allInWindow.length
    : 0;

  const byType = { homework: 0, submission: 0, free: 0 };
  for (const t of doneInWindow) byType[t.type] = (byType[t.type] ?? 0) + 1;

  const streak = await getTaskStreak(env);

  // 学習記録機能との連携：同じ7日間に実際に学習した合計時間・タスク由来の時間も合わせて見せる
  const studyTotals = await env.DB.prepare(
    `SELECT COALESCE(SUM(duration_minutes), 0) AS total,
            COALESCE(SUM(CASE WHEN task_id IS NOT NULL THEN duration_minutes ELSE 0 END), 0) AS from_tasks
     FROM study_records WHERE date >= ?`
  ).bind(since).first();

  return {
    since,
    total_tasks: allInWindow.length,
    completed_tasks: doneInWindow.length,
    completion_rate: completionRate,
    average_postponed_count: Number(avgPostponed.toFixed(2)),
    completed_by_type: byType,
    streak: { current_count: streak.current_count, longest_count: streak.longest_count },
    total_study_minutes: studyTotals?.total || 0,
    study_minutes_from_tasks: studyTotals?.from_tasks || 0,
  };
}

/* ==========================================================
   ルーティング
   ========================================================== */
async function handleApi(request, env, url) {
  const [, resource, id] = url.pathname.split("/").filter(Boolean);
  try {
    if (resource === "types") {
      if (request.method === "GET") return json(await listTypes(env));
      if (request.method === "POST") return json(await createType(env, await request.json()));
      if (request.method === "PUT" && id) return json(await updateType(env, id, await request.json()));
      if (request.method === "DELETE" && id) return json(await deleteType(env, id));
    }

    if (resource === "records") {
      if (request.method === "GET") {
        const date = url.searchParams.get("date");
        return json(await recordsForDate(env, date));
      }
      if (request.method === "POST") return json(await createRecord(env, await request.json()));
      if (request.method === "DELETE" && id) return json(await deleteRecord(env, id));
    }

    if (resource === "diary") {
      if (request.method === "GET") {
        const date = url.searchParams.get("date");
        return json(await getDiary(env, date));
      }
      if (request.method === "POST") return json(await upsertDiary(env, await request.json()));
    }

    if (resource === "calendar" && request.method === "GET") {
      const year = Number(url.searchParams.get("year"));
      const month = Number(url.searchParams.get("month"));
      if (!year || !month) return fail("year と month を指定してください");
      return json(await calendarData(env, year, month));
    }

    if (resource === "summary" && request.method === "GET") {
      const date = url.searchParams.get("date");
      if (!DATE_RE.test(date || "")) return fail("date をYYYY-MM-DD形式で指定してください");
      const [records, streak, diary, testPeriod] = await Promise.all([
        recordsForDate(env, date),
        computeStreak(env, date),
        getDiary(env, date),
        testPeriodStatus(env, date),
      ]);
      const totalMinutes = records.reduce((s, r) => s + r.duration_minutes, 0);
      return json({
        date,
        records,
        total_minutes: totalMinutes,
        streak: streak.count,
        streak_dates: streak.dates,
        diary: diary.content,
        test_period: testPeriod,
      });
    }

    if (resource === "test-dates") {
      if (request.method === "GET") return json(await listTestDates(env));
      if (request.method === "POST") return json(await createTestDate(env, await request.json()));
      if (request.method === "DELETE" && id) return json(await deleteTestDate(env, id));
    }

    if (resource === "tasks") {
      if (request.method === "GET" && id === "today") return json(await todayTasks(env));
      if (request.method === "GET" && id === "focus-queue") return json(await focusQueueNext(env));
      if (request.method === "GET" && !id) return json(await listTasks(env, url.searchParams.get("status")));
      if (request.method === "POST" && !id) return json(await createTask(env, await request.json()));
      if (request.method === "PATCH" && id) return json(await updateTask(env, id, await request.json()));
      if (request.method === "DELETE" && id) return json(await deleteTask(env, id));
    }

    if (resource === "belongings") {
      if (request.method === "GET" && !id) {
        const date = url.searchParams.get("date") || todayISOInJST();
        return json({ date, items: await listBelongings(env, date) });
      }
      if (request.method === "POST" && !id) return json(await createBelonging(env, await request.json()));
      if (request.method === "PATCH" && id) {
        const body = await request.json();
        return json(await toggleBelonging(env, id, !!body?.checked));
      }
      if (request.method === "DELETE" && id) return json(await deleteBelonging(env, id));
    }

    if (resource === "study-blocks") {
      if (request.method === "GET" && id === "current") return json(await currentStudyBlock(env));
      if (request.method === "GET" && !id) return json(await listStudyBlocks(env));
      if (request.method === "POST" && !id) return json(await createStudyBlock(env, await request.json()));
      if (request.method === "DELETE" && id) return json(await deleteStudyBlock(env, id));
    }

    if (resource === "task-streak" && request.method === "GET") {
      return json(await getTaskStreak(env));
    }

    if (resource === "weekly-review" && request.method === "GET") {
      return json(await weeklyReview(env));
    }

    return fail("not found", 404);
  } catch (err) {
    return fail(err.message || "内部エラーが発生しました", 400);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
