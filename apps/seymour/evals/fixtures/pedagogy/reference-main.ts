import express from "express";

const app = express();
app.use(express.json());

app.post("/greetings", (request, response) => {
  const name = request.body?.name;

  if (typeof name !== "string" || name.trim().length === 0) {
    response.status(400).json({ error: "name must be a nonempty string" });
    return;
  }

  if (name.trim().length > 100) {
    response.status(400).json({ error: "name must have at most 100 characters" });
    return;
  }

  response.json({ message: `Hello ${name.trim()}` });
});

export default app;
