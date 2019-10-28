gs.include("xMattersLogger");
gs.include("xMattersConfig");
gs.include("xMattersEngageWorkflowConfig");
gs.include('xMattersDataHelper');
gs.include("xMattersEvent");

var xMattersEngageWorkflowTask = Class.create();

xMattersEngageWorkflowTask.prototype = {

    /**
     * Initialize the xMattersEngageWorkflowTask object
     *
     * @param {Object} config (optional) config object for the xMatters app; will default to xMattersConfig
     * @param {Object} dataHelper data helper object; will default to xMattersDataHelper
     * @param {string} logTraceId the context identifier under which to log messages
     */
    initialize: function (config, dataHelper, logTraceId) {
        if (config && config.type === 'xMattersConfig') {
            this.config = config;
        } else {
            this.config = new xMattersConfig();
        }

        this.engage_workflow_config = new xMattersEngageWorkflowConfig();

        this.log = new xMattersLogger(this.config.DEBUGGING, 'xMattersEngageWorkflowTask', logTraceId);

        if (dataHelper && dataHelper.type === 'xMattersDataHelper') {
            this.dataHelper = dataHelper;
        } else {
            this.dataHelper = new xMattersDataHelper(this.config, this.dataHelper, this.log.getLogTraceId());
        }

        this.json = new global.JSON();
    },

    /**
     * @param rec current record
     * @param triggerRule String containing the trigger rule
     */
    addTask: function (rec, triggerRule) {
        try {
            var xmEvent = new xMattersEvent(this.config, this.dataHelper, this.log.getLogTraceId());

            // Add Incident Properties
            var parentIncident = new GlideRecord('incident');
            parentIncident.get(rec.parent_incident);
            xmEvent.addAllIncidentProperties(parentIncident);

            // Add task properties
            xmEvent.addProperty('task_message', rec.message);
            xmEvent.addProperty('task_number', rec.number);
            xmEvent.addProperty('task_priority', rec.send_priority);
            xmEvent.addProperty('task_message_subject', rec.message_subject);
            xmEvent.addProperty('task_state', rec.state);
            xmEvent.addProperty('task_escalation', rec.escalation);
            xmEvent.addProperty('task_sys_id', rec.sys_id);
            xmEvent.addProperty('task_initiator_display_name', rec.initiator_display_name);
            xmEvent.addProperty('task_initiator_username', rec.initiator_username);

			// engage workflow custom fields
			xmEvent.addProperty('task_type', rec.type);
			xmEvent.addProperty('task_date_time', rec.date_time);
			xmEvent.addProperty('task_meeting_link', rec.meeting_link);
			xmEvent.addProperty('task_passcode', rec.passcode);

			this.log.info("PROPERTIES FROM ENGAGE TASK: " + JSON.stringify(rec));

            // Add additional properties
            xmEvent.addProperty('trigger', triggerRule);
            xmEvent.addProperty('servicenowurl', this.config.SNAPI.hostname);
            xmEvent.addProperty('xmatters_url', this.config.XMAPI.hostname);

            var recipients = rec.recipients.toString().split(',');
            for (var i = 0; i < recipients.length; i++) {
                if (recipients[i] !== "") {
                    xmEvent.addRecipient(recipients[i]);
                }
            }

            var isConference = false;
            var confBridge = rec.conference_bridge.getDisplayValue();
            if (confBridge !== 'None') {
                isConference = true;
                if (confBridge === 'Hosted_New') {
                    xmEvent.addConferenceBridge(null);
                } else {
                    xmEvent.addConferenceBridge(confBridge);
                }
            }

            xmEvent.addProperty('task_isConference', isConference);
            xmEvent.setPriority(rec.send_priority.getDisplayValue());

            xmEvent.setWebserviceURL(this.engage_workflow_config.ENGAGE_WORKFLOW_URL);

            xmEvent.send();

        } catch (e) {
            this.log.logException('addTask', e);
            throw e;
        }
    },

    /**
     * Terminates an incident in the xMatters (alarmpoint) Engine
     * @param rec current rec
     * @param triggerRule String containing the trigger rule
     */
    deleteTask: function (rec, triggerRule) {
        // Terminate the related events in xMatters
        try {
            var xMEvent = new xMattersEvent(this.config, this.dataHelper, this.log.getLogTraceId());
            xMEvent.terminateEvents('task_number', String(rec.number));
            return "[xMatters] - Terminated existing events for this Engage with xMatters request.";

        } catch (e) {
            return "[xMatters] - Termination of events failed: " + this.json.encode(e);
        }
    },

    /**
     * Handles task action(s)
     * @param record current record
     * @param parms an object describing actions to be performed
     */
    handleTaskAction: function (record, parms) {
        var LOG_PREFIX = 'handleTaskAction: ';
        try {
            this.log.debug(LOG_PREFIX + 'Task ' + record.number + ' with parameters ' + this.json.encode(parms));
            var notes = [];
            if (parms.terminate) {
                this.log.debug(LOG_PREFIX + 'In terminate event!');
                notes.push(this.deleteTask(record, parms.triggerRule));
            }
            if (parms.sendEvent) {
                this.log.debug(LOG_PREFIX + 'In send event!');
                notes.push(this.addTask(record, parms.triggerRule));
            }
            this.log.debug(LOG_PREFIX + 'Notes: ' + notes);

            // create the final work notes if the notes array has items to be added to the work notes
            if (notes.length > 0) {
                record.work_notes = notes.join("\n");
                record.update();
            }
        } catch (e) {
            this.log.logException('handleIncidentAction', e);
            throw e;
        }
    },
    /**
     * The xM Task Terminate Business Rule should only run on task "Update"s
     * @param  {GlideRecord} current the "current" engageTask glide record
     * @param  {GlideRecord} prev the "previous" engageTask glide record
     * @return {Boolean}     Whether or not the Business Rule should fire
     */
    isUpdateValid: function (current, prev) {
        var shouldRun = false;
        var reason = '';
        if (!this.config.ENGAGE.ENABLED) {
            reason = 'Engage with xMatters feature is disabled';
        } else {
            if (current.active.changesTo(false)) {
                shouldRun = true;
            }
            reason = 'No update criteria were met.';
        }
        if (!shouldRun) {
            this.log.debug('shouldUpdate: Bypassing Task Terminate Business Rule | Reason: ' + reason);
        }
        return shouldRun;
    },
    /**
     * When a Task changes to an inactive state, attempt to terminate related xM events
     * @param {*} current the "current" engageTask glide record
     * @returns {void}
     */
    afterUpdate: function (current) {
        var LOG_PREFIX = 'afterUpdate: ';
        var timer = this.log.timer();
        try {
            if (current.active.changesTo(false)) {
                this.log.debug(LOG_PREFIX + 'Task has changed to an "inactive" state');
                // The Engage inserted script action has been modified to handle both inserts and updates
                // it was not renamed in order to limit the amount of possible conflicts for customers
                // migrating to the new version.
                var eventName = 'x_xma_xmatters.engage.workflow.inserted';
                var parms = {
                    'sendEvent': false,
                    'terminate': true,
                    'triggerRule': 'Inactive'
                };
                gs.eventQueue(eventName, current, new global.JSON().encode(parms), 'terminateEvent');
            }
            this.log.info(LOG_PREFIX + 'Task Business Rule finished (' + this.log.timer(timer) + 'ms elapsed)');
        } catch (e) {
            this.log.logException('', e);
            throw e;
        }
    }
};
