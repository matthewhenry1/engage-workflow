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
    var engageWorkflowConfig = new xMattersEngageWorkflowConfig();

    try {
      var search_term = this.getParameter('search_term');
      log.debug('searchPeople, incoming search term:' + search_term);

      // spaces come through URL encoded, so it's necessary to execute a global replace on the encoded space i.e. %20
      var value = decodeURIComponent(search_term);

      var personObj = {};
      personObj.body = {};
      personObj.body.data = [];

      var roleList = engageWorkflowConfig.ENGAGE_WORKFLOW_QUERY_SERVICENOW_ROLE_LIST.join(',');

      var arrayUtil = new global.ArrayUtil();
      var uniqueList = [];

      var grPerson = new GlideAggregate("sys_user_has_role");
      grPerson.addEncodedQuery("user.nameLIKE" + value + "^ORuser.user_nameLIKE" + value + "^user.active=true^role.nameIN" + roleList);
      grPerson.groupBy('user');
      grPerson.query();
      while (grPerson.next()) {
        personObj.body.data.push({
          "firstName": String(grPerson.user.first_name),
          "lastName": String(grPerson.user.last_name) + ' (' + String(grPerson.user.user_name) + ')',
          "targetName": String(grPerson.user.user_name)
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
    var engageWorkflowConfig = new xMattersEngageWorkflowConfig();

    try {
      var search_term = this.getParameter('search_term');
      log.debug('searchGroups, incoming search term:' + search_term);

      // spaces come through URL encoded, so it's necessary to execute a global replace on the encoded space i.e. %20
      var value = decodeURIComponent(search_term);

      var groupObj = {};
      groupObj.body = {};
      groupObj.body.data = [];

      var roleList = engageWorkflowConfig.ENGAGE_WORKFLOW_QUERY_SERVICENOW_ROLE_LIST.join(',');

      var arrayUtil = new global.ArrayUtil();
      var uniqueList = [];

      var grGroup = new GlideAggregate("sys_group_has_role");
      grGroup.addEncodedQuery("group.nameLIKE" + value + "^ORgroup.descriptionLIKE" + value + "^group.active=true^role.nameIN" + roleList);
      grGroup.groupBy('group');
      grGroup.query();
      while (grGroup.next()) {

        groupObj.body.data.push({
          "targetName": String(grGroup.group.name)
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

  getEngageWorkflowConfig: function() {
    var conf = new xMattersConfig();
    var log = new xMattersLogger(conf.DEBUGGING, 'xMattersAjaxEngageWorkflow');
    var engageWorkflowConfig = new xMattersEngageWorkflowConfig();
    var response;
    try {

      response = {
        success: true,
        data: {
          enabled: engageWorkflowConfig.ENGAGE_WORKFLOW_ENABLED,
          url: engageWorkflowConfig.ENGAGE_WORKFLOW_URL,
          query: engageWorkflowConfig.ENGAGE_WORKFLOW_QUERY,
          query_role_list: engageWorkflowConfig.ENGAGE_WORKFLOW_QUERY_SERVICENOW_ROLE_LIST,
          notification_types: engageWorkflowConfig.ENGAGE_WORKFLOW_NOTIFICATION_TYPE_LIST,
          notification_types_to_display_date_time: engageWorkflowConfig.ENGAGE_WORKFLOW_NOTIFICATION_TYPE_DATE_TIME_LIST,
          external_conference_bridge_options: engageWorkflowConfig.ENGAGE_WORKFLOW_EXTERNAL_CONF_BRIDGE_LIST,
          meeting_builder_enable: engageWorkflowConfig.ENGAGE_WORKFLOW_MEETING_BUILDER_ENABLE,
          meeting_builder_type: engageWorkflowConfig.ENGAGE_WORKFLOW_MEETING_BUILDER_TYPE,
          dynamic_meeting_builder_ext_conf_bridge: engageWorkflowConfig.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_EXTERNAL_CONF_BRIDGE,
          dynamic_meeting_builder_url: engageWorkflowConfig.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_URL,
          dynamic_meeting_builder_profile: engageWorkflowConfig.ENGAGE_WORKFLOW_MEETING_BUILDER_DYNAMIC_PROFILE,
          xm_conf_bridge_enable: engageWorkflowConfig.ENGAGE_WORKFLOW_XM_CONF_BRIDGE_ENABLE,
          legal_statement: engageWorkflowConfig.ENGAGE_WORKFLOW_LEGAL_STATEMENT
        }
      };
    } catch (e) {
      response = {
        success: false,
        error: String(e)
      };
    }

    log.debug('Retrieving configurations for Engage Workflow ' + JSON.stringify(response.data));

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

      var engageRequest = new GlideRecord('x_xma_xmatters_xmatters_engage_workflow');
      engageRequest.initialize();
      engageRequest.recipients = formData.recipients;
      engageRequest.message = formData.message;
	  engageRequest.message_subject = formData.subject;
      engageRequest.send_priority = formData.send_priority;
      engageRequest.conference_bridge = formData.conference_bridge;
      engageRequest.initiator_display_name = formData.initiator_display_name;
      engageRequest.initiator_username = formData.initiator_username;

	  // fields for parent fields
	  engageRequest.parent_sys_id = formData.parent_sys_id;
	  engageRequest.parent_table_name = formData.parent_table_name;

      // custom update to store the entire detail here
      engageRequest.type = formData.type;
      engageRequest.passcode = formData.passcode;
      engageRequest.meeting_link = formData.meeting_link;
      engageRequest.date_time = formData.date_time;

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

  type: 'xMattersAjaxEngageWorkflow'
});
