# Learning Notes — Medium App Backend

A step-by-step record of everything we built and why.

---

## The Stack (What tools we are using and why)

| Tool | What it is | Why we use it |
|---|---|---|
| **Cloudflare Workers** | A serverless platform — your code runs on the internet edge, not a traditional server | Fast, cheap, no server to manage |
| **Hono** | A web framework (like Express.js) built specifically for edge/serverless | Lightweight, works perfectly on Cloudflare Workers |
| **Prisma** | A database toolkit — lets you talk to your database using TypeScript instead of raw SQL | Type-safe, easy to use |
| **Neon** | A cloud PostgreSQL database | Works well with serverless because it supports HTTP-based connections |
| **JWT** | JSON Web Token — a way to prove who a user is after they log in | Standard way to handle authentication |

---

## Key Concept: Serverless vs Traditional Server

In a **traditional server** (like Express on Node.js):
- The server runs 24/7 waiting for requests
- You can have global variables that persist between requests
- You can open a single database connection and reuse it

In **Cloudflare Workers (serverless)**:
- There is NO always-running server
- Each request spins up a fresh "worker" (like a mini function)
- **You CANNOT have global state** — nothing persists between requests
- This is why we create a new `PrismaClient` inside every route handler

---

## Project File Structure

```
src/
  index.ts           ← Entry point. Just mounts routers. Nothing else.
  types.ts           ← Shared TypeScript types used across all files
  middleware/
    auth.ts          ← Auth check that runs BEFORE protected routes
  routes/
    user.ts          ← /signup and /signin routes
    blog.ts          ← /blog routes (all require login)

prisma/
  schema.prisma      ← Defines the shape of your database tables

wrangler.jsonc       ← Cloudflare Workers config (env variables, entry point)
```

---

## Step 1 — Environment Variables: `.env` vs `wrangler.jsonc` (important!)

### These are two completely separate systems

**.env file — Node.js world**
- `.env` is a Node.js convention. It works with `process.env` (a Node.js thing)
- Cloudflare Workers do NOT run Node.js — they have their own runtime with no `process.env`
- In this project, `.env` is used ONLY by the Prisma CLI (e.g. `npx prisma migrate dev`)
- It has zero effect on your running Worker

**`c.env` — Cloudflare Workers world**
- When Cloudflare runs your Worker, it reads `wrangler.jsonc` and injects the `vars`
  directly into your Worker as a parameter
- Hono wraps that and exposes it as `c.env`
- Under the hood, a Cloudflare Worker looks like this:
  ```typescript
  export default {
    fetch(request, env, ctx) {
      // env = vars from wrangler.jsonc, injected by Cloudflare
      // Hono receives this and puts it on c.env
    }
  }
  ```
- So `c.env.DATABASE_URL` is reading from what Cloudflare handed to the Worker, NOT from any `.env` file

**Simple analogy:**
- `.env` → a notepad only your laptop/CLI tools can read
- `wrangler.jsonc vars` → a config Cloudflare reads and hands directly to your running Worker

---

## `wrangler.jsonc` vars

```jsonc
"vars": {
  "DATABASE_URL": "...",   // Neon DB connection string
  "JWT_SECRET": "..."      // Secret key used to sign/verify tokens
}
```

- These are injected by Cloudflare into your worker at runtime
- Inside your code, you access them via `c.env.DATABASE_URL`
- `c` is the Hono context object — it carries the request, response, and env variables

---

## Step 2 — Shared Types (`src/types.ts`)

```typescript
export type Bindings = {
  DATABASE_URL: string;
  JWT_SECRET: string;
};

export type Variables = {
  userId: string;
};
```

**Why this file exists:**
- `Bindings` tells TypeScript what environment variables exist in `c.env`
- `Variables` tells TypeScript what data you can store on the request context with `c.set()`
- Both are reused across `routes/user.ts`, `routes/blog.ts`, and `middleware/auth.ts` — so we keep them in one place instead of duplicating

---

## Step 3 — Database Connection (Prisma + Neon)

