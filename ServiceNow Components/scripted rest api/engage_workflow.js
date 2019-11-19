(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {
	var conf = new xMattersConfig();
	var log = new xMattersLogger(conf.LOGLEVEL, 'xMattersRESTProcessor');

	try {
		var callback = new xMattersEngageWorkflowCallback( request, conf, true );
		var taskId = callback.getTaskId();
		var taskQuery = new GlideRecord(gs.getCurrentScopeName() + '_xmatters_engage_workflow');
		taskQuery.addQuery('sys_id', taskId);
		taskQuery.query();

		if(taskQuery.next()) {
			var taskRec = new GlideRecord(gs.getCurrentScopeName() + '_xm_engage_workflow_temp');
			taskRec.initialize();
			taskRec.task_sys_id = taskId;

			taskRec.task_work_notes = callback.getWorkNotes();
			taskRec.update();
		} else {
			log.warn('Could not find task with id: ' + taskId + '. Will not process callback for event: ' + callback.eventId);
		}

		response.setContentType('text/plain');
		response.setStatus(200);
		response.getStreamWriter().writeString( 'Ok' );
	} catch( e ) {
		response.setError( e );
	}
})(request, response);
