function exportGradebookCsv(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const ss = openDatabase_();
  const context = getOfferingContext_(input.offeringId, ss);
  const rosterVersions = listObjects_('roster_versions', ss).filter(function(row) {
    return row.offering_id === input.offeringId && row.approved_at;
  }).sort(function(a, b) { return String(b.approved_at).localeCompare(String(a.approved_at)); });
  if (!rosterVersions.length) throw new Error('An approved roster is required for official-order export.');
  const roster = listObjects_('roster_entries', ss).filter(function(row) { return row.roster_version_id === rosterVersions[0].roster_version_id; })
    .sort(function(a, b) { return Number(a.row_number) - Number(b.row_number); });
  const enrollments = Object.fromEntries(listObjects_('enrollments', ss).filter(function(row) { return row.offering_id === input.offeringId; })
    .map(function(row) { return [String(row.student_id), row]; }));
  const assessments = listObjects_('assessments', ss).filter(function(row) { return row.offering_id === input.offeringId; });
  const grades = listObjects_('gradebook_entries', ss).filter(function(row) { return row.offering_id === input.offeringId && row.score_state !== 'ROLLED_BACK'; });
  const gradeMap = Object.fromEntries(grades.map(function(row) { return [row.assessment_id + '|' + row.student_id, row]; }));
  const includeActiveOnly = input.includeActiveOnly === true;
  const output = [['Student ID', 'Name', 'Enrollment Status'].concat(assessments.map(function(a) { return a.name; }))];
  roster.forEach(function(student) {
    const enrollment = enrollments[String(student.student_id)] || { registration_status: 'PENDING_VERIFICATION' };
    if (includeActiveOnly && enrollment.registration_status !== 'ACTIVE') return;
    const isWithdrawn = enrollment.registration_status === 'WITHDRAWN';
    output.push([student.student_id, student.parsed_name, enrollment.registration_status].concat(assessments.map(function(assessment) {
      if (isWithdrawn) return '';
      const grade = gradeMap[assessment.assessment_id + '|' + student.student_id];
      if (!grade) return '';
      return grade.approved_score_nullable === '' || grade.approved_score_nullable === null ? grade.score_state : grade.approved_score_nullable;
    })));
  });
  const csv = '\uFEFF' + output.map(function(row) { return row.map(csvEscape_).join(','); }).join('\r\n');
  const folders = createOfferingDriveLayout_(context.semester.academic_year, context.semester.term, context.course.course_code, context.offering.section_code);
  const filename = sanitizePathPart_(context.course.course_code + '-' + context.offering.section_code + '-gradebook-' + nowIso_().slice(0, 10)) + '.csv';
  const file = folders.outputs.createFile(Utilities.newBlob(csv, 'text/csv', filename));
  writeAudit_('gradebook_export', file.getId(), 'EXPORT_CSV', null, { offeringId: input.offeringId, filename: filename, rowCount: output.length - 1, includeActiveOnly: includeActiveOnly }, 'Instructor requested gradebook export', actor, ss);
  return { filename: filename, fileId: file.getId(), fileUrl: 'https://drive.google.com/open?id=' + encodeURIComponent(file.getId()), rowCount: output.length - 1 };
}

function csvEscape_(value) {
  let text = String(value === null || value === undefined ? '' : value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
