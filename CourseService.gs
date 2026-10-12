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
  return createCourseOfferingInternal_(input, actor, openDatabase_());
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
  const semesters = listObjects_('semesters', ss);
  const courses = listObjects_('courses', ss);
  const offerings = listObjects_('course_offerings', ss);
  const semestersById = Object.fromEntries(semesters.map(function(row) { return [row.semester_id, row]; }));
  const coursesById = Object.fromEntries(courses.map(function(row) { return [row.course_id, row]; }));
  return offerings.map(function(row) {
    return Object.assign({}, row, {
      semester: semestersById[row.semester_id] || null,
      course: coursesById[row.course_id] || null
    });
  });
}

