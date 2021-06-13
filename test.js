const Client = require('./Client');
let client = new Client({
    url: "localhost",
    group: "controller",
});
client.on("open", () => {
    
});

client.on("error", (error) => {
    console.log(error);
});