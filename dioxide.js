/*
Copyright 2011 Developer Town

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/


var dioxide = {};

Ti.include("/lib/dioxide_config.js");


/**
 * Dioxide
 * --------------------------
 * Mobile RPC Framework
 *
 * INSTALLATION:
 *   Place dioxide.js and dioxide_config.js a folder named 'lib' in your Titanium project's resource folder.
 *   Example:
 *      /MyCoolProject
 *          /Resources
 *              /lib
 *                  dioxide.js
 *                  dioxide_config.js
 *
 * CONFIGURATION:
 *   Update dioxide_config.js with the API endpoint that you will be connecting to:
 *      dioxide.config = { serviceURL: "http://my.cool.host/api", debug: false };
 *
 *   Other possible configuration options:
 *      debug: boolean value that indicates whether or not additional debug info concerning requests and responses should be
 *        printed to the Titanium console.
 *
 *   Note: It's perfectly acceptable to reference an application-specific variable or function call to evaluate parameters such as the serviceURL,
 *   in case your application has a more extensive configuration environment already in place.
 *
 * USAGE:
 *    See the documentation for dioxide.makeRPCCall below for sample usage.
 */
(function () {
    
    /**
     * Makes an RPC call.
     *
     * Sample Usage:
     *
     *   request = new dioxide.RPCRequest({
     *       uri: "/user",
     *       method: "login",
     *       payload: {
     *           username: "billybob",
     *           password: "mysecretpassword"
     *       }
     *   });
     *
     *  var success = function(response) {
     *      alert("Success!  Server said: " + response.getMessage());
     *  };
     *
     *  var failure = function(eventSource) {
     *      alert("Awww, failure");
     *  };
     *
     *  dioxide.makeRPCCall(request, success, failure);
     *
     * 
     * @param rpcRequest A dioxide.RPCRequest object, encapsulating the RPC request parameters
     * @param successHandler A callback function that will be executed upon a successful RPC call.
     *    It takes one paramter, which will be of the type dioxide.RPCResponse
     * @param errorHandler A callback function that will be executed upon RPC failure.  It takes one parameter,
     *    which will be the error "source" (Typically, the Titanium HTTP Client)
     */
    dioxide.makeRPCCall = function (/*dioxide.RPCRequest*/ rpcRequest, /*Function*/ successHandler, /*Function*/ errorHandler) {

        var handleOnLoad = function (e) {
            var xhr = e.source;

            try {
                var rpcResponse = new dioxide.RPCResponse(xhr.responseText);
            } catch (err) {
                handleOnError(e);
                return;
            }


            xhr.stopTime = new Date().getTime();

            if (dioxide.config.debug) {
                Ti.API.info("<< " + rpcResponse.to_json());
            }

            dioxide.rpcStats.addSuccessfulCall(xhr);

            successHandler(rpcResponse);
        };

        var handleOnError = function (e) {
            var xhr = e.source;

            xhr.stopTime = new Date().getTime();
            dioxide.rpcStats.addErroredCall(xhr);

            if (dioxide.config.debug) {
                Ti.API.warn("in handleOnError, body is: " + xhr.responseText);
                Ti.API.warn("HTTP Status: " + xhr.status);
                Ti.API.warn("Event JSON: " + JSON.stringify(e));
            }

            errorHandler(xhr);
        };

        var xhr = Ti.Network.createHTTPClient({
            onload: handleOnLoad,
            onerror: handleOnError
        });

        xhr.rpcRequest = rpcRequest;
        xhr.startTime = new Date().getTime();
        xhr.open('POST', dioxide.config.serviceURL);

        if (dioxide.config.debug) {
            Ti.API.info("RPC Endpoint: " + dioxide.config.serviceURL);
            Ti.API.info(">> " + rpcRequest.to_json());
        }

        xhr.send(rpcRequest.to_json());
    };




    /**
     * Object to define parameters surrounding an RPC request.
     *
     * @see dioxide.makeRPCCall(...) for usage example
     *
     * @param params_ An Object with properties needed to make an RPC request.
     *     @property(REQUIRED) uri The opaque URI for this request.  This can be anything, but will be defined in the RPC contract
     *       between the service and the client
     *     @property(REQUIRED) method The specific RPC method that is to be called on the server
     *     @property(OPTIONAL) session_id If a session has been established, this is the already established session id
     *     @property(OPTIONAL) device_id The unique device id of the mobile device initiating this request
     *     @property(OPTIONAL) payload Arguments to be supplied to the service method
     */
    dioxide.RPCRequest = function (/*Object*/ params) {
        var requestId = dioxide.RPCRequest.nextRequestId();

        if (
        params.uri == undefined || params.uri == null || params.method == undefined || params.method == null) {
            throw "RPCProtocolError";
        }

        this.setSessionId = function (sessionId_) {
            params.session_id = sessionId_;
        };
        this.setPayload = function (payload_) {
            params.payload = payload;
        };

        this.getMethod = function () {
            return params.method;
        };
        this.getURI = function () {
            return params.uri;
        };
        
        this.getRequestId = function() {
            return requestId;
        };

        this.to_json = function () {
            var req = {
                request_id: requestId,
                uri: params.uri,
                method: params.method
            };

            if (params.device_id != undefined && params.device_id != null) {
                req.device_id = params.device_id;
            }
            if (params.session_id != undefined && params.session_id != null) {
                req.session_id = params.session_id;
            }
            if (params.payload != undefined && params.payload != null) {
                req.payload = params.payload;
            }

            return JSON.stringify(req);
        };
    };
    
    /**
     * For Internal Use Only.
     * This method allocates new request Ids.
     */
    dioxide.RPCRequest.requestIdCounter = 0;
    dioxide.RPCRequest.nextRequestId = function () {
        return ++dioxide.RPCRequest.requestIdCounter;
    };
    

    /**
     * dioxide.RPCResponse encapsulates and parses an RPC response. (Surprise!)
     *
     * Dioxide API users will never construct an instance of this class directly, but are handed pre-constructed
     * instances in success handler callback functions.
     */
    dioxide.RPCResponse = function (responseDataText) {
        var responseData = JSON.parse(responseDataText);

        if (
        responseData == undefined || responseData == null || responseData.request_id == undefined || responseData.request_id == null || responseData.status_code == undefined || responseData.status_code == null || responseData.message == undefined || responseData.message == null) {
            Ti.API.error("Error in response data object, here's my datas: \n" + JSON.stringify(responseData));
            throw "RPCProtocolError";
        }

        this.isSuccess = function () {
            return (responseData.status_code >= 200) && (responseData.status_code < 300);
        };

        this.getRequestId = function () {
            return responseData.request_id;
        };
        this.getStatusCode = function () {
            return responseData.status_code;
        };
        this.getMessage = function () {
            return responseData.message;
        };
        this.getPayload = function () {
            return responseData.payload;
        };

        this.to_json = function () {
            res = {
                request_id: responseData.request_id,
                status_code: responseData.status_code,
                message: responseData.message
            };

            if (responseData.payload != undefined && responseData.payload != null) {
                res.payload = responseData.payload;
            }

            return JSON.stringify(res);
        };
    };

    /**
     * Class to capture statistics on Dioxide RPC method calls.  An instance of this class is always available
     * using the variable dioxide.rpcStats.  The most simple way to use this class is to periodically use the
     * toString() method, for example:
     *
     * Ti.API.info(dioxide.rpcStats.toString());
     */
    dioxide.RPCStats = function () {
        var rpcCalls = {};

        this.addSuccessfulCall = function (xhr) {
            var entry = getEntry(xhr);

            entry.invocations += 1;
            entry.totalMillis += (xhr.stopTime - xhr.startTime);
            entry.successfuCalls += 1;
        };

        this.addErroredCall = function (xhr) {
            var entry = getEntry(xhr);

            entry.invocations += 1;
            entry.totalMillis += (xhr.stopTime - xhr.startTime);
            entry.erroredCalls += 1;
        };

        var getEntry = function (xhr) {
            var uri = xhr.rpcRequest.getURI();
            var method = xhr.rpcRequest.getMethod();

            var callKey = uri + '#' + method;

            if (rpcCalls[callKey] == undefined) {
                rpcCalls[callKey] = {
                    successfuCalls: 0,
                    erroredCalls: 0,
                    invocations: 0,
                    totalMillis: 0
                };
            }

            return rpcCalls[callKey];
        };
        
        this.getStats = function() {
            return rpcCalls;
        };

        this.toString = function () {

            var str = "RPC Stats:\n";

            for (var x in rpcCalls) {
                if (rpcCalls.hasOwnProperty(x)) {
                    var val = rpcCalls[x];
                    str += "  " + x + ":\n";
                    str += "    invocation count: " + val.invocations + "\n";
                    str += "    success count: " + val.successfuCalls + "\n";
                    str += "    error count: " + val.erroredCalls + "\n";
                    str += "    average millis: " + (val.totalMillis / val.invocations) + "\n";
                }
            }

            return str;
        };
    };

    dioxide.rpcStats = new dioxide.RPCStats();
})();