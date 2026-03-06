import { API_URL } from "./config";

function getToken() {
  return localStorage.getItem("token");
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

export async function signup(email, password, name) {
  const res = await fetch(`${API_URL}/api/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });
  return res.json();
}

export async function signin(email, password) {
  const res = await fetch(`${API_URL}/api/v1/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function getBlogs() {
  const res = await fetch(`${API_URL}/api/v1/blog/bulk`, {
    headers: authHeaders(),
  });
  return res.json();
}

export async function getBlog(id) {
  const res = await fetch(`${API_URL}/api/v1/blog/${id}`, {
    headers: authHeaders(),
  });
  return res.json();
}

export async function createBlog(title, content, published = false) {
  const res = await fetch(`${API_URL}/api/v1/blog`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ title, content, published }),
  });
  return res.json();
}

export async function updateBlog(id, title, content, published) {
  const res = await fetch(`${API_URL}/api/v1/blog`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ id, title, content, published }),
  });
  return res.json();
}
