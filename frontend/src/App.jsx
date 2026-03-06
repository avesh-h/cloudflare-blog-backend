import { useState, useEffect } from "react";
import { signup, signin, getBlogs, getBlog, createBlog, updateBlog } from "./api";
import "./App.css";

// ─── Auth Page ────────────────────────────────────────────────────────────────

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data =
        mode === "signup"
          ? await signup(email, password, name)
          : await signin(email, password);

      if (data.success) {
        localStorage.setItem("token", data.token);
        onLogin();
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch {
      setError("Could not reach server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1>Medium Clone</h1>
        <h2>{mode === "signin" ? "Sign In" : "Sign Up"}</h2>
        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Sign Up"}
          </button>
        </form>
        <p className="toggle-link">
          {mode === "signin" ? "No account?" : "Already have an account?"}{" "}
          <button
            className="link-btn"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
          >
            {mode === "signin" ? "Sign Up" : "Sign In"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── Blog List ────────────────────────────────────────────────────────────────

function BlogList({ onViewBlog, onCreateBlog, onLogout }) {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getBlogs()
      .then((data) => {
        if (data.success) setBlogs(data.blogs);
        else setError(data.message || "Failed to load blogs");
      })
      .catch(() => setError("Could not reach server"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <header className="top-bar">
        <h1>Medium Clone</h1>
        <div className="top-bar-actions">
          <button onClick={onCreateBlog}>+ Write</button>
          <button className="secondary" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {loading && <p className="center">Loading blogs...</p>}
      {error && <p className="error center">{error}</p>}
      {!loading && !error && blogs.length === 0 && (
        <p className="center muted">No published blogs yet. Be the first to write one!</p>
      )}

      <div className="blog-list">
        {blogs.map((blog) => (
          <div key={blog.id} className="blog-card" onClick={() => onViewBlog(blog.id)}>
            <h2>{blog.title}</h2>
            <p className="blog-preview">
              {blog.content.slice(0, 120)}{blog.content.length > 120 ? "..." : ""}
            </p>
            <div className="blog-meta">
              <span>{blog.author?.name || "Anonymous"}</span>
              <span>{new Date(blog.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single Blog ──────────────────────────────────────────────────────────────

function BlogView({ id, onBack, onEdit }) {
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getBlog(id)
      .then((data) => {
        if (data.success) setBlog(data.blog);
        else setError(data.message || "Blog not found");
      })
      .catch(() => setError("Could not reach server"))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="page">
      <header className="top-bar">
        <button className="link-btn" onClick={onBack}>← Back</button>
        {blog && <button onClick={() => onEdit(blog)}>Edit</button>}
      </header>

      {loading && <p className="center">Loading...</p>}
      {error && <p className="error center">{error}</p>}
      {blog && (
        <article className="blog-article">
          <h1>{blog.title}</h1>
          <div className="blog-meta">
            <span>{blog.author?.name || "Anonymous"}</span>
            <span>{new Date(blog.createdAt).toLocaleDateString()}</span>
            <span className={`badge ${blog.published ? "published" : "draft"}`}>
              {blog.published ? "Published" : "Draft"}
            </span>
          </div>
          <p className="blog-content">{blog.content}</p>
        </article>
      )}
    </div>
  );
}

// ─── Create / Edit Blog ───────────────────────────────────────────────────────

function BlogForm({ existing, onBack, onSaved }) {
  const [title, setTitle] = useState(existing?.title || "");
  const [content, setContent] = useState(existing?.content || "");
  const [published, setPublished] = useState(existing?.published ?? false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isEdit = !!existing;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = isEdit
        ? await updateBlog(existing.id, title, content, published)
        : await createBlog(title, content, published);

      if (data.success) {
        onSaved(data.blog);
      } else {
        setError(data.message || "Something went wrong");
      }
    } catch {
      setError("Could not reach server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="top-bar">
        <button className="link-btn" onClick={onBack}>← Back</button>
        <h2>{isEdit ? "Edit Blog" : "New Blog"}</h2>
      </header>

      <form className="blog-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          placeholder="Write your content here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          required
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Publish (uncheck to save as draft)
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : isEdit ? "Update Blog" : "Create Blog"}
        </button>
      </form>
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [view, setView] = useState("blogs"); // "blogs" | "blog" | "create" | "edit"
  const [selectedId, setSelectedId] = useState(null);
  const [editingBlog, setEditingBlog] = useState(null);

  function handleLogin() {
    setToken(localStorage.getItem("token"));
    setView("blogs");
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setToken(null);
  }

  if (!token) return <AuthPage onLogin={handleLogin} />;

  if (view === "blog") {
    return (
      <BlogView
        id={selectedId}
        onBack={() => setView("blogs")}
        onEdit={(blog) => {
          setEditingBlog(blog);
          setView("edit");
        }}
      />
    );
  }

  if (view === "create") {
    return (
      <BlogForm
        onBack={() => setView("blogs")}
        onSaved={(blog) => {
          setSelectedId(blog.id);
          setView("blog");
        }}
      />
    );
  }

  if (view === "edit") {
    return (
      <BlogForm
        existing={editingBlog}
        onBack={() => {
          setSelectedId(editingBlog.id);
          setView("blog");
        }}
        onSaved={(blog) => {
          setSelectedId(blog.id);
          setView("blog");
        }}
      />
    );
  }

  return (
    <BlogList
      onViewBlog={(id) => {
        setSelectedId(id);
        setView("blog");
      }}
      onCreateBlog={() => setView("create")}
      onLogout={handleLogout}
    />
  );
}
