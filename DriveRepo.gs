const DRIVE_LAYOUT = Object.freeze([
  'rosters',
  'assessments',
  'submissions',
  'imports',
  'outputs',
  'audit'
]);

function ensureChildFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function initializeDrive_(rootFolder) {
  const root = rootFolder || DriveApp.getFolderById(getRequiredProperty_(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID));
  const folders = {};
  DRIVE_LAYOUT.forEach(function(name) {
    folders[name] = ensureChildFolder_(root, name).getId();
  });
  return { rootFolderId: root.getId(), folders: folders };
}

function createOfferingDriveLayout_(academicYear, term, courseCode, sectionCode) {
  const root = DriveApp.getFolderById(getRequiredProperty_(APP_CONFIG.PROPERTY_KEYS.ROOT_FOLDER_ID));
  const period = sanitizePathPart_(academicYear + '-' + term);
  const offering = sanitizePathPart_(courseCode + '-' + sectionCode);
  ['rosters', 'assessments', 'submissions', 'imports', 'outputs'].forEach(function(area) {
    const areaFolder = ensureChildFolder_(root, area);
    ensureChildFolder_(ensureChildFolder_(areaFolder, period), offering);
  });
}

function sanitizePathPart_(value) {
  const result = String(value || '').trim().replace(/[\\/:*?\"<>|]/g, '-');
  if (!result || result === '.' || result === '..') throw new Error('Invalid Drive path component.');
  return result.slice(0, 120);
}

