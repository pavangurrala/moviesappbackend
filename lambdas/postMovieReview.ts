import { APIGatewayProxyHandlerV2,APIGatewayProxyEventV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
const ddbDocClient = createDDbDocClient();
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
export const handler: APIGatewayProxyHandlerV2 = async (event: APIGatewayProxyEventV2 & { requestContext: { authorizer?: { emailId?: string } } }, context) => {
    try{
        console.log("[EVENT]", JSON.stringify(event));
        const body = event.body ? JSON.parse(event.body) : undefined;
        if(!body){
            return{
                statusCode: 500,
            headers: {
            "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Missing request body" }),
            }
        }
        const emailId = event.requestContext?.authorizer?.emailId;
        if (!emailId) {
            return {
                statusCode: 403,
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "Unauthorized: Missing emailId" }),
            };
        }
        const latestreviewId = new ScanCommand({
            TableName: process.env.TABLE_NAME,
            ProjectionExpression: "reviewId"
        })

        const scanReviewIds = await docClient.send(latestreviewId)
        const reviewIdsList = scanReviewIds.Items?.map(item => item.reviewId) || [];

        const latestReviewId = reviewIdsList.length ? Math.max(...reviewIdsList):0;
        const newReviewId = latestReviewId + 1;

        const putCommandOutput = new PutCommand({
                TableName : process.env.TABLE_NAME,
                Item: {
                    movieId : body.movieId,
                    movieTitle: body.movieTitle, 
                    original_language: body.original_language,
                    reviewId : newReviewId,
                    reviewerId: emailId,
                    reviewDate: new Date().toISOString().split("T")[0],
                    Content: body.Content
                }
            })
        
        await docClient.send(putCommandOutput);
        return{
            statusCode: 201,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ message: "Movie Review added" }),
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

function createDDbDocClient() {
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