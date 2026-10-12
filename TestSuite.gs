function runBuild0SelfTests() {
  const actor = requireInstructor_();
  const tempSpreadsheet = SpreadsheetApp.create('TEMP IBM Grading Build 0 Test');
  const tempRoot = DriveApp.createFolder('TEMP IBM Grading Build 0 Test ' + newUuid_());
  const results = [];
  try {
    initializeSheets_(tempSpreadsheet);
    results.push(testResult_('schema creates every logical tab', Object.keys(SHEET_SCHEMA).every(function(name) {
      return Boolean(tempSpreadsheet.getSheetByName(name));
    })));
    results.push(testResult_('authorized instructor is accepted', isAuthorizedEmail_(actor, actor)));
    results.push(testResult_('unauthorized user is rejected', !isAuthorizedEmail_('other@example.edu', actor)));
    const driveResult = initializeDrive_(tempRoot);
    results.push(testResult_('Drive layout is complete', DRIVE_LAYOUT.every(function(name) {
      return Boolean(driveResult.folders[name]);
    })));
    const ids = createCourseOfferingInternal_({
      academicYear: '2569', term: '1', semesterLabel: '1/2569', courseCode: 'TEST101',
      nameTh: 'ข้อมูลสังเคราะห์', nameEn: 'Synthetic Test', credits: 3, sectionCode: '01'
    }, actor, tempSpreadsheet);
    results.push(testResult_('course offering is created', Boolean(ids.offeringId) && listObjects_('course_offerings', tempSpreadsheet).length === 1));
    results.push(testResult_('creation is audited', listObjects_('audit_log', tempSpreadsheet).length === 1));
  } finally {
    DriveApp.getFileById(tempSpreadsheet.getId()).setTrashed(true);
    tempRoot.setTrashed(true);
  }
  const passed = results.every(function(result) { return result.passed; });
  return { passed: passed, results: results, ranAt: nowIso_(), actor: actor };
}

function testResult_(name, passed) {
  if (!passed) throw new Error('TEST FAILED: ' + name);
  return { name: name, passed: true };
}

