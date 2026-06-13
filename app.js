const HOURS = [
  "08-09", "09-10", "10-11", "11-12", "12-13", "13-14", "14-15", "15-16",
  "16-17", "17-18", "18-19", "19-20", "20-21", "21-22", "22-23", "23-00",
  "00-01", "01-02", "02-03", "03-04", "04-05", "05-06", "06-07", "07-08"
];

const COLUMNS = [
  { id: "desk", label: "值班", kind: "desk" },
  { id: "amb1", label: "救護1車", kind: "amb" },
  { id: "amb2", label: "救護2車", kind: "amb" },
  { id: "inspection", label: "消防查察", kind: "other" },
  { id: "meeting", label: "會勘/開會", kind: "other" },
  { id: "publicity", label: "防災宣導", kind: "other" },
  { id: "hydrant", label: "水源查察", kind: "other" },
  { id: "rookieTraining", label: "新人訓練", kind: "training" },
  { id: "training", label: "訓練", kind: "training" },
  { id: "other", label: "其他", kind: "other" },
  { id: "standby", label: "備勤", kind: "standby" },
  { id: "rest", label: "休息", kind: "rest" },
  { id: "watch", label: "值宿", kind: "desk" }
];

const $ = (id) => document.getElementById(id);
let roster = makeBlankRoster();
let sheetRows = [];
let sheetHeaders = [];

function normalizeId(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.padStart(2, "0");
}

function parseIds(value) {
  return [...new Set(String(value || "")
    .split(/[,\s，、]+/)
    .map(normalizeId)
    .filter(Boolean))];
}

function idsToText(ids) {
  return ids.filter(Boolean).join(",");
}

function makeBlankRoster() {
  return HOURS.map(() => Object.fromEntries(COLUMNS.map((col) => [col.id, ""])));
}

function getConfig() {
  return {
    active: parseIds($("activeStaff").value),
    prevNight: parseIds($("prevNightStaff").value),
    bosses: parseIds($("bosses").value),
    females: parseIds($("females").value),
    rookies: parseIds($("rookies").value),
    draftees: parseIds($("draftees").value),
    leaveStaff: parseIds($("leaveStaff").value),
    watchStaff: parseIds($("watchStaff").value)
  };
}

function hourRange(start, end) {
  const startIndex = HOURS.indexOf(start);
  const endIndex = HOURS.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) return [];
  return Array.from({ length: endIndex - startIndex }, (_, index) => startIndex + index);
}

function addIds(rowIndex, column, ids) {
  const current = parseIds(roster[rowIndex][column]);
  roster[rowIndex][column] = idsToText([...new Set([...current, ...ids])]);
}

function removeIds(rowIndex, ids) {
  for (const col of COLUMNS) {
    const kept = parseIds(roster[rowIndex][col.id]).filter((id) => !ids.includes(id));
    roster[rowIndex][col.id] = idsToText(kept);
  }
}

function place(rowIndexes, column, ids, exclusive = true) {
  rowIndexes.forEach((rowIndex) => {
    if (exclusive) removeIds(rowIndex, ids);
    addIds(rowIndex, column, ids);
  });
}

function pickPairs(candidates, females, bosses) {
  const available = candidates.filter((id) => !bosses.includes(id));
  const femalePool = available.filter((id) => females.includes(id));
  const malePool = available.filter((id) => !females.includes(id));
  const first = [malePool[0], femalePool[0]].filter(Boolean);
  const second = [malePool[1], femalePool[1]].filter(Boolean);
  if (first.length < 2 && available.length >= 2) first.push(...available.filter((id) => !first.includes(id)).slice(0, 2 - first.length));
  if (second.length < 2) second.push(...available.filter((id) => !first.includes(id) && !second.includes(id)).slice(0, 2 - second.length));
  return { first, second };
}

