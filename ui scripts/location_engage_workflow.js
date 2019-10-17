angular.module('xm.location-service', [])
    .service('LocationService', function () {
        var locService = {
            searchParams: {}
        };
        var pieces = window.location.search.slice( 1 ).split( '&' );
        for( var i = 0; i < pieces.length; i++ ) {
            var paramSplit = pieces[i].split( '=' );
            locService.searchParams[ paramSplit[0] ] = paramSplit[1];
        }
        return locService;
    });
