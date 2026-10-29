const SCORE_IMPORT_TYPES = Object.freeze(['TEAMS_SCORE_XLSX_CSV', 'GENERIC_SCORE_XLSX_CSV']);
const SCORE_FILE_EXTENSIONS = Object.freeze(['csv', 'xlsx']);

function createImportAssessment(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const ss = openDatabase_();
  getOfferingContext_(input.offeringId, ss);
  const name = String(input.name || '').trim();
  const maximum = Number(input.maximumScore);
  if (!name) throw new Error('Assessment name is required.');
  if (!Number.isFinite(maximum) || maximum <= 0) throw new Error('Maximum score must be greater than zero.');
  if (listObjects_('assessments', ss).some(function(row) { return row.offering_id === input.offeringId && normalizeIdentityValue_(row.name) === normalizeIdentityValue_(name); })) {
    throw new Error('Assessment name already exists in this offering.');
  }
  const record = {
    assessment_id: newUuid_(), offering_id: input.offeringId, name: name, type: 'OTHER',
    maximum_score: maximum, weight: '', status: 'IMPORT_PLACEHOLDER', current_rubric_version_id: ''
  };
  appendObjects_('assessments', [record], ss);
  writeAudit_('assessment', record.assessment_id, 'CREATE_IMPORT_PLACEHOLDER', null, record, 'Build 2 score-import dependency; rubric remains unconfigured', actor, ss);
  return record;
}

function listImportAssessments(offeringId) {
  requireInstructor_();
  return listObjects_('assessments', openDatabase_()).filter(function(row) { return row.offering_id === offeringId; });
}

function uploadScoreFile(request) {
  const startedMs = Date.now();
  const actor = requireInstructor_();
  const input = request || {};
  if (SCORE_IMPORT_TYPES.indexOf(input.importType) < 0) throw new Error('Invalid score import type.');
  const filename = sanitizeUploadFilename_(input.filename);
  const extension = filename.toLowerCase().split('.').pop();
  if (SCORE_FILE_EXTENSIONS.indexOf(extension) < 0) throw new Error('Only CSV and XLSX score files are supported.');
  const bytes = decodeUpload_(input.base64Data);
  if (!bytes.length || bytes.length > APP_CONFIG.MAX_SCORE_UPLOAD_BYTES) throw new Error('Score file must be between 1 byte and 10 MB.');
  if (extension === 'xlsx') {
    if (!bytesStartWithAscii_(bytes, 'PK')) throw new Error('File content is not a valid XLSX container.');
  }
  const ss = openDatabase_();
  const context = getOfferingContext_(input.offeringId, ss);
  const hash = sha256Hex_(bytes);
  const duplicate = listObjects_('import_batches', ss).find(function(row) {
    return row.offering_id === input.offeringId && row.sha256 === hash && row.status !== 'ROLLED_BACK';
  });
  if (duplicate) {
    const duplicateResult = {
      duplicate: true, existingBatchId: duplicate.batch_id, status: duplicate.status,
      message: 'This exact file was already imported for the selected offering.'
    };
    if (duplicate.status === 'UPLOADED') {
      const duplicateMatrix = readTabularScoreFile_(bytes, extension, filename);
      duplicateResult.headers = makeUniqueHeaders_(duplicateMatrix[0] || []);
      const duplicateRows = duplicateMatrix.slice(1).filter(function(row) { return row.some(function(value) { return String(value).trim() !== ''; }); });
      duplicateResult.preview = duplicateRows.slice(0, 10);
      duplicateResult.rowCount = duplicateRows.length;
    } else {
      duplicateResult.review = getImportReviewInternal_(duplicate.batch_id, ss);
    }
    return duplicateResult;
  }

  const matrix = readTabularScoreFile_(bytes, extension, filename);
  if (!matrix.length || !matrix[0].length) throw new Error('The score file contains no tabular data.');
  const headers = makeUniqueHeaders_(matrix[0]);
  const dataRows = matrix.slice(1).filter(function(row) { return row.some(function(value) { return String(value).trim() !== ''; }); });
  const folders = createOfferingDriveLayout_(context.semester.academic_year, context.semester.term, context.course.course_code, context.offering.section_code);
  const mimeType = extension === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const sourceFile = folders.imports.createFile(Utilities.newBlob(bytes, mimeType, filename));
  const batch = {
    batch_id: newUuid_(), offering_id: input.offeringId, assessment_id_nullable: '', import_type: input.importType,
    source_file_id: sourceFile.getId(), sha256: hash, parser_version: APP_CONFIG.SCORE_PARSER_VERSION,
    status: 'UPLOADED', created_at: nowIso_()
  };
  appendObjects_('import_batches', [batch], ss);
  const processingMs = Date.now() - startedMs;
  writeAudit_('import_batch', batch.batch_id, 'UPLOAD', null, { filename: filename, sha256: hash, rowCount: dataRows.length, sourceFileId: sourceFile.getId(), processingMs: processingMs }, 'Immutable score source uploaded', actor, ss);
  return { duplicate: false, batchId: batch.batch_id, headers: headers, preview: dataRows.slice(0, 10), rowCount: dataRows.length, processingMs: processingMs };
}

