function doGet() {
  try {
    requireInstructor_();
    return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle(APP_CONFIG.APP_NAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  } catch (error) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html><body style="font-family:Arial;padding:2rem">' +
      '<h1>Access denied</h1><p>This application is restricted to the configured instructor.</p>' +
      '</body></html>'
    ).setTitle('Access denied');
  }
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getBootstrapData() {
  const setup = getSetupStatus();
  return {
    setup: setup,
    offerings: setup.spreadsheetConfigured && setup.rootFolderConfigured ? listCourseOfferings() : [],
    rosterTypes: ROSTER_TYPES,
    scoreImportTypes: SCORE_IMPORT_TYPES
  };
}

function initializeApplicationStorage() {
  requireInstructor_();
  setupBuild0({ seedSyntheticData: false });
  return getBootstrapData();
}