```typescript
const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

**What's happening line by line:**
1. `PrismaNeon` is an adapter (a bridge) that lets Prisma talk to Neon over HTTP instead of a raw TCP connection (required for serverless)
2. `PrismaClient` is the actual database client — you use it to query your DB
3. We do this inside every route handler because (as explained above) serverless has no global state

---

## Step 4 — Signup Route (`src/routes/user.ts`)

### What signup does, step by step:

```typescript
// 1. Read data from the request body
const { email, password, name } = await c.req.json();

// 2. Validate — don't proceed if required fields are missing
if (!email || !password) {
  return c.json({ success: false, message: "Email and password are required" }, 400);
}

// 3. Check if email already exists in the database
const existingUser = await prisma.user.findUnique({ where: { email } });
if (existingUser) {
  return c.json({ success: false, message: "Email already in use" }, 409);
}

// 4. Hash the password before saving
const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
const hashedPassword = Array.from(new Uint8Array(hashBuffer))
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("");

// 5. Save the user to the database
const user = await prisma.user.create({
  data: { email, name, password: hashedPassword },
});

// 6. Create a JWT token and return it
const token = await sign({ id: user.id, email: user.email }, c.env.JWT_SECRET);
return c.json({ success: true, token }, 201);
```

### Why do we hash the password?
- You should NEVER store a plain text password in the database
- If the database ever gets hacked, hackers get hashed strings, not real passwords
- SHA-256 converts any text into a fixed 64-character string
- The same input always gives the same output — so during signin, you hash what they typed and compare it to what's stored

### What is a JWT token?
- After signup/signin, we give the user a token
- It's a string that looks like: `xxxxx.yyyyy.zzzzz`
- It contains data (user id, email) + a signature made with `JWT_SECRET`
- The client (frontend) sends this token with every future request in the `Authorization` header
- The server verifies the signature to confirm the token is real and wasn't tampered with

---

## Step 5 — Auth Middleware (`src/middleware/auth.ts`)

```typescript
export const authMiddleware = async (c, next) => {
  // 1. Read the token from the request header
  const token = c.req.header("Authorization")?.split(" ")[1];

  // 2. If no token, reject immediately
  if (!token) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  // 3. Verify the token is valid and not tampered with
  const decoded = await verify(token, c.env.JWT_SECRET);
  if (!decoded) {
    return c.json({ success: false, message: "Unauthorized" }, 401);
  }

  // 4. Save the userId on the context so route handlers can use it
  c.set("userId", decoded.id as string);

  // 5. Call next() — this means "proceed to the actual route handler"
  await next();
};
```

**What is middleware?**
- Middleware is code that runs in the MIDDLE — before your route handler runs
- Think of it like a security guard at a door. Before you enter, the guard checks your ID
- If the check passes, `next()` is called and the request continues to the route handler
- If the check fails, we return early with a 401 error and the route handler never runs

**How the token is sent:**
The frontend sends the token in the request header like this:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...
```
We split on the space and take index `[1]` to get just the token part (without "Bearer ")

---

## Step 6 — Blog Routes (`src/routes/blog.ts`)

```typescript
// Apply auth middleware to ALL routes in this router
blogRouter.use("/*", authMiddleware);

blogRouter.get("/:id", (c) => {
  const id = c.req.param("id");      // from the URL e.g. /blog/123
  const userId = c.get("userId");    // set by authMiddleware
  return c.json({ message: "get blog route", id, userId });
});
```

- `blogRouter.use("/*", authMiddleware)` means: run auth check on every route in this file
- `c.get("userId")` retrieves the userId that auth middleware stored — this is how middleware passes data to route handlers
- `c.req.param("id")` reads dynamic URL segments — if the URL is `/blog/abc123`, then `id` is `"abc123"`

---

## Step 7 — Entry Point (`src/index.ts`)

```typescript
const app = new Hono<{ Bindings: Bindings }>();

app.route("/api/v1", userRouter);       // mounts /signup and /signin under /api/v1
app.route("/api/v1/blog", blogRouter);  // mounts blog routes under /api/v1/blog

export default app;
```

