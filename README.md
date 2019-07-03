# Intro

DynamoDB Lambda Helper is a tool built to make it easy to leverage the power of AWS&#39;s DynamoDB with Lambda functions. This tool will allow you PUT, GET, and DELETE data from an AWS DynamoDB without having to deal with the complexity of building out the DynamoDB models and query parameter objects.

![Image 1](/images/Picture1.png)

## Setup

The setup is very easy, all you need to-do is create **three** Lambda functions and add in this Node.JS library. You will need a function for GET, PUT, and DELETE. Repeat the steps below for each function.

1. Click on the &quot;Create Function&quot; button on the AWS Lambda function page.  
![Image 2](/images/Picture2.png)  
2. Give it a name (example dynamoDB\_GET).
3. Select Node.JS 10.x for the runtime.
4. Select or create permission that has access to your database.  
![Image 3](/images/Picture3.png)  
5. After you create the function you will see a code editor in the browser. When you see this page you need to first add the dynamoDBHelper.js file and then configure the function to use the correct operation (ie GET or PUT). First thing you need to do is to click on File → New File  
![Image 4](/images/Picture4.png)  
6. Paste the content of the dynamoDBHelper.js file into the code editor.  
![Image 5](/images/Picture5.png)  
7. Save the file and name it &quot;dynamoDBHelper.js&quot;  
![Image 6](/images/Picture6.png)  
![Image 7](/images/Picture7.png)  
8. Open the &quot;index.js&quot; then copy and paste the code from the file the corresponds to the function you&#39;re creating (example dynmoDB\_GET.js for creating the GET Lambda function). Your lambda function should look something like this. (note the highlighted function will be different based on which operation you&#39;re creating).  
![Image 8](/images/Picture8.png)  
Make sure to update the region in the config to point to the region of your AWS dynamoDB.
9. That&#39;s it. After you create the functions for GET, PUT, and DELETE you should see your functions like this.  
![Image 8](/images/Picture8.png)  
Now that you have setup your Lambda functions you can start calling them to access the data in your Dynamo database. Before you can start using the functions let&#39;s walk through the models we created to interact.  

## Query Model

This model has two properties

1. Table _string_
2. Filters _list of Filter_
3. Limit _integer (optional)_
4. NextPage _string (optional)_

&quot;Table&quot; is the name of the table you want to interact with and &quot;Filters&quot; is a list of filters. Filters are used like where statements in SQL.

A Filter has the following properties

1. Attribute _string_
  1. The Column or field we want to filter on.
2. Operation _string_
  1. How we want to filter against that Attribute.
3. CompareValue _string or integer_
  1. What value we want to use for the comparison.

Here&#39;s an example of how to fetch all records that are between two ages. It&#39;s the SQL equivalent to writing SELECT \* FROM rescue\_dogs WHERE Age \&gt; 3 AND Age \&lt; 10.

```{
  "Table": "rescue_dogs",
  “Limit”: 1000,
  “NextPage”: “322”,
  "Filters": [
    {
      "Attribute": "Age",
      "Operation": ">",
      "CompareValue": "3"
    },
    {
      "Attribute": "Age",
      "Operation": "<",
      "CompareValue": "10"
    }
  ]
}
```

That query will return dogs between those ages. Here is a complete list of all the operations our tool supports.

1. > &quot;greater than&quot;
2. < &quot;less than&quot;
3. = &quot;equals to&quot;
4. <> &quot;not equal to&quot;
5. null &quot;attribute does not contain a value&quot;
6. contains &quot;attribute value contains part of string&quot;
7. not contains &quot;attribute value does not contain part of string&quot;
8. begins with &quot;attribute value begins with string&quot;




**Below is the documentation on how to use each of the functions.**

# PUT

Allows you to insert or update a record in the database.

NOTE: Make sure all your tables have a primary partition key called &quot;id&quot; and it&#39;s set to a string. Currently, this tool is built to expect all tables to use the same &quot;id&quot; column as the partition key.



Input

Example of putting a single record.
```{
  "Table": "rescue_dogs",
  "Item": {
    "id": "324",
    "Age": "2",
    "DogName": "Lucky",
    "Gender": "Male"
  }
}
```

Example of putting two or more records. Note: your function might timeout if you pass a lot of data into the payload. It&#39;s ideal to insert 500 records at a time, although you may be able to pass in more. Be sure to check your Lambda function&#39;s timeout setting.

```{
  "Table": "rescue_dogs",
  "Items": [{
    "id": "324",
    "Age": "2",
    "DogName": "Lucky",
    "Gender": "Male” 
  },{
    "id": "325",
    "Age": "11",
    "DogName": "Lucy",
    "Gender": "Female” 
  }]
}
```

Output

The &quot;Put&quot; function will return a &quot;SUCCESS&quot; if the insert or update was successful.



# GET

This function allows you to retrieve data from the table. Dynamo does allow you to create advanced filters but please note that when you&#39;re creating filters outside of the primary partition key Dynamo will use a table scan to retrieve that data.

Input

The GET function accepts the Query Model (See the section above about the query model). If you&#39;re paging through a large dataset you can pass in the NextPage value into the query to get the next page of data.

Output

The GET function will return the Result Model (example below).

```{
  "NextPage": null, //will return a key to be used for getting next page
  "Count": 1, //count of records being returned in the Result 
  "Result": [
    {
      "Gender": "Male",
      "id": "600",
      "DogName": "Teddy",
      "Age": 8
    }
  ]
}
```

The NextPage will only return a value if there is more data that can be returned by creating another query and passing that value into it. For example, you want to query a table for 200 records but set a limit of 100 records. The first query will return 100 records and a NextPage value. You can create a second query and pass that value in as the &quot;NextPage&quot; value and it will return the next 100 records and the NextPage will be null in the response.

# DELETE

Input

The input for the DELETE function is very similar to the GET input minus a few things.
```{
  "Table": "rescue_dogs",
  “Delete”: false, // determine if you want to preview the data you want to delete
  “Verbose”: true, //determines what is returned when you call the delete.
  "Filters": [
    {
      "Attribute": "Id",
      "Operation": "=",
      "CompareValue": "3"
    }
  ]
}
```

- Delete = false: You can tell the function that you want to preview the data you wish to delete without deleting them. This makes the function behave like a GET function where it just returns data with the ability to page through the results. When you set the Delete=true then the function will delete the records from the database.
- Verbose = true: This determines what is returned from the function after you delete records. If verbose is set to true the response will contain a result set of all the Ids that were deleted. If verbose is set to false then the response will just contain a count of the records that were deleted. NOTE: if you&#39;re deleting more than 1000 records the verbose will always be set to false.
- Filters: DynamoDB doesn&#39;t allow you to delete records with advance filters (ie Where Age \&gt; 11), we can delete a batch of records but only by supplying the Id. This function allows you to pass in advance filters and we can achieve that functionality by fetching the data with a GET operation and looping through each record and deleting them 1 by 1. This function can timeout if you try to delete a lot of records.

Output

When verbose is set to false

```{
  "Count": 2,
  "Result": [],
  “Delete” : true
}
```
When verbose is set to true

```{
  "Count": 2,
  "Result": [
      {id: “43”},
      {id: “22”}
   ],
  “Delete” : true
}

```