function configureScoreImport(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const ss = openDatabase_();
  const batch = findObjectBy_('import_batches', 'batch_id', input.batchId, ss);
  if (!batch) throw new Error('Import batch not found.');
  if (batch.status !== 'UPLOADED') throw new Error('This batch has already been configured.');
  const sourceFile = DriveApp.getFileById(batch.source_file_id);
  const filename = sourceFile.getName();
  const extension = filename.toLowerCase().split('.').pop();
  const sourceBytes = sourceFile.getBlob().getBytes();
  if (sha256Hex_(sourceBytes) !== batch.sha256) throw new Error('Source file hash changed after upload; batch rejected.');
  const rawMatrix = readTabularScoreFile_(sourceBytes, extension, filename);
  const matrix = {
    headers: makeUniqueHeaders_(rawMatrix[0] || []),
    rows: rawMatrix.slice(1).filter(function(row) { return row.some(function(value) { return String(value).trim() !== ''; }); })
  };
  const mapping = validateImportMapping_(input.mapping, matrix.headers, ss, batch.offering_id);
  const records = normalizeScoreRows_(batch, matrix, mapping, ss);
  appendObjects_('import_rows', records, ss);
  updateObjectByKey_('import_batches', 'batch_id', batch.batch_id, { status: 'PREVIEW_READY', assessment_id_nullable: mapping.defaultAssessmentId || '' }, ss);
  writeAudit_('import_batch', batch.batch_id, 'CONFIGURE_MAPPING', batch, { mapping: mapping, normalizedRows: records.length }, 'Instructor configured source columns', actor, ss);
  return getImportReviewInternal_(batch.batch_id, ss);
}

function getImportReview(batchId) {
  requireInstructor_();
  return getImportReviewInternal_(batchId, openDatabase_());
}

function getImportReviewInternal_(batchId, ss) {
  const batch = findObjectBy_('import_batches', 'batch_id', batchId, ss);
  if (!batch) throw new Error('Import batch not found.');
  const assessments = Object.fromEntries(listObjects_('assessments', ss).map(function(row) { return [row.assessment_id, row]; }));
  const existingGrades = listObjects_('gradebook_entries', ss);
  const enrolledIds = new Set(listObjects_('enrollments', ss).filter(function(row) { return row.offering_id === batch.offering_id; }).map(function(row) { return String(row.student_id); }));
  const students = listObjects_('students', ss).filter(function(row) { return enrolledIds.has(String(row.student_id)); });
  const rows = listObjects_('import_rows', ss).filter(function(row) { return row.batch_id === batchId; }).map(function(row) {
    const parsed = JSON.parse(row.parsed_json || '{}');
    const conflict = existingGrades.find(function(grade) {
      return grade.offering_id === batch.offering_id && grade.assessment_id === parsed.assessmentId && String(grade.student_id) === String(row.proposed_student_id);
    });
    return Object.assign({}, row, {
      parsed: parsed,
      assessment: assessments[parsed.assessmentId] || null,
      conflict: conflict ? { entryId: conflict.entry_id, score: conflict.approved_score_nullable, state: conflict.score_state, batchId: conflict.batch_id_nullable } : null
    });
  });
  return { batch: batch, rows: rows, students: students };
}

