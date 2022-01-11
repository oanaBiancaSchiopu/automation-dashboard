function UtilsFactory($window, $uibModal, $filter, $cookies, $http, $rootScope, $q, toastr, SweetAlert) {
    var specialUIModel = ['pa:boolean', 'pa:list', 'pa:datetime', 'pa:hidden', 'pa:global_file', 'pa:user_file', 'pa:global_folder', 'pa:user_folder', 'pa:catalog_object', 'pa:credential'];

    function openJobInSchedulerPortal(jobId) {
        if (jobId) {
            var url = JSON.parse(localStorage.schedulerPortalUrl) + '/?job=' + jobId;
            var win = $window.open(url, '/scheduler/');
            win.focus();
        }
    }

    function updateCursor(isWaiting) {
        var body = angular.element(document).find('body');
        if (isWaiting) {
            body.addClass('waiting');
        } else {
            body.removeClass('waiting');
        }
    }

    // check whether the variable needs a special UI (i.e., it's not simply showing its value with an inputbox)
    // For example, if the variable is the type 'pa:boolean', 'pa:list', or 'pa:datetime' etc, the function return true
    function isSpecialUIModel(variable) {
        return -1 !== specialUIModel.findIndex(function (targetModel) {
            if (variable.resolvedModel) {
                return variable.resolvedModel.toLowerCase().indexOf(targetModel) == 0;
            }
            return variable.resolvedModel.toLowerCase().indexOf(targetModel) == 0;
        });
    };

    // When the variable value is null or undefined, convert it to the empty string
    function parseEmptyVariablesValue(variables) {
        angular.forEach(variables, function (variable) {
            if (variable.value == null) {
                variable.value = '';
            }
        });
        return variables;
    }
    // returns true when variables includes advanced variables and false otherwise
    function isVariablesIncludeAdvancedVar(variables){
        return variables.findIndex(function(variable){
                  return  variable.advanced;
                }) > -1;
    }

    function extractVariableValue(variable, model) {
        // for data binding, we need to transform boolean to 'false'/'true' (instead of numbers or strings with upper case)
        if (model && model.toLowerCase().indexOf('pa:boolean') == 0) {
            if (variable.value.toLowerCase() === 'true' || variable.value == 1) {
                return 'true';
            } else if (variable.value.toLowerCase() === 'false' || variable.value == 0) {
                return 'false';
            }
        } else {
            return variable.value;
        }
    }

    function extractVariables(modifiedWorkflow) {
        var variables = [];
        angular.forEach(modifiedWorkflow.variables_order, function(group, key){
            angular.forEach(group, function(variable){
                variable.value = extractVariableValue(variable, variable.model);
                variable.group = key;
                variables.push(variable);
            })
        })
        return variables;
    }

    // open a pop-up to browse the catalog objects and select one
    function openCatalogObjectModal(variable, variableModel) {
        $uibModal.open({
            templateUrl: 'views/modals/catalog_objects_modal.html',
            controller: 'CatalogObjectsModalCtrl',
            windowClass: 'fadeIn catalog-objects-modal',
            size: 'xl',
            keyboard: true,
            backdrop: 'static',
            resolve: {
                variable: function () {
                    return variable;
                },
                variableModel: function () {
                    return variableModel;
                }
            }
        });
    }

    // open a pop-up to manage (browse, upload, delete) the global or user data space files
    function openFileBrowser(variable, dataspace, selectFolder) {
        $uibModal.open({
            templateUrl: 'views/modals/dataspace-file-browser.html',
            controller: 'FileBrowserModalCtrl',
            windowClass: 'fadeIn file-browser-modal',
            size: 'xl',
            keyboard: true,
            backdrop: 'static',
            resolve: {
                dataspace: function () {
                    return dataspace;
                },
                variable: function () {
                    return variable;
                },
                selectFolder: function () {
                    return selectFolder;
                }
            }
        });
    }

    function uploadDataspaceFile(url, selectedFile, isGlobalFile, successCallback, errorCallback) {
        if ($rootScope.uploadingFiles === void 0) {
            $rootScope.uploadingFiles = [];
        }
        if ($rootScope.uploadingCancelers === void 0) {
            $rootScope.uploadingCancelers = new Map();
        }

        var uploadId = Math.random().toString(36).substr(2, 9);
        $rootScope.uploadingFiles.push({
            id: uploadId,
            filename: selectedFile.name,
            size: toReadableFileSize(selectedFile.size),
            isGlobalFile: isGlobalFile,
            uploaded: 0,
            remainingSeconds: 0
        })

        var uploadRequestCanceler = $q.defer();
        $rootScope.uploadingCancelers.set(uploadId, {filename: selectedFile.name, canceler: uploadRequestCanceler});

        var timeStarted = moment();
        $http({
            url: url,
            method: 'PUT',
            data: selectedFile,
            processData: false,
            timeout: uploadRequestCanceler.promise,
            uploadEventHandlers: {
                progress: function (e) {
                    if (e.lengthComputable) {
                        uploadProgress = (e.loaded / e.total) * 100;
                        $('.' + uploadId + ' .progress-bar').css('width', uploadProgress + '%');
                        $('.' + uploadId + ' .upload-progress').html(toReadableFileSize(e.loaded) + '/' + toReadableFileSize(e.total));

                        var timeElapsed = moment().diff(timeStarted);
                        var uploadSpeed = e.loaded / (timeElapsed / 1000); // Upload speed in bytes per second
                        $('.' + uploadId + ' .upload-speed').html(toReadableNetworkSpeed(uploadSpeed * 8)); // Upload speed in bps, Kbps, or Mbps

                        var remainingSeconds = Math.floor((e.total - e.loaded) / uploadSpeed);  // estimated remaining seconds for uploading
                        $('.' + uploadId + ' .upload-remaining-time').html(timeToHHMMSS(remainingSeconds) + ' left');

                        var maxRemainSeconds = 0;
                        var totalUploaded = 0
                        var totalSize = 0;
                        for (var i = 0; i < $rootScope.uploadingFiles.length; i++) {
                            if ($rootScope.uploadingFiles[i].id === uploadId) {
                                $rootScope.uploadingFiles[i].uploaded = e.loaded;
                                $rootScope.uploadingFiles[i].remainingSeconds = remainingSeconds;
                            }
                            maxRemainSeconds = Math.max(maxRemainSeconds, $rootScope.uploadingFiles[i].remainingSeconds);
                            totalUploaded += $rootScope.uploadingFiles[i].uploaded;
                            totalSize += $rootScope.uploadingFiles[i].size
                        }
                        $rootScope.totalRemainTime = maxRemainSeconds * 1000;
                        $rootScope.totalProgress = (totalUploaded / totalSize) * 100;
                    }
                }
            },
            headers: {'sessionid': getSessionId()}
        })
            .success(function (data) {
                successCallback();
                toastr.success('Your file ' + selectedFile.name + ' has been successfully uploaded.', {
                    closeButton: true,
                    timeOut: 5000,
                    extendedTimeOut: 0
                });
                $rootScope.uploadingFiles = $rootScope.uploadingFiles.filter(function (x) {
                    return x.id !== uploadId;
                });
                $rootScope.uploadingCancelers.delete(uploadId);
            })
            .error(function (xhr, status, headers, config) {
                errorCallback();
                // No need to show error message for cancelled request (status 499)
                if (config.timeout.status !== 499) {
                    var errorMessage = '';
                    if (xhr) {
                        errorMessage = ': ' + xhr;
                    }
                    toastr.error('Failed to upload the file ' + selectedFile.name + errorMessage, {
                        closeButton: true,
                        timeOut: 0,
                        extendedTimeOut: 0
                    })
                }
                $rootScope.uploadingFiles = $rootScope.uploadingFiles.filter(function (x) {
                    return x.id !== uploadId;
                });
                $rootScope.uploadingCancelers.delete(uploadId);
            });
    }

    // convert a duration (number of seconds) to a human readable format (D:HH:MM:SS)
    function timeToHHMMSS(totalSeconds) {
        return totalSeconds ? moment.duration(totalSeconds * 1000).format('D[d]H[h]m[m]s[s]') : '';
    }

    function toReadableNetworkSpeed(uploadSpeedBps) {
        var uploadSpeedKbps = uploadSpeedBps / 1024;
        if (uploadSpeedKbps < 1) {
            return uploadSpeedBps.toFixed(2) + ' b/s';
        } else if (uploadSpeedKbps < 1024) {
            return uploadSpeedKbps.toFixed(2) + ' Kb/s'
        } else {
            return (uploadSpeedKbps / 1024).toFixed(2) + ' Mb/s';
        }
    }

    function toReadableFileSize(size) {
        if (typeof bytes !== 'number') {
            size = parseInt(size);
        }
        var units = [' B', ' KB', ' MB', ' GB', ' TB']
        var unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return size.toFixed(1) + units[unitIndex];
    }

    /**
     This function translates string and concat them one after the other.
     If a string hasn't got translations, it will be concatenated as written.
     */
    function translate(stringsToTranslate) {
        var translatedStr = '';
        if (stringsToTranslate !== undefined) {
            if (!Array.isArray(stringsToTranslate)) {
                stringsToTranslate = [stringsToTranslate];
            }

            for (i = 0; i < stringsToTranslate.length; i++) {
                translatedStr = translatedStr.concat(' ').concat($filter('translate')(stringsToTranslate[i].replace(/\n/gm, '<br>')));
            }
        }
        return translatedStr.trim();
    }

    function displayTranslatedMessage(type, titleToTranslate, messageToTranslate) {
        var swalContent = {html: true};

        if (titleToTranslate !== undefined) {
            if (!Array.isArray(titleToTranslate)) {
                titleToTranslate = [titleToTranslate];
            }
            swalContent.title = translate(titleToTranslate);
        }

        if (messageToTranslate !== undefined) {
            if (!Array.isArray(messageToTranslate)) {
                messageToTranslate = [messageToTranslate];
            }
            swalContent.text = translate(messageToTranslate);
        }

        if (type === 'error' || type === 'warning' || type === 'success' || type === 'info') {
            swalContent.type = type;
        } else if (type === undefined) {
            console.log('No type has been defined for the displayed message')
        } else {
            console.log(type + ' is not a valid message type to be displayed')
        }

        SweetAlert.swal(swalContent);
    }

    function displayTranslatedErrorMessage(title, message) {
        displayTranslatedMessage('error', title, message);
    }

    function displayTranslatedSuccessMessage(title, message) {
        displayTranslatedMessage('success', title, message);
    }

    function openEndpoint(url) {
        // Add default protocol if it is not provided (when launching locally)
        if (!url.match(/^[a-zA-Z]+:\/\//)) {
            url = window.location.protocol + '//' + url;
        }
        var parsedUrl = new URL(url);
        // Open the endpoint in the browser only if the protocol is http or https
        if (parsedUrl.protocol.startsWith('http')){

            if (parsedUrl.pathname.includes('cloud-automation-service/services/')) {
                //override the hostname of the target url (with the hostname of the current window)
                parsedUrl.hostname = window.location.hostname;

                //add a cookie with a domain set to the same hostname (i.e., the hostname of the current window)
                $cookies.put('sessionid', getSessionId(), {
                    domain: parsedUrl.hostname,
                    path: '/'
                });
            }

            //open the targeted url
            $window.open(parsedUrl.href, url);
        }
    }

    function getByKey(propertyLabel, propertyName, collection) {
        var len = collection.length;
        var value = '';
        for (var i = 0; i < len; i++) {
            if ((collection[i].label === propertyLabel) && (collection[i].key === propertyName)) {
                value = collection[i].value;
            }
        }
        return value;
    }

    /**
     * Get the url or proxified url for a given endpoint
     * @param endpoint
     * @returns {string}
     */
    function getEndpointUrl(endpoint) {
        return endpoint.proxyfied ? endpoint.proxyfiedUrl : endpoint.url;
    }

    /** Transforms list of variables format to key-value without model :
    from : ["toto": {"value": 1, "model":"PA:INTEGER"}, ...]
    to : ["toto":1] **/
    function getVariablesInKeyValueFormat(variables) {
        var result = {};
        angular.forEach(variables, function(variable){
            var name = variable.name;
            var value = variable.value;
            result[name] = value;
        });
        return result;
    };

    function modelToDateFormat(model) {
        var indexBegin = model.indexOf('(');
        var indexEnd = model.lastIndexOf(')');
        var javaDateTimeFormat =  model.substring(indexBegin + 1, indexEnd).trim();
        return moment().toMomentFormatString(javaDateTimeFormat);
    };

    function modelToList (model) {
        var indexBegin = model.indexOf('(');
        var indexEnd = model.lastIndexOf(')');
        var options = model.substring(indexBegin + 1, indexEnd).split(',');
        return options.map(function (option) {
            return option.trim();
        });
    };

    function modelToDateScope (model) {
        var indexBegin = model.indexOf('[');
        var indexEnd = model.lastIndexOf(']');
        var dates = model.substring(indexBegin + 1, indexEnd).split(',');
        var dateScope = {};
        if (dates.length > 1) {
            dateScope.min = dates[0].trim();
            dateScope.max = dates[1].trim();
        }
        return dateScope;
    };
    return {
        openJobInSchedulerPortal: openJobInSchedulerPortal,
        isSpecialUIModel: isSpecialUIModel,
        parseEmptyVariablesValue: parseEmptyVariablesValue,
        openCatalogObjectModal: openCatalogObjectModal,
        openFileBrowser: openFileBrowser,
        uploadDataspaceFile: uploadDataspaceFile,
        toReadableFileSize: toReadableFileSize,
        translate: translate,
        displayTranslatedMessage: displayTranslatedMessage,
        displayTranslatedErrorMessage: displayTranslatedErrorMessage,
        displayTranslatedSuccessMessage: displayTranslatedSuccessMessage,
        updateCursor: function (isWaiting) {
            return updateCursor(isWaiting);
        },
        extractVariables: extractVariables,
        openEndpoint: openEndpoint,
        getEndpointUrl: getEndpointUrl,
        getByKey: getByKey,
        getVariablesInKeyValueFormat: getVariablesInKeyValueFormat,
        isVariablesIncludeAdvancedVar: isVariablesIncludeAdvancedVar,
        modelToDateFormat: modelToDateFormat,
        modelToList: modelToList,
        modelToDateScope: modelToDateScope
    };
}

angular.module('main')
    .factory('UtilsFactory', UtilsFactory);
