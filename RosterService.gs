const ROSTER_TYPES = Object.freeze(['ROSTER_CLASSROOM', 'ROSTER_EXAM']);
const ENROLLMENT_STATUSES = Object.freeze(['ACTIVE', 'WITHDRAWN', 'PENDING_VERIFICATION']);

function uploadRosterFile(request) {
  const startedMs = Date.now();
  const actor = requireInstructor_();
  const input = request || {};
  if (ROSTER_TYPES.indexOf(input.rosterType) < 0) throw new Error('Invalid roster type.');
  if (!String(input.documentDate || '').match(/^\d{4}-\d{2}-\d{2}$/)) throw new Error('Document date is required.');
  const filename = sanitizeUploadFilename_(input.filename);
  if (!filename.toLowerCase().endsWith('.pdf')) throw new Error('Build 1 accepts PDF roster files only.');
  const bytes = decodeUpload_(input.base64Data);
  if (!bytes.length || bytes.length > APP_CONFIG.MAX_ROSTER_UPLOAD_BYTES) throw new Error('Roster PDF must be between 1 byte and 10 MB.');
  if (!bytesStartWithAscii_(bytes, '%PDF-')) throw new Error('File content is not a valid PDF.');

  const ss = openDatabase_();
  const context = getOfferingContext_(input.offeringId, ss);
  const blob = Utilities.newBlob(bytes, 'application/pdf', filename);
  const hash = sha256Hex_(bytes);
  const priorUpload = findRosterUploadByHash_(input.offeringId, hash, ss);
  if (priorUpload && priorUpload.parserVersion === APP_CONFIG.ROSTER_PARSER_VERSION) {
    const existingReview = getRosterReviewInternal_(priorUpload.rosterVersionId, ss, '');
    existingReview.duplicate = true;
    existingReview.message = 'This exact roster file was already processed with the current parser.';
    return existingReview;
  }
  let sourceFile;
  let auditAction = 'UPLOAD_AND_EXTRACT';
  if (priorUpload && priorUpload.sourceFileId) {
    sourceFile = DriveApp.getFileById(priorUpload.sourceFileId);
    auditAction = 'REPROCESS_WITH_NEW_PARSER';
  } else {
    const folders = createOfferingDriveLayout_(context.semester.academic_year, context.semester.term, context.course.course_code, context.offering.section_code);
    sourceFile = folders.rosters.createFile(blob);
  }
  const rosterVersionId = newUuid_();
  let parsedRows = [];
  let extractionError = '';
  try {
    parsedRows = parseRosterText_(extractPdfText_(sourceFile.getBlob()));
  } catch (error) {
    extractionError = String(error && error.message || error);
  }

  appendObjects_('roster_versions', [{
    roster_version_id: rosterVersionId,
    offering_id: context.offering.offering_id,
    roster_type: input.rosterType,
    document_date: input.documentDate,
    uploaded_at: nowIso_(),
    source_file_id: sourceFile.getId(),
    approved_at: ''
  }], ss);
  appendObjects_('roster_entries', parsedRows.map(function(row) {
    return {
      roster_entry_id: newUuid_(), roster_version_id: rosterVersionId, row_number: row.rowNumber,
      student_id: row.studentId, parsed_name: row.parsedName, raw_remark: row.rawRemark,
      parsed_status: row.parsedStatus, page_number: row.pageNumber, confidence_flag: row.confidenceFlag
    };
  }), ss);
  writeAudit_('roster_version', rosterVersionId, auditAction, null, {
    offeringId: context.offering.offering_id, rosterType: input.rosterType, sourceFileId: sourceFile.getId(),
    sha256: hash, parserVersion: APP_CONFIG.ROSTER_PARSER_VERSION, rowCount: parsedRows.length,
    extractionError: extractionError || null, processingMs: Date.now() - startedMs
  }, 'Roster source preserved before instructor review', actor, ss);
  const review = getRosterReviewInternal_(rosterVersionId, ss, extractionError);
  review.reprocessed = Boolean(priorUpload);
  review.processingMs = Date.now() - startedMs;
  return review;
}