function generateRoster() {
  const config = getConfig();
  roster = makeBlankRoster();
  const active = config.active;
  if (!active.length) {
    alert("請先輸入今日上班人員。");
    return;
  }

  place(hourRange("16-17", "18-19"), "training", active, true);

  const nightPool = active.filter((id) => !config.bosses.includes(id) && !config.draftees.includes(id));
  const pairs = pickPairs(nightPool, config.females, config.bosses);
  const nightRows = hourRange("00-01", "08-09");
  place(nightRows, "amb1", pairs.first, true);
  place(nightRows, "amb2", pairs.second, true);

  const watch = config.watchStaff[0] || nightPool.find((id) => ![...pairs.first, ...pairs.second].includes(id)) || nightPool[0];
  if (watch) place([...hourRange("22-23", "23-00"), ...hourRange("23-00", "00-01"), ...hourRange("00-01", "06-07")], "watch", [watch], true);

  place(hourRange("20-21", "00-01"), "amb1", pairs.second, true);
  place(hourRange("22-23", "00-01"), "standby", pairs.first, true);

  config.prevNight.forEach((id) => {
    if (active.includes(id) && !config.draftees.includes(id)) place(hourRange("08-09", "10-11"), "rest", [id], true);
  });

  config.rookies.forEach((id) => {
    if (active.includes(id)) place(hourRange("10-11", "12-13"), "rookieTraining", [id], true);
  });

  config.draftees.forEach((id) => {
    if (active.includes(id)) place([...hourRange("08-09", "12-13"), ...hourRange("13-14", "16-17"), ...hourRange("18-19", "21-22")], "desk", [id], true);
  });

  readExtraDuties().forEach((duty) => {
    const ids = duty.staff.filter((id) => active.includes(id));
    if (ids.length) place(hourRange(duty.start, duty.end), duty.type, ids, true);
  });

  active.forEach((id) => {
    if (config.draftees.includes(id)) return;
    const hasRest = roster.some((row) => parseIds(row.rest).includes(id));
    if (!hasRest) {
      const target = config.leaveStaff.includes(id) ? "14-15" : "12-13";
      place(hourRange(target, HOURS[HOURS.indexOf(target) + 2]), "rest", [id], true);
    }
  });

  fillStandby(active);
  renderRoster();
  validateRoster();
  persist();
}

function fillStandby(active) {
  roster.forEach((row, rowIndex) => {
    const busy = new Set();
    COLUMNS.filter((col) => col.id !== "standby").forEach((col) => {
      parseIds(row[col.id]).forEach((id) => busy.add(id));
    });
    const standby = active.filter((id) => !busy.has(id));
    roster[rowIndex].standby = idsToText(standby);
  });
}

function readRosterFromTable() {
  document.querySelectorAll(".cell-input").forEach((input) => {
    const row = Number(input.dataset.row);
    const col = input.dataset.col;
    roster[row][col] = idsToText(parseIds(input.value));
  });
}

function renderRoster() {
  const thead = $("rosterTable").querySelector("thead");
  const tbody = $("rosterTable").querySelector("tbody");
  thead.innerHTML = `<tr><th>時段</th>${COLUMNS.map((col) => `<th>${col.label}</th>`).join("")}</tr>`;
  tbody.innerHTML = HOURS.map((hour, rowIndex) => {
    const nightClass = rowIndex >= 14 || rowIndex <= 0 ? "row-night" : "";
    const trainClass = rowIndex >= 8 && rowIndex <= 9 ? "row-training" : "";
    return `<tr class="${nightClass} ${trainClass}">
      <td>${hour}</td>
      ${COLUMNS.map((col) => {
        const className = ["cell-input", `cell-${col.kind}`].join(" ");
        return `<td><input class="${className}" data-row="${rowIndex}" data-col="${col.id}" value="${roster[rowIndex][col.id] || ""}" aria-label="${hour} ${col.label}"></td>`;
      }).join("")}
    </tr>`;
  }).join("");

  document.querySelectorAll(".cell-input").forEach((input) => {
    input.addEventListener("input", () => {
      readRosterFromTable();
      fillStandby(getConfig().active);
      refreshStandbyCells();
      validateRoster();
      persist();
    });
  });
}

function refreshStandbyCells() {
  document.querySelectorAll('[data-col="standby"]').forEach((input) => {
    input.value = roster[Number(input.dataset.row)].standby || "";
  });
}

