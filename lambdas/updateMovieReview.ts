import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async(event, context) =>{
    try{
        console.log("Event: ", JSON.stringify(event));
        const body = event.body ? JSON.parse(event.body) : undefined;
        const queryParams = event?.pathParameters;
        const movieId = queryParams?.movieId ? parseInt(queryParams.movieId) : undefined;
        const reviewId = queryParams?.reviewId ? parseInt(queryParams.reviewId) : undefined;
        if(!body){
            return{
                statusCode: 500,
            headers: {
            "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Missing request body" }),
            }
        }
        if(!movieId || !reviewId){
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "reviewId and movieID is required for updation" }),
              };
        }

        const commandOutput = new UpdateCommand({
            TableName : process.env.TABLE_NAME,
            Key: { movieId: movieId,
                reviewId: reviewId },

            UpdateExpression: "set #mTitle = :movieTitle,#lang = :original_language,#rId = :reviewerId,#rDate = :reviewDate,#content = :content",
            ExpressionAttributeNames: {
                
                "#mTitle": "movieTitle",
                "#lang": "original_language",
                "#rId": "reviewerId",
                "#rDate": "reviewDate",
                "#content": "Content"
            },
            ExpressionAttributeValues: {
                
                ":movieTitle": body.movieTitle,
                ":original_language": body.original_language,
                ":reviewerId": body.reviewerId,
                ":reviewDate": new Date().toISOString().split("T")[0], // Current date in YYYY-MM-DD
                ":content": body.Content
            },
        })

        await ddbDocClient.send(commandOutput);
        return {
            statusCode: 201,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Movie Review Updated" }),
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