function findRosterUploadByHash_(offeringId, hash, ss) {
  const audits = listObjects_('audit_log', ss).filter(function(row) {
    return row.entity === 'roster_version' && ['UPLOAD_AND_EXTRACT', 'REPROCESS_WITH_NEW_PARSER'].indexOf(row.action) >= 0;
  }).reverse();
  for (let index = 0; index < audits.length; index += 1) {
    try {
      const details = JSON.parse(audits[index].after_json || '{}');
      if (details.offeringId === offeringId && details.sha256 === hash) {
        return {
          rosterVersionId: audits[index].entity_id,
          sourceFileId: details.sourceFileId,
          parserVersion: details.parserVersion
        };
      }
    } catch (error) {
      // Ignore malformed historical audit JSON and continue searching.
    }
  }
  return null;
}

function getRosterReview(rosterVersionId) {
  requireInstructor_();
  return getRosterReviewInternal_(rosterVersionId, openDatabase_(), '');
}

function getRosterReviewInternal_(rosterVersionId, ss, extractionError) {
  const version = findObjectBy_('roster_versions', 'roster_version_id', rosterVersionId, ss);
  if (!version) throw new Error('Roster version not found.');
  const entries = listObjects_('roster_entries', ss).filter(function(row) { return row.roster_version_id === rosterVersionId; });
  return {
    version: version,
    entries: entries,
    comparison: compareRosterVersionInternal_(version, entries, ss),
    extractionError: extractionError || '',
    sourceUrl: 'https://drive.google.com/open?id=' + encodeURIComponent(version.source_file_id)
  };
}

function listRosterVersions(offeringId) {
  requireInstructor_();
  return listObjects_('roster_versions', openDatabase_()).filter(function(row) {
    return row.offering_id === offeringId;
  }).sort(function(a, b) { return String(b.uploaded_at).localeCompare(String(a.uploaded_at)); });
}

function getLatestRosterReview(offeringId) {
  requireInstructor_();
  const ss = openDatabase_();
  const latest = listObjects_('roster_versions', ss).filter(function(row) {
    return row.offering_id === offeringId;
  }).sort(function(a, b) { return String(b.uploaded_at).localeCompare(String(a.uploaded_at)); })[0];
  if (!latest) throw new Error('No roster upload found for this offering.');
  return getRosterReviewInternal_(latest.roster_version_id, ss, '');
}

function compareRosterVersionInternal_(version, entries, ss) {
  const previousVersions = listObjects_('roster_versions', ss).filter(function(row) {
    return row.offering_id === version.offering_id && row.roster_version_id !== version.roster_version_id && row.approved_at;
  }).sort(function(a, b) { return String(b.approved_at).localeCompare(String(a.approved_at)); });
  const previous = previousVersions[0] || null;
  const previousEntries = previous ? listObjects_('roster_entries', ss).filter(function(row) {
    return row.roster_version_id === previous.roster_version_id;
  }) : [];
  const currentById = Object.fromEntries(entries.filter(function(row) { return row.student_id; }).map(function(row) { return [String(row.student_id), row]; }));
  const previousById = Object.fromEntries(previousEntries.filter(function(row) { return row.student_id; }).map(function(row) { return [String(row.student_id), row]; }));
  const ids = Array.from(new Set(Object.keys(currentById).concat(Object.keys(previousById))));
  return ids.map(function(studentId) {
    const current = currentById[studentId] || null;
    const prior = previousById[studentId] || null;
    let change = 'UNCHANGED';
    if (current && current.parsed_status === 'WITHDRAWN_PROPOSED') change = 'EXPLICIT_W';
    else if (!prior) change = 'NEW';
    else if (!current) change = 'ABSENT_PENDING_VERIFICATION';
    else if (normalizeName_(current.parsed_name) !== normalizeName_(prior.parsed_name)) change = 'NAME_CHANGED';
    else if (current.confidence_flag) change = 'OCR_REVIEW_REQUIRED';
    return { studentId: studentId, change: change, current: current, previous: prior };
  });
}

