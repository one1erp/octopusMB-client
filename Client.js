var EventEmitter = require('eventemitter3');
const ws = require('ws');

class Client extends EventEmitter {

    identified = false;
    messageId = 0;
    ws = null;
    group = null;
    name= null;

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

        this.group = group.trim();
        this.name = (name)? name.trim() : null;
        let fullUrl = (url.includes(":"))? url : url + ":" + "8899";

        this.ws = new ws("ws://" + fullUrl);
        this.ws.on('open', () => {
            let identityJson = {
                group: this.group,
                name: this.name
            }

            this.ws.send(JSON.stringify(identityJson));
        });

        this.ws.on("message", (message) => {
            let jsonMessage = null;
            try {
                jsonMessage = JSON.parse(message);
            } catch (error) {
                console.error(error);
                return;
            }

            if (!this.identified) {
                if (jsonMessage.status == "fail") {
                    this.emit("error", new Error(jsonMessage.errorMessage));
                } else {
                    this.identified = true;
                    if (!this.name) this.name = jsonMessage.identity;
                    console.log(this.name);
                }
            }
        });
    }

    send(message) {
        this.ws.send(message);
    }
}

module.exports = Client