angular.module('xm.xmatters-service', ['xm.glide-ajax'])
  .service('XMService', function($q, $http, GlideAjax) {
    var xmService = {};
    var searchConf = {
      people: {
        cache: {},
        type: 'PEOPLE',
        method: 'searchPeople',
        icon: 'user',
        decorator: function(person) {
          person.name = person.firstName + ' ' + person.lastName;
          person.value = person.targetName;
        }
      },
      groups: {
        cache: {},
        type: 'GROUPS',
        method: 'searchGroups',
        icon: 'users',
        decorator: function(group) {
          group.name = group.targetName;
          group.value = group.targetName;
        }
      }
    };

    /**
     * Used to validate and sanitize search terms so that only terms of longer than 2 characters
     * are sent to xmApi
     */
    var sanitizeSearchTerms = function(searchTerm) {
      var trimmedTerm = searchTerm.toLowerCase().trim();
      var pieces = trimmedTerm.split(' ');
      var validTerms = [];
      var isValid = false;
      for (var i = 0; i < pieces.length; i++) {
        var term = pieces[i].trim();
        if (term.length >= 2) {
          isValid = true;
          validTerms.push(term);
        }
      }
      return {
        isValid: isValid,
        term: validTerms.join(' ')
      };
    };
    var glideSearch = function(method, searchTerm) {
      var ga = new GlideAjax('xMattersAjaxEngageWorkflow');
      ga.addParam('sysparm_name', method);
      ga.addParam('search_term', encodeURIComponent(searchTerm));
      return ga.send();
    };

    var resolveSearch = function(searchTerm, searchType) {
      if (xmService.searchState.activeSearchTerm === searchTerm && xmService.searchState.activeSearchType === searchType) {
        xmService.searchState.isSearching = false;
      }
    };

    var startSearch = function(searchTerm, searchType) {
      xmService.searchState.isSearching = true;
      xmService.searchState.activeSearchType = searchType;
      xmService.searchState.activeSearchTerm = searchTerm;
    };

    /**
     * Helper function that actually performs the work for validating, sanitizing, caching,
     * searching xMatters for people/groups
     *
     * @param  {String} search
     *         The unsanitized search string (can be space delimited)
     * @param  {Object} searchOpts
     *         Configuration for the type of object we are searching. Properties:
     *         {
     *         		type: a string identifier,
     *         		method: the name of the method in the xMattersAjaxEngageWorkflow Script Include,
     *         		icon: an fa icon to use (without the fa-),
     *         		cache: an object that will be used to cache results,
     *         		decorator: a function that takes a single object (one item, group, person, etc)
     *         			and modifies anything that needs to be modified
     *         }
     * @return {varied}
     *         May return a promise of array of results depending on whether or not the result is cached already
     */
    var doSearch = function(search, searchOpts) {
      var searchTerm = sanitizeSearchTerms(search);
      if (!searchTerm.isValid) {
        return [];
      } else if (searchOpts.cache.hasOwnProperty(searchTerm.term)) {
        xmService.searchState.isSearching = false;
        return searchOpts.cache[searchTerm.term];
      } else {
        var term = searchTerm.term;
        startSearch(term, searchOpts.type);
        var deferred = $q.defer();
        glideSearch(searchOpts.method, term).then(function(res) {
          jslog(res);
          if (res.success) {
            var results = [];
            var data = JSON.parse(res.data.body);
            for (var i = 0; i < data.data.length; i++) {
              var item = data.data[i];
              item.icon = searchOpts.icon;
              searchOpts.decorator(item);
              results.push(item);
            }
            searchOpts.cache[term] = results;
            resolveSearch(term, searchOpts.type);
            deferred.resolve(results);
          } else {
            deferred.reject(res);
          }
        }).catch(function(e) {
          jslog('Error while searching for people "' + search + '"');
          jslog(e);
          deferred.reject(e);
        });
        return deferred.promise;
      }
    };

    /**
     * Search state is used to track whether or not the service is actively searching at a given point of
     * time and what is active.
     */
    xmService.searchState = {
      isSearching: false,
      activeSearchTerm: '',
      activeSearchType: ''
    };

    /**
     * function used by a typeahead to search for people matching a search term. Does some additional logic to
     * validate search terms, cache results and manage search state
     *
     * @param  {String} search
     *         The space delimited terms to search for. Each space delimited string must be at least 2 characters long
     * @return {Promise}
     *         A promise that will resolve with the people response from xMatters -- with additional full name value
     */
    xmService.searchPeople = function(search) {
      return doSearch(search, searchConf.people);
    };

    /**
     * function used by a typeahead to search for groups matching a search term. Does some additional logic to
     * validate search terms, cache results and manage search state
     *
     * @param  {String} search
     *         The space delimited terms to search for. Each space delimited string must be at least 2 characters long
     * @return {Promise}
     *         A promise that will resolve with the groups response from xMatters
     */
    xmService.searchGroups = function(search) {
      return doSearch(search, searchConf.groups);
    };

    xmService.getMeetingLinkFromTable = function(userID) {
      var deferred = $q.defer();
      var ga = new GlideAjax('xMattersAjaxEngageWorkflow');
      ga.addParam('sysparm_name', 'getMeetingLinkFromTable');
      ga.addParam('userID', encodeURIComponent(userID));
      ga.send().then(function(response) {
        if (response.success) {
          if (response.data.status >= 200 && response.data.status < 300) {
            deferred.resolve(JSON.parse(response.data.body).data);
            return;
          }
        }
        deferred.reject(response);
      }).catch(function(e) {
        jslog(e);
        deferred.reject(e);
      });

      return deferred.promise;
    };

    xmService.getDeviceNames = function() {
      var deferred = $q.defer();
      var ga = new GlideAjax('xMattersAjaxConfig');
      ga.addParam('sysparm_name', 'getDeviceNames');
      ga.setScope('x_xma_xmatters');
      ga.send().then(function(response) {
        if (response.success) {
          if (response.data.status >= 200 && response.data.status < 300) {
            deferred.resolve(JSON.parse(response.data.body).data);
            return;
          }
        }
        deferred.reject(response);
      }).catch(function(e) {
        jslog(e);
        deferred.reject(e);
      });
      return deferred.promise;
    };

    return xmService;
  });
