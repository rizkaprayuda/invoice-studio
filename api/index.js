const path = require("path");
const { createApp } = require("../src/create-app");

module.exports = createApp(path.join(process.cwd(), "public"));
