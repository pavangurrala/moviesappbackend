import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { QueryString } from "aws-cdk-lib/aws-logs";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2  = async(event, context) =>{
    try{
        console.log("Event: ", JSON.stringify(event));
        const queryParams = event?.pathParameters;
        const reviewId = queryParams?.reviewId ? parseInt(queryParams.reviewId) : undefined;
        if(!queryParams){
            return {
                statusCode: 500,
                headers: {
                  "content-type": "application/json",
         },
         body: JSON.stringify({ message: "Missing query parameters" }),
        }
    }
    if(!queryParams.movieId){
        return {
            statusCode: 500,
            headers: {
              "content-type": "application/json",
     },
     body: JSON.stringify({ message: "Missing movie Id parameter" }),
        }
    }
    
    const movieId = parseInt(queryParams?.movieId)
    let commandInput: QueryCommandInput = {
        TableName: process.env.TABLE_NAME,
    };
    if("reviewId" in queryParams){
        if (!reviewId) {
            return {
                statusCode: 400,
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "Invalid reviewId parameter. Must be a number." }),
            };
        }
        commandInput = {
            ...commandInput,
            KeyConditionExpression:"movieId =:m and reviewId= :r",
            ExpressionAttributeValues :{
                ":m":movieId,
                ":r":reviewId,
            } 
        }
    }else if("reviewerId" in queryParams){
        commandInput = {
            ...commandInput,
            IndexName: "reviewerId",
            KeyConditionExpression:"movieId =:m and begins_with(reviewerId, :r)",
            ExpressionAttributeValues :{
                ":m":movieId,
                ":r": queryParams.reviewerId,
            } 
        }
    }else{
        commandInput = {
            ...commandInput,
            KeyConditionExpression:"movieId =:m",
            ExpressionAttributeValues :{
                ":m":movieId,
            } 
        }
    }
    const commandOutput = await ddbDocClient.send(
        new QueryCommand(commandInput)
    );
    return{
        statusCode: 200,
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            data: commandOutput.Items,
        }),
    }
    }
    catch(error:any){
        console.log(JSON.stringify(error));
        return{
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ error }),
        } 
    }
}

function createDocumentClient() {
    const ddbClient = new DynamoDBClient({ region: process.env.REGION });
    const marshallOptions = {
      convertEmptyValues: true,
      removeUndefinedValues: true,
      convertClassInstanceToMap: true,
   };
    const unmarshallOptions = {
      wrapNumbers: false,
   };
    const translateConfig = { marshallOptions, unmarshallOptions };
    return DynamoDBDocumentClient.from(ddbClient, translateConfig);
  }