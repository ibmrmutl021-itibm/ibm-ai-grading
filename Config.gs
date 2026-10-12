const APP_CONFIG = Object.freeze({
  APP_NAME: 'IBM AI Teaching & Grading Center',
  APP_VERSION: '0.1.0-build0',
  SCHEMA_VERSION: '1',
  DEFAULT_LANGUAGE: 'th',
  ROOT_FOLDER_NAME: 'IBM_Grading_Center',
  LOCK_TIMEOUT_MS: 30000,
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

