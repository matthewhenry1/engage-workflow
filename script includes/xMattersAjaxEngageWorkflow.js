gs.include("xMattersConfig");
gs.include("xMattersEngageWorkflowConfig");
gs.include("xMattersDataHelper");

var xMattersAjaxEngageWorkflow = Class.create();
xMattersAjaxEngageWorkflow.prototype = Object.extendsObject(global.AbstractAjaxProcessor, {

  /**
   * Retrieves xMatters configuration details used to make calls from the browser client.
   * Currently unused because xmApi doesn't support cross-browser calls right now
   *
   * @return {String} A stringified JSON object with the following details:
   * {
   * 		"success": true or false depending on whether the request was successful,
   * 		"log": an array of strings used to debug the request,
   * 		"error": only present if "success" = false - a string describing what went wrong,
   * 		"data": only present if "success" = true - an object with the following properties:
   * 			{
   * 				"host": the configured xMatters hostname,
   * 				"baseAuth": the Basic Authentication credentials configured to be used by the integration
   * 					to communicate with xMatters
   * 			}
   * }
   */
  getXMattersDetails: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersConfig();
      var hostname = conf.XMAPI.hostname;
      var user = conf.XMAPI.user;
      var password = conf.XMAPI.password;

      var isValid = true;
      if (typeof hostname === 'undefined' || hostname === null || hostname.trim() === '') {
        isValid = false;
        customLog.push('Invalid hostname: ' + hostname);
      }
      if (typeof user === 'undefined' || user === null || user.trim() === '') {
        isValid = false;
        customLog.push('Invalid user: ' + user);
      }
      if (typeof password === 'undefined' || password === null || password.trim() === '') {
        isValid = false;
        customLog.push('Invalid password: ' + password);
      }
      if (isValid) {
        response = {
          success: true,
          data: {
            host: hostname,
            baseAuth: gs.base64Encode(user + ':' + password)
          }
        };
      } else {
        response = {
          success: false,
          error: "Problems exist in the xMatters API configuration"
        };
      }
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  getActiveHostedConferenceBridges: function() {
    var response;
    var opts;

    try {
      var conf = new xMattersConfig();
      var incidentId = this.getParameter('incident_id');
      opts = {
        "method": "GET",
        "path": "/api/xm/1/events?status=ACTIVE&sortBy=start_time&propertyName=sys_id%23" + conf.EVENTS.LANGUAGE + "&propertyValue=" + incidentId,
        "headers": {
          "Content-Type": "application/json"
        }
      };
      var dataHelper = new xMattersDataHelper();
      var apiResp = dataHelper.sendRequest(opts);
      if (apiResp.status >= 200 && apiResp.status < 300 && apiResp.body) {
        var apiRespBody = JSON.parse(apiResp.body);

        if (apiRespBody.data && Array.isArray(apiRespBody.data)) {
          var conferenceBridgeIds = [];
          for (var i = 0; i < apiRespBody.data.length; i++) {
            var dataItem = apiRespBody.data[i];
            if (dataItem.conference && dataItem.conference.bridgeId &&
              conferenceBridgeIds.indexOf(dataItem.conference.bridgeId) < 0) {
              conferenceBridgeIds.push(dataItem.conference.bridgeId);
            }
          }
          var activeConferenceBridgesResponse = JSON.parse(this.getActiveConferenceBridges(conferenceBridgeIds));
          if (activeConferenceBridgesResponse.success) {
            response = {
              success: true,
              data: activeConferenceBridgesResponse.data
            };
          } else {
            return activeConferenceBridgesResponse;
          }
        }

      } else {
        response = {
          success: false,
          api_response: apiResp,
          error: 'The call to xMatters was unsuccessful'
        };
      }
    } catch (e) {
      response = {
        success: false,
        opts: opts,
        error: String(e)
      };
    }
    return new global.JSON().encode(response);
  },

  /**
   * Get a list of bridges that are still ongoing
   * @param {[]} conferenceBridgeIds: a list of conference bridge ids
   * @returns {{}} A list of bridges, or failure response.
   */
  getActiveConferenceBridges: function(conferenceBridgeIds) {
    var response;
    var opts;
    var activeConferenceBridges = [];
    var dataHelper = new xMattersDataHelper();

    try {
      for (var i = 0; i < conferenceBridgeIds.length; i++) {
        opts = {
          "method": "GET",
          "path": "/api/xm/1/conferences/" + conferenceBridgeIds[i],
          "headers": {
            "Content-Type": "application/json"
          }
        };
        var apiResp = dataHelper.sendRequest(opts);
        if (apiResp.status >= 200 && apiResp.status < 300 && apiResp.body) {
          var apiRespBody = JSON.parse(apiResp.body);
          if (apiRespBody.status && apiRespBody.status !== "INACTIVE") {
            activeConferenceBridges.push(apiRespBody);
          }
        } else {
          response = {
            success: false,
            api_response: apiResp,
            error: 'The call to xMatters was unsuccessful'
          };
          return new global.JSON().encode(response);
        }
      }
      response = {
        success: true,
        data: activeConferenceBridges
      };
    } catch (e) {
      response = {
        success: false,
        opts: opts,
        error: String(e)
      };
    }

    return new global.JSON().encode(response);
  },

  searchPeople: function() {
    var response;
    try {
      var engageConf = new xMattersEngageWorkflowConfig();
      var conf = new xMattersConfig();
      var log = new xMattersLogger(conf.DEBUGGING, 'xMattersAjaxEngageWorkflow');

      if (engageConf.ENGAGE_WORKFLOW_QUERY == "servicenow") {
        log.info('Querying ServiceNow');
        return this.searchPeopleFromServiceNow();
      } else if (engageConf.ENGAGE_WORKFLOW_QUERY == "xmatters") {
        log.info('Querying xMatters');
        return this.searchPeopleFromxMatters();
      } else {
        log.info('Unknown query type ' + engageConf.ENGAGE_WORKFLOW_QUERY);
        response = {
          success: false,
          error: 'Unknown query type.'
        };
      }
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    return new global.JSON().encode(response);
  },

  /**
   * Searches xMatters for people via the search people xmAPI endpoint
   * When called from glide ajax, must have a string "search_term" parameter.
   *
   * @return {String} A stringified JSON object with the following details:
   * {
   * 		"success": true or false depending on whether the submission was successful,
   * 		"opts": an object that will contain the details of the http callout,
   * 		"error": only present if "success" = false - a string describing what went wrong,
   * 		"api_response": only present if "success" = false - will contain the http response in a failed http call,
   * 		"data": only present if "success" = true - will contain the http response in a successfull http call
   * }
   */
  searchPeopleFromxMatters: function() {
    var response;
    var opts;
    try {
      var search_term = this.getParameter('search_term');
      // Read the Engage configuration to get the maximum number of suggestions to show in the recipient autosuggest dropdown.
      var conf = new xMattersConfig();
      var results_limit = conf.ENGAGE.MAX_RECIPIENT_RESULTS;

      opts = {
        "method": "GET",
        "path": "/api/xm/1/people?limit=" + results_limit + "&search=" + search_term,
        "headers": {
          "Content-Type": "application/json"
        }
      };
      var dataHelper = new xMattersDataHelper();
      var apiResp = dataHelper.sendRequest(opts);
      if (apiResp.status >= 200 && apiResp.status < 300) {
        response = {
          success: true,
          data: apiResp
        };
      } else {
        response = {
          success: false,
          api_response: apiResp,
          error: 'The call to xMatters was unsuccessful'
        };
      }
    } catch (e) {
      response = {
        success: false,
        opts: opts,
        error: String(e)
      };
    }
    return new global.JSON().encode(response);
  },

  searchPeopleFromServiceNow: function() {
    var response;
    var opts;
    var conf = new xMattersConfig();
    var log = new xMattersLogger(conf.DEBUGGING, 'xMattersAjaxEngageWorkflow');
    try {
      var search_term = this.getParameter('search_term');
      log.debug('searchPeople, incoming search term:' + search_term);

      // spaces come through URL encoded, so it's necessary to execute a global replace on the encoded space i.e. %20
      var value = decodeURIComponent(search_term);

      var personObj = {};
      personObj.body = {};
      personObj.body.data = [];

      var grPerson = new GlideRecord("sys_user");
      grPerson.addEncodedQuery("nameLIKE" + value + "^ORuser_nameLIKE" + value + "^active=true");
      grPerson.query();
      while (grPerson.next()) {

        personObj.body.data.push({
          "firstName": String(grPerson.first_name),
          "lastName": String(grPerson.last_name),
          "targetName": String(grPerson.user_name)
        });
      }

      // mock a get response
      personObj.status = 200;
      personObj.body = new global.JSON().encode(personObj.body);
      personObj.respData = personObj.body;

      response = {
        success: true,
        data: personObj
      };
    } catch (e) {
      response = {
        success: false,
        opts: opts,
        error: String(e)
      };
    }

    return new global.JSON().encode(response);
  },

  searchGroups: function() {
    var response;
    try {
      var engageConf = new xMattersEngageWorkflowConfig();
      var conf = new xMattersConfig();
      var log = new xMattersLogger(conf.DEBUGGING, 'xMattersAjaxEngageWorkflow');

      if (engageConf.ENGAGE_WORKFLOW_QUERY == "servicenow") {
        log.info('Querying ServiceNow');
        return this.searchGroupsFromServiceNow();
      } else if (engageConf.ENGAGE_WORKFLOW_QUERY == "xmatters") {
        log.info('Querying xMatters');
        return this.searchGroupsFromxMatters();
      } else {
        log.info('Unknown query type ' + engageConf.ENGAGE_WORKFLOW_QUERY);
        response = {
          success: false,
          error: 'Unknown query type.'
        };
      }
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }

    return new global.JSON().encode(response);
  },

  /**
   * Searches xMatters for groups via the search groups xmAPI endpoint
   * When called from glide ajax, must have a string "search_term" parameter.
   *
   * @return {String} A stringified JSON object with the following details:
   * {
   * 		"success": true or false depending on whether the submission was successful,
   * 		"opts": an object that will contain the details of the http callout,
   * 		"error": only present if "success" = false - a string describing what went wrong,
   * 		"api_response": only present if "success" = false - will contain the http response in a failed http call,
   * 		"data": only present if "success" = true - will contain the http response in a successfull http call
   * }
   */
  searchGroupsFromxMatters: function() {
    var response;
    var opts;
    try {
      var search_term = this.getParameter('search_term');
      // Read the Engage configuration to get the maximum number of suggestions to show in the recipient autosuggest dropdown.
      var conf = new xMattersConfig();
      var results_limit = conf.ENGAGE.MAX_RECIPIENT_RESULTS;

      var dataHelper = new xMattersDataHelper();
      opts = {
        "method": "GET",
        "path": "/api/xm/1/groups?operand=AND&limit=" + results_limit + "&search=" + search_term,
        "headers": {
          "Content-Type": "application/json"
        }
      };
      var apiResp = dataHelper.sendRequest(opts);
      if (apiResp.status >= 200 && apiResp.status < 300) {
        response = {
          success: true,
          data: apiResp
        };
      } else {
        response = {
          success: false,
          api_response: apiResp,
          error: 'The call to xMatters was unsuccessful'
        };
      }
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.opts = opts;
    return new global.JSON().encode(response);
  },

  searchGroupsFromServiceNow: function() {
    var response;
    var opts;
    var conf = new xMattersConfig();
    var log = new xMattersLogger(conf.DEBUGGING, 'xMattersAjaxEngageWorkflow');
    try {
      var search_term = this.getParameter('search_term');
      log.debug('searchGroups, incoming search term:' + search_term);

      // spaces come through URL encoded, so it's necessary to execute a global replace on the encoded space i.e. %20
      var value = decodeURIComponent(search_term);

      var groupObj = {};
      groupObj.body = {};
      groupObj.body.data = [];

      var grGroup = new GlideRecord("sys_user_group");
      grGroup.addEncodedQuery("nameLIKE" + value + "^ORdescriptionLIKE" + value + "^active=true");
      grGroup.query();
      while (grGroup.next()) {

        groupObj.body.data.push({
          "targetName": String(grGroup.name)
        });
      }

      // mock a get response
      groupObj.status = 200;
      groupObj.body = new global.JSON().encode(groupObj.body);
      groupObj.respData = groupObj.body;

      response = {
        success: true,
        data: groupObj
      };

    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.opts = opts;

    log.info('searchGroups - Returning: ' + new global.JSON().encode(response));
    return new global.JSON().encode(response);
  },

  getEngageWorkflowQuery: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_QUERY
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },


  getNotificationTypes: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_NOTIFICATION_TYPE_LIST
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  getNotificationTypesToDisplayDateTime: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_NOTIFICATION_TYPE_DATE_TIME_LIST
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  /**
   * Retrieves the configured External Conference Bridges
   *
   * @return {String} A stringified JSON object with the following details:
   * {
   * 		"success": true or false depending on whether the request was successful,
   * 		"log": an array of strings used to debug the request,
   * 		"error": only present if "success" = false - a string describing what went wrong,
   * 		"data": only present if "success" = true - an object that will contain the external conference bridges as text
   * }
   */
  getExternalConferenceBridges: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_EXTERNAL_CONF_BRIDGE_LIST
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },


  getMeetingBuilderEnable: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_MEETING_BUILDER_ENABLE
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  getMeetingBuilderType: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_MEETING_BUILDER_TYPE
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  getDynamicMeetingBuilderExternalConfBridge: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_EXTERNAL_CONF_BRIDGE
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },


  getDynamicMeetingBuilderURL: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_URL
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  getMeetingBuilderDynamicProfile: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_PROFILE
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }

    response.log = customLog;
    return new global.JSON().encode(response);
  },

  getXMConfBridgeEnable: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_XM_CONF_BRIDGE_ENABLE
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  getLegalStatement: function() {
    var response;
    var customLog = [];
    try {
      var conf = new xMattersEngageWorkflowConfig();
      response = {
        success: true,
        data: conf.ENGAGE_WORKFLOW_LEGAL_STATEMENT
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    response.log = customLog;
    return new global.JSON().encode(response);
  },

  /**
   * Submits a new Engage with xMatters record in ServiceNow (note that this does not perform any communication between ServiceNow and xMatters)
   * When called from glide ajax, must have a stringified "form_data" parameter. This parameter should look like the following:
   * 	{
   * 		"recipients": semi-colon delimited list of recipient target names,
   * 		"message": the message,
   * 		"incident_id": System ID of Parent Incident,
   * 		"subject": the subject,
   * 		"send_priority": the send priority,
   * 		"conference_bridge": Optional Conference Bridge
   * 	}
   *
   * @return {String} A stringified JSON object with the following details:
   * {
   * 		"success": true or false depending on whether the submission was successful,
   * 		"error": only present if "success" = false - a string describing what went wrong,
   * 		"data": only present if "success" = true - an object with the following properties:
   * 			{
   * 				"sys_id": the id of the new Engage with xMatters record
   * 			}
   * }
   */
  submitEngageWithXMatters: function() {
    var response;
    try {
      var form_data = this.getParameter('form_data');
      var formData = new global.JSON().decode(form_data);
      var config = new xMattersConfig();
      var log = new xMattersLogger(config.DEBUGGING, 'xMatters User Sync BR');
      log.info("HERE IT IS! " + formData + '  string it   ' + JSON.stringify(formData));
      var engageRequest = new GlideRecord('x_xma_xmatters_engage_with_xmatters');
      engageRequest.initialize();
      engageRequest.recipients = formData.recipients;
      //       engageRequest.message = formData.message;
      engageRequest.parent_incident = formData.incident_id;
      engageRequest.message_subject = formData.subject;
      engageRequest.send_priority = formData.send_priority;
      engageRequest.conference_bridge = formData.conference_bridge;
      engageRequest.initiator_display_name = formData.initiator_display_name;
      engageRequest.initiator_username = formData.initiator_username;

      // custom update to store the entire detail here
      engageRequest.message = JSON.stringify(formData);
      engageRequest.insert();

      response = {
        success: true,
        data: {
          sys_id: String(engageRequest.sys_id)
        }
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }
    return new global.JSON().encode(response);
  },

  getMeetingLinkFromTable: function() {
      var response;
      var opts;
      var conf = new xMattersConfig();
      var log = new xMattersLogger(conf.DEBUGGING, 'xMattersAjaxEngageWorkflow');
      try {
        var userID = decodeURIComponent(this.getParameter('userID'));

        var obj = {};
        obj.body = {};
        obj.body.data = [];

        var gr = new GlideRecord("x_xma_xmatters_engage_workflow_meeting");
        gr.addQuery("user.sys_id", userID);
        gr.query();
        while (gr.next()) {
          obj.body.data.push({
            "conference_bridge_name": String(gr.conference_bridge_name),
            "meeting_url": String(gr.meeting_url),
            "passcode": String(gr.passcode)
          });
        }
        log.debug('getMeetingLinkFromTable: has:' + JSON.stringify(obj));

        // mock a get response
        obj.status = 200;
        obj.body = new global.JSON().encode(obj.body);
        obj.respData = obj.body;

        response = {
          success: true,
          data: obj
        };
      } catch (e) {
        response = {
          success: false,
          opts: opts,
          error: String(e)
        };
      }

      return new global.JSON().encode(response);
    },


  type: 'xMattersAjaxEngageWorkflow'
});
