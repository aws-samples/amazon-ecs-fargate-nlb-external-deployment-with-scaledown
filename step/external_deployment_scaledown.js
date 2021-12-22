/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
    SPDX-License-Identifier: MIT-0 */

let aws = require('aws-sdk');
let ecs = new aws.ECS();

function processDescribeTaskSet(data, callback, config){
    console.debug("Describe success " + JSON.stringify(data));           // successful response

    let response = {};
    response.nlb = config.nlb;
    response.cluster = config.cluster;
    response.serviceToScaleDown = config.service;
    response.taskSetToScaleDown = config.taskSet;
    response.runningTask = data.taskSets[0].computedDesiredCount;

    // Scale down by decrement
    if ( response.runningTask > 0 ) {
      let new_scale = Math.max(0,data.taskSets[0].scale.value - config.decrement);
      let scale_params = {
        cluster: config.cluster,
        service : config.service,
        taskSet: config.taskSet,
        scale: {
          unit: "PERCENT",
          value: new_scale
        }
      };
      console.debug("Update task params " + JSON.stringify(scale_params));
      ecs.updateTaskSet(scale_params, function(err, data) {
        if (err) callback(Error(err), null);
        else {
          console.debug("Update success " + JSON.stringify(data));           // successful response
          callback(null, response );
        }
      });
    } else {
      let delete_params = {
        cluster: config.cluster,
        service : config.service,
        taskSet: config.taskSet
      };
      // We can delete the service & remove(?) the tag from the targetGroup
      console.log("Scaledown is already at 0, so deleting");
      ecs.deleteTaskSet(delete_params, function(err, data) {
        if (err) callback(Error(err), null);
        else {
          console.debug("Delete success " + JSON.stringify(data));           // successful response
          callback(null, response );
        }
      });
    }
}

exports.handler = function(event, context, callback) {
  console.log("REQUEST RECEIVED: " + JSON.stringify(event));

  let config = {};
  config.service = event.serviceName;
  config.taskSet = event.check.taskSetToScaleDown;
  config.cluster = event.cluster;

  // Configuration elements
  config.decrement = event.scaledown_decrement;

  // Get Service
  var params = {
    cluster: config.cluster,
    service: config.service,
    taskSets: [
      config.taskSet
    ]
  };
  console.debug("Describe params " + JSON.stringify(params));
  ecs.describeTaskSets(params, function(err,data) {
    if (err) callback(Error(err), null);
    else processDescribeTaskSet(data, callback, config);
  });
};