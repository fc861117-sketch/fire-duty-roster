const fs = require("fs");
const vm = require("vm");

const code = fs.readFileSync("app.js", "utf8").replace(/restore\(\);\s*$/, "");
const elementIds = [
  "activeStaff", "prevNightStaff", "bosses", "females", "rookies", "draftees", "leaveStaff",
  "activeStaffPicker", "rosterTable", "summary", "issues", "statsTable", "saveState",
  "extraDutyList", "dutyUnit", "dutyDate", "sampleBtn", "clearBtn", "generateBtn",
  "validateBtn", "validateTopBtn", "addDutyBtn", "exportCsvBtn", "exportJsonBtn",
  "loadSheetBtn", "analyzeNightBtn", "dateColumn", "monthFilter", "personColumn",
  "dutyColumn", "selectAllStaffBtn", "invertStaffBtn", "clearStaffBtn", "importJsonInput"
];

function makeContext(inputs) {
  const elements = new Map();
  const el = (id, value) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        value: "",
        innerHTML: "",
        textContent: "",
        style: {},
        files: [],
        addEventListener() {},
        appendChild() {},
        remove() {},
        querySelector() { return el(`${id}:child`); },
        querySelectorAll() { return []; }
      });
    }
    if (value !== undefined) elements.get(id).value = value;
    return elements.get(id);
  };

  elementIds.forEach((id) => el(id));
  Object.entries(inputs).forEach(([id, value]) => el(id, value));

  const context = {
    console,
    capturedIssues: [],
    alert(message) { throw new Error(message); },
    confirm: () => true,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      getElementById: (id) => el(id),
      querySelectorAll: () => [],
      querySelector: () => null,
      createElement: () => el("created")
    },
    window: {},
    Blob: function Blob() {},
    URL: { createObjectURL: () => "", revokeObjectURL() {} },
    Date, Set, Map, JSON, Math, String, Number, Array, RegExp
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  vm.runInContext(`
    renderIssues = (issues) => { capturedIssues = issues; };
    renderStats = () => {};
    persist = () => {};
  `, context);
  return context;
}

function runScenario(name, inputs) {
  const context = makeContext({
    prevNightStaff: "",
    bosses: "01,02,03",
    females: "06,09,17",
    rookies: "09,13,15",
    draftees: "19,20",
    ...inputs
  });

  vm.runInContext("generateRoster();", context);
  return vm.runInContext(`(() => {
    const parse = parseIds;
    const config = getConfig();
    const errors = capturedIssues.filter((issue) => issue.level === "error").map((issue) => issue.text);
    const awayBad = config.leaveStaff.flatMap((id) => {
      return hourRange("20-21", "08-09").flatMap((row) => {
        return COLUMNS.filter((col) => parse(roster[row][col.id]).includes(id))
          .map((col) => HOURS[row] + ":" + id + ":" + col.id);
      });
    });
    const amb1Bad = roster
      .map((row, index) => parse(row.amb1).length === 2 ? null : HOURS[index] + ":" + parse(row.amb1).length)
      .filter(Boolean);
    const deskBad = roster
      .map((row, index) => parse(row.desk).length ? null : HOURS[index])
      .filter(Boolean);
    const activeDraftees = config.active.filter((id) => config.draftees.includes(id));
    const drafteeHours = Object.fromEntries(activeDraftees.map((id) => {
      return [id, roster.filter((row) => parse(row.desk).includes(id)).length];
    }));
    const drafteeOverLimit = activeDraftees.filter((id) => drafteeHours[id] > (activeDraftees.length >= 2 ? 8 : 10));
    return { name: ${JSON.stringify(name)}, errors, awayBad, amb1Bad, deskBad, leaveStaff: config.leaveStaff, drafteeHours, drafteeOverLimit };
  })()`, context);
}

const scenarios = [
  runScenario("six non-draftees", {
    activeStaff: "01,04,05,06,07,08,19,20",
    leaveStaff: "01"
  }),
  runScenario("seven-plus with two supervisors", {
    activeStaff: "01,02,04,05,06,07,08,09,10,12,13,15,17,18,19,20",
    leaveStaff: "02"
  })
];

const missingSupervisorLeave = runScenario("two supervisors without leave entry", {
  activeStaff: "01,02,04,05,06,07,08,09,10,12,13,15,17,18,19,20",
  leaveStaff: ""
});

const failed = scenarios.filter((item) => {
  return item.errors.length || item.awayBad.length || item.amb1Bad.length || item.deskBad.length || item.drafteeOverLimit.length;
});

const expectedSupervisorLeaveError = missingSupervisorLeave.errors.some((text) => text.includes("需有 1 位主管外宿"));
const supervisorLeaveWasNotAutoFilled = missingSupervisorLeave.leaveStaff.length === 0;

console.log(JSON.stringify({ scenarios, missingSupervisorLeave }, null, 2));
if (failed.length || !expectedSupervisorLeaveError || !supervisorLeaveWasNotAutoFilled) {
  process.exitCode = 1;
}
