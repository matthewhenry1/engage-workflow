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
        SUBJECT: 'Subject',
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
    // Core scope variables
    $scope.is_finished = false;
    $scope.is_invalid = false;
    $scope.global_errors = [];

    // form model scope variables and default values
    $scope.subject = '';
    $scope.message = '';
    $scope.recipients = [];
    $scope.conference_bridge = 'None';

    // 	More information on why the following primitives required a .value https://github.com/angular/angular.js/wiki/Understanding-Scopes
    $scope.meeting_link = {
      "value": ""
    };

    $scope.passcode = {
      "value": ""
    };

    $scope.legal_statement = '';

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


    // result scope variable
    $scope.engage_url = '';

    // behind the scenes scope variables used for options/state
    $scope.xm_search_state = XMService.searchState;
    $scope.hosted_conference_bridge_options = OptionsProvider.hosted_conference_bridges;

    // engage query
    $scope.engage_workflow_query = OptionsProvider.engage_workflow_query;

    // notify types
    $scope.notification_types = OptionsProvider.notification_types;
    $scope.notification_types_to_display_date_time = OptionsProvider.notification_types_to_display_date_time;

    // external conf
    $scope.external_conference_bridge_options = OptionsProvider.external_conference_bridges;

    // meeting builder
    $scope.meeting_builder_enable = OptionsProvider.meeting_builder_enable;

    $scope.meeting_builder_type = OptionsProvider.meeting_builder_type;

    // if dynamic meeting builder
    $scope.dynamic_meeting_builder_ext_conf_bridge = OptionsProvider.dynamic_meeting_builder_ext_conf_bridge;
    $scope.dynamic_meeting_builder_url = OptionsProvider.dynamic_meeting_builder_url;
    $scope.dynamic_meeting_builder_profile = OptionsProvider.dynamic_meeting_builder_profile;

    $scope.meeting_table = XMService.getMeetingLinkFromTable(g_user.userID);

    // misc.
    $scope.xm_conf_bridge_enable = OptionsProvider.xm_conf_bridge_enable;
    $scope.legal_statement = OptionsProvider.legal_statement;

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

    // Set the incident id scope variable based on search parameters in the url
    $scope.incident_id = LocationService.searchParams.incident_id;
    if (typeof $scope.incident_id === 'undefined' || $scope.incident_id === null || $scope.incident_id === '') {
      jslog('No incident identifier was defined');
      $scope.global_errors.push('Missing "incident_id" parameter: A valid ServiceNow Incident system id must be set to continue');
    }

    $scope.isExternalConferenceBridge = function(conference) {

      var isExternal = false;
      for (var i = 0; i < $scope.external_conference_bridge_options.length; i++) {
        if (conference.toLowerCase() === $scope.external_conference_bridge_options[i].label.toLowerCase()) {
          isExternal = true;
        }
      }
      return isExternal;
    };

    $scope.displayLegalStatement = function() {
      var trustedHTML = '';
      if ($scope.legal_statement[0].length > 0) {
        trustedHTML = $sce.trustAsHtml($scope.legal_statement[0].value);
      }
      return trustedHTML;
    };

    $scope.updateMeetingFields = function(conference) {

      var clearFields = true;
      var matchForDynamic = (conference.toLowerCase() === $scope.dynamic_meeting_builder_ext_conf_bridge[0].value.toLowerCase());

      // -- PASSCODE START --
      if ($scope.meeting_builder_enable[0].value == "true") {

        var meeting_builder_type = $scope.meeting_builder_type[0].value;
        // leverage the meeting link table
        if (meeting_builder_type == 'table') {

          console.log('Received meeting table data: ' + JSON.stringify($scope.meeting_table));
          if ($scope.meeting_table.$$state.value) {
            console.log('has $scope.meeting_table.value');
            for (var i = 0; i < $scope.meeting_table.$$state.value.length; i++) {
              console.log('User has selected conference: ' + conference);
              console.log('Comparing against table value of ' + $scope.meeting_table.$$state.value[i].conference_bridge_name);

              if ($scope.meeting_table.$$state.value[i].conference_bridge_name.toLowerCase() === conference.toLowerCase()) {
                $scope.passcode.value = $scope.meeting_table.$$state.value[i].passcode;
                $scope.meeting_link.value = $scope.meeting_table.$$state.value[i].meeting_url;
                clearFields = false;
                break;
              }
            }
          }
        } else if (meeting_builder_type == 'dynamic' && matchForDynamic) {

          var dynamic_meeting_builder_url = $scope.dynamic_meeting_builder_url[0].value;
          var dynamic_meeting_builder_profile = $scope.dynamic_meeting_builder_profile[0].value;

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

      } // CLOSING BRACE ON THE ENABLE
    };

    $scope.displayDateTime = function(type) {
      console.log("***displayDateTime " + JSON.stringify($scope.notification_types_to_display_date_time));
      var display = false;

      if (type !== '' && typeof type !== 'undefined') {
        for (var i = 0; i < $scope.notification_types_to_display_date_time.length; i++) {
          if (type.toLowerCase() === $scope.notification_types_to_display_date_time[i].label.toLowerCase()) {
            display = true;
          }
        }
      }

      return display;
    };

    $scope.displayXMConfBridge = function() {
      console.log("***xm_conf_bridge_enable " + JSON.stringify($scope.xm_conf_bridge_enable));
      var display = false;
      if ($scope.xm_conf_bridge_enable[0].length > 0) {
        if ($scope.xm_conf_bridge_enable[0].value === true) {

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
        console.log('The form will not be submitted in an invalid state, error on Type field true/false: ' + JSON.stringify($scope.engageXMForm.type.$error));
        console.log('The form will not be submitted in an invalid state error on Recipients field true/false: ' + JSON.stringify($scope.engageXMForm.recipients.$error));
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
          "incident_id": $scope.incident_id,
          "initiator_display_name": g_user.getFullName(),
          "initiator_username": g_user.userName,
          "type": $scope.type,
          "date_time": $scope.date_time.value,
          "meeting_link": $scope.meeting_link.value,
          "passcode": $scope.passcode.value
        };

        var ga = new GlideAjax('xMattersAjaxEngageWorkflow');
        ga.addParam('sysparm_name', 'submitEngageWithXMatters');
        ga.addParam('form_data', JSON.stringify(formData));
        ga.send().then(function(resp) {
          if (resp.success) {
            $translate('ENGAGE_XM.MESSAGE.SUCCESS').then(function(successMsg) {
              closeDialog(successMsg);
            });
            // replacing our complete page by closing the dialog for you
            //$scope.is_finished = true;
            //$scope.engage_url = '/nav_to.do?uri=x_xma_xmatters_engage_with_xmatters.do?sys_id=' + resp.data.sys_id;
          } else {
            jslog(resp);
          }
        }).catch(function(resp) {
          jslog(resp);
        });
      }
    };
  });