function validateRoster() {
  readRosterFromTable();
  const config = getConfig();
  const issues = [];
  const stats = buildStats(config.active);
  document.querySelectorAll(".cell-input").forEach((input) => input.classList.remove("cell-invalid"));

  config.active.forEach((id) => {
    const restHours = stats[id]?.rest || 0;
    if (!config.draftees.includes(id) && restHours !== 2) {
      issues.push({ level: "error", text: `${id} 休息時數為 ${restHours} 小時，規範需剛好 2 小時。` });
    }
    if (config.draftees.includes(id)) {
      const deskHours = stats[id]?.desk || 0;
      if (deskHours !== 10) issues.push({ level: "warn", text: `${id} 役男值班為 ${deskHours} 小時，規範需 10 小時。` });
      if (maxConsecutive(id, "desk") > 4) issues.push({ level: "error", text: `${id} 役男連續值班超過 4 小時。` });
    }
  });

  hourRange("16-17", "18-19").forEach((row) => {
    if (parseIds(roster[row].rest).length) issues.push({ level: "error", text: `${HOURS[row]} 全隊訓練時段不得排休息。`, row, col: "rest" });
  });

  hourRange("22-23", "08-09").forEach((row) => {
    if (parseIds(roster[row]?.rest).length) issues.push({ level: "error", text: `${HOURS[row]} 深夜核心勤務不得排休息。`, row, col: "rest" });
  });

  config.prevNight.forEach((id) => {
    if (config.active.includes(id) && !parseIds(roster[0].rest).includes(id) && !parseIds(roster[1].rest).includes(id)) {
      issues.push({ level: "error", text: `${id} 前日深夜勤，今日 08-10 應優先休息。` });
    }
  });

  config.leaveStaff.forEach((id) => {
    if (!config.active.includes(id)) return;
    const lateRest = HOURS.slice(12).some((_, offset) => parseIds(roster[offset + 12].rest).includes(id));
    if (lateRest) issues.push({ level: "error", text: `${id} 外宿人員休息需在 20:00 前完成。` });
  });

  COLUMNS.filter((col) => col.kind === "amb").forEach((col) => {
    roster.forEach((row, rowIndex) => {
      const ids = parseIds(row[col.id]);
      if (ids.length >= 2) {
        const femaleCount = ids.filter((id) => config.females.includes(id)).length;
        if (femaleCount > 1) issues.push({ level: "error", text: `${HOURS[rowIndex]} ${col.label} 出現女性互搭。`, row: rowIndex, col: col.id });
        if (femaleCount === 0) issues.push({ level: "warn", text: `${HOURS[rowIndex]} ${col.label} 未符合一男一女建議。`, row: rowIndex, col: col.id });
      }
    });
  });

  const nightCols = ["desk", "amb1", "amb2", "watch"];
  hourRange("22-23", "08-09").forEach((row) => {
    nightCols.forEach((col) => {
      const boss = parseIds(roster[row]?.[col]).find((id) => config.bosses.includes(id));
      if (boss) issues.push({ level: "error", text: `${boss} 主管不得編排深夜勤務。`, row, col });
    });
  });

  const nightAmb1 = uniqueIds(hourRange("00-01", "08-09").flatMap((row) => parseIds(roster[row].amb1)));
  const dayWorkRows = hourRange("08-09", "22-23");
  nightAmb1.forEach((id) => {
    const dayWork = dayWorkRows.reduce((total, row) => {
      return total + COLUMNS.filter((col) => !["rest", "standby"].includes(col.id)).some((col) => parseIds(roster[row][col.id]).includes(id));
    }, 0);
    if (dayWork < 2) issues.push({ level: "warn", text: `${id} 深夜一車人員日間實際勤務未達 2 小時。` });
  });

  const nightAmb2 = uniqueIds(hourRange("00-01", "08-09").flatMap((row) => parseIds(roster[row].amb2)));
  hourRange("20-21", "00-01").forEach((row) => {
    const amb1 = parseIds(roster[row].amb1);
    if (nightAmb2.length && !nightAmb2.every((id) => amb1.includes(id))) {
      issues.push({ level: "error", text: `${HOURS[row]} 救護1車應由深夜二車人員預熱。`, row, col: "amb1" });
    }
  });

  hourRange("22-23", "00-01").forEach((row) => {
    const amb1 = parseIds(roster[row].amb1);
    if (amb1.some((id) => nightAmb1.includes(id))) {
      issues.push({ level: "error", text: `${HOURS[row]} 深夜一車人員不得再排救護1車。`, row, col: "amb1" });
    }
  });

  config.rookies.forEach((id) => {
    if (config.active.includes(id) && (stats[id]?.rookieTraining || 0) < 2) {
      issues.push({ level: "warn", text: `${id} 新人訓練未達 2 小時。` });
    }
  });

  issues.forEach((issue) => {
    if (issue.row !== undefined && issue.col) {
      const input = document.querySelector(`[data-row="${issue.row}"][data-col="${issue.col}"]`);
      if (input) input.classList.add("cell-invalid");
    }
  });

  renderIssues(issues);
  renderStats(stats, config);
  persist();
}

