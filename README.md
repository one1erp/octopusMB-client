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

## Contributors

- [@drorv-one1](https://github.com/drorv-one1)

&copy; One1ERP