function approveRosterVersion(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const decisions = input.decisions || {};
  const ss = openDatabase_();
  const version = findObjectBy_('roster_versions', 'roster_version_id', input.rosterVersionId, ss);
  if (!version) throw new Error('Roster version not found.');
  if (version.approved_at) throw new Error('Roster version is already approved and immutable.');
  const entries = listObjects_('roster_entries', ss).filter(function(row) { return row.roster_version_id === version.roster_version_id; });
  if (!entries.length) throw new Error('No extracted rows to approve. Correct the extraction first.');
  const comparison = compareRosterVersionInternal_(version, entries, ss);
  const idCounts = entries.reduce(function(result, entry) {
    result[entry.student_id] = (result[entry.student_id] || 0) + 1; return result;
  }, {});
  const approvedRows = entries.map(function(entry) {
    if (!entry.student_id || !entry.parsed_name) throw new Error('Every approved row requires Student ID and name.');
    if (idCounts[entry.student_id] > 1) throw new Error('Duplicate Student ID must be corrected before approval: ' + entry.student_id);
    const status = String(decisions[entry.roster_entry_id] || 'ACTIVE');
    if (entry.parsed_status === 'WITHDRAWN_PROPOSED' && !decisions[entry.roster_entry_id]) {
      throw new Error('Explicit W requires an instructor decision for student ' + entry.student_id);
    }
    if (entry.parsed_status === 'WITHDRAWN_PROPOSED' && ['WITHDRAWN', 'PENDING_VERIFICATION'].indexOf(status) < 0) {
      throw new Error('Explicit W can only be confirmed or left pending for student ' + entry.student_id);
    }
    if (ENROLLMENT_STATUSES.indexOf(status) < 0) throw new Error('Invalid enrollment status for ' + entry.student_id);
    return { entry: entry, status: status };
  });

  approvedRows.forEach(function(row) {
    upsertStudentFromRoster_(row.entry, actor, ss);
    upsertEnrollmentStatus_(version.offering_id, row.entry.student_id, row.status, actor, ss, 'Approved roster row');
  });
  comparison.filter(function(item) { return item.change === 'ABSENT_PENDING_VERIFICATION'; }).forEach(function(item) {
    upsertEnrollmentStatus_(version.offering_id, item.studentId, 'PENDING_VERIFICATION', actor, ss, 'Missing from later roster; not treated as W');
  });
  const approvedAt = nowIso_();
  updateObjectByKey_('roster_versions', 'roster_version_id', version.roster_version_id, { approved_at: approvedAt }, ss);
  writeAudit_('roster_version', version.roster_version_id, 'APPROVE', version, { approved_at: approvedAt, decisions: decisions }, String(input.reason || 'Instructor approved roster'), actor, ss);
  return getRosterReviewInternal_(version.roster_version_id, ss, '');
}

function correctRosterEntry(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const reason = String(input.reason || '').trim();
  const studentId = String(input.studentId || '').trim();
  const parsedName = String(input.parsedName || '').replace(/\s+/g, ' ').trim();
  const rawRemark = String(input.rawRemark || '').trim();
  if (!reason) throw new Error('A correction reason is required.');
  if (!/^\d{8,13}(?:-\d)?$/.test(studentId)) throw new Error('Student ID format is invalid.');
  if (!parsedName) throw new Error('Student name is required.');
  const ss = openDatabase_();
  const entry = findObjectBy_('roster_entries', 'roster_entry_id', input.rosterEntryId, ss);
  if (!entry) throw new Error('Roster entry not found.');
  const version = findObjectBy_('roster_versions', 'roster_version_id', entry.roster_version_id, ss);
  if (!version || version.approved_at) throw new Error('Approved roster entries are immutable.');
  const explicitW = /ถอนวิชา\s*\(?W\)?/i.test(rawRemark) || /\(W\)/i.test(rawRemark);
  const changed = updateObjectByKey_('roster_entries', 'roster_entry_id', entry.roster_entry_id, {
    student_id: studentId,
    parsed_name: parsedName,
    raw_remark: rawRemark,
    parsed_status: explicitW ? 'WITHDRAWN_PROPOSED' : 'ACTIVE_PROPOSED',
    confidence_flag: ''
  }, ss);
  writeAudit_('roster_entry', entry.roster_entry_id, 'MANUAL_CORRECTION', changed.before, changed.after, reason, actor, ss);
  return getRosterReviewInternal_(entry.roster_version_id, ss, '');
}

