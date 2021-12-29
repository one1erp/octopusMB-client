import EventEmitter from 'eventemitter3';
import ws from 'ws';
import ReconnectingWebSocket from 'reconnecting-websocket';
import errors from './errors.js'
import OctopusStream from './OctopusStream.js';
import incomingStreams from './incomingStreams.js';
import {PassThrough, Stream} from 'stream'

/**
 * State object containing the current state of the connection
 */
const State = {
    DISCONNECTED: "DISCONNECTED",
    CONNECTING: "CONNECTING",
    OPEN: "OPEN",
    CLOSING: "CLOSING",
    CLOSED: "CLOSED"
}

class Client extends EventEmitter {

    _identified = false;
    _messageId = 0;
    _ws = null;
    _group = null;
    _name= null;
    _messages = {};
    _state = null;
    _rws = null;

    constructor(options) {
        super();
        this._state = State.DISCONNECTED;

        if (options) this.connect(options);


    }

    /**
     * Connect to server
     * @param object options 
     * @returns null
     */
    connect(options) {
        //check if group exists and is string
        if (typeof options.group != "string") {
            setImmediate(() => {
                let error = new Error(errors.GROUP_NOT_STRING.error)
                error.data = errors.GROUP_NOT_STRING;
                this.emit("error", error);
                
            });
            return;
        }

        //check if group is not empty string
        if (options.group.trim().length == 0) {
            setImmediate(() => {
                let error = new Error(errors.GROUP_EMPTY.error)
                error.data = errors.GROUP_EMPTY;
                this.emit("error", error);
            });
            return;
        }

        //check if name is string
        if (options.name && typeof options.name != "string") {
            setImmediate(() => {
                let error = new Error(errors.NAME_NOT_STRING.error)
                error.data = errors.NAME_NOT_STRING;
                this.emit("error", error);
                
            });
            return;
        }

        //check if name is not empty string
        if (options.name && options.name.trim().length == 0) {
            let error = new Error(errors.NAME_EMPTY.error)
            error.data = errors.NAME_EMPTY;
            setImmediate(() => {
                this.emit("error", error);
                
            });
            return;
        }

        //check if name equals group
        if (options.name === options.group) {
            let error = new Error(errors.NAME_EQUAL_GROUP.error)
            error.data = errors.NAME_EQUAL_GROUP;
            setImmediate(() => {
                this.emit("error", error);
            });
            return;
        }

        //set connection parameters
        this._group = options.group.trim();
        this._name = (options.name)? options.name.trim() : null;
        let host = (options.host)? options.host : "localhost";
        let port = (options.port)? options.port : "8899";
        let protocol = (options.ssl)? "wss" : "ws";
        let fullUrl = protocol + "://"  + host + ":" + port;

        let rwsOptions = (options.rwsOptions)? options.rwsOptions : {};
        rwsOptions.WebSocket = ws;
        //this._ws = new ws("ws://" + fullUrl);
        //connect to websocker server
        this._rws = new ReconnectingWebSocket(fullUrl, [], rwsOptions);
        this._state = State.CONNECTING;
        //emit state change
        this.emit("state", this._state);

        //send identity when connection open
        this._rws.addEventListener('open', () => {
            let identityJson = {
                group: this._group,
                name: this._name
            }

            this._rws.send(JSON.stringify(identityJson));
        });

        //get message from client
        this._rws.addEventListener("message", (event) => {
            let message = event.data;
            let jsonMessage = null;
            //parse message
            if (typeof message == "string") {
            
                try {
                    jsonMessage = JSON.parse(message);
                } catch (error) {
                    console.error(error);
                    return;
                }
            } else {
                jsonMessage = message;
            }

            //check client identity
            if (!this._identified) {
                //return error if no identity to client
                if (jsonMessage.status == "fail") {
                    this.emit("error", new Error(jsonMessage.errorMessage));
                } else {
                    //set name if not exists and emit open event
                    this._identified = true;
                    if (!this._name) this._name = jsonMessage.identity;
                    this._state = State.OPEN;
                    this.emit("state", this._state);
                    this.emit("open");
                }
            } else {
                //read incoming message
                let messageData = jsonMessage.data;
                //create OctopusStream if message is stream header
                if (jsonMessage.data.streamType == "OctopusStream") {
                    let streamResult = this.parseIncomingStream(jsonMessage.data);
                    if (streamResult instanceof OctopusStream) {
                        messageData = streamResult;
                    } else {
                        //do not emit event on stream data, because it was already emitted in header
                        return;
                    }
                }
                let type = jsonMessage.type;
                let replyToClientMessageId = jsonMessage.replyToClientMessageId;
                let replyErrorToClientMessageId = jsonMessage.replyErrorToClientMessageId;
                //if type of message is request, create a reply and error function
                if (type == "request") {
                    //send reply
                    this.emit("request", messageData, (message) => {
                        let type = "response";
                        //send OctopusStream if reply is stream
                        if (message instanceof OctopusStream) {
                            let reply = true;
                            this.sendStream(jsonMessage.messageId, type, message, reply);
                        } else {
                            let newMessage = {
                                replyTo: jsonMessage.messageId,
                                data: message,
                                type: type
                            }
                            newMessage.clientMessageId = this._generateMessageId();
                            this._rws.send(JSON.stringify(newMessage));
                        }
                    //send error
                    }, (error) => {
                        let newMessage = {
                            replyErrorTo: jsonMessage.messageId,
                            message: (error.message)? error.message : error,
                            data: error.data,
                            type: "response"
                        }
                        newMessage.clientMessageId = this._generateMessageId();
                        this._rws.send(JSON.stringify(newMessage));
                    });
                //resolve promise when getting response message
                } else if (replyToClientMessageId) {
                    let promise = this._messages[replyToClientMessageId];
                    if (promise) promise.resolve(messageData);
                //resolve error when getting error message
                } else if (replyErrorToClientMessageId) {
                    let promise = this._messages[replyErrorToClientMessageId];
                    if (promise) {
                        let errorMessage = (jsonMessage.message)? jsonMessage.message : jsonMessage;
                        let error = new Error(errorMessage);
                        if (typeof messageData !== "undefined") error.data = jsonMessage.data;
                        promise.reject(error);
                    }
                //message type is publish
                } else {
                    //emit stream event for OctopusStream message
                    if (messageData instanceof OctopusStream) {
                        this.emit("stream", messageData);
                    //emit message event for regular message
                    } else {
                        this.emit("message", messageData);
                    }
                }
            }
        });

        //emit error if websocker error
        this._rws.addEventListener("error", (err) => {
            this.emit("error", err);
        });

        //emit close event
        this._rws.addEventListener("close", ()=> {
            this._identified = false;
            this._state = State.CLOSED;
            this.emit("state", this._state);
            this.emit('close');
        });
    }

