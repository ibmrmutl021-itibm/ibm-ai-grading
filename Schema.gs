const SHEET_SCHEMA = Object.freeze({
  semesters: ['semester_id', 'academic_year', 'term', 'label', 'is_active'],
  courses: ['course_id', 'course_code', 'name_th', 'name_en', 'credits'],
  course_offerings: ['offering_id', 'semester_id', 'course_id', 'section_code', 'instructor_id', 'status'],
  students: ['student_id', 'official_name_th', 'official_name_en_nullable', 'metadata'],
  enrollments: ['enrollment_id', 'offering_id', 'student_id', 'registration_status', 'status_verified_by', 'status_verified_at'],
  roster_versions: ['roster_version_id', 'offering_id', 'roster_type', 'document_date', 'uploaded_at', 'source_file_id', 'approved_at'],
  roster_entries: ['roster_entry_id', 'roster_version_id', 'row_number', 'student_id', 'parsed_name', 'raw_remark', 'parsed_status', 'page_number', 'confidence_flag'],
  student_aliases: ['alias_id', 'student_id', 'kind', 'alias_value', 'confirmed_by', 'confirmed_at', 'scope'],
  assessments: ['assessment_id', 'offering_id', 'name', 'type', 'maximum_score', 'weight', 'status', 'current_rubric_version_id'],
  rubric_versions: ['rubric_version_id', 'assessment_id', 'version', 'key_or_rubric_json', 'max_score', 'approved_at', 'locked'],
  submissions: ['submission_id', 'assessment_id', 'student_id_nullable', 'group_id_nullable', 'file_id', 'source', 'version', 'submitted_at', 'state'],
  import_batches: ['batch_id', 'offering_id', 'assessment_id_nullable', 'import_type', 'source_file_id', 'sha256', 'parser_version', 'status', 'created_at'],
  import_rows: ['import_row_id', 'batch_id', 'original_row_ref', 'raw_identity', 'raw_score', 'raw_status', 'proposed_student_id', 'match_state', 'parsed_json'],
  grading_jobs: ['job_id', 'assessment_id', 'rubric_version_id', 'started_at', 'status', 'total', 'completed', 'failed', 'last_error'],
  grading_results: ['result_id', 'submission_id', 'job_id', 'rubric_version_id', 'ai_scores_json', 'explanation_json', 'ai_total', 'review_state'],
  gradebook_entries: ['entry_id', 'offering_id', 'assessment_id', 'student_id', 'approved_score_nullable', 'score_state', 'result_id_nullable', 'batch_id_nullable', 'approved_at'],
  audit_log: ['audit_id', 'entity', 'entity_id', 'action', 'actor', 'at', 'before_json', 'after_json', 'reason'],
  settings: ['key', 'value_json']
});

function validateSchemaDefinition_() {
  const names = Object.keys(SHEET_SCHEMA);
  if (!names.length) throw new Error('Schema must define at least one sheet.');
  names.forEach(function(name) {
    const headers = SHEET_SCHEMA[name];
    if (!headers.length || new Set(headers).size !== headers.length) {
      throw new Error('Invalid or duplicate headers in sheet: ' + name);
    }
  });
  return true;
}

