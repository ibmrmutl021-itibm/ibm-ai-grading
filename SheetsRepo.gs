function openDatabase_() {
  return SpreadsheetApp.openById(getRequiredProperty_(APP_CONFIG.PROPERTY_KEYS.SPREADSHEET_ID));
}

function initializeSheets_(spreadsheet) {
  validateSchemaDefinition_();
  const ss = spreadsheet || openDatabase_();
  Object.keys(SHEET_SCHEMA).forEach(function(sheetName) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    const headers = SHEET_SCHEMA[sheetName];
    const existing = sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
      : [];
    const hasContent = existing.some(function(value) { return String(value).trim() !== ''; });
    if (hasContent && JSON.stringify(existing.slice(0, headers.length)) !== JSON.stringify(headers)) {
      throw new Error('Existing sheet has incompatible headers: ' + sheetName);
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f62fe')
      .setFontColor('#ffffff');
  });
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && Object.keys(SHEET_SCHEMA).indexOf('Sheet1') === -1 && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }
  upsertSetting_('schema_version', APP_CONFIG.SCHEMA_VERSION, ss);
  return ss.getId();
}

function getSheet_(name, spreadsheet) {
  if (!SHEET_SCHEMA[name]) throw new Error('Unknown sheet: ' + name);
  const sheet = (spreadsheet || openDatabase_()).getSheetByName(name);
  if (!sheet) throw new Error('Database is not initialized; missing sheet: ' + name);
  return sheet;
}

function appendObjects_(sheetName, records, spreadsheet) {
  if (!records || !records.length) return 0;
  const headers = SHEET_SCHEMA[sheetName];
  if (!headers) throw new Error('Unknown sheet: ' + sheetName);
  const values = records.map(function(record) {
    return headers.map(function(header) {
      const value = record[header];
      return value === null || typeof value === 'undefined' ? '' : value;
    });
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(APP_CONFIG.LOCK_TIMEOUT_MS);
  try {
    const sheet = getSheet_(sheetName, spreadsheet);
    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, headers.length).setValues(values);
  } finally {
    lock.releaseLock();
  }
  return values.length;
}

function listObjects_(sheetName, spreadsheet) {
  const sheet = getSheet_(sheetName, spreadsheet);
  const headers = SHEET_SCHEMA[sheetName];
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row) {
    return headers.reduce(function(result, header, index) {
      result[header] = row[index];
      return result;
    }, {});
  });
}

function upsertSetting_(key, value, spreadsheet) {
  const sheet = getSheet_('settings', spreadsheet);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const index = rows.findIndex(function(row) { return row[0] === key; });
  const serialized = JSON.stringify(value);
  if (index >= 0) sheet.getRange(index + 2, 2).setValue(serialized);
  else sheet.appendRow([key, serialized]);
}

