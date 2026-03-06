import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { authMiddleware } from "../middleware/auth";
import type { Bindings, Variables } from "../types";

const blogRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

blogRouter.use("/*", authMiddleware);

// GET /api/v1/blog/bulk — get all published blogs
// NOTE: this must be defined BEFORE /:id, otherwise "bulk" would be treated as an id
blogRouter.get("/bulk", async (c) => {
  const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const blogs = await prisma.blog.findMany({
    where: { published: true },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      author: {
        select: { name: true },
      },
    },
  });

  return c.json({ success: true, blogs });
});

// GET /api/v1/blog/:id — get a single blog by id
blogRouter.get("/:id", async (c) => {
  const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const id = c.req.param("id");

  const blog = await prisma.blog.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      content: true,
      published: true,
      createdAt: true,
      author: {
        select: { name: true },
      },
    },
  });

  if (!blog) {
    return c.json({ success: false, message: "Blog not found" }, 404);
  }

  return c.json({ success: true, blog });
});

// POST /api/v1/blog — create a new blog
blogRouter.post("/", async (c) => {
  const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const userId = c.get("userId");
  const { title, content, published } = await c.req.json();

  if (!title || !content) {
    return c.json(
      { success: false, message: "Title and content are required" },
      400,
    );
  }

  const blog = await prisma.blog.create({
    data: {
      title,
      content,
      published: published ?? false,
      authorId: userId,
    },
  });

  return c.json({ success: true, blog }, 201);
});

// PUT /api/v1/blog — update an existing blog
blogRouter.put("/", async (c) => {
  const adapter = new PrismaNeon({ connectionString: c.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const userId = c.get("userId");
  const { id, title, content, published } = await c.req.json();

  if (!id) {
    return c.json({ success: false, message: "Blog id is required" }, 400);
  }

  // Make sure the blog belongs to the user making the request
  const existingBlog = await prisma.blog.findUnique({ where: { id } });
  if (!existingBlog) {
    return c.json({ success: false, message: "Blog not found" }, 404);
  }
  if (existingBlog.authorId !== userId) {
    return c.json(
      { success: false, message: "You can only edit your own blogs" },
      403,
    );
  }

  const blog = await prisma.blog.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(content && { content }),
      ...(published !== undefined && { published }),
    },
  });

  return c.json({ success: true, blog });
});

export default blogRouter;
