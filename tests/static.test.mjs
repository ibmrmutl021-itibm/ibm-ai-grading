import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const files = await readdir(new URL('../', import.meta.url));
const required = ['Code.gs','Config.gs','Auth.gs','Schema.gs','SheetsRepo.gs','DriveRepo.gs','CourseService.gs','Initializer.gs','AuditService.gs','Index.html','TestSuite.gs','appsscript.json'];
required.forEach(file => assert.ok(files.includes(file), `missing ${file}`));

const schema = await readFile(new URL('../Schema.gs', import.meta.url), 'utf8');
const expectedSheets = ['semesters','courses','course_offerings','students','enrollments','roster_versions','roster_entries','student_aliases','assessments','rubric_versions','submissions','import_batches','import_rows','grading_jobs','grading_results','gradebook_entries','audit_log','settings'];
expectedSheets.forEach(name => assert.match(schema, new RegExp(`\\b${name}:`), `missing schema ${name}`));

const manifest = JSON.parse(await readFile(new URL('../appsscript.json', import.meta.url), 'utf8'));
assert.equal(manifest.runtimeVersion, 'V8');
assert.equal(manifest.webapp.executeAs, 'USER_DEPLOYING');

for (const file of files.filter(file => file.endsWith('.gs'))) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(source), `syntax error in ${file}`);
}

const allSource = await Promise.all(files.filter(file => /\.(gs|html|json)$/.test(file)).map(file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
assert.ok(!allSource.some(source => /(?:api[_-]?key|secret)\s*[:=]\s*["'][^"']+["']/i.test(source)), 'possible hard-coded credential');
console.log(`Build 0 static checks passed (${required.length} files, ${expectedSheets.length} sheets).`);

