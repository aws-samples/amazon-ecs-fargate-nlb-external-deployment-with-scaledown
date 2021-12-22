/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
    SPDX-License-Identifier: MIT-0 */

let aws = require('aws-sdk');
let elb = new aws.ELBv2();
let ecs = new aws.ECS();

function createTaskSet(callback, config, response) {
  var params = {
    cluster: config.cluster,
    service: config.serviceName, // Fix
    taskDefinition: config.taskDefinition,
    launchType: "FARGATE",
    loadBalancers: [
    {
      containerName: "webserver", // TODO configurable
      containerPort: 8080, // TODO configurable
      targetGroupArn: response.tgNonProd
    }
    ],
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: config.subnets,
        securityGroups: [ config.task_sg ],
        assignPublicIp: "DISABLED"
      }
    },
    scale: {
      unit: "PERCENT",
      value: '100'
    }
  };
  ecs.createTaskSet(params, function(err, data) {
    if (err) callback(Error(err), null);
    else {
      console.debug("CreateTaskSet " + JSON.stringify(data));           // successful response
      response.ecsTaskSetId = data.taskSet.id;
      response.ecsTaskSetArn = data.taskSet.taskSetArn;
      callback(null, response);
    }
  });

}

function processTargetGroupTags(data, callback, config) {
  console.debug("Describe Tags" + JSON.stringify(data));           // successful response

  //Initialize callback object
  let response = {};

  const isProdIndex = data.TagDescriptions.findIndex( td => {
      return td.Tags.find(tag => { return tag.Key == "isProduction"; });
  });
  tgIsProd = data.TagDescriptions[isProdIndex];
  response.tgIsProd = tgIsProd.ResourceArn;
  response.taskSetToScaleDown = tgIsProd.Tags.find( v => { return v.Key == 'taskSetId'; } ).Value;

  // Let's remove the prod listener from array
  console.debug("ProdIndex " + isProdIndex);
  console.debug("ServiceName " + config.serviceName);
  console.debug("TaskSetToScaleDown " + response.taskSetToScaleDown);
  data.TagDescriptions.splice(isProdIndex,1);

  const nonProd = data.TagDescriptions.find(v => { return v; });
  response.tgNonProd = nonProd.ResourceArn;

  // Create new service with the non-prod TG
  createTaskSet(callback, config, response);
}

function processTargetGroup(data, callback, config) {
  console.debug("processTargetGroup " + JSON.stringify(data));           // successful response
  const targetGroups = data.TargetGroups.map(el => el.TargetGroupArn);

  elb.describeTags({
    ResourceArns: targetGroups
  },function(err, tags) {
    if (err) callback(Error(err), null);
    else processTargetGroupTags(tags, callback, config);
  });
}

exports.handler = function(event, context, callback) {
  console.log("REQUEST RECEIVED: " + JSON.stringify(event));

  let config = {};

  // Configuration Items
  config.task_sg = event.task_sg || callback("task_sg value needed");
  config.subnets = event.subnets || callback("subnets value needed");
  config.cluster = event.cluster || callback("cluster value needed");
  config.taskDefinition = event.taskDefinition || callback("taskDefinition value needed");
  config.serviceName = event.serviceName || callback("serviceName value needed");
  config.nlb = event.nlb || callback("NLB value needed");

  elb.describeTargetGroups({LoadBalancerArn : config.nlb }, function(err, data) {
    if (err) callback(Error(err), null);
    else processTargetGroup(data, callback, config);
  });
};