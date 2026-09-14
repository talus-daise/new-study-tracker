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
