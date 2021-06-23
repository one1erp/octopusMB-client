var EventEmitter = require('eventemitter3');
const ws = require('ws');

class Client extends EventEmitter {

    _identified = false;
    _messageId = 0;
    _ws = null;
    _group = null;
    _name= null;
    _messages = {};

    constructor({
            url,
            group,
            name
        }) {
        super();

        if (typeof group != "string") {
            setImmediate(() => {
                this.emit("error", new Error("group must be a string"));
                
            });
            return;
        }

        if (group.trim().length == 0) {
            setImmediate(() => {
                this.emit("error", new Error("group must not be empty"));
            });
            return;
        }

        if (name && typeof name != "string") {
            setImmediate(() => {
                this.emit("error", new Error("name must be a string"));
                
            });
            return;
        }

        if (name && name.trim().length == 0) {
            setImmediate(() => {
                this.emit("error", new Error("name must be a string"));
                
            });
            return;
        }

        this._group = group.trim();
        this._name = (name)? name.trim() : null;
        let fullUrl = (url.includes(":"))? url : url + ":" + "8899";

        this._ws = new ws("ws://" + fullUrl);
        this._ws.on('open', () => {
            let identityJson = {
                group: this._group,
                name: this._name
            }

            this._ws.send(JSON.stringify(identityJson));
        });

        this._ws.on("message", (message) => {
            console.log("base message:" + message);
            let jsonMessage = null;
            try {
                jsonMessage = JSON.parse(message);
            } catch (error) {
                console.error(error);
                return;
            }

            if (!this._identified) {
                if (jsonMessage.status == "fail") {
                    this.emit("error", new Error(jsonMessage.errorMessage));
                } else {
                    this._identified = true;
                    if (!this._name) this._name = jsonMessage.identity;
                    console.log(this._name);
                    this.emit("open");
                }
            } else {
                let type = jsonMessage.type;
                let replyToClientMessageId = jsonMessage.replyToClientMessageId;
                if (type == "request") {
                    this.emit("request", jsonMessage.data, (message) => {
                        let newMessage = {
                            replyTo: jsonMessage.messageId,
                            data: message,
                            type: "response"
                        }
                        newMessage.clientMessageId = this._generateMessageId();
                        this._ws.send(JSON.stringify(newMessage));
                    });
                } else if (replyToClientMessageId) {
                    console.log("replying to client message id: " + replyToClientMessageId);
                    let promise = this._messages[replyToClientMessageId];
                    if (promise) promise.resolve(jsonMessage.data);
                } else {
                    console.log("getting message:" + jsonMessage);
                    this.emit("message", jsonMessage.data);
                }

            }
        });
    }

    send(message) {
        this._ws.send(message);
    }

    publish(name, message) {
        let newMessage = {
            to: name,
            data: message,
            type: "publish"
        }
        newMessage.clientMessageId = this._generateMessageId();
        this._ws.send(JSON.stringify(newMessage));
    }

    request(name, message) {
        let newMessage = {
            to: name,
            data: message,
            type: "request"
        }
        newMessage.clientMessageId = this._generateMessageId();
        this._ws.send(JSON.stringify(newMessage));
        return new Promise( (resolve, reject) => {
            this._messages[newMessage.clientMessageId] = {resolve, reject}
        });
    }

    close () {
        this._ws.close();
    }

    _generateMessageId() {
        this._messageId++;
        return this._messageId;
    }

    
}

module.exports = Client