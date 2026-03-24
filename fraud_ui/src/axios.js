import axios from "axios"

const API = axios.create({
  // In production (Docker/Nginx), keep `/api` and let reverse proxy route it.
  // In local dev, vite proxy handles `/api` to backend.
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api"
})

API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token")
  if (token) {
    req.headers.Authorization = `Bearer ${token}`
  }
  return req
})

export default API