gs.include('xMattersLogger');
gs.include('xMattersConfig');

var xMattersEngageWorkflowCallback = Class.create();
xMattersEngageWorkflowCallback.prototype = {
    initialize: function( request, config, isREST ) {
        if (config && config.type == 'xMattersConfig') {
            this.config = config;
        } else {
            this.config = new xMattersConfig();
        }
        this.log = new xMattersLogger(this.config.DEBUGGING, 'xMattersEngageWorkflowCallback');

        // process parameters in the callback request
        this.params = {};
        if( isREST ) { //RESTAPIRequest
            this.handleRESTAPIRequest( request );
        } else { //GlideScriptRequest
            this.handleProcessorRequest( request );
        }

        // convenience variables
        this.mode = this.params.mode;
        this.eventId = this.params.eventIdentifier;

        // process event properties array of objects into a more convenient variable
        this.eventProperties = {};
        if( !gs.nil( this.params.eventProperties ) ) {
            this.eventProperties = {};
            for (var i = 0; i < this.params.eventProperties.length; i++) {
                var eventProperty = this.params.eventProperties[i];
                for( var epKey in eventProperty ) {
                    this.eventProperties[ epKey ] = eventProperty[ epKey ];
                }
            }
        }
        this.log.info('initialize: Processing callback for Event: |' + this.eventId +  '| In mode: ' + this.mode);
    },

    handleProcessorRequest: function( g_request ) {
        var paramNames = g_request.getParameterNames();
        for (var key in paramNames) {
            this.params[paramNames[key]] = g_request.getParameter( paramNames[key] );
        }
    },
    handleRESTAPIRequest: function( request ) {
        this.params = request.body.nextEntry();
    },

    // Helper methods to detect which type of callback is being processed.
    isEventCreationCallback: function() {
        return this.mode === 'eventCreation';
    },
    isResponseCallback: function() {
        return this.mode === 'response';
    },
    isDeliveryStatusCallback: function() {
        return this.mode === 'deliveryStatus';
    },
    isStatusCallback: function() {
      return this.mode === 'status';
    },
    isEventCommentCallback: function() {
      return this.mode === 'comment';
    },

    /**
     * Gets the incident id from the event properties of the callback
     * @return {string} returns the incident id if it is available, otherwise throws an error
     */
    getIncidentId: function() {
        this.incidentId = this.eventProperties.sys_id;
        if( gs.nil( this.incidentId ) || this.incidentId.trim() === '' ) {
            var errorMessage = 'The callback body did not contain the sys_id';
            throw this.getError( 'INCIDENT_ID_NOT_FOUND', errorMessage );
        }
        return this.incidentId;
    },

    /**
     * Gets the task system id from the event properties of the callback
     * @return {string} returns the task system id if it is available, otherwise throws an error
     */
    getTaskId: function() {
        this.taskId = this.eventProperties.task_sys_id;
        if( gs.nil( this.taskId ) || this.taskId.trim() === '' ) {
            var errorMessage = 'The callback body did not contain the task_sys_id';
            throw this.getError( 'TASK_ID_NOT_FOUND', errorMessage );
        }
        return this.taskId;
    },
    /**
     * Based on the xMatters Recipient's username, look up the user in service now and retrieve the correct snow
     * username
     * @return {string} The username of a ServiceNow user that matches the xMatters response recipient user
     */
    getRecipientSNowUsername: function() {
        if( this.config.USERNAMEFIELD !== 'user_name' ) {
            var serviceNowUser = (new xMattersPerson()).getServiceNowUserByxMattersUsername( this.params.recipient );
            return serviceNowUser.user_name;
        } else {
            return this.params.recipient;
        }
    },
    /**
     * Gets the response string from the xMatters event response
     * @return {string} The response string from the xMatters event response
     */
    getResponse: function() {
        return this.params.response;
    },
    /**
     * Used to build up a work notes string for the responses from xMatters
     * @return {String} A string that can be added to the Work Notes of a related record
     */
    getWorkNotes: function() {
        var workNotes = '[xMatters] - xM event ID ' + this.eventId;
        if( this.isResponseCallback() ) {
            workNotes += ' received response ' + this.params.response;
            if( !gs.nil(this.params.annotation) && this.params.annotation !== 'null' ) {
                workNotes += ' - "' + this.params.annotation + '"';
            }
            workNotes += ' by ' + this.params.recipient + ' (' + this.params.device + ')';
        } else if( this.isDeliveryStatusCallback() ) {
            workNotes += ' has a delivery status of ' + this.params.deliveryStatus + ' from recipient ' + this.params.recipient + "(" + this.params.device + ")";
        } else if( this.isStatusCallback() ) {
            workNotes += ' has an updated status of ' + this.params.status;

        } else if( this.isEventCreationCallback() ) {
            workNotes = '[xMatters] - Injected notification with xM event ID ' + this.eventId + ' targeting (' + this.params.targetName + ')';

        } else if( this.isEventCommentCallback() ) {
            var author = this.params.author;
            var fullName = (author.firstName ? author.firstName + ' ' : '') + author.lastName;
            workNotes = '[xMatters] - ' + fullName + ' (' + author.targetName + ') commented on xM event ID ' + this.eventId + ': ' + this.params.comment;

        } else {
            var errorMessage = 'The callback request "mode" did not match expected values. [' + this.mode + ']';
            throw this.getError( 'MODE_DID_NOT_MATCH_EXPECTED_VALUE', errorMessage );
        }
        this.log.debug( 'Collected Work Notes: ' + workNotes );
        return workNotes;
    },
    getError: function( type, msg ) {
        // do not use a generic error, use snow ws error
        this.log.error( msg );
        var error = new sn_ws_err.ServiceError();
        error.setMessage( type );
        error.setDetail( msg );
        return error;
    },

    type: 'xMattersEngageWorkflowCallback'
};
