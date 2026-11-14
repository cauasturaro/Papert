import express from "express";

const app = express();
app.use(express.json());

app.post("/greetings", (request, response) => {
  const name = request.body.name;
  response.json({ message: `Hello ${name}` });
});

export default app;