**Final URL mapping:**
| File | Route defined as | Final URL |
|---|---|---|
| `routes/user.ts` | `/signup` | `POST /api/v1/signup` |
| `routes/user.ts` | `/signin` | `POST /api/v1/signin` |
| `routes/blog.ts` | `/:id` | `GET /api/v1/blog/:id` |
| `routes/blog.ts` | `/` | `POST /api/v1/blog` |
| `routes/blog.ts` | `/` | `PUT /api/v1/blog` |

---

## HTTP Status Codes Used

| Code | Meaning | When we use it |
|---|---|---|
| `200` | OK | Signin successful |
| `201` | Created | Signup successful (new resource created) |
| `400` | Bad Request | Missing email or password |
| `401` | Unauthorized | Wrong credentials or missing/invalid token |
| `409` | Conflict | Email already exists |

---

## Step 8 — Secrets vs Vars (how JWT_SECRET is handled safely)

There are 3 places environment variables can live:

| Place | What goes here | Visible in code/git? |
|---|---|---|
| `wrangler.jsonc` vars | Non-sensitive config like `DATABASE_URL` | Yes |
| `npx wrangler secret put` | Sensitive secrets like `JWT_SECRET` | No — encrypted on Cloudflare |
| `.dev.vars` | Same secrets but for local dev only | Only on your machine |

**Why not put JWT_SECRET in `wrangler.jsonc`?**
Because `wrangler.jsonc` gets committed to git. Anyone who sees your repo sees your secret. Cloudflare secrets are stored encrypted on their servers — even Cloudflare staff can't read the value.

**How `wrangler secret put` works:**
```bash
npx wrangler secret put JWT_SECRET
# prompts you to type the value → uploads it encrypted to Cloudflare
# your Worker automatically gets it via c.env.JWT_SECRET at runtime
```

**To confirm it was uploaded:**
```bash
npx wrangler secret list
# shows: JWT_SECRET  secret
```

---

## Step 9 — CORS (`src/index.ts`)

CORS is a browser security rule. When your frontend (e.g. `localhost:5173`) calls your backend (`localhost:8787`), the browser asks the backend: "do you allow requests from this origin?"

```typescript
app.use("*", cors({
  origin: "*",                                          // allow any frontend (dev)
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));
```

- Must be registered **before** all routes
- `OPTIONS` method is required — browsers send a preflight OPTIONS request before every real request
- For production, change `origin: "*"` to `origin: "https://yourapp.com"`

---

## Step 10 — Deployment

**Live URL: https://backend.avesh-blog.workers.dev**

```bash
npm run deploy   # bundles TypeScript → uploads to Cloudflare edge network
```

After deploy, your API is live globally. Cloudflare runs it in 200+ locations worldwide — whoever calls it gets routed to the nearest one.

**Full deploy checklist (use this every time you change the schema):**
```bash
npx prisma migrate dev --name <describe-your-change>
npx prisma generate
npm run deploy
```

---

## What's Been Built (Complete)

- [x] User signup with hashed password + JWT token response
- [x] User signin with password check + JWT token response
- [x] Auth middleware protecting all blog routes
- [x] Create blog post (POST /api/v1/blog)
- [x] Update blog post — only by the author (PUT /api/v1/blog)
- [x] Get single blog by id (GET /api/v1/blog/:id)
- [x] Get all published blogs (GET /api/v1/blog/bulk)
- [x] CORS configured for frontend access
- [x] JWT_SECRET stored as encrypted Cloudflare secret
- [x] Deployed to Cloudflare Workers

## What to Learn Next

- [ ] Input validation with **Zod** — validate request body shape/types before hitting the DB
- [ ] try/catch error handling — so DB errors don't leak raw messages to clients
- [ ] Custom domain — attach `api.yourapp.com` to the Worker (Cloudflare dashboard)
- [ ] Prisma Accelerate — connection pooling + caching layer on top of Neon (revisit now that basics work)
