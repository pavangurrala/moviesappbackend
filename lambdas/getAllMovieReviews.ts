import { Handler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, ScanCommand, GetCommand} from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: Handler = async(event, context) =>{
    console.log("Event: ", JSON.stringify(event))
    let body;
    let statusCode = 200;
    const headers = {
        "Content-Type" : "application/json",
    };
    try{
        body = await ddbDocClient.send(new ScanCommand({TableName:process.env.TABLE_NAME}))
    }
    catch(err){
        statusCode = 400;
        body = err;
    }
    finally{
        body = JSON.stringify(body)
    }

    return{
        statusCode:200,
        headers:{
            "content-type": "application/json",
        },
        body: JSON.stringify(body),
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