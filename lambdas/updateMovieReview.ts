import { APIGatewayProxyHandlerV2,APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async(event: APIGatewayProxyEventV2 & { requestContext: { authorizer?: { emailId?: string } } }, context) =>{
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
        const signedInUserEmailId = event.requestContext?.authorizer?.emailId;
        
        if (!signedInUserEmailId) {
            return {
                statusCode: 403,
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "Unauthorized: Missing emailId"}),
            };
        }
        const getExistingReviewCommand = new GetCommand({
            TableName: process.env.TABLE_NAME,
            Key: { movieId, reviewId },
        });

        const existingReview = await ddbDocClient.send(getExistingReviewCommand);

        if (!existingReview.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: "No review found." }),
            };
        }
        if (existingReview.Item.reviewerId !== signedInUserEmailId) {
            return {
                statusCode: 403,
                body: JSON.stringify({ message: "You are not an authorized user to update this review." }),
            };
        }
        const commandOutput = new UpdateCommand({
            TableName : process.env.TABLE_NAME,
            Key: { movieId: movieId,
                reviewId: reviewId },

            UpdateExpression: "set #mTitle = :movieTitle,#lang = :original_language,#rDate = :reviewDate,#content = :content",
            ExpressionAttributeNames: {
                
                "#mTitle": "movieTitle",
                "#lang": "original_language",
                "#rDate": "reviewDate",
                "#content": "Content"
            },
            ExpressionAttributeValues: {
                
                ":movieTitle": body.movieTitle,
                ":original_language": body.original_language,
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