{
  "Comment": "External Deployment Step Function for ECS/Fargate with NLB",
  "StartAt": "CheckandCreateService",
  "States": {
    "CheckandCreateService": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "Parameters": {
        "Payload.$": "$",
        "FunctionName": "${CheckFunction}:$LATEST"
      },
      "Retry": [
        {
          "ErrorEquals": [
            "Lambda.ServiceException",
            "Lambda.AWSLambdaException",
            "Lambda.SdkClientException"
          ],
          "IntervalSeconds": 2,
          "MaxAttempts": 6,
          "BackoffRate": 2
        }
      ],
      "Next": "WaitForServiceReady",
      "ResultSelector": { "Payload.$": "$.Payload" },
      "ResultPath": "$.check"
    },
    "WaitForServiceReady": {
      "Type": "Wait",
      "SecondsPath": "$.waitForService",
      "Next": "Swap"
    },
    "Swap": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "ResultPath": "$.swap",
      "ResultSelector": { "Payload.$": "$.Payload" },
      "Parameters": {
        "Payload": {
          "serviceName.$": "$.serviceName",
          "check.$": "$.check.Payload",
          "nlb.$": "$.nlb",
          "cluster.$": "$.cluster"
        },
        "FunctionName": "${SwapFunction}:$LATEST"
      },
      "Retry": [
        {
          "ErrorEquals": [
            "Lambda.ServiceException",
            "Lambda.AWSLambdaException",
            "Lambda.SdkClientException"
          ],
          "IntervalSeconds": 2,
          "MaxAttempts": 6,
          "BackoffRate": 2
        }
      ],
      "Next": "ScaleDown"
    },
    "ScaleDown": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "ResultSelector": { "Payload.$": "$.Payload" },
      "ResultPath": "$.scaledown",
      "Parameters": {
        "Payload": {
          "serviceName.$": "$.serviceName",
          "check.$": "$.check.Payload",
          "cluster.$": "$.cluster",
          "scaledown_decrement.$": "$.scaledown_decrement"
        },
        "FunctionName": "${ScaledownFunction}:$LATEST"
      },
      "Retry": [
        {
          "ErrorEquals": [
            "Lambda.ServiceException",
            "Lambda.AWSLambdaException",
            "Lambda.SdkClientException"
          ],
          "IntervalSeconds": 2,
          "MaxAttempts": 6,
          "BackoffRate": 2
        }
      ],
      "Next": "Wait"
    },
    "Wait": {
      "Type": "Wait",
      "SecondsPath": "$.scaledown_wait",
      "Next": "LoopTillRunning"
    },
    "Cleanup": {
      "Type": "Task",
      "Resource": "arn:aws:states:::lambda:invoke",
      "ResultSelector": { "Payload.$": "$.Payload" },
      "ResultPath": "$.cleanup",
      "Parameters": {
        "Payload": {
          "serviceName.$": "$.serviceName",
          "check.$": "$.check.Payload",
          "cluster.$": "$.cluster",
          "scaledown_decrement.$": "$.scaledown_decrement"
        },
        "FunctionName": "${ScaledownFunction}:$LATEST"
      },
      "Retry": [
        {
          "ErrorEquals": [
            "Lambda.ServiceException",
            "Lambda.AWSLambdaException",
            "Lambda.SdkClientException"
          ],
          "IntervalSeconds": 2,
          "MaxAttempts": 6,
          "BackoffRate": 2
        }
      ],
      "End": true
    },
    "LoopTillRunning": {
      "Type": "Choice",
      "Choices": [
        {
          "Variable": "$.scaledown.Payload.runningTask",
          "NumericLessThanEquals": 0,
          "Next": "Cleanup"
        }
      ],
      "Default": "ScaleDown"
    }
  }
}