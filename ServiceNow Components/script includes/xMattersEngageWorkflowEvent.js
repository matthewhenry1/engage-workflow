gs.include("xMattersConfig");
gs.include("xMattersLogger");
gs.include('xMattersDataHelper');

var xMattersEngageWorkflowEvent = Class.create();
xMattersEngageWorkflowEvent.prototype = {

    /**
     * Initialize the xMattersEngageWorkflowEvent object
     * @param {Object} config [optional] config object for the xMatters app; will default to xMattersConfig
     * @param {Object} dataHelper [optional] data helper object; will default to xMattersDataHelper
     * @param {string} logTraceId [optional] the context identifier under which to log messages
     */
    initialize: function(config, dataHelper, logTraceId) {
        if (config && config.type == 'xMattersConfig') {
            this.config = config;
        } else {
            this.config = new xMattersConfig();
        }

        this.log = new xMattersLogger(this.config.DEBUGGING, 'xMattersEngageWorkflowEvent', logTraceId);

        if (dataHelper && dataHelper.type == 'xMattersDataHelper') {
            this.dataHelper = dataHelper;
        } else {
            this.dataHelper = new xMattersDataHelper(this.config, this.log.getLogTraceId());
        }

        this.json = new global.JSON();

        this.properties = {};
        this.recipients = [];
        this.conferenceBridges = [];
        this.callbacks = [];
        this.responses = [];
        this.priority = '';
        this.webserviceURL = '';
        this.xMattersId = null;
        this.response = null;
    },

    // Mutators to build up the correct Event values
    setWebserviceURL: function( webServiceURL ) {
        this.webserviceURL = webServiceURL;
    },
    setPriority: function( priority ) {
        this.priority = priority;
    },
    /**
     * Safely add a property to the event's property list
     * @param {string} propName  The key to identify the new property
     * @param {string|object|null} propValue The value to assign to the new property - usually a String or GlideElement
     */
    addProperty: function( propName, propValue ) {
        // this.log.debug(propName + ' -- ' + typeof propValue + ' +++ ' + propValue);
        // this.log.debug('Encoded: ' + this.json.encode( '' + propValue ) );
        var strValue = '';
        if( typeof propValue === 'undefined' || propValue === null) {
            strValue = '';
        } else if( typeof propValue === 'string' ) {
            strValue = propValue;
        } else {
            if( typeof propValue.getDisplayValue === 'function' ) {
                strValue = propValue.getDisplayValue();
            } else {
                strValue = this.json.encode( String( propValue ) );
            }
        }
        if( strValue.length > this.config.EVENTS.MAX_FIELD_LENGTH ) {
            this.log.debug('addProperty: Truncating "' + propName + '" to ' + this.config.EVENTS.MAX_FIELD_LENGTH + ' characters');
            strValue = strValue.substr( 0, this.config.EVENTS.MAX_FIELD_LENGTH );
        }
		// for a prefix of parent_
        this.properties[propName] = strValue;
    },
    /**
     * Convenience method for adding all fields from an parent_table_name to the event
     * @param {GlideRecord[parent_table_name]} parentRecord  The parent_table_name glide record to pull values from.
     */

    addAllProperties: function( parentRecord, parent_table_name ) {

        this.log.debug('Adding all parent fields' );

        var fields = new GlideRecord( 'sys_dictionary' );
        fields.addEncodedQuery('name=task^ORname='+parent_table_name);
        fields.query();
        var count = 0;
        while( fields.next() ) {

            var fieldName = fields.element;
            // this.log.debug('Trying to add ' + fieldName );
            this.addProperty( fieldName, parentRecord.getElement( fieldName ) );
            count++;
        }
        this.log.debug('addAllProperties: Total properties added: ' + count);
    },


    /**
     * Safely adds the target name to the list of recipients for the event
     * @param {string} targetName The recipient's target name
     */
    addRecipient: function( targetName ) {
        if( typeof targetName !== 'string' || targetName.trim() === '' ) {
            this.log.debug('addRecipient: Skipping invalid target: ' + targetName);
        } else {
            this.recipients.push( { "id": targetName } );
        }
    },
    /**
     * Safely adds the bridge to the list of conference bridges
     * @param {string|null} bridgeName The bridge's name, can be null
     */
    addConferenceBridge: function( bridgeName ) {
        var safeBridgeName = null;
        if( bridgeName !== null ) {
            safeBridgeName = String( bridgeName );
        }
        this.conferenceBridges.push( { "name": safeBridgeName } );
    },
    /**
     * Safely sets the list of responses in the event (UUID strings)
     * @param {string|array[string]} responses The response UUIDs you wish to allow users to use
     *                                         in the given event.
     */
    setResponses: function( responses ) {
        if( typeof responses === 'string' ) {
            if( responses.trim() !== '' ) {
                this.responses = responses.trim().split( ';' );
            } else {
                this.log.debug('setResponses: Leaving responses empty');
            }
        } else {
            this.responses = responses;
        }
    },

    // Convenience Getters
    /**
     * Gets a description of the targets/recipients
     * @return {string} If recipients exist, will return a targeting string, otherwise an empty string
     */
    getTargetDescription: function() {
        var targStr = '';
        if( this.recipients.length > 0 ) {
            var targets = [];
            for( var i = 0; i < this.recipients.length; i++ ) {
                targets.push( this.recipients[i].targetName );
            }
            targStr = 'targeting (' + targets.join(', ') + ') ';
        } else {
            targStr = 'targeting default recipients ';
        }
        return targStr;
    },

    /**
     * Gets the message to be used in the work notes log for this event
     * @return {string} message that can be directly used in the work notes
     */
    getEventNotes: function() {
        var msg = '';
        if( this.response.status < 200 || this.response.status >= 300 ) {
            msg = '[xMatters] - Injected notification event FAILED ' + this.getTargetDescription();
            if( this.recipients.length <= 0 && this.response.status === 400 ) {
                if( this.isResponseMissingRecipients( this.response ) ) {
                    msg += '; no default recipients configured';
                }
            }
        }
        return msg;
    },

    isResponseMissingRecipients: function( resp ) {
        var isMissingRecipients = false;
        var data = this.json.decode( resp.respData );
        if( data.type === 'DATA_VALIDATION_ERROR' ) {
            for( var i = 0; i < data.errorDetails.length; i++ ) {
                if( data.errorDetails[i].jsonPath === 'recipients/targetName' ) {
                    isMissingRecipients = true;
                    break;
                }
            }
        }
        return isMissingRecipients;
    },

    /**
     * Convenience method for getting the post body of the Event
     * @return {object} The JSON body of the xmEvent POST request
     */
    getEventBody: function() {
        var body = {
            "properties" : this.properties,
            "priority" : this.priority
        };
        if( this.recipients.length > 0 ) {
            body.recipients = this.recipients;
        }
        if( this.conferenceBridges.length > 0 ) {
            body.conferences = this.conferenceBridges;
        }
        if( this.callbacks.length > 0 ) {
            body.callbacks = this.callbacks;
        }
        if( this.responses.length > 0 ) {
            body.responses = this.responses;
        }
        this.log.debug('getEventBody: Prepared event body: ' + this.json.encode( body ));
        return body;
    },

    // Methods that interact with xMatters syste via the Data Helper
    /**
     * Sends the event -- will attempt a set number of times based on configured
     * maximum attempts.
     * @return {undefined}
     */
    send: function() {
        var attempts = 0;
        var isSuccess = false;
        var message = '';
        while( !isSuccess && attempts < this.config.EVENTS.MAX_ATTEMPTS ) {
            attempts += 1;
            try {
                var resp = this.dataHelper.sendRequest( {
                    "method": "POST",
                    "endpoint": this.webserviceURL,
                    "path": this.webserviceURL, //added for logging
                    "headers": {
                        "Content-Type": "application/json"
                    },
                    "body": this.getEventBody()
                } );
                this.response = resp;
                if (this.dataHelper.isSucessfulResponse(resp)) {
                    // This is a response from IB, which doesn't come with an event id.
                    // However we still want to indicate the POST is successful.
                    isSuccess = true;
                } else {
                    if( this.recipients.length <= 0 && resp.status === 400 ) {
                        if( this.isResponseMissingRecipients( resp ) ) {
                            // there was no default recipient.
                            this.log.error( "send: Failed to create event " + this.getTargetDescription() + "\n" +
                                this.dataHelper.formatErrorMessage(resp));
                            message = "Creation of xMatters event FAILED " + this.getTargetDescription() +
                                " after " + attempts + " attempts, no recipients were specified. To avoid this error, set default recipients" +
                                " within xmatters. please refer to logs for more details";
                            break;
                        }
                    }
                    // if didn't break, catch errors through regular error handling
                    this.log.error( "send: Failed to create event " + this.getTargetDescription() + "\n" +
                        this.dataHelper.formatErrorMessage(resp));
                }
            } catch( e ) {
                this.log.error( "send: Failed to create event " + this.getTargetDescription() +
                    " | error: " + String( e ) );
            }
        }
        if( !isSuccess && message === '' ) {
            message = "Creation of xMatters event FAILED " + this.getTargetDescription() +
                " after " + attempts + " attempts, please refer to logs for more details";
        }
        if (message && message !== '') {
            this.log.info('send: ' +  message);
        }
    },

    /**
     * Helper method to find events in xMatters (for termination)
     *
     * An assumption is made here that any properties to search are of "text" type
     * which carry a language suffix (e.g. "#en"). Numeric type fields do not have
     * this suffic in xMatters. If the comm plan in xMatters is customized, ensure
     * that any new properties added that will be used in searches are are of text
     * type.
     *
     * TODO: Update this call to support paginated results
     *
     * @param  {string} status     The Status to search for
     * @param  {string} xMProperty The name of the property to filter by
     * @param  {string} value      The value of the property to filter by
     * @return {array}            An array of events returned by the search
     */
    findEvents: function( status, xMProperty, value ) {
        var opts = { status: status };
        if (xMProperty) {
            opts['propertyName'] = xMProperty + '#' + this.config.EVENTS.LANGUAGE;
            opts['propertyValue'] = value;
        } else {
          throw 'Find Events: Need to specify property in order to avoid terminating all events';
        }
        var response = this.dataHelper.get('/events', opts);

        if (!this.dataHelper.isSucessfulResponse(response)) {
            this.log.error('findEvents: A problem occurred searching for ' + status + ' events' + "\n" +
                this.dataHelper.formatErrorMessage(response));
            throw {
                response: response,
                error: 'Searching for ' + status + ' events FAILED'
            };
        }

        var body = this.json.decode(response.body);
        this.log.debug('findEvents: Successfully found ' + body.total + ' ' + status + ' events');
        return body.data;
    },

    /**
     * Terminates all active and suspended events in xMatters that have a matching
     * xmProperty:value combination
     * @param  {string} xMProperty The name of the property in xMatters to filter by
     * @param  {string} value      The value to filter by in xMatters
     * @return {object}            An object containing the records and count of terminated events
     */
    terminateEvents: function( xMProperty, value ) {
        var start = this.log.timer();

        this.log.debug("terminateEvents: Start: Terminating all events where " + xMProperty + " == " + value);

        var activeEvents = this.findEvents( 'ACTIVE', xMProperty, value );
        this.log.debug('terminateEvents: Active Events: ' + this.json.encode( activeEvents ));

        var suspendedEvents = this.findEvents( 'SUSPENDED', xMProperty, value );
        this.log.debug('terminateEvents: Suspended Events: ' + this.json.encode( suspendedEvents ));

        var eventsForTermination = activeEvents.concat( suspendedEvents );
        this.log.debug('terminateEvents: All Events: ' + this.json.encode( eventsForTermination ));

        for (var i = 0; i < eventsForTermination.length; i++) {
            this.dataHelper.post('/events', {
                id: eventsForTermination[i].id,
                status: 'TERMINATED'
            });
        }

        this.log.debug('terminateEvents: Completed (' + this.log.timer(start) + 'ms elapsed)');
        return {
            "event_count": eventsForTermination.length,
            "records": eventsForTermination
        };
    },

    type: 'xMattersEngageWorkflowEvent'
};
