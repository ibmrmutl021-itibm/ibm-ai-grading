function runBuild1SelfTests() {
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
    const parsed = parseRosterText_('1 68123456789 นายทดสอบ หนึ่ง\n2 68541206308-1 นางสาวทดสอบ สอง ถอนวิชา(W)');
    results.push(testResult_('roster parser preserves IDs as strings', parsed.length === 2 && parsed[0].studentId === '68123456789'));
    results.push(testResult_('explicit W is only proposed', parsed[1].parsedStatus === 'WITHDRAWN_PROPOSED'));
    const firstVersion = syntheticRosterVersion_(ids.offeringId, 'ROSTER_CLASSROOM', true);
    const secondVersion = syntheticRosterVersion_(ids.offeringId, 'ROSTER_EXAM', false);
    appendObjects_('roster_versions', [firstVersion, secondVersion], tempSpreadsheet);
    const firstRows = syntheticRosterEntries_(firstVersion.roster_version_id, 41, 68000000001);
    const secondRows = syntheticRosterEntries_(secondVersion.roster_version_id, 41, 68000000001);
    appendObjects_('roster_entries', firstRows.concat(secondRows), tempSpreadsheet);
    const sameRosterComparison = compareRosterVersionInternal_(secondVersion, secondRows, tempSpreadsheet);
    results.push(testResult_('41-person classroom and exam rosters reconcile unchanged', sameRosterComparison.length === 41 && sameRosterComparison.every(function(row) { return row.change === 'UNCHANGED'; })));
    const otherIds = createCourseOfferingInternal_({
      academicYear: '2569', term: '1', semesterLabel: '1/2569', courseCode: 'TEST101',
      nameTh: 'ข้อมูลสังเคราะห์อีกตอนเรียน', nameEn: 'Separate Synthetic Offering', credits: 3, sectionCode: '02'
    }, actor, tempSpreadsheet);
    const otherVersion = syntheticRosterVersion_(otherIds.offeringId, 'ROSTER_EXAM', false);
    appendObjects_('roster_versions', [otherVersion], tempSpreadsheet);
    const otherRows = syntheticRosterEntries_(otherVersion.roster_version_id, 51, 69000000001);
    otherRows[0].student_id = '68541206308-1'; otherRows[0].raw_remark = 'ถอนวิชา(W)'; otherRows[0].parsed_status = 'WITHDRAWN_PROPOSED';
    appendObjects_('roster_entries', otherRows, tempSpreadsheet);
    const separateComparison = compareRosterVersionInternal_(otherVersion, otherRows, tempSpreadsheet);
    results.push(testResult_('51-person roster remains isolated by offering', separateComparison.length === 51 && separateComparison.filter(function(row) { return row.change === 'EXPLICIT_W'; }).length === 1));
  } finally {
    DriveApp.getFileById(tempSpreadsheet.getId()).setTrashed(true);
    tempRoot.setTrashed(true);
  }
  const passed = results.every(function(result) { return result.passed; });
  return { passed: passed, results: results, ranAt: nowIso_(), actor: actor };
}

function runBuild0SelfTests() {
  return runBuild1SelfTests();
}

function syntheticRosterVersion_(offeringId, rosterType, approved) {
  return {
    roster_version_id: newUuid_(), offering_id: offeringId, roster_type: rosterType,
    document_date: '2026-10-12', uploaded_at: nowIso_(), source_file_id: 'SYNTHETIC_FILE',
    approved_at: approved ? nowIso_() : ''
  };
}

function syntheticRosterEntries_(versionId, count, startingId) {
  return Array.from({ length: count }, function(_, index) {
    return {
      roster_entry_id: newUuid_(), roster_version_id: versionId, row_number: index + 1,
      student_id: String(startingId + index), parsed_name: 'นักศึกษาทดสอบ ' + (index + 1),
      raw_remark: '', parsed_status: 'ACTIVE_PROPOSED', page_number: index < 25 ? 1 : 2, confidence_flag: ''
    };
  });
}

function testResult_(name, passed) {
  if (!passed) throw new Error('TEST FAILED: ' + name);
  return { name: name, passed: true };
}