    send(message) {
        this._rws.send(message);
    }

    /**
     * Publish a message to all group or single client name
     * @param string name 
     * @param string/object message 
     */
    publish(name, message) {
        let type = "publish";
        let clientMessageId = this._generateMessageId();
        //send OctopusStream if message is stream
        if (message instanceof OctopusStream) {
            this.sendStream(name, type, message);
        //send regular message
        } else {
            let newMessage = {
                to: name,
                data: message,
                clientMessageId: clientMessageId,
                type: type,
            }
            this._rws.send(JSON.stringify(newMessage));
        } 
    }

    /**
     * Send request message and return Promise for response or error
     * @param string name 
     * @param string/object message 
     * @param object options 
     * @returns Promise
     */
    request(name, message, options) {
        //check options
        if (options && options.timeout && !Number.isInteger(options.timeout)) {
            let error = new Error(errors.TIMEOUT_NOT_NUMBER.error);
            error.data = errors.TIMEOUT_NOT_NUMBER;
            throw error;
        }
        let type = "request";
        let baseMessageId = null;
        //send OctopusStream if message is stream
        if (message instanceof OctopusStream) {
            baseMessageId = this.sendStream(name, type, message);
        //send regular message
        } else {
            let newMessage = {
                to: name,
                data: message,
                type: type
            }
            newMessage.clientMessageId = this._generateMessageId();
            baseMessageId = newMessage.clientMessageId;
            this._rws.send(JSON.stringify(newMessage));
        }
        //return Promise
        return new Promise( (resolve, reject) => {
            //reject promise if timeout from options
            if (options && options.timeout) {
                setTimeout(() => {
                    let error = new Error(errors.TIMEOUT.error);
                    error.data = errors.TIMEOUT
                    reject(error);
                }, options.timeout);
            }
            this._messages[baseMessageId] = {resolve, reject}
        });
    }