function hourRangeByIndex(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function uniqueIds(ids) {
  return [...new Set(ids.filter(Boolean))];
}

function hourRange(start, end) {
  const startIndex = HOURS.indexOf(start);
  const endIndex = end === "08-09" && startIndex > 0 ? HOURS.length : HOURS.indexOf(end);
  if (startIndex < 0 || endIndex < 0) return [];
  if (endIndex > startIndex) return hourRangeByIndex(startIndex, endIndex - 1);
  return [...hourRangeByIndex(startIndex, HOURS.length - 1), ...hourRangeByIndex(0, endIndex - 1)];
}

function buildStats(active) {
  const stats = Object.fromEntries(active.map((id) => [id, { desk: 0, rest: 0, amb: 0, training: 0, other: 0, rookieTraining: 0 }]));
  roster.forEach((row) => {
    COLUMNS.forEach((col) => {
      parseIds(row[col.id]).forEach((id) => {
        if (!stats[id]) stats[id] = { desk: 0, rest: 0, amb: 0, training: 0, other: 0, rookieTraining: 0 };
        if (col.id === "rest") stats[id].rest += 1;
        else if (col.id === "desk" || col.id === "watch") stats[id].desk += 1;
        else if (col.kind === "amb") stats[id].amb += 1;
        else if (col.kind === "training") stats[id].training += 1;
        else if (col.kind === "other") stats[id].other += 1;
        if (col.id === "rookieTraining") stats[id].rookieTraining += 1;
      });
    });
  });
  return stats;
}

function maxConsecutive(id, column) {
  let max = 0;
  let current = 0;
  roster.forEach((row) => {
    if (parseIds(row[column]).includes(id)) {
      current += 1;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  });
  return max;
}

function renderIssues(issues) {
  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const warnCount = issues.filter((issue) => issue.level === "warn").length;
  $("summary").innerHTML = `
    <div class="summary-card"><span>重大違規</span><strong>${errorCount}</strong></div>
    <div class="summary-card"><span>提醒</span><strong>${warnCount}</strong></div>
    <div class="summary-card"><span>狀態</span><strong>${errorCount ? "需修正" : "可用"}</strong></div>
  `;
  $("issues").innerHTML = issues.length
    ? issues.map((issue) => `<li class="issue-${issue.level}">${issue.text}</li>`).join("")
    : `<li class="issue-ok">目前勤務表符合主要規範。</li>`;
}

function renderStats(stats, config) {
  $("statsTable").innerHTML = Object.entries(stats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, item]) => {
      const role = [
        config.bosses.includes(id) ? "主管" : "",
        config.females.includes(id) ? "女性" : "",
        config.rookies.includes(id) ? "新人" : "",
        config.draftees.includes(id) ? "役男" : ""
      ].filter(Boolean).join(" / ") || "隊員";
      return `<div class="stat-row">
        <strong>${id}</strong>
        <span>${role}</span>
        <span>休 ${item.rest}</span>
        <span>值 ${item.desk}</span>
        <span>救 ${item.amb}</span>
      </div>`;
    }).join("");
}

function addExtraDuty(data = {}) {
  const template = $("extraDutyTemplate").content.cloneNode(true);
  const node = template.querySelector(".extra-duty");
  const type = node.querySelector(".extra-type");
  const start = node.querySelector(".extra-start");
  const end = node.querySelector(".extra-end");
  type.innerHTML = COLUMNS.filter((col) => ["inspection", "meeting", "publicity", "hydrant", "rookieTraining", "other"].includes(col.id))
    .map((col) => `<option value="${col.id}">${col.label}</option>`).join("");
  start.innerHTML = HOURS.map((hour) => `<option value="${hour}">${hour}</option>`).join("");
  end.innerHTML = HOURS.map((hour) => `<option value="${hour}">${hour}</option>`).join("");
  type.value = data.type || "inspection";
  start.value = data.start || "10-11";
  end.value = data.end || "12-13";
  node.querySelector(".extra-staff").value = data.staff || "";
  node.querySelector(".remove-duty").addEventListener("click", () => {
    node.remove();
    persist();
  });
  node.querySelectorAll("input,select").forEach((field) => field.addEventListener("input", persist));
  $("extraDutyList").appendChild(node);
}

