function setupBuild0(options) {
  const actor = requireInstructor_();
  const input = options || {};
  const props = getScriptProperties_();
  let spreadsheetId = String(input.spreadsheetId || props.getProperty(APP_CONFIG.PROPERTY_KEYS.SPREADSHEET_ID) || '').trim();
  let rootFolderId = String(input.rootFolderId || props.getProperty(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID) || '').trim();

  if (!spreadsheetId) spreadsheetId = SpreadsheetApp.create(APP_CONFIG.APP_NAME + ' Database').getId();
  if (!rootFolderId) rootFolderId = DriveApp.createFolder(APP_CONFIG.ROOT_FOLDER_NAME).getId();
  props.setProperties({ SPREADSHEET_ID: spreadsheetId, ROOT_FOLDER_ID: rootFolderId }, false);

  const ss = SpreadsheetApp.openById(spreadsheetId);
  initializeSheets_(ss);
  const drive = initializeDrive_(DriveApp.getFolderById(rootFolderId));
  writeAudit_('system', 'build0', 'INITIALIZE', null, {
    appVersion: APP_CONFIG.APP_VERSION,
    schemaVersion: APP_CONFIG.SCHEMA_VERSION,
    spreadsheetId: spreadsheetId,
    rootFolderId: rootFolderId
  }, 'Build 0 initialization', actor, ss);

  if (input.seedSyntheticData === true && listObjects_('course_offerings', ss).length === 0) {
    createCourseOfferingInternal_({
      academicYear: '2569', term: '1', semesterLabel: '1/2569',
      courseCode: 'DEMO101', nameTh: 'รายวิชาตัวอย่าง', nameEn: 'Synthetic Demo Course',
      credits: 3, sectionCode: '01', defaultLanguage: 'th'
    }, actor, ss);
  }
  return { spreadsheetId: spreadsheetId, rootFolderId: rootFolderId, folders: drive.folders };
}

function getSetupStatus() {
  const actor = requireInstructor_();
  const props = getScriptProperties_();
  return {
    actor: actor,
    appVersion: APP_CONFIG.APP_VERSION,
    spreadsheetConfigured: Boolean(props.getProperty(APP_CONFIG.PROPERTY_KEYS.SPREADSHEET_ID)),
    rootFolderConfigured: Boolean(props.getProperty(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID))
  };
}

