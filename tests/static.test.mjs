import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const files = await readdir(new URL('../', import.meta.url));
const required = ['Code.gs','Config.gs','Auth.gs','Schema.gs','SheetsRepo.gs','DriveRepo.gs','CourseService.gs','RosterService.gs','IdentityMatchService.gs','ImportService.gs','GradebookService.gs','ExportService.gs','Initializer.gs','AuditService.gs','Index.html','TestSuite.gs','appsscript.json'];
required.forEach(file => assert.ok(files.includes(file), `missing ${file}`));

const schema = await readFile(new URL('../Schema.gs', import.meta.url), 'utf8');
const expectedSheets = ['semesters','courses','course_offerings','students','enrollments','roster_versions','roster_entries','student_aliases','assessments','rubric_versions','submissions','import_batches','import_rows','grading_jobs','grading_results','gradebook_entries','audit_log','settings'];
expectedSheets.forEach(name => assert.match(schema, new RegExp(`\\b${name}:`), `missing schema ${name}`));

const manifest = JSON.parse(await readFile(new URL('../appsscript.json', import.meta.url), 'utf8'));
assert.equal(manifest.runtimeVersion, 'V8');
assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING');
assert.equal(manifest.executionApi.access, 'MYSELF');
assert.ok(manifest.dependencies.enabledAdvancedServices.some(service => service.userSymbol === 'Drive' && service.version === 'v3'));

for (const file of files.filter(file => file.endsWith('.gs'))) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(source), `syntax error in ${file}`);
}

const rosterSource = await readFile(new URL('../RosterService.gs', import.meta.url), 'utf8');
const rosterFns = new Function(`${rosterSource}; return { parseRosterText_, normalizeName_, sanitizeUploadFilename_ };`)();
const parsedRoster = rosterFns.parseRosterText_('1 68123456789 นายทดสอบ หนึ่ง\n2 68541206308-1 นางสาวทดสอบ สอง ถอนวิชา(W)');
assert.equal(parsedRoster.length, 2);
assert.equal(parsedRoster[0].studentId, '68123456789');
assert.equal(parsedRoster[1].parsedStatus, 'WITHDRAWN_PROPOSED');
assert.equal(rosterFns.normalizeName_('สมชาย  ใจดี'), rosterFns.normalizeName_('สมชายใจดี'));
assert.equal(rosterFns.sanitizeUploadFilename_('../../roster.pdf'), 'roster.pdf');
assert.throws(() => rosterFns.sanitizeUploadFilename_('../..'));
const roster41 = Array.from({length: 41}, (_, index) => `${index + 1} ${String(68000000001 + index)} นักศึกษาทดสอบ ${index + 1}`).join('\n');
assert.equal(rosterFns.parseRosterText_(roster41).length, 41);
const roster51 = Array.from({length: 51}, (_, index) => `${index + 1} ${index === 0 ? '68541206308-1' : String(69000000001 + index)} นักศึกษาทดสอบ ${index + 1}${index === 0 ? ' ถอนวิชา(W)' : ''}`).join('\n');
const parsed51 = rosterFns.parseRosterText_(roster51);
assert.equal(parsed51.length, 51);
assert.equal(parsed51.filter(row => row.parsedStatus === 'WITHDRAWN_PROPOSED').length, 1);

const importSource = await readFile(new URL('../ImportService.gs', import.meta.url), 'utf8');
const importFns = new Function(`${importSource}; return { parseImportedScore_, makeUniqueHeaders_ };`)();
assert.deepEqual(importFns.parseImportedScore_('', ''), { numericScore: null, state: 'MISSING' });
assert.deepEqual(importFns.parseImportedScore_('Viewed', ''), { numericScore: null, state: 'VIEWED' });
assert.deepEqual(importFns.parseImportedScore_('0', ''), { numericScore: 0, state: 'SCORE' });
assert.deepEqual(importFns.parseImportedScore_('', 'Unexpected'), { numericScore: null, state: 'REVIEW_REQUIRED' });
assert.deepEqual(importFns.makeUniqueHeaders_(['Name', 'Name', '']), ['Name', 'Name (2)', 'Column 3']);

const identitySource = await readFile(new URL('../IdentityMatchService.gs', import.meta.url), 'utf8');
const identityFns = new Function(`${identitySource}; return { nameSimilarity_, levenshteinDistance_ };`)();
assert.equal(identityFns.levenshteinDistance_('kitten', 'sitting'), 3);
assert.equal(identityFns.nameSimilarity_('สมชาย', 'สมชาย'), 1);

const exportSource = await readFile(new URL('../ExportService.gs', import.meta.url), 'utf8');
const exportFns = new Function(`${exportSource}; return { csvEscape_ };`)();
assert.equal(exportFns.csvEscape_('a,"b"'), '"a,""b"""');
assert.equal(exportFns.csvEscape_('=1+1'), "'=1+1");

const allSource = await Promise.all(files.filter(file => /\.(gs|html|json)$/.test(file)).map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
assert.ok(!allSource.some(source => /(?:api[_-]?key|secret)\s*[:=]\s*["'][^"']+["']/i.test(source)), 'possible hard-coded credential');
const html = await readFile(new URL('../Index.html', import.meta.url), 'utf8');
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(inlineScript, 'missing UI script');
assert.doesNotThrow(() => new Function(inlineScript[1]), 'syntax error in Index.html script');
const codeSource = await readFile(new URL('../Code.gs', import.meta.url), 'utf8');
assert.match(codeSource, /function initializeApplicationStorage\s*\(/);
console.log(`Build 2 static checks passed (${required.length} files, ${expectedSheets.length} sheets, roster and score fixtures).`);

