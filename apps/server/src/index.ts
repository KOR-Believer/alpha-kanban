import { createServerApp } from "./app";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "5174", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const { app } = createServerApp();

app.listen(port, host, () => {
  console.log(`Alpha Kanban API listening at http://${host}:${port}`);
});
