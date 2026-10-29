function runBuild2SelfTests() {
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
    results.push(testResult_('semester label remains term/year text', getCourseOfferingView_(ids.offeringId, tempSpreadsheet).semesterLabel === '1/2569'));
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
    appendObjects_('students', [{ student_id: '68000000001', official_name_th: 'นักศึกษาทดสอบ 1', official_name_en_nullable: '', metadata: '{}' }], tempSpreadsheet);
    appendObjects_('enrollments', [{ enrollment_id: newUuid_(), offering_id: ids.offeringId, student_id: '68000000001', registration_status: 'ACTIVE', status_verified_by: actor, status_verified_at: nowIso_() }], tempSpreadsheet);
    const exactMatch = matchImportedIdentity_(ids.offeringId, { studentId: '68000000001', name: 'Wrong Name' }, tempSpreadsheet);
    results.push(testResult_('score identity uses validated ID first within offering', exactMatch.state === 'MATCHED_EXACT_ID' && exactMatch.proposedStudentId === '68000000001'));
    results.push(testResult_('blank, Viewed and zero remain distinct',
      parseImportedScore_('', '').state === 'MISSING' && parseImportedScore_('Viewed', '').state === 'VIEWED' && parseImportedScore_('0', '').numericScore === 0));
    const assessmentRows = Array.from({ length: 7 }, function(_, index) {
      return { assessment_id: newUuid_(), offering_id: ids.offeringId, name: 'Hw' + (index + 1), type: 'OTHER', maximum_score: 10, weight: '', status: 'IMPORT_PLACEHOLDER', current_rubric_version_id: '' };
    });
    appendObjects_('assessments', assessmentRows, tempSpreadsheet);
    const matrix = { headers: ['Student ID', 'Name'].concat(assessmentRows.map(function(row) { return row.name; })), rows: [['68000000001', 'นักศึกษาทดสอบ 1'].concat([0, 1, 2, 3, 4, 5, 6])] };
    const normalized = normalizeScoreRows_({ batch_id: newUuid_(), offering_id: ids.offeringId }, matrix, {
      layout: 'WIDE', studentIdColumn: 'Student ID', nameColumn: 'Name', emailColumn: '', statusColumn: '',
      scoreColumns: assessmentRows.map(function(row) { return { column: row.name, assessmentId: row.assessment_id }; })
    }, tempSpreadsheet);
    results.push(testResult_('seven wide assignments normalize without losing zero', normalized.length === 7 && JSON.parse(normalized[0].parsed_json).numericScore === 0));
    const crossLanguage = matchImportedIdentity_(ids.offeringId, { name: 'Unconfirmed English Name' }, tempSpreadsheet);
    results.push(testResult_('unconfirmed cross-language name is not silently accepted', ACCEPTED_MATCH_STATES.indexOf(crossLanguage.state) < 0));
  } finally {
    DriveApp.getFileById(tempSpreadsheet.getId()).setTrashed(true);
    tempRoot.setTrashed(true);
  }
  const passed = results.every(function(result) { return result.passed; });
  return { passed: passed, results: results, ranAt: nowIso_(), actor: actor };
}

function runBuild0SelfTests() {
  return runBuild2SelfTests();
}

function runBuild1SelfTests() {
  return runBuild2SelfTests();
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

