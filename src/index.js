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
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

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

async function createRecord(env, body) {
  const date = body?.date;
  if (!DATE_RE.test(date || "")) throw new Error("日付はYYYY-MM-DD形式で指定してください");
  const typeId = Number(body?.type_id);
  if (!typeId) throw new Error("学習タイプを選択してください");
  const minutes = Math.max(0, Math.floor(Number(body?.duration_minutes) || 0));
  const content = (body?.content || "").toString().slice(0, 500);
  return env.DB.prepare(
    `INSERT INTO study_records (date, type_id, duration_minutes, content)
     VALUES (?, ?, ?, ?)
     RETURNING id, date, type_id, duration_minutes, content, created_at`
  ).bind(date, typeId, minutes, content).first();
}

async function deleteRecord(env, id) {
  await env.DB.prepare("DELETE FROM study_records WHERE id = ?").bind(id).run();
  return { deleted: true };
}

async function recordsForDate(env, date) {
  if (!DATE_RE.test(date || "")) throw new Error("date はYYYY-MM-DD形式で指定してください");
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.date, r.type_id, r.duration_minutes, r.content, r.created_at,
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
    const entry = (byDate[row.date] ||= { colors: [], total_minutes: 0 });
    if (!entry.colors.includes(row.type_color)) entry.colors.push(row.type_color);
    entry.total_minutes += row.duration_minutes;
  }
  return byDate;
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

    if (resource === "calendar" && request.method === "GET") {
      const year = Number(url.searchParams.get("year"));
      const month = Number(url.searchParams.get("month"));
      if (!year || !month) return fail("year と month を指定してください");
      return json(await calendarData(env, year, month));
    }

    if (resource === "summary" && request.method === "GET") {
      const date = url.searchParams.get("date");
      if (!DATE_RE.test(date || "")) return fail("date をYYYY-MM-DD形式で指定してください");
      const [records, streak] = await Promise.all([
        recordsForDate(env, date),
        computeStreak(env, date),
      ]);
      const totalMinutes = records.reduce((s, r) => s + r.duration_minutes, 0);
      return json({ date, records, total_minutes: totalMinutes, streak: streak.count, streak_dates: streak.dates });
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