function confirmImportMappings(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const choices = input.choices || {};
  const ss = openDatabase_();
  const batch = findObjectBy_('import_batches', 'batch_id', input.batchId, ss);
  if (!batch || batch.status !== 'PREVIEW_READY') throw new Error('Import batch is not awaiting mapping review.');
  const enrolledIds = new Set(listObjects_('enrollments', ss).filter(function(row) { return row.offering_id === batch.offering_id; }).map(function(row) { return String(row.student_id); }));
  Object.keys(choices).forEach(function(rowId) {
    const studentId = String(choices[rowId] || '');
    if (!enrolledIds.has(studentId)) throw new Error('Selected student is not enrolled in this offering: ' + studentId);
    const row = findObjectBy_('import_rows', 'import_row_id', rowId, ss);
    if (!row || row.batch_id !== batch.batch_id) throw new Error('Import row does not belong to this batch.');
    const changed = updateObjectByKey_('import_rows', 'import_row_id', rowId, { proposed_student_id: studentId, match_state: 'CONFIRMED' }, ss);
    writeAudit_('import_row', rowId, 'CONFIRM_IDENTITY', changed.before, changed.after, String(input.reason || 'Instructor confirmed identity mapping'), actor, ss);
  });
  return getImportReviewInternal_(batch.batch_id, ss);
}

function validateImportMapping_(mapping, headers, ss, offeringId) {
  const value = mapping || {};
  if (['LONG', 'WIDE'].indexOf(value.layout) < 0) throw new Error('Layout must be LONG or WIDE.');
  const headerSet = new Set(headers);
  ['studentIdColumn', 'nameColumn', 'emailColumn', 'statusColumn', 'assessmentColumn', 'scoreColumn'].forEach(function(field) {
    if (value[field] && !headerSet.has(value[field])) throw new Error('Mapped column not found: ' + value[field]);
  });
  if (!value.studentIdColumn && !value.nameColumn && !value.emailColumn) throw new Error('Map at least one identity column.');
  const assessmentIds = new Set(listObjects_('assessments', ss).filter(function(row) { return row.offering_id === offeringId; }).map(function(row) { return row.assessment_id; }));
  if (value.layout === 'LONG') {
    if (!value.scoreColumn || (!value.defaultAssessmentId && !value.assessmentColumn)) throw new Error('Long format requires score and assessment mapping.');
    if (value.defaultAssessmentId && !assessmentIds.has(value.defaultAssessmentId)) throw new Error('Default assessment is outside this offering.');
  } else {
    if (!Array.isArray(value.scoreColumns) || !value.scoreColumns.length) throw new Error('Wide format requires at least one score column.');
    value.scoreColumns.forEach(function(item) {
      if (!headerSet.has(item.column) || !assessmentIds.has(item.assessmentId)) throw new Error('Invalid wide score-column mapping.');
    });
  }
  return value;
}

