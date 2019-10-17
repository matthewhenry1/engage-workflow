/**
 * Configured settings for xMatters integration
 * @type {Object}
 */
var xMattersEngageWorkflowConfig = Class.create();

xMattersEngageWorkflowConfig.prototype = {

  initialize: function() {
    var prefix = gs.getCurrentScopeName(); // 'x_xma_xmatters'

    // enable engage type
    this.ENGAGE_WORKFLOW_ENABLED = gs.getProperty(prefix + '.engage_workflow_enable') == 'true';

    // query selector: xmatters or servicenow
    this.ENGAGE_WORKFLOW_QUERY = gs.getProperty(prefix + '.engage_workflow_query');

    // notification type lists
    this.ENGAGE_WORKFLOW_NOTIFICATION_TYPE_LIST = gs.getProperty(prefix + '.engage_workflow_notification_type_list');
    this.ENGAGE_WORKFLOW_NOTIFICATION_TYPE_DATE_TIME_LIST = gs.getProperty(prefix + '.engage_workflow_notification_type_with_date_time');

    // external conf bridges
    this.ENGAGE_WORKFLOW_EXTERNAL_CONF_BRIDGE_LIST = gs.getProperty(prefix + '.engage_workflow_external_conference_bridge_list');

    // meeting builder configuration
    this.ENGAGE_WORKFLOW_MEETING_BUILDER_ENABLE = gs.getProperty(prefix + '.engage_workflow_meeting_builder_enable');
    this.ENGAGE_WORKFLOW_MEETING_BUILDER_TYPE = gs.getProperty(prefix + '.engage_workflow_meeting_builder_type');

    // leverage for when dynamic is selected
    this.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_EXTERNAL_CONF_BRIDGE = gs.getProperty(prefix + '.engage_workflow_meeting_builder_dynamic_external_conf_bridge');
    this.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_URL = gs.getProperty(prefix + '.engage_workflow_meeting_builder_dynamic_url');
    this.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_PROFILE = gs.getProperty(prefix + '.engage_workflow_meeting_builder_dynamic_profile');

    //
    this.ENGAGE_WORKFLOW_XM_CONF_BRIDGE_ENABLE = gs.getProperty(prefix + '.engage_workflow_xm_conference_bridge_enable') == 'true';
    this.ENGAGE_WORKFLOW_LEGAL_STATEMENT = gs.getProperty(prefix + '.engage_workflow_legal_statement');
  },

  type: 'xMattersEngageWorkflowConfig'
};
