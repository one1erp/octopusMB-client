import EventEmitter from 'eventemitter3';
import ws from 'ws';
import ReconnectingWebSocket from 'reconnecting-websocket';
import errors from './errors.js'

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
        this._state = State.CONNECTING;
        this.emit("state", this._state);
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
                    this._state = State.OPEN;
                    this.emit("state", this._state);
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
            this._state = State.CLOSED;
            this.emit("state", this._state);
            this.emit('close');
        });
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

    request(name, message, options) {
        if (options && options.timeout && !Number.isInteger(options.timeout)) {
            let error = new Error(errors.TIMEOUT_NOT_NUMBER.error);
            error.data = errors.TIMEOUT_NOT_NUMBER;
            throw error;
        }
        let newMessage = {
            to: name,
            data: message,
            type: "request"
        }
        newMessage.clientMessageId = this._generateMessageId();
        this._rws.send(JSON.stringify(newMessage));
        return new Promise( (resolve, reject) => {
            if (options && options.timeout) {
                setTimeout(() => {
                    let error = new Error(errors.TIMEOUT.error);
                    error.data = errors.TIMEOUT
                    reject(error);
                }, options.timeout);
            }
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
}

export default Client