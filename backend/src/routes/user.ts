import { Hono } from "hono";
import { sign } from "hono/jwt";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { Bindings } from "../types";

const userRouter = new Hono<{ Bindings: Bindings }>();

userRouter.post("/signup", async (c) => {
  const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const { email, password, name } = await c.req.json();

  if (!email || !password) {
    return c.json(
      { success: false, message: "Email and password are required" },
      400,
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return c.json({ success: false, message: "Email already in use" }, 409);
  }

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  );
  const hashedPassword = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const user = await prisma.user.create({
    data: { email, name, password: hashedPassword },
  });

  const token = await sign(
    { id: user.id, email: user.email },
    c.env.JWT_SECRET,
  );

  return c.json({ success: true, token }, 201);
});

userRouter.post("/signin", async (c) => {
  const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json(
      { success: false, message: "Email and password are required" },
      400,
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return c.json({ success: false, message: "Invalid credentials" }, 401);
  }

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password),
  );
  const hashedPassword = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (user.password !== hashedPassword) {
    return c.json({ success: false, message: "Invalid credentials" }, 401);
  }

  const token = await sign(
    { id: user.id, email: user.email },
    c.env.JWT_SECRET,
  );

  return c.json({ success: true, token }, 200);
});

export default userRouter;
