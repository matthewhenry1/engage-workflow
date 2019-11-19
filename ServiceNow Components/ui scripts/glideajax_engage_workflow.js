angular.module('xm.glide-ajax', [])
	.service('GlideAjax', function ($q) {
		var glideAjax = window.GlideAjax;
		glideAjax.prototype.send = function () {
			var deferred = $q.defer();
			this.getXMLAnswer(function (answer) {
				deferred.resolve(JSON.parse(answer));
			});
			return deferred.promise;
		};
		return glideAjax;
	});
