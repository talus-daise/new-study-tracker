(() => {
  const todayLabel = document.getElementById("today-label");
  const clockEl = document.getElementById("clock");
  const monthLabel = document.getElementById("month-label");
  const calendarGrid = document.getElementById("calendar-grid");
  const prevBtn = document.getElementById("prev-month");
  const nextBtn = document.getElementById("next-month");
  const streakNumber = document.getElementById("streak-number");
  const todayTotal = document.getElementById("today-total");
  const todaySummaryList = document.getElementById("today-summary-list");
  const todaySummaryEmpty = document.getElementById("today-summary-empty");
  const legendBar = document.getElementById("legend-bar");

  const WEEKDAY_KANJI = ["日", "月", "火", "水", "木", "金", "土"];

  let types = [];
  let viewYear, viewMonth; // 1-12
  let streakDateSet = new Set();

  function localDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function api(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error("通信に失敗しました: " + path);
    return res.json();
  }

  function formatMinutes(min) {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m ? `${h}時間${m}分` : `${h}時間`;
    }
    return `${min}分`;
  }

  function updateClock() {
    const now = new Date();
    const w = WEEKDAY_KANJI[now.getDay()];
    todayLabel.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${w}）`;
    clockEl.textContent = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  function renderLegend() {
    legendBar.innerHTML = "";
    for (const t of types) {
      const item = document.createElement("span");
      item.className = "legend-item";
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.setProperty("--dot-color", t.color);
      const name = document.createElement("span");
      name.textContent = t.name;
      item.append(dot, name);
      legendBar.appendChild(item);
    }
  }

  async function renderCalendar(year, month) {
    monthLabel.textContent = `${year}年${month}月`;
    const data = await api(`/api/calendar?year=${year}&month=${month}`);

    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = localDateStr(new Date());

    calendarGrid.innerHTML = "";
    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement("div");
      blank.className = "day-cell is-blank";
      calendarGrid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cell = document.createElement("div");
      cell.className = "day-cell";
      if (dateStr === todayStr) cell.classList.add("is-today");
      if (streakDateSet.has(dateStr)) {
        cell.classList.add("in-streak");
        const previousDate = `${year}-${String(month).padStart(2, "0")}-${String(day - 1).padStart(2, "0")}`;
        const nextDate = `${year}-${String(month).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`;
        const weekday = new Date(year, month - 1, day).getDay();
        if (day > 1 && weekday !== 0 && streakDateSet.has(previousDate)) {
          cell.classList.add("streak-continues-left");
        }
        if (day < daysInMonth && weekday !== 6 && streakDateSet.has(nextDate)) {
          cell.classList.add("streak-continues-right");
        }
      }

      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = day;
      cell.appendChild(num);

      const info = data[dateStr];
      if (info) {
        const dots = document.createElement("div");
        dots.className = "day-dots";
        for (const color of info.colors) {
          const dot = document.createElement("span");
          dot.className = "dot";
          dot.style.setProperty("--dot-color", color);
          dots.appendChild(dot);
        }
        cell.appendChild(dots);
      }
      calendarGrid.appendChild(cell);
    }
  }

  async function renderSummary() {
    const todayStr = localDateStr(new Date());
    const summary = await api(`/api/summary?date=${todayStr}`);

    streakNumber.textContent = summary.streak;
    streakDateSet = new Set(summary.streak_dates);

    todayTotal.textContent = `合計 ${formatMinutes(summary.total_minutes)}`;
    todaySummaryList.innerHTML = "";
    todaySummaryEmpty.style.display = summary.records.length ? "none" : "block";
    for (const r of summary.records) {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.setProperty("--dot-color", r.type_color);
      const label = document.createElement("span");
      label.textContent = `${r.type_name}${r.content ? " — " + r.content : ""}`;
      label.style.flex = "1";
      const meta = document.createElement("span");
      meta.className = "entry-meta";
      meta.textContent = formatMinutes(r.duration_minutes);
      li.append(dot, label, meta);
      todaySummaryList.appendChild(li);
    }
  }

  async function refreshAll() {
    types = await api("/api/types");
    renderLegend();
    await renderSummary(); // streakDateSet をカレンダー描画前に更新
    await renderCalendar(viewYear, viewMonth);
  }

  prevBtn.addEventListener("click", async () => {
    viewMonth -= 1;
    if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; }
    await renderCalendar(viewYear, viewMonth);
  });

  nextBtn.addEventListener("click", async () => {
    viewMonth += 1;
    if (viewMonth > 12) { viewMonth = 1; viewYear += 1; }
    await renderCalendar(viewYear, viewMonth);
  });

  (function init() {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth() + 1;
    updateClock();
    setInterval(updateClock, 15000);
    refreshAll();
    // 数分おきに今日の概要とカレンダーを再取得（表示しっぱなしのタブレット向け）
    setInterval(refreshAll, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshAll();
    });
  })();
})();
