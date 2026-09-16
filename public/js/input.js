(() => {
  const dateInput = document.getElementById("date-input");
  const typePicker = document.getElementById("type-picker");
  const durationInput = document.getElementById("duration-input");
  const contentInput = document.getElementById("content-input");
  const form = document.getElementById("record-form");
  const formMessage = document.getElementById("form-message");
  const todayList = document.getElementById("today-list");
  const todayEmpty = document.getElementById("today-empty");
  const typeList = document.getElementById("type-list");
  const typeForm = document.getElementById("type-form");
  const newTypeName = document.getElementById("new-type-name");
  const newTypeColor = document.getElementById("new-type-color");
  const diaryInput = document.getElementById("diary-input");
  const diarySaveBtn = document.getElementById("diary-save-btn");
  const diaryMessage = document.getElementById("diary-message");
  const testDateList = document.getElementById("test-date-list");
  const testDateEmpty = document.getElementById("test-date-empty");
  const testDateForm = document.getElementById("test-date-form");
  const testDateInput = document.getElementById("test-date-input");
  const testDateLabelInput = document.getElementById("test-date-label-input");

  let types = [];
  let selectedTypeId = null;

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

  function renderTypePicker() {
    // 選択中のタイプが削除済みなら選択を解除する
    if (selectedTypeId && !types.some((t) => t.id === selectedTypeId)) {
      selectedTypeId = null;
    }
    if (!selectedTypeId && types.length) selectedTypeId = types[0].id;

    typePicker.innerHTML = "";
    for (const t of types) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-chip-btn" + (t.id === selectedTypeId ? " is-selected" : "");
      btn.style.setProperty("--chip-color", t.color);
      btn.textContent = t.name;
      btn.addEventListener("click", () => {
        selectedTypeId = t.id;
        renderTypePicker();
      });
      typePicker.appendChild(btn);
    }
  }

  function renderTypeManageList() {
    typeList.innerHTML = "";
    for (const t of types) {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.setProperty("--dot-color", t.color);
      const name = document.createElement("span");
      name.textContent = t.name;
      name.style.flex = "1";
      const del = document.createElement("button");
      del.className = "icon-btn";
      del.type = "button";
      del.textContent = "削除";
      del.addEventListener("click", async () => {
        try {
          await api(`/api/types/${t.id}`, { method: "DELETE" });
          await loadTypes();
        } catch (err) {
          alert(err.message);
        }
      });
      li.append(dot, name, del);
      typeList.appendChild(li);
    }
  }

  async function loadTypes() {
    types = await api("/api/types");
    renderTypePicker();
    renderTypeManageList();
  }

  function formatMinutes(min) {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m ? `${h}時間${m}分` : `${h}時間`;
    }
    return `${min}分`;
  }

  async function loadTodayList() {
    const date = dateInput.value || localToday();
    const records = await api(`/api/records?date=${date}`);
    todayList.innerHTML = "";
    todayEmpty.style.display = records.length ? "none" : "block";
    for (const r of records) {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.setProperty("--dot-color", r.type_color);
      const content = document.createElement("span");
      content.className = "entry-content";
      content.textContent = `${r.type_name}${r.content ? " — " + r.content : ""}`;
      const meta = document.createElement("span");
      meta.className = "entry-meta";
      meta.textContent = formatMinutes(r.duration_minutes);
      const del = document.createElement("button");
      del.className = "icon-btn";
      del.type = "button";
      del.textContent = "削除";
      del.addEventListener("click", async () => {
        await api(`/api/records/${r.id}`, { method: "DELETE" });
        await loadTodayList();
      });
      const parts = [dot, content];
      if (r.task_id) {
        const link = document.createElement("span");
        link.className = "entry-task-link";
        link.textContent = "🔗";
        link.title = "タスク完了時に記録した学習";
        parts.push(link);
      }
      parts.push(meta, del);
      li.append(...parts);
      todayList.appendChild(li);
    }
  }

  async function loadDiary() {
    const date = dateInput.value || localToday();
    diaryMessage.textContent = "";
    diaryMessage.classList.remove("is-error");
    try {
      const entry = await api(`/api/diary?date=${date}`);
      diaryInput.value = entry.content || "";
    } catch (err) {
      diaryInput.value = "";
    }
  }

  diarySaveBtn.addEventListener("click", async () => {
    const date = dateInput.value || localToday();
    diaryMessage.textContent = "";
    diaryMessage.classList.remove("is-error");
    try {
      await api("/api/diary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, content: diaryInput.value }),
      });
      diaryMessage.textContent = "日記を保存しました";
    } catch (err) {
      diaryMessage.textContent = err.message;
      diaryMessage.classList.add("is-error");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMessage.textContent = "";
    formMessage.classList.remove("is-error");
    if (!selectedTypeId) {
      formMessage.textContent = "学習タイプを選んでください";
      formMessage.classList.add("is-error");
      return;
    }
    try {
      await api("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateInput.value,
          type_id: selectedTypeId,
          duration_minutes: Number(durationInput.value) || 0,
          content: contentInput.value.trim(),
        }),
      });
      formMessage.textContent = "記録しました";
      durationInput.value = "";
      contentInput.value = "";
      await loadTodayList();
    } catch (err) {
      formMessage.textContent = err.message;
      formMessage.classList.add("is-error");
    }
  });

  function formatDateJp(iso) {
    const [, m, d] = iso.split("-");
    return `${Number(m)}/${Number(d)}`;
  }

  async function loadTestDates() {
    const list = await api("/api/test-dates");
    testDateList.innerHTML = "";
    testDateEmpty.style.display = list.length ? "none" : "block";
    for (const t of list) {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "test-date-name";
      label.textContent = `${formatDateJp(t.date)}${t.label ? "　" + t.label : ""}`;
      const del = document.createElement("button");
      del.className = "icon-btn";
      del.type = "button";
      del.textContent = "削除";
      del.addEventListener("click", async () => {
        try {
          await api(`/api/test-dates/${t.id}`, { method: "DELETE" });
          await loadTestDates();
        } catch (err) {
          alert(err.message);
        }
      });
      li.append(label, del);
      testDateList.appendChild(li);
    }
  }

  testDateForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/test-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: testDateInput.value,
          label: testDateLabelInput.value.trim(),
        }),
      });
      testDateInput.value = "";
      testDateLabelInput.value = "";
      await loadTestDates();
    } catch (err) {
      alert(err.message);
    }
  });

  typeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTypeName.value.trim(), color: newTypeColor.value }),
      });
      newTypeName.value = "";
      await loadTypes();
    } catch (err) {
      alert(err.message);
    }
  });

  dateInput.addEventListener("change", () => {
    loadTodayList();
    loadDiary();
  });

  (async function init() {
    dateInput.value = localToday();
    await loadTypes();
    await loadTodayList();
    await loadDiary();
    await loadTestDates();
  })();
})();
