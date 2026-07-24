const API_SECRET = "__API_SECRET__";
const STATE_SHEET = "_state";
const STATE_CHUNK_SIZE = 40000;

const ENTITY_SCHEMAS = {
  athletes: ["id", "bib", "name", "kana", "grade", "sex", "teamId", "affiliation", "region", "abilityBand", "personalBests"],
  events: ["id", "name", "category", "kind", "discipline", "direction", "unit", "startTime", "round", "scoringSlots", "status"],
  entries: ["id", "eventId", "heatId", "athleteId", "laneOrOrder", "scoringEligible"],
  results: ["id", "entryId", "value", "displayValue", "status", "provisional", "isPersonalBest"],
  auditLogs: ["id", "at", "actor", "action", "entity", "before", "after", "reason"],
};

function setupDatabase() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: spreadsheet.getId(),
    API_SECRET,
  });
  Object.keys(ENTITY_SCHEMAS).forEach((name) => getOrCreateSheet_(spreadsheet, name));
  const stateSheet = getOrCreateSheet_(spreadsheet, STATE_SHEET);
  stateSheet.hideSheet();
}

function doGet(event) {
  try {
    authorize_(event && event.parameter && event.parameter.secret);
    const state = readState_();
    return json_({
      ok: true,
      state,
      updatedAt: state && state.updatedAt ? state.updatedAt : null,
      source: "google-sheets",
    });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    authorize_(payload.secret);
    if (!payload.state || typeof payload.state !== "object") {
      throw new Error("state is required");
    }
    saveState_(payload.state);
    syncEntitySheets_(payload.state);
    return json_({
      ok: true,
      saved: true,
      updatedAt: payload.state.updatedAt || new Date().toISOString(),
      source: "google-sheets",
    });
  } catch (error) {
    return json_({ ok: false, saved: false, error: String(error && error.message ? error.message : error) });
  } finally {
    lock.releaseLock();
  }
}

function authorize_(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expected || !secret || secret !== expected) throw new Error("unauthorized");
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("setupDatabase must be run first");
  return SpreadsheetApp.openById(id);
}

function saveState_(state) {
  const spreadsheet = spreadsheet_();
  const sheet = getOrCreateSheet_(spreadsheet, STATE_SHEET);
  const json = JSON.stringify(state);
  const rows = [];
  for (let index = 0; index < json.length; index += STATE_CHUNK_SIZE) {
    rows.push([json.slice(index, index + STATE_CHUNK_SIZE)]);
  }
  sheet.clearContents();
  if (rows.length) sheet.getRange(1, 1, rows.length, 1).setValues(rows);
  if (!sheet.isSheetHidden()) sheet.hideSheet();
}

function readState_() {
  const spreadsheet = spreadsheet_();
  const sheet = spreadsheet.getSheetByName(STATE_SHEET);
  if (!sheet || sheet.getLastRow() === 0) return null;
  const chunks = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().flat();
  const json = chunks.join("");
  return json ? JSON.parse(json) : null;
}

function syncEntitySheets_(state) {
  const spreadsheet = spreadsheet_();
  Object.keys(ENTITY_SCHEMAS).forEach((name) => {
    const headers = ENTITY_SCHEMAS[name];
    const values = Array.isArray(state[name]) ? state[name] : [];
    const rows = values.map((item) => headers.map((header) => {
      const value = item[header];
      return value && typeof value === "object" ? JSON.stringify(value) : value == null ? "" : value;
    }));
    const sheet = getOrCreateSheet_(spreadsheet, name);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground("#244f96")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
  });
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function json_(body) {
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
