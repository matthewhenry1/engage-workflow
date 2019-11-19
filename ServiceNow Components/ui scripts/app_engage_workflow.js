var engageApp = angular.module('xm.engage-xm', ['ngTagsInput', 'ngMessages', 'pascalprecht.translate', 'xm.xmatters-service', 'xm.location-service', 'xm.options-provider', 'xm.glide-ajax', 'ui.bootstrap']);
// Global configuration for ng tags input module
engageApp.config(function(tagsInputConfigProvider) {
  tagsInputConfigProvider.setDefaults('tagsInput', {
    placeholder: 'Find Recipients',
    replaceSpacesWithDashes: false,
    addFromAutocompleteOnly: true,
    displayProperty: 'name',
    keyProperty: 'targetName'
  }).setDefaults('autoComplete', {
    debounceDelay: 250,
    displayProperty: 'name',
    minLength: 2
  });
});
// Configuration for translations
engageApp.config(function($translateProvider) {
  $translateProvider.translations('en', {
    ENGAGE_XM: {
      TITLE: 'Engage with xMatters',
      LABEL: {
        RECIPIENTS: 'Recipients',
        CONFERENCE_BRIDGE: 'Conference Bridge',
        MESSAGE: 'Message',
        TYPE: 'Type',
        DATE: 'Date',
        TIME: 'Time',
        PASSCODE: 'Passcode',
        MEETING_LINK: 'Meeting Link'
      },
      BUTTON: {
        SUBMIT: 'Submit',
        CANCEL: 'Cancel',
        VIEW_RECORD: 'View Record'
      },
      ERROR: {
        REQUIRED: 'Required field',
        MAX_LENGTH: 'Maximum length {{max_length}} characters'
      },
      MESSAGE: {
        SUCCESS: 'Your request has been submitted successfully. To track the progress of this request in ServiceNow, view the Engage with xMatters record.'
      },
      OPTIONS: {
        TYPE: {
          'None': '-- None --'
        },
        CONFERENCE_BRIDGE: {
          'None': '-- None --',
          'External_Category': 'External Bridges',
          'Hosted_Category': 'xMatters Hosted Bridges',
          'Hosted_New': 'Create new'
        },
        RECIPIENT_TYPE: {
          "people": "People",
          "groups": "Groups"
        }
      }
    }
  });
  $translateProvider.preferredLanguage('en');

});

