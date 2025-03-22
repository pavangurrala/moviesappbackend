import { APIGatewayProxyHandlerV2 , APIGatewayProxyEventV2} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand,GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async(event: APIGatewayProxyEventV2 & { requestContext: { authorizer?: { emailId?: string } } }, context) =>{
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
        const signedInUserEmailId = event.requestContext?.authorizer?.emailId;
        if (!signedInUserEmailId) {
                return {
                        statusCode: 403,
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ message:"missing email id" }),
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
                body: JSON.stringify({ message: "You are not an authorized user to delete this review." }),
            };
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