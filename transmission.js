/**
 * 
 * 22/05/2014
 *
 * 
 */

// The result of require is (usually) just a plain object whose properties may be accessed.
var http = require('http') ,scp  = require('scp'), fs = require('fs'), path = require('path'), nodemailer = require("nodemailer");

var configuration = require('./configuration');



var escape = function (string)
{
 
  string = string.replace(/\s/g,"\\\\ ");
  string = string.replace(/\(/g,"\\\\(");
  string = string.replace(/\)/g,"\\\\)");
  string = string.replace(/'/g,"\\\\'");
  string = string.replace(/\./g,"\\\\.");

  
  return string;
  
}


/***
*  Size in bytes of filename 	
*  Doesn't consider the directory size (4096 bytes)
*   
*/
function size(filename) 
{
  
  if (!fs.existsSync(filename))
      return -1;
    
  var stats = fs.lstatSync(filename);
  
  var total = 0 ; 

    if (stats.isDirectory()) 
    {
      
      
      // Returns an array of filenames excluding '.' and '..'
      var array = fs.readdirSync(filename);

	for (i=0; i < array.length; i++)
	{
	  total = total + size(path.join(filename, array[i]));
	}
	
	return total;
 
    }   
    else 
    {
      return stats.size;
    }   

}   


var notice;
var email = function(filename)
{

console.info("Sending email for " + filename);

notice = notice + 1;
  
var smtpTransport = nodemailer.createTransport("SMTP",
{
    service: "Gmail",
    auth: {
        user: configuration.notify.user,
        pass: configuration.notify.password
    }
});

// setup e-mail data with unicode symbols
var mailOptions = 
{
    from: "Transmission Notify Service  <notice@transmission.com>", // sender address
    to: configuration.notify.to, // list of receivers
    subject: "File " + filename + " available", // Subject line
    text: "A new file has been downloaded by Transmission:" + filename, // plaintext body

}


smtpTransport.sendMail(mailOptions, function(error, response)
{
  
    notice = notice - 1;
    
    
    if(error)
    {
        console.log(error);
    }
    else
    {
        console.log("Email sent: " + response.message);
	
    }
    

    
    // shut down the connection pool, no more messages
    smtpTransport.close(); 
    
    if ( task == 0 )
       process.exit(0);
    else
      return;
      
    
    
});  
  
  
  
  
}


/***
* Loop over message to download file from remote host , waiting before operation is finished
*
*/


var task;
var download = function(message, index)
{
  

   if (index ===  undefined )
   {
     index = 0;
   }
   
   if ( task === undefined )
   {
      task  = message.arguments.torrents.length;
   }
   
   if ( notice == undefined )
   {
      notice = 0;
   }


   if (index >= message.arguments.torrents.length)
   {
      console.info("No more torrent");
      if ( notice == 0 )
	 process.exit(0);
      else 
	return;
     
 
   }
   
   var filename = message.arguments.torrents[index].name;
   
   var bytes = size(path.join("." , filename));
   //console.info("¿Size:" + bytes + " == " + message.arguments.torrents[index].totalSize + "?");
   if (bytes >= message.arguments.torrents[index].totalSize)
   {

      console.info(filename + " already downloaded.");
      task = task - 1;
      download(message,index + 1);
   
   }
 
   else if (message.arguments.torrents[index].eta != -1)
   {
     console.info(filename + " not finished");
     task = task - 1;
     download(message,index + 1);
     
   }
   else
   {
   
    console.info("Downloading " + filename + "...");

    var options = 
    {
	    file: '"/var/lib/transmission-daemon/downloads/' + escape(filename) + '"',
	    user: 'pi',
	    host: '192.168.1.10',
	    port: '22',
	    path: '.'
	  }
    
    scp.get(options, function (err,stdout, stderr) 
    {
	  if (err) 
	      console.log(err);
	  else 
	  {
	      console.log("File " + filename + " downloaded");
	      task = task - 1;
	      email(filename);
	  }
	      
	  download(message,index + 1);
	      
      });
      
   }
 
}


// Create the JSON object
var json = JSON.stringify(
{
  "arguments": {
	         "fields": [ "id", "eta", "name", "totalSize" ]
	       },
   "method": "torrent-get"

});
 

var header = 
{
    'Content-Type' : 'application/json',
    'Content-Length' : Buffer.byteLength(json, 'utf8')
};
 

var option = 
{
    host : '192.168.1.10',
    port : 9091,
    path : '/transmission/rpc',
    method : 'POST',
    auth: 'transmission:ch3m455',
    headers : header
};


var send = function(option,json)
{
  
  
  /// The optional callback parameter will be added as a one time listener for the 'response' event.
  var request = http.request(option ,function(response) 
  {
    
    if (response.statusCode == 409)
    {
      
      header['x-transmission-session-id'] = response.headers['x-transmission-session-id'];
      option.headers = header;

      
      send(option,json);
      
      return;
    }
	

    
    /*
    If no 'response' handler is added, then the response will be entirely discarded. 
    However, if you add a 'response' event handler, 
    then you must consume the data from the response object, either 
    - by calling response.read() whenever there is a 'readable' event, or
    - by adding a 'data' handler, or
    - by calling the .resume() method. 
    Until the data is consumed, the 'end' event will not fire. 
    Also, until the data is read it will consume memory that can eventually lead to a 'process out of memory' error. 
    */
    
    /*
    During the 'response' event, one can add listeners to the response object; particularly to listen for the 'data' event. 
    */
    response.on('data', function(text) 
    {
	      
	  var message = JSON.parse(text);
	  
	  //console.info(JSON.stringify(message))
     
	  download(message);

	  
    });
    
    
  });
  
  request.write(json,'utf8');
  request.end();
  request.on('error', function(e) 
  {
      console.error(e);
      process.exit(1);
      
  });

};
  

send(option,json);




