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

    angular.module('myApp', [])
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
                    $scope.$broadcast('digest', index);
                });
            };

            $scope.addRow = function() {
                $scope.rows.push(_generateRow('foo' + $index));
            };

            $scope.removeRow = function($index) {
                $scope.rows.splice($index, 1);
            };
        }])
        .directive('taCountWatches', [function() {

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

                    $scope.$parent.$watch(function() {
                        return _calcWatches($scope);
                    }, function(nbWatches) {
                        if (angular.isNumber(nbWatches)) {
                            console.log($element, nbWatches);
                        }
                    });
                }]
            }
        }])
        .hackDirective('ngRepeat', ['$delegate', '$timeout', function($delegate, $timeout) {
            var ngRepeat = $delegate[0],
                originalLink = ngRepeat.link;

            ngRepeat.compile = function() {

                return function($scope, $element, $attrs) {
                    var new$Scope = $scope,
                        args =  Array.prototype.slice.call(arguments),
                        original$New;

                    if ($attrs.hasOwnProperty('repeatDetached')) {
                        new$Scope = $scope.$new();
                        original$New = new$Scope.$new;

                        new$Scope.$new = function () {
                            var childScope = original$New.apply(new$Scope, Array.prototype.slice.call(arguments)),
                                detachedScope;

                            childScope.$new = original$New;

                            detachedScope  = childScope.$new();
                            detachedScope.$on('$destroy', function() {
                                childScope.$destroy();
                            });

                            childScope.$on('digest', function (event, index) {
                                if (angular.isUndefined(index) || index === detachedScope.$index) {
                                    detachedScope.$digest();
                                }
                            });

                            // @todo iets maken dat hem wel attached tot de initiele data is binnengekomen
                            // watchen tot de property voor deze ngRepeat ene keer defined geweest is?
                            // kan misschien beter ... misschien evalAsync
                            // for now just digest one time in the next digestCycle :)
                            $timeout(function() {
                                childScope.$$childHead = childScope.$$childTail = null;
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