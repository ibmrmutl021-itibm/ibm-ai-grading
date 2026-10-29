function validateOfferingInput_(input) {
  const value = input || {};
  const required = ['academicYear', 'term', 'semesterLabel', 'courseCode', 'nameTh', 'sectionCode'];
  required.forEach(function(field) {
    if (!String(value[field] || '').trim()) throw new Error('Missing required field: ' + field);
  });
  const credits = Number(value.credits);
  if (!Number.isFinite(credits) || credits < 0 || credits > 30) throw new Error('Credits must be between 0 and 30.');
  return {
    academicYear: String(value.academicYear).trim(),
    term: String(value.term).trim(),
    semesterLabel: String(value.semesterLabel).trim(),
    courseCode: String(value.courseCode).trim().toUpperCase(),
    nameTh: String(value.nameTh).trim(),
    nameEn: String(value.nameEn || '').trim(),
    credits: credits,
    sectionCode: String(value.sectionCode).trim(),
    defaultLanguage: ['th', 'en'].indexOf(value.defaultLanguage) >= 0 ? value.defaultLanguage : APP_CONFIG.DEFAULT_LANGUAGE
  };
}

function createCourseOffering(input) {
  const actor = requireInstructor_();
  const ss = openDatabase_();
  const ids = createCourseOfferingInternal_(input, actor, ss);
  return getCourseOfferingView_(ids.offeringId, ss);
}

function createCourseOfferingInternal_(input, actor, spreadsheet) {
  const data = validateOfferingInput_(input);
  const ids = { semesterId: newUuid_(), courseId: newUuid_(), offeringId: newUuid_() };
  appendObjects_('semesters', [{
    semester_id: ids.semesterId,
    academic_year: data.academicYear,
    term: data.term,
    label: data.semesterLabel,
    is_active: true
  }], spreadsheet);
  appendObjects_('courses', [{
    course_id: ids.courseId,
    course_code: data.courseCode,
    name_th: data.nameTh,
    name_en: data.nameEn,
    credits: data.credits
  }], spreadsheet);
  appendObjects_('course_offerings', [{
    offering_id: ids.offeringId,
    semester_id: ids.semesterId,
    course_id: ids.courseId,
    section_code: data.sectionCode,
    instructor_id: actor,
    status: 'ACTIVE'
  }], spreadsheet);
  writeAudit_('course_offering', ids.offeringId, 'CREATE', null, data, 'Build 0 course offering creation', actor, spreadsheet);
  return ids;
}

function listCourseOfferings() {
  requireInstructor_();
  const ss = openDatabase_();
  return listCourseOfferingViews_(ss, false);
}

function listCourseOfferingViews_(ss, includeArchived) {
  const semesters = listObjects_('semesters', ss);
  const courses = listObjects_('courses', ss);
  const offerings = listObjects_('course_offerings', ss);
  const semestersById = Object.fromEntries(semesters.map(function(row) { return [row.semester_id, row]; }));
  const coursesById = Object.fromEntries(courses.map(function(row) { return [row.course_id, row]; }));
  return offerings.filter(function(row) { return includeArchived || row.status !== 'ARCHIVED'; }).map(function(row) {
    const semester = semestersById[row.semester_id] || {};
    const course = coursesById[row.course_id] || {};
    return {
      offeringId: String(row.offering_id || ''), semesterId: String(row.semester_id || ''), courseId: String(row.course_id || ''),
      academicYear: String(semester.academic_year || ''), term: String(semester.term || ''), semesterLabel: String(semester.label || ''),
      courseCode: String(course.course_code || ''), nameTh: String(course.name_th || ''), nameEn: String(course.name_en || ''),
      credits: Number(course.credits || 0), sectionCode: String(row.section_code || ''), status: String(row.status || ''),
      instructorId: String(row.instructor_id || '')
    };
  });
}

function getCourseOfferingView_(offeringId, ss) {
  const view = listCourseOfferingViews_(ss, true).find(function(row) { return row.offeringId === offeringId; });
  if (!view) throw new Error('Course offering not found.');
  return view;
}

function updateCourseOffering(input) {
  const actor = requireInstructor_();
  const data = validateOfferingInput_(input);
  const offeringId = String((input || {}).offeringId || '').trim();
  if (!offeringId) throw new Error('Offering ID is required.');
  const ss = openDatabase_();
  const before = getCourseOfferingView_(offeringId, ss);
  if (before.status === 'ARCHIVED') throw new Error('Archived offering cannot be edited.');
  updateObjectByKey_('semesters', 'semester_id', before.semesterId, {
    academic_year: data.academicYear, term: data.term, label: data.semesterLabel
  }, ss);
  updateObjectByKey_('courses', 'course_id', before.courseId, {
    course_code: data.courseCode, name_th: data.nameTh, name_en: data.nameEn, credits: data.credits
  }, ss);
  updateObjectByKey_('course_offerings', 'offering_id', offeringId, {
    section_code: data.sectionCode
  }, ss);
  const after = getCourseOfferingView_(offeringId, ss);
  writeAudit_('course_offering', offeringId, 'UPDATE', before, after, String(input.reason || 'Instructor edited course offering'), actor, ss);
  return after;
}

function deleteCourseOffering(request) {
  const actor = requireInstructor_();
  const input = request || {};
  const offeringId = String(input.offeringId || '').trim();
  const reason = String(input.reason || '').trim();
  if (!offeringId) throw new Error('Offering ID is required.');
  if (!reason) throw new Error('Delete/archive reason is required.');
  const ss = openDatabase_();
  const before = getCourseOfferingView_(offeringId, ss);
  if (before.status === 'ARCHIVED') throw new Error('Course offering is already archived.');
  updateObjectByKey_('course_offerings', 'offering_id', offeringId, { status: 'ARCHIVED' }, ss);
  const after = getCourseOfferingView_(offeringId, ss);
  writeAudit_('course_offering', offeringId, 'ARCHIVE', before, after, reason, actor, ss);
  return { archived: true, offeringId: offeringId };
}

