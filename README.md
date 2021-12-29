# octopusMB-client

Client for connecting to octopusMB

## Technologies

Project is created with:
* Node.js

## Install

1. run `npm i github:one1erp/octopusmb-client`

## Usage

To use the client:
```
import Client from "octopusmb-client";

const client = new Client();
client.connect(options);

client.on("open", () => {
    //run code after connection established

    //send message to all clients in the 'foo' group
    client.publish("foo","my new message");

    //send message to a client with the name 'foo' or the next client in the group 'foo'
    client.request("foo", "a message waiting to response")
          .then(response => {
              //do something with response
          })
          .catch(err => {
              //error handling
          })
    
    //or you can use async await
    try {
        let response = client.request("foo", "a message waiting to response - await style")
    } catch (err) {
        //error handling
    }
});

client.on('close', () => {
    //run code after connection closed
});

client.on("error", (error) => {
    catch errors
});
```
### Sending Stream
You can also send a stream of data to another client, via publish, in a request, or in a response
The use of streams is available with the OctopusStream object
This object can contain the stream and an 'extrea' property that can be whatever you like

example for publishing a file:
```
import Client, {OctopusStream} from 'octopusmb-client'
import fs from 'fs'
...
const file = "/location/to/file";
const readableStream = fs.createReadStream(file);
const octopusStream = new OctopusStream({
    stream: readableStream,
    extra: {
        fileName: "filename",
    }
})

client.publish("foo", octopusStream);
```
If a stream is published, it will be received by the client in a 'stream' event
```
client.on("stream", octopusStream => {
    //saving stream to file
    let writeStream = fs.createWriteStream(octopusStream.extra().fileName); //get fileName from octopusStream's extra property
    octopusStream.stream().on("data", chunk => {
        writeStream.write(chunk);
    })
    octopusStream.stream().on("end", () => {
        writeStream.end();
    });
})
```

If a stream is sent by request or response, there needs to be a check for the OctopusStream object
```
//for receiving request
client.on("request", message => {
    if (message instanceof OctopusStream) {
        //do something with stream
    } else {
        //do something with regular message
    }
});

//for receiving response
let response = await client.request("foo", "bar");
if (response instanceof OctopusStream) {
    //do something with response stream
} else {
        //do something with regular response message
    }
```
A client.connect() accepts the following parameters:

| Name          | Default                     |  Description    |
| ------------- | --------------------------- | --------------- |
| `host`        | `'localhost'`               | hostname/ip of octopusMB server                            |  
| `port`        | `8899`                      | port of octopusMB server                                   |
| `ssl`         | `false`                     | is the connection secure (ws:// vs wss://)                 |
| `group`       | `none`                      | mandatory, the group name for which this client belongs to |
| `name`        | `none`                      | the specific name of this client                           |
| `rwsOptions`  | `false`                     | object options for reconnecting-websocket module           |

A client.request() accepts the following parameters:

| Name          | Mandatory                   |  Description    |
| ------------- | --------------------------- | --------------- |
| `recipient`   | `true`                      | recipient client, by group or name  |  
| `message`     | `true`                      | message to be sent                  |
| `options`     | `false`                     | options for the request             |

request options:

| Name          | Default                   |  Description    |
| ------------- | ------------------------- | --------------- |
| `timeout`     | `no timeout`              | timeout in ms for request to be rejected  |  

OctopusStream accepts the following object in constructor:
| Name          | Mandatory                 |  Description    |
| ------------- | ------------------------- | --------------- |
| `stream`      | `true`                    | a readable stream                                                       |  
| `extra`       | `false`                   | string/object of any information you want to pass along with the stream |

## Contributors

- [@drorv-one1](https://github.com/drorv-one1)

&copy; One1ERP
