var xmEngage = {};

function xmEngageWorkflow() {
  var incidentId = g_form.getUniqueValue();
  xmEngage.incident = incidentId;
  var tableName = g_form.getTableName();

  var dialog = new GlideDialogWindow('x_xma_xmatters_xm_engage_workflow');
  dialog.setTitle("");
  dialog.setPreference("sysparm_nostack", true);
  dialog.setPreference("sysparm_sysID", incidentId);
  dialog.setPreference("sysparm_table", tableName);
  dialog.render();
}
