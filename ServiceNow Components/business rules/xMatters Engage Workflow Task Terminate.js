
(new xMattersEngageWorkflowTask()).isUpdateValid(current, previous)

(function executeRule(current, previous /*null when async*/) {

	// Add your code here
    (new xMattersEngageWorkflowTask()).afterUpdate(current, previous);
})(current, previous);