function normalizeScoreRows_(batch, matrix, mapping, ss) {
  const headerIndex = Object.fromEntries(matrix.headers.map(function(header, index) { return [header, index]; }));
  const assessments = listObjects_('assessments', ss).filter(function(row) { return row.offering_id === batch.offering_id; });
  const assessmentById = Object.fromEntries(assessments.map(function(row) { return [row.assessment_id, row]; }));
  const assessmentByName = Object.fromEntries(assessments.map(function(row) { return [normalizeIdentityValue_(row.name), row]; }));
  const output = [];
  matrix.rows.forEach(function(sourceRow, rowIndex) {
    const identity = {
      studentId: mapping.studentIdColumn ? sourceRow[headerIndex[mapping.studentIdColumn]] : '',
      name: mapping.nameColumn ? sourceRow[headerIndex[mapping.nameColumn]] : '',
      email: mapping.emailColumn ? sourceRow[headerIndex[mapping.emailColumn]] : ''
    };
    const match = matchImportedIdentity_(batch.offering_id, identity, ss);
    const statusValue = mapping.statusColumn ? sourceRow[headerIndex[mapping.statusColumn]] : '';
    const scoreMappings = mapping.layout === 'WIDE' ? mapping.scoreColumns : [{
      column: mapping.scoreColumn,
      assessmentId: mapping.defaultAssessmentId || ((assessmentByName[normalizeIdentityValue_(sourceRow[headerIndex[mapping.assessmentColumn]])] || {}).assessment_id || '')
    }];
    scoreMappings.forEach(function(scoreMapping) {
      if (!assessmentById[scoreMapping.assessmentId]) throw new Error('Could not resolve assessment on source row ' + (rowIndex + 2));
      const rawScore = sourceRow[headerIndex[scoreMapping.column]];
      const parsedScore = parseImportedScore_(rawScore, statusValue);
      output.push({
        import_row_id: newUuid_(), batch_id: batch.batch_id, original_row_ref: String(rowIndex + 2) + ':' + scoreMapping.column,
        raw_identity: JSON.stringify(identity), raw_score: rawScore === undefined ? '' : String(rawScore), raw_status: String(statusValue || ''),
        proposed_student_id: match.proposedStudentId, match_state: match.state,
        parsed_json: JSON.stringify({ assessmentId: scoreMapping.assessmentId, assessmentName: assessmentById[scoreMapping.assessmentId].name,
          sourceColumn: scoreMapping.column, numericScore: parsedScore.numericScore, scoreState: parsedScore.state,
          matchReason: match.reason, candidates: match.candidates })
      });
    });
  });
  return output;
}

function parseImportedScore_(rawScore, rawStatus) {
  const scoreText = String(rawScore === null || rawScore === undefined ? '' : rawScore).trim();
  const statusText = String(rawStatus || '').trim().toLowerCase();
  const combined = (statusText || scoreText.toLowerCase()).replace(/[._-]+/g, ' ');
  const states = {
    'viewed': 'VIEWED', 'absent': 'ABSENT', 'not submitted': 'NOT_SUBMITTED',
    'ungraded': 'UNGRADED', 'excused': 'EXCUSED', 'missing': 'MISSING'
  };
  if (!scoreText && !statusText) return { numericScore: null, state: 'MISSING' };
  if (states[combined]) return { numericScore: null, state: states[combined] };
  if (!scoreText || scoreText === '-') return { numericScore: null, state: statusText ? 'REVIEW_REQUIRED' : 'MISSING' };
  const numeric = Number(scoreText.replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return { numericScore: null, state: 'REVIEW_REQUIRED' };
  return { numericScore: numeric, state: 'SCORE' };
}

function readTabularScoreFile_(bytes, extension, filename) {
  if (extension === 'csv') {
    const text = Utilities.newBlob(bytes).getDataAsString('UTF-8').replace(/^\uFEFF/, '');
    return Utilities.parseCsv(text);
  }
  let convertedId = '';
  try {
    const converted = Drive.Files.create({ name: 'TEMP_SCORE_' + newUuid_(), mimeType: 'application/vnd.google-apps.spreadsheet' },
      Utilities.newBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename), { fields: 'id' });
    convertedId = converted.id;
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const spreadsheet = SpreadsheetApp.openById(convertedId);
        const sheets = spreadsheet.getSheets();
        if (!sheets.length) throw new Error('Converted XLSX contains no worksheets.');
        return sheets[0].getDataRange().getDisplayValues();
      } catch (error) {
        lastError = error;
      }
      if (attempt < 4) Utilities.sleep(Math.min(4000, 500 * Math.pow(2, attempt)));
    }
    throw lastError || new Error('Unable to read converted XLSX file.');
  } finally {
    if (convertedId) DriveApp.getFileById(convertedId).setTrashed(true);
  }
}

function makeUniqueHeaders_(row) {
  const counts = {};
  return row.map(function(value, index) {
    const base = String(value || '').trim() || 'Column ' + (index + 1);
    counts[base] = (counts[base] || 0) + 1;
    return counts[base] === 1 ? base : base + ' (' + counts[base] + ')';
  });
}
