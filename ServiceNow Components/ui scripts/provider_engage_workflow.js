angular.module('xm.options-provider', ['xm.glide-ajax', 'xm.location-service'])
  .service('OptionsProvider', function(GlideAjax, LocationService) {
    var options = {

      // xm hosted //
      hosted_conference_bridges: [],

      // engage workflow configuration - getting all at once
      engage_workflow_config: {}
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

    var engageWorkflowConfig = new GlideAjax('xMattersAjaxEngageWorkflow');
    engageWorkflowConfig.addParam('sysparm_name', 'getEngageWorkflowConfig');
    engageWorkflowConfig.send().then(function(resp) {
      if (resp.success) {
        var data = resp.data;
        for (var i in data) {
          options.engage_workflow_config[String(i)] = String(data[i]);
        }

        // Should only execute the following if xMatters Conference Bridge is enabled
        if (options.engage_workflow_config.xm_conf_bridge_enable === "true") {

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
        }
      }
    });

    return options;
  });