function readExtraDuties() {
  return [...document.querySelectorAll(".extra-duty")].map((node) => ({
    type: node.querySelector(".extra-type").value,
    start: node.querySelector(".extra-start").value,
    end: node.querySelector(".extra-end").value,
    staff: parseIds(node.querySelector(".extra-staff").value)
  }));
}

function exportCsv() {
  readRosterFromTable();
  const header = ["時段", ...COLUMNS.map((col) => col.label)];
  const lines = [header, ...roster.map((row, index) => [HOURS[index], ...COLUMNS.map((col) => row[col.id])])]
    .map((line) => line.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","));
  download(`fire-duty-roster-${dateStamp()}.csv`, "\ufeff" + lines.join("\n"), "text/csv;charset=utf-8");
}

function exportJson() {
  readRosterFromTable();
  const data = {
    version: 1,
    savedAt: new Date().toISOString(),
    inputs: collectInputs(),
    extraDuties: readExtraDuties(),
    roster
  };
  download(`fire-duty-roster-${dateStamp()}.json`, JSON.stringify(data, null, 2), "application/json");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function collectInputs() {
  return {
    activeStaff: $("activeStaff").value,
    prevNightStaff: $("prevNightStaff").value,
    bosses: $("bosses").value,
    females: $("females").value,
    rookies: $("rookies").value,
    draftees: $("draftees").value,
    leaveStaff: $("leaveStaff").value,
    watchStaff: $("watchStaff").value
  };
}

function applyInputs(inputs = {}) {
  Object.entries(inputs).forEach(([key, value]) => {
    if ($(key)) $(key).value = value || "";
  });
}

function persist() {
  const data = { inputs: collectInputs(), extraDuties: readExtraDuties(), roster };
  localStorage.setItem("fire-duty-roster", JSON.stringify(data));
  $("saveState").textContent = `已暫存 ${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`;
}

function restore() {
  const raw = localStorage.getItem("fire-duty-roster");
  if (!raw) {
    addExtraDuty();
    renderRoster();
    validateRoster();
    return;
  }
  try {
    const data = JSON.parse(raw);
    applyInputs(data.inputs);
    roster = data.roster || makeBlankRoster();
    $("extraDutyList").innerHTML = "";
    (data.extraDuties || [{}]).forEach(addExtraDuty);
    renderRoster();
    validateRoster();
  } catch {
    addExtraDuty();
    renderRoster();
  }
}

function loadSample() {
  applyInputs({
    activeStaff: "01,02,04,05,06,07,08,09,10,12,13,15,17,18,19,20",
    prevNightStaff: "05,08,10,12,17",
    bosses: "01,02,03",
    females: "06,09,17",
    rookies: "09,13,15",
    draftees: "18,19,20",
    leaveStaff: "07,12",
    watchStaff: ""
  });
  $("extraDutyList").innerHTML = "";
  addExtraDuty({ type: "inspection", start: "10-11", end: "12-13", staff: "07,12" });
  addExtraDuty({ type: "publicity", start: "14-15", end: "16-17", staff: "13,15" });
  generateRoster();
}

function clearAll() {
  if (!confirm("確定清空目前資料？")) return;
  localStorage.removeItem("fire-duty-roster");
  roster = makeBlankRoster();
  $("extraDutyList").innerHTML = "";
  applyInputs({ activeStaff: "", prevNightStaff: "", bosses: "01,02,03", females: "06,09,17", rookies: "09,13,15", draftees: "18,19,20", leaveStaff: "", watchStaff: "" });
  addExtraDuty();
  renderRoster();
  validateRoster();
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const data = JSON.parse(reader.result);
    applyInputs(data.inputs);
    roster = data.roster || makeBlankRoster();
    $("extraDutyList").innerHTML = "";
    (data.extraDuties || [{}]).forEach(addExtraDuty);
    renderRoster();
    validateRoster();
    persist();
  };
  reader.readAsText(file);
}

