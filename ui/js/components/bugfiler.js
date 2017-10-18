"use strict";

treeherder.component('bugFiler', {
    template: `
        <div class="modal fade bugfiler-modal"
             id="bugfiler-modal"
             tabindex="-1" role="dialog" aria-labelledby="bugfiler-modal" aria-hidden="true">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">

                <div class="modal-header">
                  <button type="button" class="close" ng-click="cancelFiler()"><span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>
                  <h4>Intermittent Bug Filer</h4>
                </div>
                <div class="modal-body">
                  <form id="modalForm">
                    <input name="modalProductFinderSearch" id="modalProductFinderSearch" ng-keydown="productSearchEnter($event)"
                           ng-model="productSearch" type="text" placeholder="Firefox" uib-tooltip="Manually search for a product" />
                    <button name="modalProductFinderButton" id="modalProductFinderButton"
                            type="button" ng-click="findProduct()" prevent-default-on-left-click>Find Product</button>
                    <div>
                      <div id="productSearchSpinner" ng-show="searching">
                        <span class="fa fa-spinner fa-pulse th-spinner-lg"></span>
                        Searching {{searching}}
                      </div>
                      <fieldset id="suggestedProducts" ng-init="selection={}">
                        <div ng-repeat="product in suggestedProducts">
                          <input type="radio" value="{{product}}"
                                 ng-model="selection.selectedProduct"
                                 name="productGroup" id="modalProductSuggestion{{$id}}"/>
                          <label for="modalProductSuggestion{{$id}}">{{product}}</label>
                        </div>
                      </fieldset>
                    </div>
                
                    <br/><br/>
                
                    <div id="failureSummaryGroup" class="collapsed">
                      <div id="unhelpfulSummaryReason" ng-show="unhelpfulSummaryReason()">
                        <div>
                          <span class="fa fa-info-circle" uib-tooltip="This can cause poor bug suggestions to be generated"></span>
                          Warning: {{unhelpfulSummaryReason()}}
                        </div>
                        <div ng-repeat="term in search_terms">
                          {{term}}
                        </div>
                      </div>
                      <label id="modalSummarylabel" for="modalSummary">Summary:</label>
                      <input id="modalSummary" type="text" placeholder="Intermittent..." pattern=".{0,255}" 
                             ng-model="modalSummary" ng-model-options="{allowInvalid:true}" />
                      <span id="modalSummaryLength" ng-bind="modalSummary.length" />
                      <a ng-class="{'filersummary-open-btn': isFilerSummaryVisible}" prevent-default-on-left-click>
                        <i ng-click="toggleFilerSummaryVisibility()" ng-hide="isFilerSummaryVisible" 
                           class="fa fa-chevron-right" uib-tooltip="Show all failure lines for this job">
                        </i>
                        <span ng-show="isFilerSummaryVisible">
                          <i ng-click="toggleFilerSummaryVisibility()" class="fa fa-chevron-down" uib-tooltip="Hide all failure lines for this job"></i>
                          <textarea id="modalFailureList">{{thisFailure}}</textarea>
                        </span>
                      </a>
                    </div>
                
                    <div id="modalLogLinkCheckboxes">
                      <label>
                        <input id="modalParsedLog" type="checkbox"
                               ng-model="checkedLogLinks.parsedLog"
                               ng-true-value="'{{parsedLog}}'"/>
                        <a target="_blank" href="{{ parsedLog }}">Include Parsed Log Link</a>
                      </label><br/>
                      <label>
                        <input id="modalFullLog" type="checkbox"
                               ng-model="checkedLogLinks.fullLog"
                               ng-true-value="'{{fullLog}}'"/>
                        <a target="_blank"  href="{{ fullLog }}">Include Full Log Link</a>
                      </label><br/>
                      <label id="modalReftestLogLabel" ng-if="isReftest()">
                        <input id="modalReftestLog" type="checkbox"
                               ng-model="checkedLogLinks.reftest"
                               ng-true-value="'{{reftest}}'"/>
                        <a target="_blank" href="{{ reftest }}">Include Reftest Viewer Link</a>
                      </label>
                    </div>
                
                    <div id="modalCommentDiv">
                      <label id="modalCommentlabel" for="modalComment">Comment:</label>
                      <textarea ng-model="modalComment" id="modalComment" type="textarea" placeholder=""></textarea>
                    </div>
                
                    <div id="modalExtras">
                      <label>
                        <input id="modalIsIntermittent"
                               ng-model="isIntermittent" type="checkbox"
                               ng-checked="true" />
                        This is an intermittent failure
                      </label>
                
                      <div id="modalRelatedBugs">
                        <input type="text" ng-model="modalBlocks" placeholder="Blocks" uib-tooltip="Comma-separated list of bugs" tooltip-placement="bottom" />
                        <input type="text" ng-model="modalDependsOn" placeholder="Depends on" uib-tooltip="Comma-separated list of bugs" tooltip-placement="bottom" />
                        <input type="text" ng-model="modalSeeAlso" placeholder="See also" uib-tooltip="Comma-separated list of bugs" tooltip-placement="bottom" />
                      </div>
                
                      <div ng-show="crashSignatures.length" id="modalCrashSignatureDiv">
                        <label id="modalCrashSignatureLabel" for="modalCrashSignature">Signature:</label>
                        <textarea id="modalCrashSignature" ng-model="crashSignatures" maxlength="2048"></textarea>
                      </div>
                    </div>
                  </form>
                </div>
                <div class="modal-footer">
                  <button name="modalCancelButton" id="modalCancelButton" type="button" ng-click="cancelFiler()"> Cancel </button>
                  <button name="modalSubmitButton" id="modalSubmitButton" type="button" ng-click="submitFiler()"> Submit Bug </button>
                </div>

            </div>
          </div>
        </div>

    `,
    controller: ['$scope', '$rootScope', '$http', 'summary',
        'search_terms', 'fullLog', 'parsedLog', 'reftest', 'selectedJob',
        'allFailures', 'crashSignatures', 'successCallback', 'thNotify',
        function ($scope, $rootScope, $http, summary, search_terms,
                  fullLog, parsedLog, reftest, selectedJob, allFailures,
                  crashSignatures, successCallback, thNotify) {

            const bzBaseUrl = "https://bugzilla.mozilla.org/";
            const hgBaseUrl = "https://hg.mozilla.org/";
            const dxrBaseUrl = "https://dxr.mozilla.org/";

            $scope.omittedLeads = ["TEST-UNEXPECTED-FAIL", "PROCESS-CRASH", "TEST-UNEXPECTED-ERROR", "REFTEST ERROR"];

            /**
             *  'enter' from the product search input should initiate the search
             */
            $scope.productSearchEnter = function (ev) {
                if (ev.keyCode === 13) {
                    $scope.findProduct();
                }
            };

            /*
             **
             */
            $scope.isReftest = function () {
                return reftest !== "";
            };

            $scope.search_terms = search_terms;
            $scope.parsedLog = parsedLog;
            $scope.fullLog = fullLog;
            $scope.crashSignatures = crashSignatures.join("\n");
            if ($scope.isReftest()) {
                $scope.reftest = reftest;
            }

            $scope.unhelpfulSummaryReason = function () {
                if (search_terms.length === 0) {
                    return "Selected failure does not contain any searchable terms.";
                }
                if (_.every(search_terms, function (term) {
                    return !$scope.modalSummary.includes(term);
                })) {
                    return "Summary does not include the full text of any of the selected failure's search terms:";
                }
                return "";
            };

            /**
             *  Pre-fill the form with information/metadata from the failure
             */
            $scope.initiate = function () {
                var thisFailure = "";

                // Auto-block the stylo-bustage metabug if this is a stylo failure
                if (selectedJob.build_platform.includes("stylo")) {
                    $scope.modalBlocks = "1381405,";
                }

                for (var i = 0; i < allFailures.length; i++) {
                    for (var j = 0; j < $scope.omittedLeads.length; j++) {
                        if (allFailures[i][0].search($scope.omittedLeads[j]) >= 0 && allFailures[i].length > 1) {
                            allFailures[i].shift();
                        }
                    }

                    allFailures[i][0] = allFailures[i][0].replace("REFTEST TEST-UNEXPECTED-PASS", "TEST-UNEXPECTED-PASS");

                    if (i !== 0) {
                        thisFailure += "\n";
                    }
                    thisFailure += allFailures[i].join(" | ");
                }
                $scope.thisFailure = thisFailure;

                $scope.findProduct();
            };

            $scope.parsedSummary = "";
            $scope.initiate = $scope.initiate;
            $scope.possibleFilename = "";

            /*
             *  Find the first thing in the summary line that looks like a filename.
             */
            var findFilename = function (summary) {
                // Take left side of any reftest comparisons, as the right side is the reference file
                summary = summary.split("==")[0];
                // Take the leaf node of unix paths
                summary = summary.split("/").pop();
                // Take the leaf node of Windows paths
                summary = summary.split("\\").pop();
                // Remove leading/trailing whitespace
                summary = summary.trim();
                // If there's a space in what's remaining, take the first word
                summary = summary.split(" ")[0];
                return summary;
            };

            /*
             *  Remove extraneous junk from the start of the summary line
             *  and try to find the failing test name from what's left
             */
            $scope.parseSummary = function (summary) {
                // Strip out some extra stuff at the start of some failure paths
                var re = /file:\/\/\/.*?\/build\/tests\/reftest\/tests\//gi;
                summary = summary.replace(re, "");
                re = /\/home\/worker\/workspace\/build\/src\//gi;
                summary = summary.replace(re, "");
                re = /chrome:\/\/mochitests\/content\/a11y\//gi;
                summary = summary.replace(re, "");
                re = /\/home\/worker\/checkouts\/gecko\//gi;
                summary = summary.replace(re, "");
                re = /http:\/\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):([0-9]+)\/tests\//gi;
                summary = summary.replace(re, "");
                re = /jetpack-package\//gi;
                summary = summary.replace(re, "");
                re = /xpcshell([-a-zA-Z0-9]+)?.ini:/gi;
                summary = summary.replace(re, "");
                summary = summary.replace("/_mozilla/", "mozilla/tests/");
                // We don't want to include "REFTEST" when it's an unexpected pass
                summary = summary.replace("REFTEST TEST-UNEXPECTED-PASS", "TEST-UNEXPECTED-PASS");

                summary = summary.split(" | ");

                // If the search_terms used for finding bug suggestions
                // contains any of the omittedLeads, that lead is needed
                // for the full string match, so don't omit it in this case.
                // If it's not needed, go ahead and omit it.
                for (var i = 0; i < $scope.omittedLeads.length; i++) {
                    if ($scope.search_terms.length > 0 && summary.length > 1 &&
                        !$scope.search_terms[0].includes($scope.omittedLeads[i]) &&
                        summary[0].search($scope.omittedLeads[i]) >= 0) {
                        summary.shift();
                    }
                }

                // Some of the TEST-FOO bits aren't removed from the summary,
                // so we sometimes end up with them instead of the test path here.
                var summaryName = summary[0].startsWith("TEST-") && summary.length > 1 ? summary[1] : summary[0];
                $scope.possibleFilename = findFilename(summaryName);

                return [summary, $scope.possibleFilename];
            };

            $scope.parsedSummary = $scope.parseSummary(summary);
            var summaryString = $scope.parsedSummary[0].join(" | ");
            if (selectedJob.job_group_name.toLowerCase().includes("reftest")) {
                var re = /layout\/reftests\//gi;
                summaryString = summaryString.replace(re, "");
            }
            $scope.modalSummary = "Intermittent " + summaryString;

            $scope.toggleFilerSummaryVisibility = function () {
                $scope.isFilerSummaryVisible = !$scope.isFilerSummaryVisible;
            };

            $scope.isFilerSummaryVisible = false;

            /*
             *  Attempt to find a good product/component for this failure
             */
            $scope.findProduct = function () {
                $scope.suggestedProducts = [];

                // Look up product suggestions via Bugzilla's api
                var productSearch = $scope.productSearch;

                if (productSearch) {
                    $scope.searching = "Bugzilla";
                    $http.get(bzBaseUrl + "rest/prod_comp_search/" + productSearch + "?limit=5").then(function (request) {
                        var data = request.data;
                        // We can't file unless product and component are provided, this api can return just product. Cut those out.
                        for (var i = data.products.length - 1; i >= 0; i--) {
                            if (!data.products[i].component) {
                                data.products.splice(i, 1);
                            }
                        }
                        $scope.searching = false;
                        $scope.suggestedProducts = [];
                        $scope.suggestedProducts = _.map(data.products, function (prod) {
                            if (prod.product && prod.component) {
                                return prod.product + " :: " + prod.component;
                            }
                            return prod.product;
                        });
                        $scope.selection.selectedProduct = $scope.suggestedProducts[0];
                    });
                } else {
                    var failurePath = $scope.parsedSummary[0][0];

                    // If the "TEST-UNEXPECTED-foo" isn't one of the omitted ones, use the next piece in the summary
                    if (failurePath.includes("TEST-UNEXPECTED-")) {
                        failurePath = $scope.parsedSummary[0][1];
                        $scope.possibleFilename = findFilename(failurePath);
                    }

                    // Try to fix up file paths for some job types.
                    if (selectedJob.job_group_name.toLowerCase().includes("spidermonkey")) {
                        failurePath = "js/src/tests/" + failurePath;
                    }
                    if (selectedJob.job_group_name.toLowerCase().includes("videopuppeteer ")) {
                        failurePath = failurePath.replace("FAIL ", "");
                        failurePath = "dom/media/test/external/external_media_tests/" + failurePath;
                    }
                    if (selectedJob.job_group_name.toLowerCase().includes("web platform")) {
                        failurePath = failurePath.startsWith("mozilla/tests") ?
                            `testing/web-platform/${failurePath}` :
                            `testing/web-platform/tests/${failurePath}`;
                    }

                    // Search mercurial's moz.build metadata to find products/components
                    $scope.searching = "Mercurial";
                    $http.get(`${hgBaseUrl}mozilla-central/json-mozbuildinfo?p=${failurePath}`).then(function (firstRequest) {
                        if (firstRequest.data.aggregate && firstRequest.data.aggregate.recommended_bug_component) {
                            var suggested = firstRequest.data.aggregate.recommended_bug_component;
                            addProduct(suggested[0] + " :: " + suggested[1]);
                        }

                        $scope.searching = false;

                        // Make an attempt to find the file path via a dxr file search
                        if ($scope.suggestedProducts.length === 0 && $scope.possibleFilename.length > 4) {
                            $scope.searching = "DXR & Mercurial";
                            const dxrlink = `${dxrBaseUrl}mozilla-central/search?q=file:${$scope.possibleFilename}&redirect=false&limit=5`;
                            // Bug 1358328 - We need to override headers here until DXR returns JSON with the default Accept header
                            $http.get(dxrlink, {
                                headers: {
                                    Accept: "application/json"
                                }
                            }).then((secondRequest) => {
                                const results = secondRequest.data.results;
                                var resultsCount = results.length;
                                // If the search returns too many results, this probably isn't a good search term, so bail
                                if (resultsCount === 0) {
                                    $scope.searching = false;
                                    injectProducts(failurePath);
                                }
                                results.forEach((result) => {
                                    $scope.searching = "DXR & Mercurial";
                                    $http.get(`${hgBaseUrl}mozilla-central/json-mozbuildinfo?p=${result.path}`)
                                        .then((thirdRequest) => {
                                            if (thirdRequest.data.aggregate && thirdRequest.data.aggregate.recommended_bug_component) {
                                                const suggested = thirdRequest.data.aggregate.recommended_bug_component;
                                                addProduct(suggested[0] + " :: " + suggested[1]);
                                            }
                                            // Only get rid of the throbber when all of these searches have completed
                                            resultsCount -= 1;
                                            if (resultsCount === 0) {
                                                $scope.searching = false;
                                                injectProducts(failurePath);
                                            }
                                        });
                                });
                            });
                        } else {
                            injectProducts(failurePath);
                        }

                        $scope.selection.selectedProduct = $scope.suggestedProducts[0];
                    });
                }
            };

            // Add a product/component pair to suggestedProducts
            var addProduct = function (product) {
                // Don't allow duplicates to be added to the list
                if (!$scope.suggestedProducts.includes(product)) {
                    $scope.suggestedProducts.push(product);
                    $scope.selection.selectedProduct = $scope.suggestedProducts[0];
                }
            };

            // Some job types are special, lets explicitly handle them.
            var injectProducts = function (fp) {
                if ($scope.suggestedProducts.length === 0) {
                    var jg = selectedJob.job_group_name.toLowerCase();
                    if (jg.includes("web platform")) {
                        addProduct("Testing :: web-platform-tests");
                    }
                    if (jg.includes("talos")) {
                        addProduct("Testing :: Talos");
                    }
                    if (jg.includes("mochitest") && (fp.includes("webextensions/") || fp.includes("components/extensions"))) {
                        addProduct("Toolkit :: WebExtensions: General");
                    }
                    if (jg.includes("mochitest") && fp.includes("webrtc/")) {
                        addProduct("Core :: WebRTC");
                    }
                }
                $scope.selection.selectedProduct = $scope.suggestedProducts[0];
            };

            /*
             *  Same as clicking outside of the modal, but with a nice button-clicking feel...
             */
            // $scope.cancelFiler = function () {
            //     $scope.dismiss('cancel');
            // };

            $scope.checkedLogLinks = {
                parsedLog: $scope.parsedLog,
                fullLog: $scope.fullLog,
                reftest: $scope.reftest
            };

            $scope.isIntermittent = true;

            /*
             *  Actually send the gathered information to bugzilla.
             */
            $scope.submitFiler = function () {
                var summarystring = $scope.modalSummary;
                var productString = "";
                var componentString = "";

                $scope.toggleForm(true);

                if ($scope.modalSummary.length > 255) {
                    thNotify.send("Please ensure the summary is no more than 255 characters", "danger");
                    $scope.toggleForm(false);
                    return;
                }

                if ($scope.selection.selectedProduct) {
                    var prodParts = $scope.selection.selectedProduct.split(" :: ");
                    productString += prodParts[0];
                    componentString += prodParts[1];
                } else {
                    thNotify.send("Please select (or search and select) a product/component pair to continue", "danger");
                    $scope.toggleForm(false);
                    return;
                }

                var descriptionStrings = _.reduce($scope.checkedLogLinks, function (result, link) {
                    if (link) {
                        result = result + link + "\n\n";
                    }
                    return result;
                }, "");
                if ($scope.modalComment) {
                    descriptionStrings += $scope.modalComment;
                }

                var keywords = $scope.isIntermittent ? ["intermittent-failure"] : [];

                var severity = "normal";
                var priority = "P5";
                var blocks = $scope.modalBlocks;
                var dependsOn = $scope.modalDependsOn;
                var seeAlso = $scope.modalSeeAlso;
                var crashSignature = $scope.crashSignatures;
                if (crashSignature.length > 0) {
                    keywords.push("crash");
                    severity = "critical";
                }

                // Fetch product information from bugzilla to get version numbers, then submit the new bug
                // Only request the versions because some products take quite a long time to fetch the full object
                $http.get(bzBaseUrl + "rest/product/" + productString + "?include_fields=versions")
                    .then(function (response) {
                        var productJSON = response.data;
                        var productObject = productJSON.products[0];

                        // Find the newest version for the product that is_active
                        var version = _.findLast(productObject.versions, function (version) {
                            return version.is_active === true;
                        });

                        return $http({
                            url: "api/bugzilla/create_bug/",
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json; charset=utf-8"
                            },
                            data: {
                                product: productString,
                                component: componentString,
                                summary: summarystring,
                                keywords: keywords,
                                version: version.name,
                                blocks: blocks,
                                depends_on: dependsOn,
                                see_also: seeAlso,
                                crash_signature: crashSignature,
                                severity: severity,
                                priority: priority,
                                comment: descriptionStrings,
                                comment_tags: "treeherder"
                            }
                        });
                    })
                    .then((response) => {
                        var data = response.data;
                        if (data.failure) {
                            var error = JSON.parse(data.failure.join(""));
                            thNotify.send("Bugzilla error: " + error.message, "danger", { sticky: true });
                            $scope.toggleForm(false);
                        } else {
                            successCallback(data);
                            $scope.cancelFiler();
                        }
                    })
                    .catch((response) => {
                        var failureString = "Bug Filer API returned status " + response.status + " (" + response.statusText + ")";
                        if (response.data && response.data.failure) {
                            failureString += "\n\n" + response.data.failure;
                        }
                        if (response.status === 403) {
                            failureString += "\n\nAuthentication failed. Has your Treeherder session expired?";
                        }
                        thNotify.send(failureString, "danger");
                        $scope.toggleForm(false);
                    });
            };

            /*
             *  Disable or enable form elements as needed at various points in the submission process
             */
            $scope.toggleForm = function (disabled) {
                $(':input', '#modalForm').attr("disabled", disabled);
            };
        }
    ],
});

