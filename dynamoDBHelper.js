//Version: 2.0
//Author: Thomas Depole 
//Email: tom.depole@wodify.com

var DynamoDBHelper = function(){
  //private varibles
  var self = this;
  var context = null; 
  var tableName = null;   
  var limit = 1000; //default limit is 1000
  var AWS = require('aws-sdk');
  var batchList = [];

  
  //create the database object
  this.ddb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
  
  ///////////////////////////
  // Configuration Functions
  ///////////////////////////

  //use this if you need to set the table later
  this.setTable = function(_tableName){
    tableName = _tableName;
  }
  
  //use this to set the config. You're required to pass in the region
  this.setConfig = function(config){      
    // Set the region 
    AWS.config.update({ region: config.region});
    //set the table if supplied
    if(typeof tableName === "string")
      tableName = tableName;
    //set the limit if it's passed in
    if(typeof config.limit === "number")
      limit = config.limit;
  }
  
  ///////////////////////////
  // Converting Functions
  ///////////////////////////

  //use this method if you want to create an dynamoDB insert item dynamically (assuming all properties are strings)
  this.convertObjectToInsertItem = function(obj){
    var item = {}; //create the empty object we are building out
    var props = Object.keys(obj);
  
    //loop through the object parameters and build out the query for dynamo
    for(var i = 0; i < props.length; i++)
    {
      var prop = props[i];
      if(prop != 'id' && self.isNumeric(obj[prop]))
        item[prop] = {N: obj[prop].toString()}; // tell dyanmo this is a number
      else
        item[prop] = {S: obj[prop]}; // assume everything else is a string  
    }
    return item;
  }
  
  //convert the filter models and convert it into the param models that the dynamo JS SDK requires
  this.convertFiltersToParamValues = function(filters){
    //build out the params based on filters passed in.
    var valIndex = 1;
    var attrValues = {};
    var expression = "";
    
    //loop through each filter to build out the params to send into dynamo.
    for(var i = 0; i < filters.length; i++){
      var filter = filters[i];
      
      //build out the expression attribute values            
      var expressionKey = null;
      if(typeof filter.CompareValue !== 'undefined')
      {
          expressionKey = ":v" + valIndex;
          //make sure we handle numbers correctly
          if(typeof filter.CompareValue === 'number')
              attrValues[expressionKey] = { N: filter.CompareValue.toString() };            
          else
              attrValues[expressionKey] = { S: filter.CompareValue }; 
  
          //increase the key to the next index 
          valIndex++;
      }
  
      //make sure the BETWEEN operator isn't passed in. It's not supported. 
      if(filter.Operation == "BETWEEN")
      {
          context.fail('BETWEEN isn\'t a supported operation. Please pass in two filters using ">" and "<" operators');
          console.log("BETWEEN was passed in as an operation. BETWEEN isn't supported");
          return null;
      }
  
      //handle NULL and NOT NULL if they are passed in 
      if(filter.Operation.toLowerCase() == "null")
          filter.Operation = "attribute_not_exists";
      if(filter.Operation.toLowerCase() == "not null")
          filter.Operation = "attribute_exists";
      //handle Exists and Not Exists
      if(filter.Operation.toLowerCase() == "not exists")
          filter.Operation = "attribute_not_exists";
      if(filter.Operation.toLowerCase() == "exists")
          filter.Operation = "attribute_exists";
      //handle Begins with
      if(filter.Operation.toLowerCase() == "begins with")
          filter.Operation = "begins_with";
  
      //create the filter expression
      var operators = ["=", "<>", "<=", "<", ">=", ">"];
      if(operators.includes(filter.Operation))
          expression += filter.Attribute + " " + filter.Operation + ' ' + expressionKey + '' ;
      else if(expressionKey != null)
          expression += filter.Operation.toLowerCase() +" (" + filter.Attribute + ", " + expressionKey + ')';
      else 
          expression += filter.Operation.toLowerCase() +" (" + filter.Attribute + ')';
  
      //append the "AND" statement if there are more filters
      if(i < (filters.length - 1))
          expression += " AND ";
    }
  
    //build out the response object
    var paramValues = {
      Expression: expression,
      AttributeValues: null
    }
    if(Object.keys(attrValues).length > 0)
    paramValues.AttributeValues = attrValues;
  
    return paramValues;
  }

  //used to convert the response from dynamo to a clean object without the types.
  this.convertDynamoItemsToObjects = function(items){
    var result = [];
  
      //convert the model returned from dynamo to response object        
      for(var x = 0; x < items.length; x++){
      var dynamoItemProps = Object.keys(items[x]);
      var item = {};
      
      //loop through the items returned and build out a object
      for(var i = 0; i < dynamoItemProps.length; i++){
          var prop = dynamoItemProps[i];
          var typeKey = Object.keys(items[x][prop])[0]; //could be obj.S or obj.N
          item[prop] = items[x][prop][typeKey];
      }
      
      //update the result then process the response
      result.push(item);
    } 
    
    return result;
  }
  
  ///////////////////////////
  // DB Operation Functions
  ///////////////////////////

  //get item from the table by providing the keys
  //todo revert this method from an older version later
  this.getItem = function(keys){
    //build out the parameters
    var params = {
      TableName: tableName,
      Key: keys
    };
  
    // Call DynamoDB to read the item from the table
    this.ddb.getItem(params, this.handleGetCallback);
  }
  
  //insert single item into the table
  this.putItem = function(item){
    //build out the parameters to pass into dynamo
    var params = {
      TableName: tableName,
      Item: item
    };
    //console.log("Params", params);
    // Call DynamoDB to add the item to the table
    this.ddb.putItem(params, function(err, data) {
      //check if an error occured
      if (err) {        
        context.fail('ERROR: Dynamo failed: ' + err);
        return;
      }
  
      //request was successful
      context.succeed('SUCCESS');
    });
  }
  
  //insert multiple items into the table
  this.putItems = function(items){

    //AWS has a limit of 25 per batch so let's loop through and handle each batch
    var failure = false;
    var insertTotal = items.length;
    var insertCount = 0;
    var limit = 25;
    for(var i = 0; i < items.length; i+=(limit-1))
    {      
      if(failure)
        return;

      //grab the next 25 items to insert      
      var end = i + (limit-1);
      var batch = items.slice(i, end);

      //make sure we have data in this batch before processing
      if(batch == null || batch.length == 0)
        return;
  
      //create the put requests for the items we are inserting
      var putItems = [];
      for(var x = 0; x < batch.length; x++)
        putItems.push({PutRequest: {Item: batch[x]}})
      
      //create the request object with the table and items we need to insert
      var requestItems = {};
      requestItems[tableName] = putItems;
      
      //create the params object with the request items 
      var params = {
        RequestItems: requestItems,
        ReturnConsumedCapacity: "TOTAL"
      };

      console.log("Starting Batch: " + i + "-" + end);
      
      //insert the batch of data
      self.ddb.batchWriteItem(params, function(err, data) {
        if(failure)
          return;

        //check to make sure we don't have any errors
        if (err) {
            context.fail('ERROR: Dynamo failed: ' + err);
            failure = true;
            return;
        }

        //CHECK for UnprocessedItems here
        if(typeof data.UnprocessedItems.length == "number" && data.UnprocessedItems.length > 0)
        {
          //todo handle for unprocessed items at some point in the future              
          failure = true;
          console.log("UnprocessedItems returned. Retrying isn't supported.", data);
          context.fail("DynamoDB returned unprocessed items. This means the requests exceeded the read/write capacity of your database configuration. Please try lower the amount of data you're trying to process or increase your Read/Write capacity.");
          return;
        }                                

        //check to make sure the number of units is returned
        if(typeof data.ConsumedCapacity === "undefined" || typeof data.ConsumedCapacity[0].CapacityUnits !== "number"){
          context.fail("DynamoDB didn't return a count of records deleted. Please try again.")
          failure = true;
          return;
        }

        //update the count
        insertCount += data.ConsumedCapacity[0].CapacityUnits;        

        //check to see if all the items were deleted. If so let's end the function and pass back the response. 
        if(insertCount == insertTotal){            
          console.log("Successful Batch Delete");
          context.succeed("SUCCESS");
        }
        
      });
    }
  }
  
  //use this to scan the table, this will return a special data model
  this.scanTable = function(params){
    console.log("Params:", params);
    this.ddb.scan(params, this.handleGetCallback);
  }
  
  //use this to query a table, this will return a special data model
  this.queryTable = function(params){     
    console.log("Params:", params); 
    this.ddb.query(params, this.handleGetCallback);
  }

  this.recursiveBatchDelete = function(response, verbose){
    //let's grab the next batch of items from the list
    var batch = batchList.pop();
    //make sure we have a batch to continue with
    if(batch == null){
      console.log("End of batchlist");
      return;
    }

    //Build out the params for the batch delete request. 
    //create the put requests for the items we are inserting
    var deleteItems = [];
    for(var x = 0; x < batch.length; x++)
      deleteItems.push({DeleteRequest: { Key: { "id" : {S : batch[x].id }  }}})
    
    //create the request object with the table and items we need to insert
    var requestItems = {};
    requestItems[tableName] = deleteItems;
    
    //create the params object with the request items 
    var params = {};
    params["RequestItems"] = requestItems;
    params["ReturnConsumedCapacity"] = "TOTAL";
    //console.log("Starting Batch. " + context.getRemainingTimeInMillis());
    //delete the batch result          
 
    self.ddb.batchWriteItem(params, function(err, data) {
      //make sure there wasn't any errors first
      if (err) {
          context.fail('ERROR: Dynamo failed: ' + err);             
          return;
      }
      
      //CHECK for UnprocessedItems here
      if(typeof data.UnprocessedItems.length == "number" && data.UnprocessedItems.length > 0)
      {
        //todo handle for unprocessed items at some point in the future              
        console.log("UnprocessedItems returned. Retrying isn't supported.", data);
        context.fail("DynamoDB returned unprocessed items. This means the requests exceeded the read/write capacity of your database configuration. Please try lower the amount of data you're trying to process or increase your Read/Write capacity.");
        return;
      }                                

      //update the delete count 
      if(typeof data.ConsumedCapacity === "undefined" || typeof data.ConsumedCapacity[0].CapacityUnits !== "number"){
        context.fail("DynamoDB didn't return a count of records deleted. Please try again.")
        return;
      }

      //update the count
      response.ItemsDeleted += data.ConsumedCapacity[0].CapacityUnits;
      console.log("BatchDelete Callback " + response.ItemsDeleted + " of " + response.ItemsFound + " deleted.");

      //update the results 
      if(verbose)
        for(var v=0; v < batch.lengthl; v++)
          response.Result.push(batch[v]);

      //let's make sure we have enough time left!!
      var timeRemaining = context.getRemainingTimeInMillis();
      if(timeRemaining < 200)
      {
        console.log('Ran out of time, stopping batch. ' + timeRemaining);
        //build out the response object and throw the error
        response.AllItemsDeleted = false;
        response.Retry = true;           
        response.Warning = "The Lambda function exceeded the timeout threshold before all items could be deleted. Try running this function again to delete the remaining items or increase the Lambda function timeout in AWS.";
        context.succeed(response);
        return;
      }


      //check to see if all the items were deleted. If so let's end the function and pass back the response. 
      if(response.ItemsDeleted == response.ItemsFound){  
        console.log("Successful Batch Delete");
        response.AllItemsDeleted = true;       
        context.succeed(response);
      }else{
        //we aren't finished deleting items so recall the batch deletion function
        self.recursiveBatchDelete(response);
      }

    });
  }
  
  ///////////////////////////
  // Util Functions
  ///////////////////////////

  //this is the callback handler for when data is returned from a get operation
  this.handleGetCallback = function(err, data) {
    if (err) {
        context.fail('ERROR: Dynamo failed: ' + err);
    } else {
      //create the response object
      var response = {
        NextPage: null,
          Count: 0,
          Result: []            
      };
  
      //make sure we have data to return, other wise return empty result set
      if(typeof data === 'undefined' || data.Items.length == 0){
        context.succeed(response);
        return;
      }        
  
      //convert the model returned from dynamo to response object     
      response.Result = self.convertDynamoItemsToObjects(data.Items);           
  
      //update the count
      response.Count = response.Result.length;
      //if(response.Count < 100)
      if(data.LastEvaluatedKey != null)
        response.NextPage = data.LastEvaluatedKey.id.S;
      context.succeed(response);
    }          
  }    
  
  //this is used internally to check if a value is a number
  this.isNumeric = function(value) {
    return /^((\d+(\.\d+)?)|((\d+)?\.\d+))$/g.test(value);
  }
  
  ///////////////////////////
  // Handle Functions
  ///////////////////////////

  //handle functions, these functions are built to dynamically 
  this.handle_Get = function(event, _context){
    //need to set the context for the dyanmo helper
    context = _context;

    //make sure we have the table model
    if(typeof event.Table === 'undefined' || event.Table == null){
        context.fail('The payload you passed in is missing a table. Make sure to include the Table you which to query against');
        console.log("payload is missing table");
        return; 
    }

    //grab the table name from the event
    self.setTable(event.Table);

    //using the filters provided build out the params and call the appropriate database operation
    var params = {  TableName: event.Table };  
    
    //set the limit
    params["Limit"] = limit; 
    if(typeof event.Limit == 'number')
        params["Limit"] = event.Limit;

    //if the next page param is set, add it.
    if(typeof event.NextPage == 'string')
        params["ExclusiveStartKey"] = { id: { S: event.NextPage }};

    //if the user didn't pass in any filters just return all the results
    if(typeof event.Filters === 'undefined' || event.Filters.length == 0){
        console.log("Filter Type: Return All");
        self.scanTable(params);
        return;        
    }
    
    //generate the param value, these are used to build out the params for dynamoDB sdk
    var paramValues = self.convertFiltersToParamValues(event.Filters);

    //if they are getting a value based off the id field, handle it has a query and not table scan
    if(event.Filters.length == 1 && event.Filters[0].Attribute == "id" && event.Filters[0].Operation == "="){
        //this is a pointer query, handle as such 
        console.log("Filter Type: Pointer Query");
        
        params["ExpressionAttributeValues"] = paramValues.AttributeValues;
        params["KeyConditionExpression"] = paramValues.Expression;    

        //perform the operation against the database
        self.queryTable(params); 
        return;
    }
    
    //handle the filters as a table scan. NOTE: this might be slow on larger tables
    console.log("Filter Type: Table Scan");

    //attribute values can be null, this is becauaes of "Exists" filters.
    if(paramValues.AttributeValues != null) 
        params["ExpressionAttributeValues"] = paramValues.AttributeValues;
    params["FilterExpression"] = paramValues.Expression;    
    
    //perform the operation against the database
    self.scanTable(params);
  }
  
  this.handle_Put = function(event, _context){
    //need to set the context for the dyanmo helper
    context = _context;

    //make sure we have the correct model
    if(typeof event.Table === 'undefined' || event.Table == null )
    {
        context.fail('The payload you passed in is incorrect. Example: { Table: "myTableName", Item : { id : "123", name: "Teddy", age: "12" } }.');
        console.log("payload is invalid");
        return; 
    }

    //grab the table name from the event
    self.setTable(event.Table);

    //determine if we are handling a single item
    if(typeof event.Item === 'object')
    {
      //make sure we have an id
      if(typeof event.Item.id === 'undefined' || event.Item.id == null)
      {
          context.fail("Item is missing an Id property. Please make sure you have an 'id' property and it's set to a string.");
          console.log("Item missing Id");
          return;
      }
  
      //generate the item to insert
      var item = self.convertObjectToInsertItem(event.Item);
      
      //make sure the data is there
      if(typeof item === 'undefined' || item == "null")
      {
          context.fail('Failed to generate the item for inserting. Makes sure the Item you passed in is correct.');
          console.log("Item failed to generate.");
          return;
      }
  
      self.putItem(item);
      return;
    }

    //handle list of items
    if(typeof event.Items !== 'undefined')
    {
      var items = [];
      for(var i = 0; i < event.Items.length; i++){
        var item = self.convertObjectToInsertItem(event.Items[i]);
        //todo add error handling for not having an id
        items.push(item);
      }
      console.log("Doing batch PUT operation. Count:" + items.length);
      self.putItems(items);
      return;
    }

    //if we got here there was an error
    context.fail("There was an error processing your request. Make sure you pass in Item or Items to be inserted/updated");
  }
  
  this.handle_Delete = function(event, _context){
    //need to set the context for the dyanmo helper
    context = _context;
  
    //make sure we have the table model
    if(typeof event.Table === 'undefined' || event.Table == null){
        context.fail('The payload you passed in is missing a table. Make sure to include the Table you which to query against');
        console.log("payload is missing table");
        return; 
    }
  
    //if the user didn't pass in any filters just return all the results
    if(typeof event.Filters === 'undefined' || event.Filters.length == 0){
        //console.log("Filter Type: Return All");
        //dynamo.scanTable(params);
        context.fail("Filters are required at this time.");
        return;        
    }
  
    //the response model, we want to return this to the user
    var response = {      
      ItemsFound: -1,
      ItemsDeleted: -1,
      AllItemsDeleted: false,
      Retry: false,
      Result: []
    };

    //grab the table name from the event
    this.setTable(event.Table);
    
    //get the verbose property
    var verbose = true; //default setting for verbose is true
    if(typeof event.Verbose === "boolean")
      verbose = event.Verbose;

    //handle the delete property. Default is false
    if(typeof event.Delete !== 'boolean')
        event.Delete = false;
  
    //let's start the delete process
    var docClient = new AWS.DynamoDB.DocumentClient();
    
    //start building out the params to get the data we are deleting
    var getParams = { TableName : event.Table};
    var gpValues = self.convertFiltersToParamValues(event.Filters);
    getParams["ExpressionAttributeValues"] = gpValues.AttributeValues;
    getParams["FilterExpression"] = gpValues.Expression;
    
    //if they asked to not delete let's return just the items we are deleting
    if(event.Delete == false)
    {
      self.handle_Get(event, context);
      return;// make sure we stop here and don't continue with the delete logic.
    }
  
    //using the filters provided build out the params and call the appropriate database operation
    var params = {  TableName: event.Table };
    params["ReturnValues"] = "ALL_OLD";    
    
    //handle single delete based on the key
    if(event.Filters.length == 1 && event.Filters[0].Attribute == "id" && event.Filters[0].Operation == "="){
        params["Key"] = { "id": event.Filters[0].CompareValue };

        //delete the single record
        docClient.delete(params, function(err, data) {
          //check for errors
          if (err) {
              context.fail('ERROR: Dynamo failed: ' + err);
              return;
          }

          console.log("Single delete returned", data);
          
          //check if nothing was deleted
          if(typeof data.Attributes === 'undefined')
          {
            context.fail("There are no records matching id = " + event.Filters[0].CompareValue + " in the table " + event.Table);
            console.log("No records found");
            return;
          }

          //check to make sure the correct item was deleted.
          if(typeof data.Attributes.id !== 'string' || data.Attributes.id != event.Filters[0].CompareValue)
          {
            //return an error
            context.fail("The item deleted didn't match the item you requested. The following item was deleted: " + JSON.stringify(data));
            console.log("Item deleted didn't match the item requested")
            return;
          }
          
          //build out the response
          if(verbose)
            response.Result = [{id: data.Attributes.id}];
          response.ItemsFound = 1;
          response.ItemsDeleted = 1
          response.AllItemsDeleted =  true;
          
          //return the status to the user
          context.succeed(response);     
        });
        return; //make sure we don't continue with the rest of the logic
    }
    
    //Delete the result based off table scan: Note this will have issues with larger sets of data
    getParams["ProjectionExpression"] = "id"; //only return the ids so to increase performance    

    //handle for advance filter deletion by first searching for the records we need to delete
    self.ddb.scan(getParams, function(err, data) {  
        if (err) {
            context.fail('ERROR: Dynamo failed: ' + err);
            return;
        }
        
        //make sure we have data to delete
        if(typeof data.Items === 'undefined' || data.Items.length == 0)
        {
          //context.fail("No data was found matching the filters supplied. Please make sure the data exists before calling the delete");
          //return;
        }

        //get the data we are deleting
        var items = self.convertDynamoItemsToObjects(data.Items);
        
        //TODO REMOVE THIS
        for(var i=0; i < 700; i++)
          items.push({id: "test" + i});    

        //used to keep track of what was deleted to know when to call the success method.
        response.ItemsFound = items.length;

        //make sure we dont' have too much data to return
        //pass the result if verbose is set to true
        if(response.ItemsFound  > 1000)
          verbose = false;   
  
        //build out the response (we pass this when they all process)        
        response.ItemsDeleted = 0;
        
        //create a batch list of items, we have to do this because aws can only process 25 requests at a time.
        var limit = 25;        
        batchList = [];
        for(var i = 0; i < items.length; i+=(limit-1))
        {                   
          //grab the next 25 items to insert
          var end = i + (limit-1) ;
          var batch = items.slice(i, end);
          
          //make sure we have data
          if(batch == null || batch.length == 0)
            continue;
          
          //update the batch list with this batch
          batchList.push(batch);
        }

        //kick off the recursive batch deletion. This function will call itself until there are no more items to delete or the timeout threshhold is exceeded. 
        self.recursiveBatchDelete(response, verbose);
    });   
  }
}

module.exports = new DynamoDBHelper();