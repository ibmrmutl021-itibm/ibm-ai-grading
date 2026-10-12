function matchImportedIdentity_(offeringId, identity, spreadsheet) {
  const ss = spreadsheet || openDatabase_();
  const enrollments = listObjects_('enrollments', ss).filter(function(row) { return row.offering_id === offeringId; });
  const enrolledIds = new Set(enrollments.map(function(row) { return String(row.student_id); }));
  const students = listObjects_('students', ss).filter(function(row) { return enrolledIds.has(String(row.student_id)); });
  const studentsById = Object.fromEntries(students.map(function(row) { return [String(row.student_id), row]; }));
  const rawId = String(identity.studentId || '').trim();
  if (/^\d{8,13}(?:-\d)?$/.test(rawId) && studentsById[rawId]) {
    return matchResult_('MATCHED_EXACT_ID', rawId, 'Validated exact Student ID in selected offering', []);
  }

  const aliases = listObjects_('student_aliases', ss).filter(function(row) {
    return enrolledIds.has(String(row.student_id)) && (row.scope === 'GLOBAL' || row.scope === offeringId);
  });
  const probes = [identity.email, identity.name].filter(Boolean).map(normalizeIdentityValue_);
  const aliasMatches = Array.from(new Set(aliases.filter(function(row) {
    return probes.indexOf(normalizeIdentityValue_(row.alias_value)) >= 0;
  }).map(function(row) { return String(row.student_id); })));
  if (aliasMatches.length === 1) return matchResult_('MATCHED_ALIAS', aliasMatches[0], 'Instructor-confirmed alias', []);
  if (aliasMatches.length > 1) return matchResult_('CONFLICT', '', 'Alias resolves to multiple students in this offering', aliasMatches.map(function(id) { return candidate_(studentsById[id], 1); }));

  const normalizedName = normalizeName_(identity.name);
  const exactNameMatches = students.filter(function(student) {
    return normalizedName && [student.official_name_th, student.official_name_en_nullable].some(function(name) { return normalizeName_(name) === normalizedName; });
  });
  if (exactNameMatches.length === 1) return matchResult_('MATCHED_EXACT_NAME', String(exactNameMatches[0].student_id), 'Unique exact normalized name in selected offering', []);
  if (exactNameMatches.length > 1) return matchResult_('CONFLICT', '', 'Name matches multiple students in this offering', exactNameMatches.map(function(student) { return candidate_(student, 1); }));

  const suggestions = students.map(function(student) {
    const names = [student.official_name_th, student.official_name_en_nullable].filter(Boolean);
    const score = names.reduce(function(best, name) { return Math.max(best, nameSimilarity_(normalizedName, normalizeName_(name))); }, 0);
    return candidate_(student, score);
  }).filter(function(candidate) { return candidate.score >= 0.72; })
    .sort(function(a, b) { return b.score - a.score; }).slice(0, 3);
  if (suggestions.length) return matchResult_('SUGGESTED', suggestions[0].studentId, 'Fuzzy name suggestion requires instructor confirmation; never accepted across languages automatically', suggestions);
  return matchResult_('UNMATCHED', '', 'No identity match in selected offering', []);
}

function matchResult_(state, proposedStudentId, reason, candidates) {
  return { state: state, proposedStudentId: proposedStudentId, reason: reason, candidates: candidates || [] };
}

function candidate_(student, score) {
  return { studentId: String(student.student_id), nameTh: student.official_name_th, nameEn: student.official_name_en_nullable, score: Math.round(score * 1000) / 1000 };
}

function normalizeIdentityValue_(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function nameSimilarity_(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshteinDistance_(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function levenshteinDistance_(left, right) {
  const previous = Array.from({ length: right.length + 1 }, function(_, index) { return index; });
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

