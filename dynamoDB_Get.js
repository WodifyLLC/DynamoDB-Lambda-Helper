//Configuration
var config = {
  region: 'us-east-1',
}

//grab the helper object
var dynamo = require("./dynamoDBHelper");
dynamo.setConfig(config);

exports.handler = (event, context) => {    
  //pass the event down to the dyamo handler
  dynamo.handle_Get(event,context);
};