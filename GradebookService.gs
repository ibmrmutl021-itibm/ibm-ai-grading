const ACCEPTED_MATCH_STATES = Object.freeze(['MATCHED_EXACT_ID', 'MATCHED_ALIAS', 'MATCHED_EXACT_NAME', 'CONFIRMED']);
const CONFLICT_ACTIONS = Object.freeze(['SKIP', 'REPLACE_WITH_AUDIT', 'REVIEW_DIFF']);

function commitScoreImport(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const resolutions = input.resolutions || {};
  const ss = openDatabase_();
  const review = getImportReviewInternal_(input.batchId, ss);
  if (review.batch.status !== 'PREVIEW_READY') throw new Error('Import batch is not ready to commit.');
  const assessments = Object.fromEntries(listObjects_('assessments', ss).map(function(row) { return [row.assessment_id, row]; }));
  const existingGrades = listObjects_('gradebook_entries', ss);
  const plannedKeys = new Set();
  const actions = review.rows.map(function(row) {
    const requested = String(resolutions[row.import_row_id] || '');
    if (ACCEPTED_MATCH_STATES.indexOf(row.match_state) < 0) {
      if (requested === 'SKIP' || requested === 'REVIEW_DIFF') return { kind: requested, row: row };
      throw new Error('Identity mapping requires review on source row ' + row.original_row_ref);
    }
    const assessment = assessments[row.parsed.assessmentId];
    if (!assessment || assessment.offering_id !== review.batch.offering_id) throw new Error('Assessment is outside the selected offering.');
    if (row.parsed.scoreState === 'REVIEW_REQUIRED') {
      if (requested === 'SKIP' || requested === 'REVIEW_DIFF') return { kind: requested, row: row };
      throw new Error('Unrecognized score/status requires review on source row ' + row.original_row_ref);
    }
    if (row.parsed.numericScore !== null && (row.parsed.numericScore < 0 || row.parsed.numericScore > Number(assessment.maximum_score))) {
      if (requested === 'SKIP' || requested === 'REVIEW_DIFF') return { kind: requested, row: row };
      throw new Error('Score is outside assessment bounds on source row ' + row.original_row_ref);
    }
    const uniqueKey = review.batch.offering_id + '|' + row.parsed.assessmentId + '|' + row.proposed_student_id;
    if (plannedKeys.has(uniqueKey)) {
      if (requested === 'SKIP' || requested === 'REVIEW_DIFF') return { kind: requested, row: row };
      throw new Error('Duplicate student/assessment inside this batch on source row ' + row.original_row_ref);
    }
    plannedKeys.add(uniqueKey);
    const existing = existingGrades.find(function(grade) {
      return grade.offering_id === review.batch.offering_id && grade.assessment_id === row.parsed.assessmentId && String(grade.student_id) === String(row.proposed_student_id);
    });
    if (existing) {
      if (CONFLICT_ACTIONS.indexOf(requested) < 0) throw new Error('Choose SKIP, REPLACE_WITH_AUDIT, or REVIEW_DIFF for conflicting row ' + row.original_row_ref);
      return { kind: requested, row: row, existing: existing };
    }
    return { kind: 'CREATE', row: row };
  });

  let created = 0; let replaced = 0; let skipped = 0;
  actions.forEach(function(action) {
    if (action.kind === 'SKIP' || action.kind === 'REVIEW_DIFF') { skipped += 1; return; }
    const row = action.row;
    const changes = {
      approved_score_nullable: row.parsed.numericScore === null ? '' : row.parsed.numericScore,
      score_state: row.parsed.numericScore === null ? row.parsed.scoreState : 'IMPORTED_PENDING_APPROVAL',
      result_id_nullable: '', batch_id_nullable: review.batch.batch_id, approved_at: ''
    };
    if (action.kind === 'CREATE') {
      const record = Object.assign({
        entry_id: newUuid_(), offering_id: review.batch.offering_id, assessment_id: row.parsed.assessmentId,
        student_id: row.proposed_student_id
      }, changes);
      appendObjects_('gradebook_entries', [record], ss);
      writeAudit_('gradebook_entry', record.entry_id, 'IMPORT_CREATE', null, record, 'Committed from import row ' + row.import_row_id, actor, ss);
      created += 1;
    } else {
      const changed = updateObjectByKey_('gradebook_entries', 'entry_id', action.existing.entry_id, changes, ss);
      writeAudit_('gradebook_entry', action.existing.entry_id, 'REPLACE_WITH_AUDIT', changed.before, changed.after, 'Replaced from import row ' + row.import_row_id, actor, ss);
      replaced += 1;
    }
  });
  const status = skipped ? 'COMMITTED_WITH_REVIEW' : 'COMMITTED';
  updateObjectByKey_('import_batches', 'batch_id', review.batch.batch_id, { status: status }, ss);
  writeAudit_('import_batch', review.batch.batch_id, 'COMMIT', review.batch, { status: status, created: created, replaced: replaced, skipped: skipped }, String(input.reason || 'Instructor committed score import'), actor, ss);
  return { batchId: review.batch.batch_id, status: status, created: created, replaced: replaced, skipped: skipped };
}

