import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

const ddbDocClient = createDocumentClient();
const translateClient = new TranslateClient({});
export const handler: APIGatewayProxyHandlerV2 = async(event:any) =>{
    try{
        console.log("Event: ", JSON.stringify(event));
        
        const queryParams = event?.pathParameters;
        const movieId = queryParams?.movieId ? parseInt(queryParams.movieId) : undefined;
        const reviewId = queryParams?.reviewId ? parseInt(queryParams.reviewId) : undefined;
        const translateLanguageCode = event.queryStringParameters?.language;
        if(!movieId || !reviewId ){
            return{
                statusCode: 400,
                body: JSON.stringify({ message: "movieId or reviewId are missing is required for updation" }),
            }
        }
        if(!translateLanguageCode){
            return{
                statusCode: 400,
                body: JSON.stringify({ message: "translateLanguageCode are missing is required for updation" }),
            }
        }
        const getContentToBeTranslated = new GetCommand({
            TableName : process.env.TABLE_NAME,
            Key: { movieId, reviewId },
        })

        const contentResult = await ddbDocClient.send(getContentToBeTranslated);
        if(!contentResult.Item || !contentResult.Item.Content){
            return { statusCode: 404, 
                body: JSON.stringify({ message: "Review not found" }) };
        }
        const actualContent = contentResult.Item?.Content;
        const translateCommandOutput = new TranslateTextCommand({
            Text: actualContent,
            SourceLanguageCode:"en",
            TargetLanguageCode: translateLanguageCode
        })
        const transResult = await translateClient.send(translateCommandOutput);
        const translatedReview = transResult.TranslatedText

        const updateTranslatedReviewCommand = new UpdateCommand({
            TableName : process.env.TABLE_NAME,
            Key: { movieId: movieId,
                reviewId: reviewId },
                UpdateExpression: "SET #translatedReview = :translatedReview",
                ExpressionAttributeNames:{"#translatedReview":"translatedReview"},
                ExpressionAttributeValues:{":translatedReview" :translateLanguageCode+": "+ translatedReview}    
        }) 
        await ddbDocClient.send(updateTranslatedReviewCommand);
        return {
            statusCode: 201,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ translatedReview }),
        }
    }
    catch(error:any){
        console.log(JSON.stringify(error));
        return{
            statusCode: 500,
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify({ error: error.message }),
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

