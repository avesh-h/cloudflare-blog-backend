import { verify } from "hono/jwt";
import type { Context, Next } from "hono";
import type { Bindings, Variables } from "../types";

export const authMiddleware = async (
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  next: Next,
) => {
  const token = c.req.header("Authorization")?.split(" ")[1];

  if (!token) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  const decoded = await verify(token, c.env.JWT_SECRET, "HS256");
  if (!decoded) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  c.set("userId", decoded.id as string);
  await next();
};
