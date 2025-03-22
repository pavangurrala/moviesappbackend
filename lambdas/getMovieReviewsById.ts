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
        //const queryParams = event?.pathParameters;
        //const reviewId = queryParams?.reviewId ? parseInt(queryParams.reviewId) : undefined;
        const movieId = event.pathParameters?.movieId;
        const reviewId = event.queryStringParameters?.reviewId; // Extract reviewId from query string (if provided)
        const reviewerId = event.queryStringParameters?.reviewerId;
        if(!movieId){
            return {
                statusCode: 500,
                headers: {
                "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing movie Id parameter" }),
            }
        }
        let commandInput: QueryCommandInput = {
            TableName: process.env.TABLE_NAME,
            KeyConditionExpression: "movieId = :movieId",
            ExpressionAttributeValues: { ":movieId": Number(movieId) },
        };
        if (reviewId) {
            commandInput.KeyConditionExpression += " AND reviewId = :reviewId";
            commandInput.ExpressionAttributeValues![":reviewId"] = Number(reviewId);
          } else if (reviewerId) {
            commandInput.FilterExpression = "reviewerId = :reviewerId";
            commandInput.ExpressionAttributeValues![":reviewerId"] = reviewerId; 
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