function rollbackScoreImport(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('Rollback reason is required.');
  const ss = openDatabase_();
  const batch = findObjectBy_('import_batches', 'batch_id', input.batchId, ss);
  if (!batch || ['COMMITTED', 'COMMITTED_WITH_REVIEW'].indexOf(batch.status) < 0) throw new Error('Only a committed batch can be rolled back.');
  const audits = listObjects_('audit_log', ss);
  const grades = listObjects_('gradebook_entries', ss).filter(function(row) { return row.batch_id_nullable === batch.batch_id; });
  grades.forEach(function(grade) {
    const replacementAudit = audits.slice().reverse().find(function(audit) {
      if (audit.entity !== 'gradebook_entry' || audit.entity_id !== grade.entry_id || audit.action !== 'REPLACE_WITH_AUDIT') return false;
      try { return JSON.parse(audit.after_json || '{}').batch_id_nullable === batch.batch_id; } catch (error) { return false; }
    });
    if (replacementAudit) {
      const before = JSON.parse(replacementAudit.before_json);
      const fields = {}; SHEET_SCHEMA.gradebook_entries.forEach(function(field) { if (field !== 'entry_id') fields[field] = before[field]; });
      const restored = updateObjectByKey_('gradebook_entries', 'entry_id', grade.entry_id, fields, ss);
      writeAudit_('gradebook_entry', grade.entry_id, 'ROLLBACK_RESTORE', restored.before, restored.after, reason, actor, ss);
    } else {
      const changed = updateObjectByKey_('gradebook_entries', 'entry_id', grade.entry_id, { approved_score_nullable: '', score_state: 'ROLLED_BACK', approved_at: '' }, ss);
      writeAudit_('gradebook_entry', grade.entry_id, 'ROLLBACK_VOID', changed.before, changed.after, reason, actor, ss);
    }
  });
  updateObjectByKey_('import_batches', 'batch_id', batch.batch_id, { status: 'ROLLED_BACK' }, ss);
  writeAudit_('import_batch', batch.batch_id, 'ROLLBACK', batch, { status: 'ROLLED_BACK', affectedEntries: grades.length }, reason, actor, ss);
  return { batchId: batch.batch_id, status: 'ROLLED_BACK', affectedEntries: grades.length };
}

function getGradebook(offeringId) {
  requireInstructor_();
  const ss = openDatabase_();
  getOfferingContext_(offeringId, ss);
  return {
    assessments: listObjects_('assessments', ss).filter(function(row) { return row.offering_id === offeringId; }),
    entries: listObjects_('gradebook_entries', ss).filter(function(row) { return row.offering_id === offeringId && row.score_state !== 'ROLLED_BACK'; })
  };
}

