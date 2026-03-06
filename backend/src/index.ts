import { Hono } from "hono";
import { cors } from "hono/cors";
import userRouter from "./routes/user";
import blogRouter from "./routes/blog";
import type { Bindings } from "./types";

const app = new Hono<{ Bindings: Bindings }>();

// CORS must be registered before all routes
// origin: "*"  → allows any frontend (good for development)
// For production, replace "*" with your frontend URL e.g. "https://yourapp.com"
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.route("/api/v1", userRouter);
app.route("/api/v1/blog", blogRouter);

export default app;