    /**
     * Close connection
     */
    close() {
        if (this._rws) {
            this._rws.close();
        }
    }

    /**
     * Return group name
     * @returns string
     */
    group() {
        return this._group;
    }

    /**
     * Return client name
     * @returns string
     */
    name() {
        return this._name;
    }

    /**
     * Generate unique message id
     * @returns string
     */
    _generateMessageId() {
        this._messageId++;
        return this._messageId;
    }

    /**
     * Get the current state of the connection
     * @returns State
     */
    state() {
       if (!this._rws) return State.DISCONNECTED;
       else return this.stateFromReadyState(this._rws.readyState); 
    }

    /**
     * Transform rws readyState to State object
     * @param integer readyState 
     * @returns State
     */
    stateFromReadyState(readyState) {
        switch (readyState) {
            case 0:
                return State.CONNECTING;
            case 1:
                return State.OPEN;
            case 2:
                return State.CLOSING;
            case 3:
                return State.CLOSED;
        }
    }

    /**
     * Send OctopusStream to client
     * @param string name 
     * @param string type 
     * @param object octopusStream 
     * @param string reply 
     * @returns string
     */
    sendStream(name, type, octopusStream, reply) {
        if (!octopusStream || !this.isReadableStream(octopusStream.stream())) {
            throw new Error("Not a readable stream");
        }
        //prepare header message
        let headerMessageId = this._generateMessageId();
        let headerMessage = {
            data: {
                uuid: octopusStream.uuid(),
                streamType: "OctopusStream",
                streamStatus: "HEADER",
                extra: octopusStream.extra(),
            },
            type: type,
            clientMessageId: headerMessageId,
        }
        //set 'to' or 'replyTo'
        if (reply) headerMessage.replyTo = name;
        else headerMessage.to = name;
        //send header message
        this._rws.send(JSON.stringify(headerMessage));

        //read data from stream
        octopusStream.stream().on("data", (chunk) => {
            //prepare data message
            let streamMessage = {
                clientMessageId: this._generateMessageId(),
                type: type + "-stream",
                data: {
                    uuid: octopusStream.uuid(),
                    stream: chunk,
                    streamType: "OctopusStream",
                    streamStatus: "DATA"
                }
            }
            //set 'to' or 'replyTo'
            if (reply) streamMessage.replyTo = name;
            else streamMessage.to = name;
            //send data message
            this._rws.send(JSON.stringify(streamMessage));
        });

        //get end of stream
        octopusStream.stream().on("end", () => {
            //prepare end message
            let endMessage = {
                clientMessageId: this._generateMessageId(),
                type: type,
                data: {
                    uuid: octopusStream.uuid(),
                    streamType: "OctopusStream",
                    streamStatus: "END"
                }
            }
            //set 'to' or 'replyTo'
            if (reply) endMessage.replyTo = name;
            else endMessage.to = name;
            //send end message
            this._rws.send(JSON.stringify(endMessage));
        });

        //handle read stream error
        octopusStream.stream().on("error", err => {
            throw err;
        });

        return headerMessageId;
    }

    /**
     * Parse incoming stream and create/update OctopusStream object
     * @param object data 
     * @returns OctopusStream/boolean
     */
    parseIncomingStream(data) {
        let uuid = data.uuid;
        let currentStream = null;
        //create or return OctopusStream object by streamStatus property
        if (!incomingStreams[uuid]) {
            //can't parse stream without having header first
            if (data.streamStatus != "HEADER") return false;
            let stream = new PassThrough();
            //create OctopusStream from header message
            currentStream = new OctopusStream({stream, extra: data.extra, uuid});
            incomingStreams[uuid] = currentStream;
        } else {
            currentStream = incomingStreams[uuid];
        }
        //add to stream if received data
        if (data.streamStatus == "DATA") {
            currentStream.stream().write(Buffer.from(data.stream));
        //set end of stream
        } else if (data.streamStatus == "END") {
            currentStream.stream().end();
            delete incomingStreams[uuid];
        }

        //return OctopusStream created from header message, or return false
        if (data.streamStatus == "HEADER") return currentStream;
        else return false;
    }

    /**
     * Check if object is a readable stream
     * @param object obj 
     * @returns boolean
     */
    isReadableStream(obj) {
        return obj instanceof Stream &&
          typeof (obj._read === 'function') &&
          typeof (obj._readableState === 'object');
      }
}

export default Client