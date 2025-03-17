import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async(event, context) =>{
    try{
        console.log("Event: ", JSON.stringify(event));
        const queryParams = event?.pathParameters;
        const movieId = queryParams?.movieId ? parseInt(queryParams.movieId) : undefined;
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
        if(!queryParams.reviewId || !queryParams.movieId){
            return {
                statusCode: 500,
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({ message: "Missing review Id or movie Id parameter" }),
            }
        }
        const deleteCommand = new DeleteCommand({
            TableName: process.env.TABLE_NAME,
            Key:{movieId: movieId, reviewId: reviewId }
        })
        await ddbDocClient.send(deleteCommand);
        return {
            statusCode: 201,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Movie Review Deleted" }),
        }


    }catch(error:any){
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