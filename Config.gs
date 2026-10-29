const APP_CONFIG = Object.freeze({
  APP_NAME: 'IBM AI Teaching & Grading Center',
  APP_VERSION: '0.3.0-build2',
  SCHEMA_VERSION: '1',
  DEFAULT_LANGUAGE: 'th',
  ROOT_FOLDER_NAME: 'IBM_Grading_Center',
  LOCK_TIMEOUT_MS: 30000,
  MAX_ROSTER_UPLOAD_BYTES: 10 * 1024 * 1024,
  ROSTER_PARSER_VERSION: 'roster-regex-v2',
  SCORE_PARSER_VERSION: 'score-tabular-v1',
  MAX_SCORE_UPLOAD_BYTES: 10 * 1024 * 1024,
  PROPERTY_KEYS: Object.freeze({
    INSTRUCTOR_EMAIL: 'INSTRUCTOR_EMAIL',
    SPREADSHEET_ID: 'SPREADSHEET_ID',
    ROOT_FOLDER_ID: 'ROOT_FOLDER_ID'
  })
});

function getScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function getRequiredProperty_(key) {
  const value = String(getScriptProperties_().getProperty(key) || '').trim();
  if (!value) throw new Error('Missing required Script Property: ' + key);
  return value;
}

function getRuntimeConfig_() {
  return {
    instructorEmail: normalizeEmail_(getRequiredProperty_(APP_CONFIG.PROPERTY_KEYS.INSTRUCTOR_EMAIL)),
    spreadsheetId: getRequiredProperty_(APP_CONFIG.PROPERTY_KEYS.SPREADSHEET_ID),
    rootFolderId: getRequiredProperty_(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID)
  };
}

function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function nowIso_() {
  return new Date().toISOString();
}

function newUuid_() {
  return Utilities.getUuid();
}

function bytesStartWithAscii_(bytes, signature) {
  if (!bytes || bytes.length < signature.length) return false;
  return signature.split('').every(function(character, index) {
    return (bytes[index] + 256) % 256 === character.charCodeAt(0);
  });
}