function addStudentAlias(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const studentId = String(input.studentId || '').trim();
  const aliasValue = String(input.aliasValue || '').trim();
  const kind = String(input.kind || 'OTHER').trim().toUpperCase();
  const scope = String(input.scope || 'GLOBAL').trim();
  if (!studentId || !aliasValue) throw new Error('Student ID and alias are required.');
  const ss = openDatabase_();
  if (!findObjectBy_('students', 'student_id', studentId, ss)) throw new Error('Student must be approved before adding an alias.');
  const duplicate = listObjects_('student_aliases', ss).some(function(row) {
    return row.student_id === studentId && normalizeName_(row.alias_value) === normalizeName_(aliasValue) && row.scope === scope;
  });
  if (duplicate) throw new Error('This confirmed alias already exists.');
  const record = { alias_id: newUuid_(), student_id: studentId, kind: kind, alias_value: aliasValue, confirmed_by: actor, confirmed_at: nowIso_(), scope: scope };
  appendObjects_('student_aliases', [record], ss);
  writeAudit_('student_alias', record.alias_id, 'CONFIRM', null, record, 'Instructor-confirmed alias', actor, ss);
  return record;
}

function upsertStudentFromRoster_(entry, actor, ss) {
  const existing = findObjectBy_('students', 'student_id', entry.student_id, ss);
  if (!existing) {
    appendObjects_('students', [{ student_id: entry.student_id, official_name_th: entry.parsed_name, official_name_en_nullable: '', metadata: JSON.stringify({ source: 'ROSTER', confirmedBy: actor }) }], ss);
    writeAudit_('student', entry.student_id, 'CREATE', null, { officialName: entry.parsed_name }, 'Approved roster identity', actor, ss);
  } else if (normalizeName_(existing.official_name_th) !== normalizeName_(entry.parsed_name)) {
    writeAudit_('student', entry.student_id, 'NAME_DIFFERENCE_REVIEW', existing, { parsedName: entry.parsed_name }, 'Roster name differs; official name not overwritten', actor, ss);
  }
}

function upsertEnrollmentStatus_(offeringId, studentId, status, actor, ss, reason) {
  const existing = listObjects_('enrollments', ss).find(function(row) { return row.offering_id === offeringId && String(row.student_id) === String(studentId); });
  const changes = { registration_status: status, status_verified_by: actor, status_verified_at: nowIso_() };
  if (!existing) {
    const record = Object.assign({ enrollment_id: newUuid_(), offering_id: offeringId, student_id: studentId }, changes);
    appendObjects_('enrollments', [record], ss);
    writeAudit_('enrollment', record.enrollment_id, 'CREATE', null, record, reason, actor, ss);
  } else if (existing.registration_status !== status) {
    const changed = updateObjectByKey_('enrollments', 'enrollment_id', existing.enrollment_id, changes, ss);
    writeAudit_('enrollment', existing.enrollment_id, 'STATUS_CHANGE', changed.before, changed.after, reason, actor, ss);
  }
}

function getOfferingContext_(offeringId, ss) {
  const offering = findObjectBy_('course_offerings', 'offering_id', offeringId, ss);
  if (!offering) throw new Error('Course offering not found.');
  const semester = findObjectBy_('semesters', 'semester_id', offering.semester_id, ss);
  const course = findObjectBy_('courses', 'course_id', offering.course_id, ss);
  if (!semester || !course) throw new Error('Course offering references incomplete data.');
  return { offering: offering, semester: semester, course: course };
}

function extractPdfText_(blob) {
  let convertedId = '';
  try {
    const converted = Drive.Files.create({ name: 'TEMP_ROSTER_OCR_' + newUuid_(), mimeType: 'application/vnd.google-apps.document' }, blob, { fields: 'id' });
    convertedId = converted.id;
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const text = DocumentApp.openById(convertedId).getBody().getText();
        if (text) return text;
        lastError = new Error('Converted document contains no text.');
      } catch (error) {
        lastError = error;
      }
      if (attempt < 4) Utilities.sleep(Math.min(4000, 500 * Math.pow(2, attempt)));
    }
    throw lastError || new Error('Unable to read converted roster document.');
  } finally {
    if (convertedId) DriveApp.getFileById(convertedId).setTrashed(true);
  }
}

