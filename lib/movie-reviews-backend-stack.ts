import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from '../shared/util';
import { movieReviews } from '../seed/moviereviews';
import { Construct } from 'constructs';
import * as apig from "aws-cdk-lib/aws-apigateway"
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

    const api = new apig.RestApi(this, "RestApi", {
      description : "getMoviewReviews api",
      deployOptions:{
        stageName:"movies",
      },
      defaultCorsPreflightOptions:{
        allowHeaders:["Content-Type", "X-Amz-Date"],
        allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
        allowCredentials: true,
        allowOrigins: ["*"],
      }
    });

    
    
    const simpleFnURL = simpleFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors:{
        allowedOrigins:["*"]
      }
    });
    //to create movie reviews table in dynamo database
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
    //to seed the data into movie reviews table in dynamodb
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

    //this function is for creating a lambda function to get all movie reviews
    const getAllMovieReviews = new lambdanode.NodejsFunction(
      this,
      "GetAllMovieReviews",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/getAllMovieReviews.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviereviewstable.tableName,
          REGION: 'eu-west-1',
        },
      }
    )
    // to get the function URL of get all movie reviews
    const getAllMovieReviewsURL = getAllMovieReviews.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE ,
      cors:{
        allowedOrigins:["*"]
      }
    });
    //granting read access to the dynamo db table
    moviereviewstable.grantReadData(getAllMovieReviews)

    //to filter the reviews based on movie id, review id and reviewer id
    const getMovieReviewsId = new lambdanode.NodejsFunction(
      this,
      "GetMovieReviewsById",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/getMovieReviewsById.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviereviewstable.tableName,
          REGION: 'eu-west-1',
        },
      },
    )
    //to get the function URL of get movie reviews by movie id, review id and reviewer id
    const getMoviewReviewsByIdURL = getMovieReviewsId.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE ,
      cors:{
        allowedOrigins:["*"]
      }
    });
    moviereviewstable.grantReadData(getMovieReviewsId)

    const postMoviewReviews = new lambdanode.NodejsFunction(
      this, 
      "PostMoviewReviews",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/postMovieReview.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviereviewstable.tableName,
          REGION: 'eu-west-1',
        },
      }
    )
    const postMoviewReviewsURL = postMoviewReviews.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE ,
      cors:{
        allowedOrigins:["*"]
      }
    });
    moviereviewstable.grantReadWriteData(postMoviewReviews)

    const movieReviewsEndPoint = api.root.addResource("reviews");
    movieReviewsEndPoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getAllMovieReviews,{proxy:true})
    );
    const movieReviewsByIdEndPoint = movieReviewsEndPoint.addResource("{movieId}");
    movieReviewsByIdEndPoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewsId, {proxy:true})
    )
    const movieReviewsByReviewIdEndPoint = movieReviewsByIdEndPoint.addResource("{reviewId}");
    movieReviewsByReviewIdEndPoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewsId, {proxy:true})
    )
    const movieReviewsByReviewerIdEndPoint = movieReviewsByIdEndPoint.addResource("reviewer").addResource("{reviewerId}");
    movieReviewsByReviewerIdEndPoint.addMethod(
      "GET",
      new apig.LambdaIntegration(getMovieReviewsId, {proxy:true})
    )
    movieReviewsEndPoint.addMethod(
      "POST",
      new apig.LambdaIntegration(postMoviewReviews, {proxy:true})
    )
    new cdk.CfnOutput(this, "Post Movie Reviews Url", {value: postMoviewReviewsURL.url,});
    new cdk.CfnOutput(this, "Get Movie Reviews by Ids Url", {value: getMoviewReviewsByIdURL.url,});
    new cdk.CfnOutput(this, "Get All Movie Reviews Url", {value: getAllMovieReviewsURL.url,});
    new cdk.CfnOutput(this, "Simple Function Url", {value: simpleFnURL.url});
  }
}
