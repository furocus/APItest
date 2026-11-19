import express from "express";
import type { ErrorRequestHandler } from "express";
import { signupHandler, getUserHandler, updateUserHandler, closeAccountHandler } from "./function.js";

const app = express();

app.use(express.json());
app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});

app.post("/signup", signupHandler);
app.get("/users/:user_id", getUserHandler);
app.patch("/users/:user_id", updateUserHandler);
app.post("/close", closeAccountHandler);

const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof SyntaxError && "status" in error && error.status === 400) {
        res.status(400).json({ message: "Invalid JSON" });
        return;
    }
    console.error("API request failed");
    res.status(500).json({ message: "Internal server error"});
};

app.use(handleError);

app.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