function extractSheetInfo(value) {
  const url = String(value || "").trim();
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[?&#]gid=([0-9]+)/);
  return {
    url,
    id: idMatch?.[1] || "",
    gid: $("sheetGid").value.trim() || gidMatch?.[1] || "0"
  };
}

function loadSheet() {
  const info = extractSheetInfo($("sheetUrl").value);
  if (!info.url) {
    setSheetStatus("請先貼上 Google 試算表連結。", true);
    return;
  }
  setSheetStatus("讀取中，只讀模式，不會修改試算表。");
  if (info.id) {
    loadGoogleSheetViaJsonp(info.id, info.gid)
      .then((rows) => handleLoadedSheet(rows))
      .catch((error) => setSheetStatus(`讀取失敗：${error.message}`, true));
    return;
  }
  fetch(info.url)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    })
    .then((csv) => handleLoadedSheet(csvToRows(csv)))
    .catch((error) => setSheetStatus(`讀取失敗：${error.message}`, true));
}

function loadGoogleSheetViaJsonp(spreadsheetId, gid) {
  return new Promise((resolve, reject) => {
    const callbackName = `sheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };
    window[callbackName] = (payload) => {
      cleanup();
      if (payload?.status === "error") {
        reject(new Error(payload.errors?.[0]?.detailed_message || "Google Sheets 回傳錯誤"));
        return;
      }
      resolve(gvizToRows(payload.table));
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("無法載入試算表，請確認分享權限或使用已發布的 CSV 連結。"));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?gid=${encodeURIComponent(gid)}&headers=1&tqx=responseHandler:${callbackName}`;
    document.body.appendChild(script);
  });
}

function gvizToRows(table) {
  const headers = (table?.cols || []).map((col, index) => String(col.label || col.id || `欄${index + 1}`).trim());
  const body = (table?.rows || []).map((row) => (row.c || []).map((cell) => formatSheetCell(cell?.v ?? "")));
  return [headers, ...body].filter((row) => row.some((cell) => String(cell).trim()));
}

function formatSheetCell(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").trim();
}

function csvToRows(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function handleLoadedSheet(rows) {
  if (!rows.length) {
    setSheetStatus("讀不到資料，請確認工作表不是空白。", true);
    return;
  }
  sheetHeaders = rows[0].map((header, index) => header || `欄${index + 1}`);
  sheetRows = rows.slice(1).map((row) => Object.fromEntries(sheetHeaders.map((header, index) => [header, row[index] || ""])));
  populateSheetControls();
  setSheetStatus(`已讀取 ${sheetRows.length} 筆資料。請確認欄位後產生統計。`);
}

function populateSheetControls() {
  const options = sheetHeaders.map((header) => `<option value="${escapeAttr(header)}">${escapeHtml(header)}</option>`).join("");
  const none = `<option value="">自動判斷</option>`;
  $("dateColumn").innerHTML = none + options;
  $("personColumn").innerHTML = none + options;
  $("dutyColumn").innerHTML = none + options;
  setPreferredSelect("dateColumn", /日期|date|日/i);
  setPreferredSelect("personColumn", /員編|人員|姓名|隊員|編號|name|staff/i);
  setPreferredSelect("dutyColumn", /勤務|班別|類型|時段|duty|shift/i);
  populateMonthFilter();
}

function setPreferredSelect(id, pattern) {
  const match = sheetHeaders.find((header) => pattern.test(header));
  if (match) $(id).value = match;
}

function populateMonthFilter() {
  const dateHeader = $("dateColumn").value || findHeader(/日期|date|日/i);
  const months = uniqueIds(sheetRows.map((row) => monthKey(row[dateHeader])).filter(Boolean)).sort();
  $("monthFilter").innerHTML = months.length
    ? months.map((month) => `<option value="${month}">${month}</option>`).join("")
    : `<option value="">全部資料</option>`;
}

function analyzeNightStats() {
  if (!sheetRows.length) {
    setSheetStatus("請先讀取試算表。", true);
    return;
  }
  const config = getConfig();
  const dateHeader = $("dateColumn").value || findHeader(/日期|date|日/i);
  const personHeader = $("personColumn").value || findHeader(/員編|人員|姓名|隊員|編號|name|staff/i);
  const dutyHeader = $("dutyColumn").value || findHeader(/勤務|班別|類型|時段|duty|shift/i);
  const month = $("monthFilter").value;
  const keywords = String($("nightKeywords").value || "").split(/[,\s，、]+/).filter(Boolean);
  const counts = new Map();
  const activeStaff = config.active.length ? config.active : collectPeopleFromSheet(personHeader);
  activeStaff.forEach((id) => counts.set(id, 0));

  sheetRows.forEach((row) => {
    const rowMonth = monthKey(row[dateHeader]);
    if (month && rowMonth && rowMonth !== month) return;
    const ids = extractNightDutyPeople(row, { personHeader, dutyHeader, keywords });
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  });

  const records = [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
  renderNightStats(records, month || "全部資料");
}

function extractNightDutyPeople(row, { personHeader, dutyHeader, keywords }) {
  const isNightText = (text) => keywords.some((keyword) => String(text || "").includes(keyword));
  if (personHeader && dutyHeader && isNightText(row[dutyHeader])) {
    return parseIds(row[personHeader]);
  }
  const ids = [];
  sheetHeaders.forEach((header) => {
    const value = row[header];
    if (isNightText(header) || isNightText(value)) {
      ids.push(...parseIds(value));
      if (personHeader && isNightText(value)) ids.push(...parseIds(row[personHeader]));
    }
  });
  return uniqueIds(ids);
}

function collectPeopleFromSheet(personHeader) {
  if (!personHeader) return [];
  return uniqueIds(sheetRows.flatMap((row) => parseIds(row[personHeader]))).sort();
}

function findHeader(pattern) {
  return sheetHeaders.find((header) => pattern.test(header)) || "";
}

function monthKey(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  const text = String(value).trim();
  const constructorMatch = text.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)/);
  if (constructorMatch) {
    return `${constructorMatch[1]}-${String(Number(constructorMatch[2]) + 1).padStart(2, "0")}`;
  }
  const western = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (western) return `${western[1]}-${western[2].padStart(2, "0")}`;
  const minguo = text.match(/(\d{2,3})[/-](\d{1,2})[/-](\d{1,2})/);
  if (minguo) return `${Number(minguo[1]) + 1911}-${minguo[2].padStart(2, "0")}`;
  return "";
}

