import EventEmitter from 'eventemitter3';
import ws from 'ws';
import ReconnectingWebSocket from 'reconnecting-websocket';

const Status = {
    CONNECTED: "CONNECTED",
    DISCONNECTED: "DISCONNECTED"
}

class Client extends EventEmitter {

    static get Status() {
        return Status;
    }

    _identified = false;
    _messageId = 0;
    _ws = null;
    _group = null;
    _name= null;
    _messages = {};
    _status = null;
    _rws = null;

    constructor(options) {
        super();
        this._status = Status.DISCONNECTED;

        if (options) this.connect(options);


    }

    connect(options) {
        if (typeof options.group != "string") {
            setImmediate(() => {
                this.emit("error", new Error("group must be a string"));
                
            });
            return;
        }

        if (options.group.trim().length == 0) {
            setImmediate(() => {
                this.emit("error", new Error("group must not be empty"));
            });
            return;
        }

        if (options.name && typeof options.name != "string") {
            setImmediate(() => {
                this.emit("error", new Error("name must be a string"));
                
            });
            return;
        }

        if (options.name && options.name.trim().length == 0) {
            setImmediate(() => {
                this.emit("error", new Error("name must be a string"));
                
            });
            return;
        }

        this._group = options.group.trim();
        this._name = (options.name)? options.name.trim() : null;
        let host = (options.host)? options.host : "localhost";
        let port = (options.port)? options.port : "8899";
        let protocol = (options.ssl)? "wss" : "ws";
        let fullUrl = protocol + "://"  + host + ":" + port;

        let rwsOptions = (options.rwsOptions)? options.rwsOptions : {};
        rwsOptions.WebSocket = ws;
        //this._ws = new ws("ws://" + fullUrl);
        this._rws = new ReconnectingWebSocket(fullUrl, [], rwsOptions);
        this._rws.addEventListener('open', () => {
            let identityJson = {
                group: this._group,
                name: this._name
            }

            this._rws.send(JSON.stringify(identityJson));
        });

        this._rws.addEventListener("message", (event) => {
            let message = event.data;
            let jsonMessage = null;
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
            if (!this._identified) {
                if (jsonMessage.status == "fail") {
                    this.emit("error", new Error(jsonMessage.errorMessage));
                } else {
                    this._identified = true;
                    if (!this._name) this._name = jsonMessage.identity;
                    this._status = Status.CONNECTED;
                    this.emit("status", this._status);
                    this.emit("open");
                }
            } else {
                
                let type = jsonMessage.type;
                let replyToClientMessageId = jsonMessage.replyToClientMessageId;
                let replyErrorToClientMessageId = jsonMessage.replyErrorToClientMessageId;
                if (type == "request") {
                    this.emit("request", jsonMessage.data, (message) => {
                        let newMessage = {
                            replyTo: jsonMessage.messageId,
                            data: message,
                            type: "response"
                        }
                        newMessage.clientMessageId = this._generateMessageId();
                        this._rws.send(JSON.stringify(newMessage));
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
                } else if (replyToClientMessageId) {
                    let promise = this._messages[replyToClientMessageId];
                    if (promise) promise.resolve(jsonMessage.data);
                } else if (replyErrorToClientMessageId) {
                    let promise = this._messages[replyErrorToClientMessageId];
                    if (promise) {
                        let errorMessage = (jsonMessage.message)? jsonMessage.message : jsonMessage;
                        let error = new Error(errorMessage);
                        if (typeof jsonMessage.data !== "undefined") error.data = jsonMessage.data;
                        promise.reject(error);
                    }
                } else {
                    this.emit("message", jsonMessage.data);
                }

            }
        });

        this._rws.addEventListener("error", (err) => {
            this.emit("error", err);
        });

        this._rws.addEventListener("close", ()=> {
            this._identified = false;
            //this._name = null;
            this._status = Status.DISCONNECTED;
            this.emit("status", this._status);
            this.emit('close');
        });
    }

    status() {
        return this._status;
    }

    send(message) {
        this._rws.send(message);
    }

    publish(name, message) {
        let newMessage = {
            to: name,
            data: message,
            type: "publish"
        }
        newMessage.clientMessageId = this._generateMessageId();
        this._rws.send(JSON.stringify(newMessage));
    }

    request(name, message) {
        let newMessage = {
            to: name,
            data: message,
            type: "request"
        }
        newMessage.clientMessageId = this._generateMessageId();
        this._rws.send(JSON.stringify(newMessage));
        return new Promise( (resolve, reject) => {
            this._messages[newMessage.clientMessageId] = {resolve, reject}
        });
    }

    close() {
        if (this._rws) {
            this._rws.close();
        }
    }

    group() {
        return this._group;
    }

    name() {
        return this._name;
    }

    _generateMessageId() {
        this._messageId++;
        return this._messageId;
    }

    
}

export default Client