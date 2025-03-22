import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from '../shared/util';
import { movieReviews } from '../seed/moviereviews';
import { Construct } from 'constructs';
import * as apig from "aws-cdk-lib/aws-apigateway"
import * as iam from "aws-cdk-lib/aws-iam";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cognito from "aws-cdk-lib/aws-cognito";
import { UserPool } from "aws-cdk-lib/aws-cognito";

export class MovieReviewsBackendStack extends cdk.Stack {
    private auth: apig.IResource;
    private userPoolId: string;
    private userPoolClientId: string;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new UserPool(this, "UserPool", {
                signInAliases: { username: true, email: true },
                selfSignUpEnabled: true,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.userPoolId = userPool.userPoolId;
        const appClient = userPool.addClient("AppClient", {
            authFlows: { userPassword: true },
    });
    this.userPoolClientId = appClient.userPoolClientId;
    const authApi = new apig.RestApi(this, "AuthServiceApi", {
                description: "Authentication Service RestApi",
                endpointTypes: [apig.EndpointType.REGIONAL],
                defaultCorsPreflightOptions: {
                  allowOrigins: apig.Cors.ALL_ORIGINS,
                },
    });
    const appCommonFnProps = {
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        environment: {
          USER_POOL_ID: this.userPoolId,
          CLIENT_ID: this.userPoolClientId,
          REGION: cdk.Aws.REGION,
          },
    };
    this.auth = authApi.root.addResource("auth");
    this.addAuthRoute(
      "signup",
      "POST",
      "SignupFn",
      "signup.ts")
    this.addAuthRoute(
        "confirm_signup",
        "POST",
        "ConfirmFn",
        "confirm-signup.ts"
      )
  this.addAuthRoute('signout', 'GET', 'SignoutFn', 'signout.ts');
  this.addAuthRoute('signin', 'POST', 'SigninFn', 'signin.ts'); 
  const authorizerFn = new lambdanode.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../lambdas/auth/authorizer.ts`,
  });
  const requestAuthorizer = new apig.RequestAuthorizer(this,"RequestAuthorizer",{
      identitySources: [apig.IdentitySource.header("cookie")],
      handler:authorizerFn,
      resultsCacheTtl: cdk.Duration.minutes(0)
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

    const updateMovieReviews = new lambdanode.NodejsFunction(
      this,
      "UpdateMovieReview",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/updateMovieReview.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviereviewstable.tableName,
          REGION: 'eu-west-1',
        },
      }
    )
    const updateMovieReviewURL = updateMovieReviews.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE ,
      cors:{
        allowedOrigins:["*"]
      }
    })
    moviereviewstable.grantReadWriteData(updateMovieReviews);

    const deleteMovieReviews = new lambdanode.NodejsFunction(
      this,
      "DeleteMovieReview",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/deleteMovieReview.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviereviewstable.tableName,
          REGION: 'eu-west-1',
        },
      }
    )
    const deleteMovieReviewURL = deleteMovieReviews.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE ,
      cors:{
        allowedOrigins:["*"]
      }
    })
    moviereviewstable.grantReadWriteData(deleteMovieReviews)

    const translatedMovieReview = new lambdanode.NodejsFunction(
      this,
      "TranslateMovieReview",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/translateMovieReview.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          TABLE_NAME: moviereviewstable.tableName,
          REGION: 'eu-west-1',
        },
      }
    )
    const translateMovieReviewURL = translatedMovieReview.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE ,
      cors:{
        allowedOrigins:["*"]
      }
    });
    moviereviewstable.grantReadWriteData(translatedMovieReview)
    translatedMovieReview.addToRolePolicy(
      new iam.PolicyStatement({
        actions:["translate:TranslateText"],
        resources:["*"]
      })
    )
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
    const updateMovieIdReviewEndPoint = api.root.addResource("{movieId}")
    const updateMovieReviewsEndPoint = updateMovieIdReviewEndPoint.addResource("reviews")
    const movieReviewsByReviewIdEndPoint = updateMovieReviewsEndPoint.addResource("{reviewId}");
    movieReviewsEndPoint.addMethod(
      "POST",
      new apig.LambdaIntegration(postMoviewReviews, {proxy:true}),{
        authorizer:requestAuthorizer,
        authorizationType:apig.AuthorizationType.CUSTOM
      }
    )
    movieReviewsByReviewIdEndPoint.addMethod(
      "PATCH",
      new apig.LambdaIntegration(updateMovieReviews, {proxy:true}),{
        authorizer:requestAuthorizer,
        authorizationType:apig.AuthorizationType.CUSTOM
      }
    )
    movieReviewsByReviewIdEndPoint.addMethod(
      "DELETE",
      new apig.LambdaIntegration(deleteMovieReviews, {proxy:true}),{
        authorizer:requestAuthorizer,
        authorizationType:apig.AuthorizationType.CUSTOM
      }
    )
    
    const translationEndpoint =  api.root.addResource("reviewtranslations")
    const translationReviewsEndpoint = translationEndpoint.addResource("reviews")
    const translationReviewIDEndpoint = translationReviewsEndpoint.addResource("{reviewId}")
    const translationMovieIDEndpoint = translationReviewIDEndpoint.addResource("{movieId}")
    const translateMovieReviewsByTranslateIdEndPoint = translationMovieIDEndpoint.addResource("translation");
    translateMovieReviewsByTranslateIdEndPoint.addMethod(
      "PATCH",
      new apig.LambdaIntegration(translatedMovieReview, {proxy:true})
    )
    new cdk.CfnOutput(this, "CognitoUserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "Translate Movie Reviews Url", {value: translateMovieReviewURL.url,});
    new cdk.CfnOutput(this, "Delete Movie Reviews Url", {value: deleteMovieReviewURL.url,});
    new cdk.CfnOutput(this, "Update Movie Reviews Url", {value: updateMovieReviewURL.url,});
    new cdk.CfnOutput(this, "Post Movie Reviews Url", {value: postMoviewReviewsURL.url,});
    new cdk.CfnOutput(this, "Get Movie Reviews by Ids Url", {value: getMoviewReviewsByIdURL.url,});
    new cdk.CfnOutput(this, "Get All Movie Reviews Url", {value: getAllMovieReviewsURL.url,});
  }

  private addAuthRoute(
          resourceName: string,
          method:string,
          fnName:string,
          fnEntry:string,
          allowCognitoAcccess?:boolean
        ):void{
          const commonFnProps = {
            architecture: lambda.Architecture.ARM_64,
            timeout: cdk.Duration.seconds(10),
            memorySize: 128,
            runtime: lambda.Runtime.NODEJS_22_X,
            handler: "handler",
            environment: {
              USER_POOL_ID: this.userPoolId,
              CLIENT_ID: this.userPoolClientId,
              REGION: cdk.Aws.REGION
            },
          }
          const resource = this.auth.addResource(resourceName);
          const fn = new lambdanode.NodejsFunction(this, fnName,{
            ...commonFnProps,
            entry: `${__dirname}/../lambdas/auth/${fnEntry}`
          });
          resource.addMethod(method, new apig.LambdaIntegration(fn));
        };
}
