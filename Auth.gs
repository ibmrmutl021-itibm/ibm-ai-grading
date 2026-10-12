function isAuthorizedEmail_(actualEmail, allowedEmail) {
  const actual = normalizeEmail_(actualEmail);
  const allowed = normalizeEmail_(allowedEmail);
  return Boolean(actual && allowed && actual === allowed);
}

function requireInstructor_() {
  const actual = normalizeEmail_(Session.getActiveUser().getEmail());
  const allowed = normalizeEmail_(getRequiredProperty_(APP_CONFIG.PROPERTY_KEYS.INSTRUCTOR_EMAIL));
  if (!isAuthorizedEmail_(actual, allowed)) {
    throw new Error('UNAUTHORIZED: This application is restricted to the configured instructor.');
  }
  return actual;
}

function getCurrentActor_() {
  return requireInstructor_();
}

