const path = require("path");
const { createApp } = require("./src/create-app");

const PORT = Number(process.env.PORT) || 3000;
const app = createApp(path.join(__dirname, "public"));

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Invoice web app running: http://localhost:${PORT}`);
});
