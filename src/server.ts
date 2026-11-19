import express from "express";
import type { ErrorRequestHandler } from "express";
import { getUserHandler } from "./function.js";

const app = express();

app.get("/users/:user_id", getUserHandler);

const handleError: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(500).json({ message: "Internal server error"});
};

app.use(handleError);

app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");