import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from '../shared/util';
import { movieReviews } from '../seed/moviereviews';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class MovieReviewsBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const simpleFn = new lambdanode.NodejsFunction(this, "SimpleFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: `${__dirname}/../lambdas/simple.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });
    
    const simpleFnURL = simpleFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors:{
        allowedOrigins:["*"]
      }
    });

    const moviereviewstable = new dynamodb.Table(this, "MovieReviewsTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {name:"movieId", type: dynamodb.AttributeType.NUMBER},
      sortKey:{name:"reviewId", type:dynamodb.AttributeType.NUMBER},
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "MovieReviews"
    });
    moviereviewstable.addLocalSecondaryIndex({
      indexName: "reviewerId",
      sortKey: {name:"reviewerId", type:dynamodb.AttributeType.STRING},
    })
    new custom.AwsCustomResource(this, "moviereviewsdbInitData",{
      onCreate:{
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters:{
          RequestItems:{
            [moviereviewstable.tableName]:generateBatch(movieReviews),
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of('moviereviewsdbInitData'),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources:[moviereviewstable.tableArn]
      })
    });

    new cdk.CfnOutput(this, "Simple Function Url", {value: simpleFnURL.url});
  }
}
