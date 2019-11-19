(function executeRule(current, previous /*null when async*/) {
    //This function will be automatically called when this rule is processed.
    var config = new xMattersConfig();
    var log = new xMattersLogger(config.DEBUGGING, 'xMatters Task BR');
    var json = new global.JSON();

    var timer = log.timer();
    log.debug('Starting Business Rule (operation: ' + current.operation() + ')');
    try {
        var triggerRule = 'Opened';
        var eventName = 'x_xma_xmatters.engage.workflow.inserted';

        log.debug('Sending xM Engage Workflow Task Assignment notification on insert.');

        var parms = {
            "sendEvent": true,
            "triggerRule": triggerRule
        };

        gs.eventQueue(eventName, current, json.encode(parms), 'taskInsert');

        log.info('Business Rule finished (' + log.timer(timer) + 'ms elapsed)');

    } catch (e) {
        log.logException('', e);
        throw e;
    }

})(current, previous);
