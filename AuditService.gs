function writeAudit_(entity, entityId, action, beforeValue, afterValue, reason, actor, spreadsheet) {
  const record = {
    audit_id: newUuid_(),
    entity: entity,
    entity_id: entityId,
    action: action,
    actor: actor || getCurrentActor_(),
    at: nowIso_(),
    before_json: JSON.stringify(beforeValue === undefined ? null : beforeValue),
    after_json: JSON.stringify(afterValue === undefined ? null : afterValue),
    reason: String(reason || '')
  };
  appendObjects_('audit_log', [record], spreadsheet);
  return record.audit_id;
}

