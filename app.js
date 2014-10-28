'use strict';

(function(angular) {
    var originalModule = angular.module;

    angular.module = function () {
        var module = originalModule.apply(this, arguments);
        module.hackDirective = function(name, fn) {
            module.config(['$provide', function($provide) {
                $provide.decorator(name + 'Directive', fn);
            }]);
        };
        return module;
    };

    var _id = 1,
        _generateRow = function(name) {
            return {
                'rowId': _id++,
                'name': name,
                'total': 0
            };
        };

    angular.module('dpApp', [])
        .controller('FooCtrl', ['$scope', '$timeout', '$interval', function($scope, $timeout, $interval) {
            $scope.rows = [
                _generateRow('foo'),
                _generateRow('bar'),
                _generateRow('rab'),
                _generateRow('baz')
            ];

            var $index = 0;
            $interval(function() {
                $scope.rows[$index%$scope.rows.length].total++;
                $index++;
            }, 1000);

            $scope.update = function(index) {
                $timeout(function() {
                    $scope.$broadcast('repeat-digest-row', index);
                });
            };

            $scope.addRow = function() {
                $scope.rows.push(_generateRow('foo' + $index));
            };

            $scope.removeRow = function($index) {
                $scope.rows.splice($index, 1);
            };
        }])
        .factory('eventSubscriberFactory', ['$q', function($q) {
            return function() {
                var listeners = [], result;

                result = function(cb) {
                    if (angular.isFunction(cb)) {
                        listeners.push(cb);

                        return function() {
                            listeners.splice(_.indexOf(listeners, cb), 1);
                        };
                    }

                    return angular.noop;
                };

                var _getArgs = function(args) {
                    return Array.prototype.slice.call(args, 0, args.length);
                };

                result.triggerAll = function() {
                    var args = _getArgs(arguments);

                    angular.forEach(listeners, function(listener) {
                        listener.apply(listener, args);
                    });
                };

                result.triggerAllAsPromise = function() {
                    var args = _getArgs(arguments);

                    return $q.all(_.map(listeners, function(listener) {
                        return $q.when(listener.apply(listener, args));
                    }));
                };

                result.listenerCount = function() {
                    return listeners.length;
                };

                return result;
            };
        }])
        .directive('dpCountWatches', ['eventSubscriberFactory', '$window', function(eventSubscriberFactory, $window) {

            var watchCounters = eventSubscriberFactory();

            // Expose it on the window object so we can access it in the terminal.
            $window.dpApp = $window.dpApp || {};
            $window.dpApp.countWatches = watchCounters.triggerAll;

            return {
                'restrict': 'A',
                'scope': true,
                'controller': ['$scope', '$element', function($scope, $element) {

                    var _calcWatches = function($scope) {
                        var $watches = angular.isArray($scope.$$watchers) ? $scope.$$watchers.length : 0,
                            currentSibling = $scope.$$childHead;

                        while (angular.isDefined(currentSibling) && currentSibling !== null) {
                            $watches += _calcWatches(currentSibling);
                            currentSibling = currentSibling.$$nextSibling;
                        }

                        return $watches;
                    };

                    var unwatch = watchCounters(function() {
                        console.log($element[0], _calcWatches($scope));
                    });

                    $scope.$on('$destroy', unwatch);
                }]
            };
        }])
        .hackDirective('ngRepeat', ['$delegate', '$timeout', function($delegate, $timeout) {
            var ngRepeat = $delegate[0],
                originalLink = ngRepeat.link;

            ngRepeat.compile = function() {

                return function($scope, $element, $attrs) {
                    var new$Scope = $scope,
                        args =  Array.prototype.slice.call(arguments),
                        original$New;

                    if ($attrs.hasOwnProperty('repeatDetachedScope')) {
                        new$Scope = $scope.$new();
                        original$New = new$Scope.$new;

                        new$Scope.$new = function() {
                            var childScope = original$New.apply(new$Scope, Array.prototype.slice.call(arguments)),
                                detachedScope;

                            childScope.$new = original$New;

                            detachedScope  = childScope.$new();
                            detachedScope.$on('$destroy', function() {
                                childScope.$destroy();
                            });

                            /**
                             * condition can be the index or a function that receives the scope for manual checking
                             */
                            childScope.$on('repeat-digest-row', function (event, condition, force) {
                                if (angular.isUndefined(condition)) {
                                    condition = angular.identity.bind(undefined, true);
                                } else if (angular.isNumber(condition)) {
                                    var index = condition;
                                    condition = function() {
                                        return index === detachedScope.$index;
                                    };
                                }

                                if (false && angular.isUndefined(condition) || (angular.isFunction(condition) && condition(detachedScope))) {
                                    if (detachedScope.$$phase) { // prevent digest in progess errors
                                        if (force === true) {
                                            $timeout(function() {
                                                detachedScope.$digest();
                                            });
                                        }
                                    } else {
                                        detachedScope.$digest();
                                    }
                                }
                            });

                            childScope.$$postDigest(function() {
                                childScope.$$childHead = childScope.$$childTail = null; // detach after initial digest
                            });

                            return detachedScope;
                        };
                    }

                    args[0] = new$Scope;

                    originalLink.apply(ngRepeat, args);
                };
            };

            return $delegate;
        }]);

}(angular));