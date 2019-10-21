angular.module('xm.options-provider', ['xm.glide-ajax', 'xm.location-service'])
  .service('OptionsProvider', function(GlideAjax, LocationService) {
    var options = {

      // xm hosted
      hosted_conference_bridges: [],

      // engage query
      engage_workflow_query: [],

      // notiy types
      notification_types: [],
      notification_types_to_display_date_time: [],

      // external conf
      external_conference_bridges: [],

      // meeting builder
      meeting_builder_enable: [],
      meeting_builder_type: [],

      // if dynamic meeting builder
      dynamic_meeting_builder_ext_conf_bridge: [],
      dynamic_meeting_builder_url: [],
      dynamic_meeting_builder_profile: [],

      // misc.
      xm_conf_bridge_enable: [],
      legal_statement: []
    };

    var buildOption = function(value, translationPrefix) {
      return {
        value: value,
        label: (translationPrefix) ? translationPrefix + '.' + value : value
      };
    };

    var buildActiveBridgeOption = function(bridge) {
      return {
        value: bridge.bridgeId,
        label: bridge.bridgeId + ' - Started ' + moment(bridge.startTime).fromNow(),
      };
    };

    // xMatters hosted bridges
    options.hosted_conference_bridges.push(buildOption('Hosted_New', 'ENGAGE_XM.OPTIONS.CONFERENCE_BRIDGE'));

    var activeBridges = new GlideAjax('xMattersAjaxEngageWorkflow');
    activeBridges.addParam('sysparm_name', 'getActiveHostedConferenceBridges');
    activeBridges.addParam('incident_id', LocationService.searchParams.incident_id);
    activeBridges.send().then(function(resp) {
      if (resp && resp.success && resp.data && Array.isArray(resp.data)) {
        for (var i = 0; i < resp.data.length; i++) {
          options.hosted_conference_bridges.push(buildActiveBridgeOption(resp.data[i]));
        }
      }
    });

    var engageTypeQuery = new GlideAjax('xMattersAjaxEngageWorkflow');
    engageTypeQuery.addParam('sysparm_name', 'getEngageWorkflowQuery');
    engageTypeQuery.send().then(function(resp) {
      if (resp.success) {
        options.engage_workflow_query.push(buildOption(resp.data));
      }
    });

    // notification types
    var notificationTypes = new GlideAjax('xMattersAjaxEngageWorkflow');
    notificationTypes.addParam('sysparm_name', 'getNotificationTypes');
    notificationTypes.send().then(function(resp) {
      if (resp.success) {
        var types = resp.data.split(';');
        for (var i = 0; i < types.length; i++) {
          if (types[i].trim().length > 0) {
            options.notification_types.push(buildOption(types[i].trim()));
          }
        }
      }
    });

    // notification types to display Date Time
    var notificationTypesToDisplayDateTime = new GlideAjax('xMattersAjaxEngageWorkflow');
    notificationTypesToDisplayDateTime.addParam('sysparm_name', 'getNotificationTypesToDisplayDateTime');
    notificationTypesToDisplayDateTime.send().then(function(resp) {
      if (resp.success) {
        var dateTimeTypes = resp.data.split(';');
        for (var i = 0; i < dateTimeTypes.length; i++) {
          if (dateTimeTypes[i].trim().length > 0) {
            options.notification_types_to_display_date_time.push(buildOption(dateTimeTypes[i].trim()));
          }
        }
      }
    });

    // External bridges
    var retrieveBridges = new GlideAjax('xMattersAjaxEngageWorkflow');
    retrieveBridges.addParam('sysparm_name', 'getExternalConferenceBridges');
    retrieveBridges.send().then(function(resp) {
      if (resp.success) {
        var confBridges = resp.data.split(';');
        for (var i = 0; i < confBridges.length; i++) {
          if (confBridges[i].trim().length > 0) {
            options.external_conference_bridges.push(buildOption(confBridges[i].trim()));
          }
        }
      }
    });

    var meetingBuilderEnable = new GlideAjax('xMattersAjaxEngageWorkflow');
    meetingBuilderEnable.addParam('sysparm_name', 'getMeetingBuilderEnable');
    meetingBuilderEnable.send().then(function(resp) {
      if (resp.success) {
        options.meeting_builder_enable.push(buildOption(resp.data));
      }
    });

    var meetingBuilderType = new GlideAjax('xMattersAjaxEngageWorkflow');
    meetingBuilderType.addParam('sysparm_name', 'getMeetingBuilderType');
    meetingBuilderType.send().then(function(resp) {
      if (resp.success) {
        options.meeting_builder_type.push(buildOption(resp.data));
      }
    });

    var dynamicMeetingBuilderExternalConfBridge = new GlideAjax('xMattersAjaxEngageWorkflow');
    dynamicMeetingBuilderExternalConfBridge.addParam('sysparm_name', 'getDynamicMeetingBuilderExternalConfBridge');
    dynamicMeetingBuilderExternalConfBridge.send().then(function(resp) {
      if (resp.success) {
        options.dynamic_meeting_builder_ext_conf_bridge.push(buildOption(resp.data));
      }
    });

    var dynamicMeetingBuilderURL = new GlideAjax('xMattersAjaxEngageWorkflow');
    dynamicMeetingBuilderURL.addParam('sysparm_name', 'getDynamicMeetingBuilderURL');
    dynamicMeetingBuilderURL.send().then(function(resp) {
      if (resp.success) {
        options.dynamic_meeting_builder_url.push(buildOption(resp.data));
      }
    });

    var dynamicMeetingBuilderProfile = new GlideAjax('xMattersAjaxEngageWorkflow');
    dynamicMeetingBuilderProfile.addParam('sysparm_name', 'getMeetingBuilderDynamicProfile');
    dynamicMeetingBuilderProfile.send().then(function(resp) {
      if (resp.success) {
        options.dynamic_meeting_builder_profile.push(buildOption(resp.data));
      }
    });

    var xMConfBridgeEnable = new GlideAjax('xMattersAjaxEngageWorkflow');
    xMConfBridgeEnable.addParam('sysparm_name', 'getXMConfBridgeEnable');
    xMConfBridgeEnable.send().then(function(resp) {
      if (resp.success) {
        options.xm_conf_bridge_enable.push(buildOption(resp.data));
      }
    });

    var legalStatement = new GlideAjax('xMattersAjaxEngageWorkflow');
    legalStatement.addParam('sysparm_name', 'getLegalStatement');
    legalStatement.send().then(function(resp) {
      if (resp.success) {
        options.legal_statement.push(buildOption(resp.data));
      }
    });

    return options;
  });
