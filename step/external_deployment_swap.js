/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
    SPDX-License-Identifier: MIT-0 */

let aws = require('aws-sdk');
let elb = new aws.ELBv2();

function modifyListener(params, callback) {
  elb.modifyListener(params, function(err, data) {
    if (err) callback(Error(err), null);
    else {
      console.debug("modifyListener"  + JSON.stringify(data));
    }
  });
}

function findListenersAndModify(data, callback, config) {
  // Check serviceHealth
  let listener_80 = data.Listeners.find( v => v.Port == 80).ListenerArn;
  let listener_8080 = data.Listeners.find( v => v.Port == 8080).ListenerArn;

  // Swap listener default action
  let params_80 = {
    ListenerArn: listener_80,
    DefaultActions: [
     {
       Type: "forward",
       TargetGroupArn: config.nonProd
     }
    ]
  };
  modifyListener(params_80, callback);

  let params_8080 = {
    ListenerArn: listener_8080,
    DefaultActions: [
     {
       Type: "forward",
       TargetGroupArn: config.isProd
     }
    ]
  };
  modifyListener(params_8080, callback);

  // Adjust tagging
  let params_tags = {
    ResourceArns: [
        config.isProd
    ],
    TagKeys: [
        "isProduction",
    ]
  };

  let promises = [];
  promises.push(elb.removeTags(params_tags).promise());

  let params = {
    ResourceArns: [
        config.nonProd
    ],
    Tags: [
        { Key: "isProduction", Value: "true" },
        { Key: "serviceName", Value: config.serviceName }, // Remove when scaledown is reaching 0
        { Key: "taskSetId", Value: config.taskSetId } // Remove when scaledown is reaching 0
    ]
  };
  // Adjust tagging
  promises.push(elb.addTags(params).promise());

  Promise.all(promises).then( (values) => {
    console.debug(config.nonProd + " is now Port80, isProduction=true");
    let response = {};
    response.tgIsProd = config.nonProd;
    response.tgNonProd = config.isProd;

    callback(null,response);
  });
}

exports.handler = function(event, context, callback) {
  console.log("REQUEST RECEIVED:\n" + JSON.stringify(event));

  let config = {};
  config.nlb = event.nlb;
  config.nonProd = event.check.tgNonProd;
  config.isProd = event.check.tgIsProd;
  config.serviceName = event.serviceName;
  config.taskSetId = event.check.ecsTaskSetId;

  let listener_params = {
    LoadBalancerArn: config.nlb
  };
  elb.describeListeners(listener_params, function(err, data) {
    if (err) callback(Error(err), null);
    else findListenersAndModify(data, callback, config);
  });
};