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
  const diaryText = document.getElementById("diary-text");
  const todayPie = document.getElementById("today-pie");
  const todayGoalNote = document.getElementById("today-goal-note");
  const testPeriodBlock = document.getElementById("test-period-block");
  const testPeriodText = document.getElementById("test-period-text");
  const dayDetailOverlay = document.getElementById("day-detail-overlay");
  const dayDetailClose = document.getElementById("day-detail-close");
  const dayDetailTitle = document.getElementById("day-detail-title");
  const dayDetailPie = document.getElementById("day-detail-pie");
  const dayDetailTotal = document.getElementById("day-detail-total");
  const dayDetailGoalNote = document.getElementById("day-detail-goal-note");
  const dayDetailList = document.getElementById("day-detail-list");
  const dayDetailEmpty = document.getElementById("day-detail-empty");

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

  /* ---------- 日没にあわせたダークモード ----------
     21:00〜5:00は問答無用で「夜間（暗め）」、
     5:00〜21:00は日没時刻を境に「昼間」⇄「夜（通常の暗さ)」を切り替える。
     日没時刻はタブレットの位置情報から概算し、取得できない場合は18:00を仮の日没とする。 */
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  let geoCoords = null;
  let sunsetCache = { dateKey: null, sunset: null };

  function toRad(deg) { return (deg * Math.PI) / 180; }
  function toDeg(rad) { return (rad * 180) / Math.PI; }

  // 緯度経度から日没時刻(UTC)を近似計算する（誤差はおよそ数分程度）
  function calcSunsetUtc(date, lat, lon) {
    const dayOfYear = Math.floor(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
        Date.UTC(date.getFullYear(), 0, 0)) / 86400000
    );
    const lngHour = lon / 15;
    const t = dayOfYear + (18 - lngHour) / 24;

    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(toRad(M)) + 0.02 * Math.sin(toRad(2 * M)) + 282.634;
    L = ((L % 360) + 360) % 360;

    let RA = toDeg(Math.atan(0.91764 * Math.tan(toRad(L))));
    RA = ((RA % 360) + 360) % 360;
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
    RA /= 15;

    const sinDec = 0.39782 * Math.sin(toRad(L));
    const cosDec = Math.cos(Math.asin(sinDec));

    const zenith = 90.833;
    const cosH =
      (Math.cos(toRad(zenith)) - sinDec * Math.sin(toRad(lat))) / (cosDec * Math.cos(toRad(lat)));
    if (cosH > 1 || cosH < -1) return null; // 極端な高緯度など、その日は日没/日の出がない

    const H = (360 - toDeg(Math.acos(cosH))) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = ((T - lngHour) % 24 + 24) % 24;

    const hours = Math.floor(UT);
    const minutes = Math.floor((UT - hours) * 60);
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes));
  }

  function getTodaySunset() {
    const now = new Date();
    const dateKey = localDateStr(now);
    if (sunsetCache.dateKey === dateKey) return sunsetCache.sunset;

    let sunset = geoCoords ? calcSunsetUtc(now, geoCoords.lat, geoCoords.lon) : null;
    if (!sunset) {
      // 位置情報が使えない場合の暫定値（18:00を日没とみなす）
      sunset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0);
    }
    sunsetCache = { dateKey, sunset };
    return sunset;
  }

  function applyTimeTheme() {
    const now = new Date();
    const hour = now.getHours();
    const isNightWindow = hour >= 21 || hour < 5; // 21:00〜5:00
    const isDark = isNightWindow || now >= getTodaySunset();
    document.body.classList.toggle("theme-dark", isDark);
    document.body.classList.toggle("theme-dimmed", isNightWindow);
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", isDark ? "#21242b" : "#efe9da");
    }
  }

  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        sunsetCache = { dateKey: null, sunset: null }; // 取得できたので再計算させる
        applyTimeTheme();
      },
      () => { /* 位置情報が拒否/取得不可でも18:00固定の近似で動作を続ける */ },
      { timeout: 8000, maximumAge: 12 * 60 * 60 * 1000 }
    );
  }

  async function api(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error("通信に失敗しました: " + path);
    return res.json();
  }

  function formatDateJp(iso) {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  }

  // 平日は1時間30分、休日(土日)は2時間を目標学習時間とする
  function goalMinutesFor(date) {
    const day = date.getDay(); // 0=日, 6=土
    return day === 0 || day === 6 ? 120 : 90;
  }

  // 「今日の学習」の円グラフ：目標学習時間を100%として、各学習タイプの割合を描く
  function renderPieChart(container, records, goalMinutes) {
    container.innerHTML = "";
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 36 36");

    const track = document.createElementNS(svgNS, "circle");
    track.setAttribute("cx", "18");
    track.setAttribute("cy", "18");
    track.setAttribute("r", "15.9155");
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "rgba(120, 120, 120, 0.22)");
    track.setAttribute("stroke-width", "4");
    svg.appendChild(track);

    const totalMinutes = records.reduce((s, r) => s + r.duration_minutes, 0);

    if (totalMinutes > 0 && goalMinutes > 0) {
      const byColor = new Map();
      for (const r of records) {
        const pct = (r.duration_minutes / goalMinutes) * 100;
        byColor.set(r.type_color, (byColor.get(r.type_color) || 0) + pct);
      }
      let segments = [...byColor.entries()].map(([color, pct]) => ({ color, pct }));
      const sumPct = segments.reduce((s, seg) => s + seg.pct, 0);
      if (sumPct > 100) {
        const scale = 100 / sumPct;
        segments = segments.map((seg) => ({ ...seg, pct: seg.pct * scale }));
      }

      const group = document.createElementNS(svgNS, "g");
      group.setAttribute("transform", "rotate(-90 18 18)");
      let offset = 0;
      for (const seg of segments) {
        if (seg.pct <= 0) continue;
        const c = document.createElementNS(svgNS, "circle");
        c.setAttribute("cx", "18");
        c.setAttribute("cy", "18");
        c.setAttribute("r", "15.9155");
        c.setAttribute("fill", "none");
        c.setAttribute("stroke", seg.color);
        c.setAttribute("stroke-width", "4");
        c.setAttribute("stroke-dasharray", `${seg.pct} ${100 - seg.pct}`);
        c.setAttribute("stroke-dashoffset", `${-offset}`);
        group.appendChild(c);
        offset += seg.pct;
      }
      svg.appendChild(group);
    }

    container.appendChild(svg);

    const label = document.createElement("span");
    label.className = "pie-center-label";
    const pct = goalMinutes > 0 ? Math.round((totalMinutes / goalMinutes) * 100) : 0;
    label.textContent = `${pct}%`;
    container.appendChild(label);
  }

  // テスト期間限定連続学習・次のテスト予定の表示
  function renderTestPeriod(testPeriod) {
    if (!testPeriod || (!testPeriod.active && !testPeriod.upcoming)) {
      testPeriodBlock.hidden = true;
      return;
    }
    if (testPeriod.active) {
      const a = testPeriod.active;
      const labelPart = a.label ? `「${a.label}」` : "";
      const untilPart = a.days_until_test <= 0 ? "今日がテスト当日" : `テストまであと${a.days_until_test}日`;
      testPeriodText.innerHTML =
        `テスト期間限定連続学習 <strong>${a.streak_count}日</strong>` +
        `　${formatDateJp(a.date)}${labelPart}のテスト・${untilPart}`;
    } else {
      const u = testPeriod.upcoming;
      const labelPart = u.label ? `「${u.label}」` : "";
      testPeriodText.textContent = `次のテスト：${formatDateJp(u.date)}${labelPart}`;
    }
    testPeriodBlock.hidden = false;
  }

  // 日別の学習詳細（カレンダーの日付タップで開く）
  async function openDayDetail(dateStr) {
    const summary = await api(`/api/summary?date=${dateStr}`);
    const [y, m, d] = dateStr.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const goalMinutes = goalMinutesFor(dateObj);

    dayDetailTitle.textContent = `${y}年${m}月${d}日（${WEEKDAY_KANJI[dateObj.getDay()]}）の学習`;
    dayDetailTotal.textContent = `合計 ${formatMinutes(summary.total_minutes)}`;
    dayDetailGoalNote.textContent = `目標 ${formatMinutes(goalMinutes)}`;
    renderPieChart(dayDetailPie, summary.records, goalMinutes);

    renderRecordList(dayDetailList, dayDetailEmpty, summary.records);

    dayDetailOverlay.hidden = false;
  }

  function closeDayDetail() {
    dayDetailOverlay.hidden = true;
  }

  dayDetailClose.addEventListener("click", closeDayDetail);
  dayDetailOverlay.addEventListener("click", (e) => {
    if (e.target === dayDetailOverlay) closeDayDetail();
  });

  // 学習記録の一覧を描画する（今日の学習・日別詳細で共用）。タスク完了時に記録された分には🔗を付ける
  function renderRecordList(container, emptyEl, records) {
    container.innerHTML = "";
    emptyEl.style.display = records.length ? "none" : "block";
    for (const r of records) {
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
      const parts = [dot, label];
      if (r.task_id) {
        const link = document.createElement("span");
        link.className = "entry-task-link";
        link.textContent = "🔗";
        link.title = "タスク完了時に記録した学習";
        parts.push(link);
      }
      parts.push(meta);
      li.append(...parts);
      container.appendChild(li);
    }
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
        if (info.is_test_day) cell.classList.add("is-test-day");
        if (info.is_test_highlight) cell.classList.add("is-test-highlight");
      }

      // 学習内容の概要バー：目標学習時間を100%として、学習タイプごとの割合を色分けした帯で示す
      const weekday = new Date(year, month - 1, day).getDay();
      const dayGoal = weekday === 0 || weekday === 6 ? 120 : 90;
      const bar = document.createElement("div");
      bar.className = "day-bar";
      if (info && info.breakdown && info.breakdown.length) {
        let segments = info.breakdown.map((b) => ({
          color: b.color,
          pct: (b.minutes / dayGoal) * 100,
        }));
        const sumPct = segments.reduce((s, seg) => s + seg.pct, 0);
        if (sumPct > 100) {
          const scale = 100 / sumPct;
          segments = segments.map((seg) => ({ ...seg, pct: seg.pct * scale }));
        }
        for (const seg of segments) {
          if (seg.pct <= 0) continue;
          const s = document.createElement("span");
          s.className = "day-bar-seg";
          s.style.width = `${seg.pct}%`;
          s.style.backgroundColor = seg.color;
          bar.appendChild(s);
        }
      }
      cell.appendChild(bar);

      cell.addEventListener("click", () => openDayDetail(dateStr));

      calendarGrid.appendChild(cell);
    }
  }

  async function renderSummary() {
    const now = new Date();
    const todayStr = localDateStr(now);
    const summary = await api(`/api/summary?date=${todayStr}`);

    streakNumber.textContent = summary.streak;
    streakDateSet = new Set(summary.streak_dates);

    const goalMinutes = goalMinutesFor(now);
    todayTotal.textContent = `合計 ${formatMinutes(summary.total_minutes)}`;
    todayGoalNote.textContent = `目標 ${formatMinutes(goalMinutes)}`;
    renderPieChart(todayPie, summary.records, goalMinutes);
    renderTestPeriod(summary.test_period);

    renderRecordList(todaySummaryList, todaySummaryEmpty, summary.records);

    if (summary.diary && summary.diary.trim()) {
      diaryText.textContent = summary.diary;
      diaryText.classList.remove("empty-note");
    } else {
      diaryText.textContent = "まだ書かれていません";
      diaryText.classList.add("empty-note");
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
    applyTimeTheme();
    setInterval(applyTimeTheme, 60 * 1000); // 昼夜/深夜の切り替わりを毎分チェック
    refreshAll();
    // 数分おきに今日の概要とカレンダーを再取得（表示しっぱなしのタブレット向け）
    setInterval(refreshAll, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        applyTimeTheme();
        refreshAll();
      }
    });
  })();
})();
