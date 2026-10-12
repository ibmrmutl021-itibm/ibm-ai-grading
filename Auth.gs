function isAuthorizedEmail_(actualEmail, allowedEmail) {
  const actual = normalizeEmail_(actualEmail);
  const allowed = normalizeEmail_(allowedEmail);
  return Boolean(actual && allowed && actual === allowed);
}

function requireInstructor_() {
  const actual = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!actual) throw new Error('UNAUTHORIZED: A signed-in Google account with visible email is required.');
  const props = getScriptProperties_();
  const key = APP_CONFIG.PROPERTY_KEYS.INSTRUCTOR_EMAIL;
  let allowed = normalizeEmail_(props.getProperty(key));
  if (!allowed) {
    try {
      const owner = normalizeEmail_(DriveApp.getFileById(ScriptApp.getScriptId()).getOwner().getEmail());
      if (owner && actual === owner) {
        props.setProperty(key, owner);
        allowed = owner;
      }
    } catch (error) {
      allowed = '';
    }
  }
  if (!isAuthorizedEmail_(actual, allowed)) {
    throw new Error('UNAUTHORIZED: This application is restricted to the configured instructor.');
  }
  return actual;
}

function getCurrentActor_() {
  return requireInstructor_();
}

