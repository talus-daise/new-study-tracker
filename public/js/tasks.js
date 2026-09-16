(() => {
  const JSON_HEADERS = { "Content-Type": "application/json" };

  const TASK_TYPE_META = {
    homework: { label: "宿題", color: "var(--teal)" },
    submission: { label: "提出物", color: "var(--coral)" },
    free: { label: "自由", color: "var(--moss)" },
  };
  const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

  // --- タスク ---
  const studyBlockBanner = document.getElementById("study-block-banner");
  const todayTasksList = document.getElementById("today-tasks-list");
  const todayTasksEmpty = document.getElementById("today-tasks-empty");
  const focusStartBtn = document.getElementById("focus-start-btn");
  const taskForm = document.getElementById("task-form");
  const taskTitleInput = document.getElementById("task-title-input");
  const taskTypePicker = document.getElementById("task-type-picker");
  const taskDueInput = document.getElementById("task-due-input");
  const taskMessage = document.getElementById("task-message");
  const allTasksList = document.getElementById("all-tasks-list");
  const allTasksEmpty = document.getElementById("all-tasks-empty");

  // --- 持ち物 ---
  const belongingDateInput = document.getElementById("belonging-date-input");
  const belongingNameInput = document.getElementById("belonging-name-input");
  const belongingAddBtn = document.getElementById("belonging-add-btn");
  const belongingProgress = document.getElementById("belonging-progress");
  const belongingList = document.getElementById("belonging-list");
  const belongingEmpty = document.getElementById("belonging-empty");

  // --- 学習ブロック ---
  const blockList = document.getElementById("block-list");
  const blockEmpty = document.getElementById("block-empty");
  const blockForm = document.getElementById("block-form");
  const blockWeekdayInput = document.getElementById("block-weekday-input");
  const blockStartInput = document.getElementById("block-start-input");
  const blockEndInput = document.getElementById("block-end-input");
  const blockLabelInput = document.getElementById("block-label-input");

  // --- 週次振り返り ---
  const reviewRatePct = document.getElementById("review-rate-pct");
  const reviewRateFraction = document.getElementById("review-rate-fraction");
  const reviewBar = document.getElementById("review-bar");
  const reviewAvgPostponed = document.getElementById("review-avg-postponed");
  const reviewStreak = document.getElementById("review-streak");
  const reviewByType = document.getElementById("review-by-type");
  const reviewStudyMinutes = document.getElementById("review-study-minutes");
  const reviewLongest = document.getElementById("review-longest");

  // --- 集中モード ---
  const focusOverlay = document.getElementById("focus-overlay");
  const focusNormal = document.getElementById("focus-normal");
  const focusCountLabel = document.getElementById("focus-count-label");
  const focusCancelBtn = document.getElementById("focus-cancel-btn");
  const focusTypeBadge = document.getElementById("focus-type-badge");
  const focusTitle = document.getElementById("focus-title");
  const focusDays = document.getElementById("focus-days");
  const focusElapsed = document.getElementById("focus-elapsed");
  const focusCompleteBtn = document.getElementById("focus-complete-btn");
  const focusLog = document.getElementById("focus-log");
  const focusLogTitle = document.getElementById("focus-log-title");
  const focusLogMinutes = document.getElementById("focus-log-minutes");
  const focusLogTypePicker = document.getElementById("focus-log-type-picker");
  const focusLogSaveBtn = document.getElementById("focus-log-save-btn");
  const focusLogSkipBtn = document.getElementById("focus-log-skip-btn");
  const focusBreak = document.getElementById("focus-break");
  const focusBreakMsg = document.getElementById("focus-break-msg");
  const focusContinueBtn = document.getElementById("focus-continue-btn");
  const focusExitBtn = document.getElementById("focus-exit-btn");
  const focusEmpty = document.getElementById("focus-empty");
  const focusEmptyCount = document.getElementById("focus-empty-count");
  const focusEmptyExitBtn = document.getElementById("focus-empty-exit-btn");

  // --- タスク完了時の学習記録（学習記録機能との連携） ---
  const taskLogOverlay = document.getElementById("task-log-overlay");
  const taskLogClose = document.getElementById("task-log-close");
  const taskLogTaskTitle = document.getElementById("task-log-task-title");
  const taskLogMinutes = document.getElementById("task-log-minutes");
  const taskLogTypePicker = document.getElementById("task-log-type-picker");
  const taskLogSaveBtn = document.getElementById("task-log-save-btn");
  const taskLogSkipBtn = document.getElementById("task-log-skip-btn");

  let selectedTaskType = "homework";
  let focusDoneCount = 0;
  let studyTypes = [];
  let currentFocusTask = null;
  let focusStartedAt = null;
  let focusElapsedTimer = null;
  let focusLogMode = null; // 'complete' | 'cancel'
  let focusLogSelectedTypeId = null;
  let taskLogPendingTask = null;
  let taskLogSelectedTypeId = null;

  function localToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "通信に失敗しました");
    return data;
  }

  function taskDaysLabel(daysLeft) {
    if (daysLeft === null || daysLeft === undefined) return "―";
    if (daysLeft <= 0) return "今日";
    return `${daysLeft}日`;
  }

  function taskDaysState(daysLeft) {
    if (daysLeft === null || daysLeft === undefined) return "none";
    if (daysLeft <= 0) return "danger";
    if (daysLeft <= 2) return "soon";
    return "normal";
  }

  function formatMinutes(min) {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m ? `${h}時間${m}分` : `${h}時間`;
    }
    return `${min}分`;
  }

  /* ---------- タスク完了時の学習記録（学習記録機能との連携） ----------
     タスクのタイプ（宿題/提出物/自由）から、記録する学習タイプの初期値をおすすめする。
     学習タイプの名前は入力ページで自由に変更できるため、名前が一致しなければ先頭のタイプを使う。 */
  async function fetchStudyTypes() {
    try {
      studyTypes = await api("/api/types");
    } catch (err) {
      studyTypes = [];
    }
  }

  function guessStudyTypeId(taskType) {
    const nameGuess = { homework: "宿題", submission: "宿題", free: "自学" }[taskType];
    const match = studyTypes.find((t) => t.name === nameGuess);
    return (match || studyTypes[0])?.id ?? null;
  }

  // 学習タイプ選択チップを描画する（円グラフのタイプ選択と同じ見た目を、集中モード/タスク完了の記録フォームで使い回す）
  function renderStudyTypePicker(container, selectedId, onSelect) {
    container.innerHTML = "";
    for (const t of studyTypes) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-chip-btn" + (t.id === selectedId ? " is-selected" : "");
      btn.style.setProperty("--chip-color", t.color);
      btn.textContent = t.name;
      btn.addEventListener("click", () => onSelect(t.id));
      container.appendChild(btn);
    }
  }

  function bindTimeAdjustButtons(root) {
    root.querySelectorAll(".time-adj").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);
        const delta = Number(btn.dataset.delta);
        const next = Math.max(0, (Number(input.value) || 0) + delta);
        input.value = String(next);
      });
    });
  }

  async function logStudyForTask(task, minutes, typeId) {
    if (minutes <= 0 || !typeId) return;
    await api("/api/records", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        date: localToday(),
        type_id: typeId,
        duration_minutes: minutes,
        content: task.title,
        task_id: task.id,
      }),
    });
  }

  /* ---------- タスク ---------- */

  function renderTaskItem(task, { showStart }) {
    const li = document.createElement("li");
    li.className = "task-item";

    const info = document.createElement("div");
    info.className = "task-info";

    const meta = TASK_TYPE_META[task.type] || { label: task.type, color: "var(--graphite-soft)" };
    const badge = document.createElement("span");
    badge.className = "task-type-badge";
    badge.style.setProperty("--chip-color", meta.color);
    badge.textContent = meta.label;
    info.appendChild(badge);

    const title = document.createElement("span");
    title.className = "task-title" + (task.status === "done" ? " is-done" : "");
    title.textContent = task.title;
    info.appendChild(title);

    if (task.postponed_count > 0) {
      const postponed = document.createElement("span");
      postponed.className = "task-postponed";
      postponed.textContent = `先延ばし ${task.postponed_count}回`;
      info.appendChild(postponed);
    }

    if (task.studied_minutes > 0) {
      const studied = document.createElement("span");
      studied.className = "task-studied";
      studied.textContent = `📖 ${formatMinutes(task.studied_minutes)}`;
      info.appendChild(studied);
    }

    const days = document.createElement("span");
    days.className = "task-days";
    days.dataset.state = task.status === "done" ? "none" : taskDaysState(task.days_left);
    days.textContent = task.status === "done" ? "完了" : taskDaysLabel(task.days_left);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    if (showStart && task.status !== "done") {
      const startBtn = document.createElement("button");
      startBtn.type = "button";
      startBtn.className = "btn-chip";
      startBtn.textContent = "はじめる";
      startBtn.addEventListener("click", async () => {
        await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ status: "in_progress" }),
        });
        await refreshTasks();
      });
      actions.appendChild(startBtn);
    }

    const doneBtn = document.createElement("button");
    doneBtn.type = "button";
    doneBtn.className = "btn-chip" + (task.status === "done" ? " is-outline" : "");
    doneBtn.textContent = task.status === "done" ? "取り消す" : "完了";
    doneBtn.addEventListener("click", async () => {
      if (task.status === "done") {
        await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ status: "pending" }),
        });
        await refreshTasks();
        await refreshWeeklyReview();
      } else {
        openTaskLogOverlay(task);
      }
    });
    actions.appendChild(doneBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", async () => {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      await refreshTasks();
    });
    actions.appendChild(delBtn);

    li.append(info, days, actions);
    return li;
  }

  async function refreshTasks() {
    const [today, all] = await Promise.all([api("/api/tasks/today"), api("/api/tasks")]);

    todayTasksList.innerHTML = "";
    todayTasksEmpty.style.display = today.length ? "none" : "block";
    for (const t of today) todayTasksList.appendChild(renderTaskItem(t, { showStart: true }));

    allTasksList.innerHTML = "";
    allTasksEmpty.style.display = all.length ? "none" : "block";
    for (const t of all) allTasksList.appendChild(renderTaskItem(t, { showStart: false }));
  }

  function renderTaskTypePicker() {
    taskTypePicker.innerHTML = "";
    for (const type of Object.keys(TASK_TYPE_META)) {
      const meta = TASK_TYPE_META[type];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-chip-btn" + (type === selectedTaskType ? " is-selected" : "");
      btn.style.setProperty("--chip-color", meta.color);
      btn.textContent = meta.label;
      btn.addEventListener("click", () => {
        selectedTaskType = type;
        renderTaskTypePicker();
      });
      taskTypePicker.appendChild(btn);
    }
  }

  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    taskMessage.textContent = "";
    taskMessage.classList.remove("is-error");
    try {
      await api("/api/tasks", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          title: taskTitleInput.value.trim(),
          type: selectedTaskType,
          due_date: taskDueInput.value || null,
        }),
      });
      taskTitleInput.value = "";
      taskDueInput.value = "";
      taskMessage.textContent = "タスクを追加しました";
      await refreshTasks();
    } catch (err) {
      taskMessage.textContent = err.message;
      taskMessage.classList.add("is-error");
    }
  });

  /* ---------- タスク完了時の学習記録フォーム（一覧の「完了」から） ---------- */

  function renderTaskLogPicker() {
    renderStudyTypePicker(taskLogTypePicker, taskLogSelectedTypeId, (id) => {
      taskLogSelectedTypeId = id;
      renderTaskLogPicker();
    });
  }

  function openTaskLogOverlay(task) {
    taskLogPendingTask = task;
    taskLogTaskTitle.textContent = task.title;
    taskLogMinutes.value = "15";
    taskLogSelectedTypeId = guessStudyTypeId(task.type);
    renderTaskLogPicker();
    taskLogOverlay.hidden = false;
  }

  function closeTaskLogOverlay() {
    taskLogOverlay.hidden = true;
    taskLogPendingTask = null;
  }

  async function finishTaskLog(shouldLog) {
    const task = taskLogPendingTask;
    if (!task) return;
    try {
      if (shouldLog) {
        const minutes = Math.max(0, Math.floor(Number(taskLogMinutes.value) || 0));
        await logStudyForTask(task, minutes, taskLogSelectedTypeId);
      }
      await api(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ status: "done" }),
      });
    } catch (err) {
      alert(err.message);
    }
    closeTaskLogOverlay();
    await refreshTasks();
    await refreshWeeklyReview();
  }

  taskLogSaveBtn.addEventListener("click", () => finishTaskLog(true));
  taskLogSkipBtn.addEventListener("click", () => finishTaskLog(false));
  taskLogClose.addEventListener("click", closeTaskLogOverlay);
  bindTimeAdjustButtons(taskLogOverlay);

  /* ---------- 持ち物チェック ---------- */

  async function refreshBelongings() {
    const date = belongingDateInput.value || localToday();
    const { items } = await api(`/api/belongings?date=${date}`);

    belongingList.innerHTML = "";
    belongingEmpty.style.display = items.length ? "none" : "block";
    const checkedCount = items.filter((i) => i.checked === 1).length;
    belongingProgress.textContent = items.length ? `${checkedCount} / ${items.length} 完了` : "";

    for (const item of items) {
      const li = document.createElement("li");
      li.className = "belonging-item";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "belonging-check" + (item.checked ? " is-checked" : "");
      toggle.textContent = "✓";
      toggle.setAttribute("aria-label", "チェックを切り替える");
      toggle.addEventListener("click", async () => {
        await api(`/api/belongings/${item.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ checked: !item.checked }),
        });
        await refreshBelongings();
      });

      const name = document.createElement("span");
      name.className = "belonging-name" + (item.checked ? " is-checked" : "");
      name.textContent = item.item_name;

      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.textContent = "削除";
      del.addEventListener("click", async () => {
        await api(`/api/belongings/${item.id}`, { method: "DELETE" });
        await refreshBelongings();
      });

      li.append(toggle, name, del);
      belongingList.appendChild(li);
    }
  }

  async function addBelonging() {
    const name = belongingNameInput.value.trim();
    if (!name) return;
    const date = belongingDateInput.value || localToday();
    try {
      await api("/api/belongings", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ date, item_name: name }),
      });
      belongingNameInput.value = "";
      await refreshBelongings();
    } catch (err) {
      alert(err.message);
    }
  }

  belongingAddBtn.addEventListener("click", addBelonging);
  belongingNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBelonging();
    }
  });
  belongingDateInput.addEventListener("change", refreshBelongings);

  /* ---------- 固定学習ブロック ---------- */

  function initWeekdaySelect() {
    blockWeekdayInput.innerHTML = "";
    WEEKDAY_LABEL.forEach((label, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${label}曜日`;
      if (i === 1) opt.selected = true;
      blockWeekdayInput.appendChild(opt);
    });
  }

  async function refreshBlocks() {
    const blocks = await api("/api/study-blocks");
    blockList.innerHTML = "";
    blockEmpty.style.display = blocks.length ? "none" : "block";
    for (const b of blocks) {
      const li = document.createElement("li");
      li.className = "block-item";

      const weekday = document.createElement("span");
      weekday.className = "block-weekday";
      weekday.textContent = `${WEEKDAY_LABEL[b.weekday]}曜日`;

      const time = document.createElement("span");
      time.className = "block-time";
      time.textContent = `${b.start_time}〜${b.end_time}`;

      const note = document.createElement("span");
      note.className = "block-note";
      note.textContent = b.label || "";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "icon-btn";
      del.textContent = "削除";
      del.addEventListener("click", async () => {
        await api(`/api/study-blocks/${b.id}`, { method: "DELETE" });
        await refreshBlocks();
      });

      li.append(weekday, time, note, del);
      blockList.appendChild(li);
    }
  }

  blockForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/study-blocks", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          weekday: Number(blockWeekdayInput.value),
          start_time: blockStartInput.value,
          end_time: blockEndInput.value,
          label: blockLabelInput.value.trim(),
        }),
      });
      blockLabelInput.value = "";
      await refreshBlocks();
    } catch (err) {
      alert(err.message);
    }
  });

  let notifiedBlockId = null;
  let bannerHideTimer = null;

  async function checkStudyBlockBanner() {
    try {
      const active = await api("/api/study-blocks/current");
      if (active && active.id !== notifiedBlockId) {
        notifiedBlockId = active.id;
        studyBlockBanner.hidden = false;
        studyBlockBanner.textContent = `📚 ${active.label ? active.label + "の" : ""}学習時間です（${active.start_time}〜${active.end_time}）`;
        if (bannerHideTimer) clearTimeout(bannerHideTimer);
        bannerHideTimer = setTimeout(() => {
          studyBlockBanner.hidden = true;
        }, 15000);
      } else if (!active) {
        notifiedBlockId = null;
      }
    } catch (err) {
      // ネットワークエラー時は静かに諦める（次回のポーリングで再試行）
    }
  }

  /* ---------- 週次振り返り ---------- */

  async function refreshWeeklyReview() {
    const data = await api("/api/weekly-review");
    const pct = data.completion_rate === null ? 0 : Math.round(data.completion_rate * 100);
    reviewRatePct.textContent = `${pct}%`;
    reviewRateFraction.textContent = `${data.completed_tasks} / ${data.total_tasks} 件`;
    reviewBar.style.width = `${pct}%`;
    reviewAvgPostponed.textContent = String(data.average_postponed_count);
    reviewStreak.textContent = `${data.streak.current_count}日`;

    reviewByType.innerHTML = "";
    for (const [type, count] of Object.entries(data.completed_by_type)) {
      const meta = TASK_TYPE_META[type] || { label: type };
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = meta.label;
      const value = document.createElement("span");
      value.textContent = `${count}件`;
      li.append(label, value);
      reviewByType.appendChild(li);
    }
    reviewLongest.textContent = `最長ストリーク: ${data.streak.longest_count}日`;

    if (reviewStudyMinutes) {
      reviewStudyMinutes.textContent =
        `今週の学習時間 合計 ${formatMinutes(data.total_study_minutes)}` +
        (data.study_minutes_from_tasks > 0
          ? `（うちタスク完了時の記録 ${formatMinutes(data.study_minutes_from_tasks)}）`
          : "");
    }
  }

  /* ---------- 集中モード ---------- */

  function showFocusScreen(name) {
    focusNormal.hidden = name !== "normal";
    focusLog.hidden = name !== "log";
    focusBreak.hidden = name !== "break";
    focusEmpty.hidden = name !== "empty";
  }

  function startFocusTimer() {
    focusStartedAt = Date.now();
    updateFocusElapsed();
    if (focusElapsedTimer) clearInterval(focusElapsedTimer);
    focusElapsedTimer = setInterval(updateFocusElapsed, 1000);
  }

  function stopFocusTimer() {
    if (focusElapsedTimer) {
      clearInterval(focusElapsedTimer);
      focusElapsedTimer = null;
    }
  }

  function updateFocusElapsed() {
    if (!focusStartedAt || !focusElapsed) return;
    const sec = Math.floor((Date.now() - focusStartedAt) / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    focusElapsed.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }

  function elapsedMinutesNow() {
    if (!focusStartedAt) return 0;
    return Math.round((Date.now() - focusStartedAt) / 60000);
  }

  async function loadFocusNext() {
    const next = await api("/api/tasks/focus-queue");
    if (!next) {
      currentFocusTask = null;
      showFocusScreen("empty");
      focusEmptyCount.textContent = `${focusDoneCount}コ終わらせた。お疲れさま。`;
      return;
    }
    await api(`/api/tasks/${next.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: "in_progress" }),
    });
    currentFocusTask = next;
    showFocusScreen("normal");
    focusCountLabel.textContent = `今 ${focusDoneCount + 1} コ目`;
    const meta = TASK_TYPE_META[next.type] || { label: next.type, color: "var(--graphite-soft)" };
    focusTypeBadge.style.setProperty("--chip-color", meta.color);
    focusTypeBadge.textContent = meta.label;
    focusTitle.textContent = next.title;
    focusDays.dataset.state = taskDaysState(next.days_left);
    focusDays.textContent = taskDaysLabel(next.days_left);
    startFocusTimer();
  }

  function openFocusOverlay() {
    focusDoneCount = 0;
    focusOverlay.hidden = false;
    loadFocusNext();
  }

  function closeFocusOverlay() {
    stopFocusTimer();
    focusOverlay.hidden = true;
    currentFocusTask = null;
    refreshTasks();
    refreshWeeklyReview();
  }

  focusStartBtn.addEventListener("click", openFocusOverlay);
  focusExitBtn.addEventListener("click", closeFocusOverlay);
  focusEmptyExitBtn.addEventListener("click", closeFocusOverlay);

  function proceedAfterComplete() {
    focusDoneCount += 1;
    if (focusDoneCount % 3 === 0) {
      showFocusScreen("break");
      focusBreakMsg.textContent = `ここまでで ${focusDoneCount} コ完了！ひと息つこう`;
    } else {
      loadFocusNext();
    }
  }

  // 何分やったか・どの学習タイプで記録するかを確認する画面を開く
  // mode: 'complete'（完了して記録） / 'cancel'（中断したが途中まで記録）
  function openFocusLog(mode) {
    if (!currentFocusTask) return;
    focusLogMode = mode;
    stopFocusTimer();
    showFocusScreen("log");
    focusLogTitle.textContent = mode === "complete" ? "お疲れさま！何分やった？" : "中断した分を記録する？";
    focusLogMinutes.value = String(Math.max(1, elapsedMinutesNow()));
    focusLogSelectedTypeId = guessStudyTypeId(currentFocusTask.type);
    renderFocusLogPicker();
    focusLogSaveBtn.textContent = mode === "complete" ? "記録して完了" : "記録して中断";
    focusLogSkipBtn.textContent = mode === "complete" ? "記録せず完了" : "記録せず中断";
  }

  function renderFocusLogPicker() {
    renderStudyTypePicker(focusLogTypePicker, focusLogSelectedTypeId, (id) => {
      focusLogSelectedTypeId = id;
      renderFocusLogPicker();
    });
  }

  focusCancelBtn.addEventListener("click", () => {
    if (elapsedMinutesNow() >= 1) {
      openFocusLog("cancel");
    } else {
      closeFocusOverlay();
    }
  });

  focusCompleteBtn.addEventListener("click", () => {
    openFocusLog("complete");
  });

  async function finishFocusLog(shouldLog) {
    const task = currentFocusTask;
    if (!task) return;
    try {
      if (shouldLog) {
        const minutes = Math.max(0, Math.floor(Number(focusLogMinutes.value) || 0));
        await logStudyForTask(task, minutes, focusLogSelectedTypeId);
      }
      if (focusLogMode === "complete") {
        await api(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ status: "done" }),
        });
      }
    } catch (err) {
      alert(err.message);
    }
    if (focusLogMode === "complete") {
      proceedAfterComplete();
    } else {
      closeFocusOverlay();
    }
  }

  focusLogSaveBtn.addEventListener("click", () => finishFocusLog(true));
  focusLogSkipBtn.addEventListener("click", () => finishFocusLog(false));
  bindTimeAdjustButtons(focusLog);

  focusContinueBtn.addEventListener("click", loadFocusNext);

  /* ---------- 初期化 ---------- */

  (async function init() {
    initWeekdaySelect();
    renderTaskTypePicker();
    belongingDateInput.value = localToday();
    await fetchStudyTypes();
    await Promise.all([refreshTasks(), refreshBelongings(), refreshBlocks(), refreshWeeklyReview()]);
    checkStudyBlockBanner();
    setInterval(checkStudyBlockBanner, 30000);
  })();
})();