function parseRosterText_(text) {
  const rows = [];
  const pages = String(text || '').split('\f');
  pages.forEach(function(page, pageIndex) {
    const lines = page.split(/\r?\n/).map(function(rawLine) { return rawLine.replace(/\s+/g, ' ').trim(); });
    lines.forEach(function(line, lineIndex) {
      const match = line.match(/(?:^|\s)(\d{8,13}(?:-\d)?)(?=\s|$)/);
      if (!match) return;
      const studentId = match[1];
      const sameLine = line.slice(match.index + match[0].length).trim();
      const segment = [sameLine];
      for (let next = lineIndex + 1; next < lines.length; next += 1) {
        if (/(?:^|\s)\d{8,13}(?:-\d)?(?=\s|$)/.test(lines[next])) break;
        if (lines[next]) segment.push(lines[next]);
        if (segment.length >= 20) break;
      }
      const segmentText = segment.join(' ').trim();
      const explicitW = /ถอนวิชา\s*\(?W\)?/i.test(segmentText) || /\(W\)/i.test(segmentText);
      const rawRemark = explicitW ? (segmentText.match(/ถอนวิชา\s*\(?W\)?|\(W\)/i) || ['W'])[0] : '';
      const parsedName = extractRosterName_(segment);
      rows.push({
        rowNumber: lineIndex + 1, studentId: studentId, parsedName: parsedName,
        rawRemark: rawRemark, parsedStatus: explicitW ? 'WITHDRAWN_PROPOSED' : 'ACTIVE_PROPOSED',
        pageNumber: pageIndex + 1, confidenceFlag: parsedName ? '' : 'REVIEW_REQUIRED:MISSING_NAME'
      });
    });
  });
  const counts = rows.reduce(function(map, row) { map[row.studentId] = (map[row.studentId] || 0) + 1; return map; }, {});
  rows.forEach(function(row) {
    if (counts[row.studentId] > 1) row.confidenceFlag = 'REVIEW_REQUIRED:DUPLICATE_ID';
  });
  return rows;
}

function extractRosterName_(segments) {
  const cleaned = (segments || []).map(function(value) {
    return String(value || '').replace(/ถอนวิชา\s*\(?W\)?|\(W\)/ig, '').replace(/\s+(?:active|enrolled)$/i, '').trim();
  }).filter(Boolean);
  const titled = cleaned.find(function(value) {
    return /^(?:นาย|นางสาว|นาง|เด็กชาย|เด็กหญิง|Mr\.?|Mrs\.?|Miss\.?|Ms\.?)\s*/i.test(value);
  });
  if (titled) return titled;
  return cleaned.find(function(value) {
    if (/^\d+$/.test(value) || value.length < 3) return false;
    if (/^(?:เดือน|วันที่|คาบ|ลำดับ|หน้าที่|หมายเหตุ)/.test(value)) return false;
    return /^[\p{L}.' -]+$/u.test(value) && value.split(/\s+/).length >= 2;
  }) || '';
}

function decodeUpload_(base64Data) {
  const value = String(base64Data || '');
  const payload = value.indexOf(',') >= 0 ? value.slice(value.indexOf(',') + 1) : value;
  try { return Utilities.base64Decode(payload); } catch (error) { throw new Error('Invalid file encoding.'); }
}

function sha256Hex_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes).map(function(value) {
    return ('0' + ((value + 256) % 256).toString(16)).slice(-2);
  }).join('');
}

function sanitizeUploadFilename_(value) {
  const filename = String(value || '').split(/[\\/]/).pop().replace(/[^\p{L}\p{N}._ -]/gu, '_').trim();
  if (!filename || filename === '.' || filename === '..') throw new Error('Filename is required.');
  return filename.slice(0, 160);
}

function normalizeName_(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s.,'"()-]+/g, '');
}