engageApp.controller('engageCtlr',
  function($scope, $window, $translate, XMService, LocationService, OptionsProvider, GlideAjax, $sce) {

    // configs
    $scope.config = OptionsProvider.engage_workflow_config;

    // Core scope variables
    $scope.is_finished = false;
    $scope.is_invalid = false;
    $scope.global_errors = [];

    // form model scope variables and default values
    $scope.subject = '';
    $scope.message = '';
    $scope.recipients = [];
    $scope.conference_bridge = 'None';

    // notification types
    $scope.notification_types = function() {
      if ($scope.config.notification_types) {
        return $scope.config.notification_types.split(';');
      }
    };

    // List dropdown for the external conf bridges
    $scope.external_conference_bridge_options = function() {
      if ($scope.config.external_conference_bridge_options) {
        return $scope.config.external_conference_bridge_options.split(';');
      }
    };

    // 	More information on why the following primitives required a .value https://github.com/angular/angular.js/wiki/Understanding-Scopes
    $scope.meeting_link = {
      "value": ""
    };

    $scope.passcode = {
      "value": ""
    };

    // Date Required Data Start
    $scope.date_time = {
      "value": new Date()
    };

    $scope.dateOptions = {
      // if desired, set min and max selectable dates
      // 	//maxDate: new Date(),
      // 	//minDate: new Date()
    };
    $scope.openCalendarPopup = function() {
      $scope.calendarPopup.opened = true;
    };

    $scope.calendarPopup = {
      opened: false
    };
    // Date Required Data End

    // behind the scenes scope variables used for options/state
    $scope.xm_search_state = XMService.searchState;

    $scope.hosted_conference_bridge_options = OptionsProvider.hosted_conference_bridges;
    $scope.meeting_table = XMService.getMeetingLinkFromTable(g_user.userID);

    $scope.recipientTypes = [{
        "label": "ENGAGE_XM.OPTIONS.RECIPIENT_TYPE.people",
        "typeahead": XMService.searchPeople
      },
      {
        "label": "ENGAGE_XM.OPTIONS.RECIPIENT_TYPE.groups",
        "typeahead": XMService.searchGroups
      }
    ];

    // default...
    $scope.activeRecipientType = $scope.recipientTypes[0];

    // Set the sys id scope variable based on search parameters in the url
    $scope.parent_sys_id = LocationService.searchParams.sys_id;
    $scope.parent_table_name = LocationService.searchParams.table_name;

    if (typeof $scope.parent_sys_id === 'undefined' || $scope.parent_sys_id === null || $scope.parent_sys_id === '') {
      jslog('No sys_id identifier was defined');
      $scope.global_errors.push('Missing "sysparm_sysID" parameter: A valid ServiceNow Incident system id must be set to continue');
    }

    $scope.isExternalConferenceBridge = function(conference) {

      var isExternal = false;
      if ($scope.config.external_conference_bridge_options) {
        var external_conference_bridges = $scope.config.external_conference_bridge_options.split(';');
        for (var i = 0; i < external_conference_bridges.length; i++) {
          if (conference.toLowerCase() === external_conference_bridges[i].toLowerCase()) {
            isExternal = true;
          }
        }
      }

      return isExternal;
    };

    $scope.displayLegalStatement = function() {
      var trustedHTML = '';
      if ($scope.config.legal_statement) {
        trustedHTML = $sce.trustAsHtml($scope.config.legal_statement);
      }
      return trustedHTML;
    };

    $scope.updateMeetingFields = function(conference) {
      var clearFields = true;
      var matchForDynamic = (conference.toLowerCase() === $scope.config.dynamic_meeting_builder_ext_conf_bridge.toLowerCase());

      if ($scope.config.meeting_builder_enable == "true") {
        var meeting_builder_type = $scope.config.meeting_builder_type;
        // leverage the meeting link table
        if (meeting_builder_type == 'table') {
          if ($scope.meeting_table.$$state.value) {
            for (var i = 0; i < $scope.meeting_table.$$state.value.length; i++) {
              if ($scope.meeting_table.$$state.value[i].conference_bridge_name.toLowerCase() === conference.toLowerCase()) {
                $scope.passcode.value = $scope.meeting_table.$$state.value[i].passcode;
                $scope.meeting_link.value = $scope.meeting_table.$$state.value[i].meeting_url;
                clearFields = false;
                break;
              }
            }
          }
        } else if (meeting_builder_type == 'dynamic' && matchForDynamic) {

          var dynamic_meeting_builder_url = $scope.config.dynamic_meeting_builder_url;
          var dynamic_meeting_builder_profile = $scope.config.dynamic_meeting_builder_profile;

          if (dynamic_meeting_builder_profile == 'first_name.last_name') {
            $scope.meeting_link.value = dynamic_meeting_builder_url + g_user.firstName + '.' + g_user.lastName;
            clearFields = false;

          } else if (dynamic_meeting_builder_profile == 'user_name') {
            $scope.meeting_link.value = dynamic_meeting_builder_url + g_user.userName;
            clearFields = false;

          } else {
            $scope.meeting_link.value = dynamic_meeting_builder_url;
            clearFields = false;
          }
        }

        // Since the field changed we must clear the fields if no new value was set
        if (clearFields) {
          $scope.passcode.value = '';
          $scope.meeting_link.value = '';
        }

      }
    };

    $scope.displayDateTime = function(type) {
      var display = false;

      if (type !== '' && typeof type !== 'undefined') {
        var types_date_time = $scope.config.notification_types_to_display_date_time.split(';');
        for (var i = 0; i < types_date_time.length; i++) {
          if (type.toLowerCase() === types_date_time[i].toLowerCase()) {
            display = true;
          }
        }
      }

      return display;
    };

    $scope.displayXMConfBridge = function() {
      var display = false;
      if ($scope.config.xm_conf_bridge_enable) {
        if ($scope.config.xm_conf_bridge_enable === 'true') {

          display = true;
        }
      }

      return display;
    };

    $scope.selectRecipientType = function(selectedIndex) {
      $scope.activeRecipientType = $scope.recipientTypes[selectedIndex];
    };

    var closeDialog = function(optionalMessage) {
      var data = {
        type: "DIALOG_CLOSE"
      };
      if (optionalMessage) {
        data.message = optionalMessage;
      }
      $window.parent.postMessage(data, window.location.origin);
    };

    $scope.cancel = function() {
      closeDialog();
    };


    $scope.submit = function() {
      $scope.engageXMForm.$setSubmitted(true);
      if ($scope.engageXMForm.$invalid) {
        jslog('The form will not be submitted in an invalid state, error on Type field true/false: ' + JSON.stringify($scope.engageXMForm.type.$error));
        jslog('The form will not be submitted in an invalid state error on Recipients field true/false: ' + JSON.stringify($scope.engageXMForm.recipients.$error));
      } else {
        var recipientTargets = [];
        for (var i = 0; i < $scope.recipients.length; i++) {
          recipientTargets.push($scope.recipients[i].targetName);
        }

        var formData = {
          "recipients": recipientTargets.join(','),
          "subject": $scope.subject,
          "message": $scope.message,
          "conference_bridge": $scope.conference_bridge,
          "parent_sys_id": $scope.parent_sys_id,
          "parent_table_name": $scope.parent_table_name,
          "initiator_display_name": g_user.getFullName(),
          "initiator_username": g_user.userName,
          "type": $scope.type,
          "date_time": $scope.date_time.value,
          "meeting_link": $scope.meeting_link.value,
          "passcode": $scope.passcode.value
        };
		console.log("SUBMITTING -- " + JSON.stringify(formData) );
        var ga = new GlideAjax('xMattersAjaxEngageWorkflow');
        ga.addParam('sysparm_name', 'submitEngageWithXMatters');
        ga.addParam('form_data', JSON.stringify(formData));
        ga.send().then(function(resp) {
          if (resp.success) {
            $translate('ENGAGE_XM.MESSAGE.SUCCESS').then(function(successMsg) {
              closeDialog(successMsg);
            });
          } else {
            jslog(resp);
          }
        }).catch(function(resp) {
          jslog(resp);
        });
      }
    };
  });