function renderNightStats(records, monthLabel) {
  const total = records.reduce((sum, item) => sum + item.count, 0);
  const average = records.length ? total / records.length : 0;
  const max = records.length ? Math.max(...records.map((item) => item.count)) : 0;
  const min = records.length ? Math.min(...records.map((item) => item.count)) : 0;
  const priority = records.filter((item) => item.count === min).map((item) => item.id);
  $("nightSummary").innerHTML = `
    <div class="summary-card"><span>${escapeHtml(monthLabel)} 平均</span><strong>${average.toFixed(1)}</strong></div>
    <div class="summary-card"><span>最高 / 最低</span><strong>${max} / ${min}</strong></div>
    <div class="summary-card"><span>差距</span><strong>${max - min}</strong></div>
  `;
  $("priorityList").innerHTML = `<div class="priority-card"><span>下次優先建議</span><strong>${priority.length ? priority.join(", ") : "無資料"}</strong></div>`;
  $("nightStatsTable").innerHTML = records
    .slice()
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .map((item) => {
      const diff = item.count - average;
      const label = diff > 0.5 ? "偏多" : diff < -0.5 ? "偏少" : "接近平均";
      const className = diff > 0.5 ? "is-high" : diff < -0.5 ? "is-low" : "";
      return `<div class="night-row ${className}">
        <strong>${escapeHtml(item.id)}</strong>
        <span>${label}</span>
        <span>${item.count} 次</span>
        <span>${diff >= 0 ? "+" : ""}${diff.toFixed(1)}</span>
      </div>`;
    }).join("");
}

function setSheetStatus(message, isError = false) {
  $("sheetStatus").textContent = message;
  $("sheetStatus").style.color = isError ? "var(--red)" : "var(--muted)";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

$("generateBtn").addEventListener("click", generateRoster);
$("validateBtn").addEventListener("click", validateRoster);
$("addDutyBtn").addEventListener("click", () => addExtraDuty());
$("exportCsvBtn").addEventListener("click", exportCsv);
$("exportJsonBtn").addEventListener("click", exportJson);
$("sampleBtn").addEventListener("click", loadSample);
$("clearBtn").addEventListener("click", clearAll);
$("loadSheetBtn").addEventListener("click", loadSheet);
$("analyzeNightBtn").addEventListener("click", analyzeNightStats);
$("dateColumn").addEventListener("change", populateMonthFilter);
$("importJsonInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importJson(file);
});

["activeStaff", "prevNightStaff", "bosses", "females", "rookies", "draftees", "leaveStaff", "watchStaff"].forEach((id) => {
  $(id).addEventListener("input", persist);
});

restore();
