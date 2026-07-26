/**
 * Authentication API service.
 * Handles login, logout, user profile, and user management API calls.
 */
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

/**
 * Attach JWT token to every request if available.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token") || sessionStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Handle 401 responses globally - clear auth on token expiry.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      sessionStorage.removeItem("auth_token");
      sessionStorage.removeItem("auth_user");
      // Only redirect if not already on login page
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

const authService = {
  /**
   * Register a new account.
   * First user becomes super_admin, subsequent become administrator.
   * @param {Object} data - { full_name, username, email, password, confirm_password }
   * @returns {Promise<Object>} { token, user, message }
   */
  async register(data) {
    const response = await api.post("/auth/register", data);
    return response.data;
  },

  /**
   * Login with email/username and password.
   * @param {string} email - Email or username
   * @param {string} password - Plain text password
   * @returns {Promise<Object>} { token, user }
   */
  async login(email, password) {
    const response = await api.post("/auth/login", { email, password });
    return response.data;
  },

  /**
   * Logout current user.
   * @returns {Promise<Object>} Success message
   */
  async logout() {
    const response = await api.post("/auth/logout");
    return response.data;
  },

  /**
   * Get current authenticated user's profile.
   * @returns {Promise<Object>} { user }
   */
  async getMe() {
    const response = await api.get("/auth/me");
    return response.data;
  },

  /**
   * Get all users (Admin+ only).
   * @returns {Promise<Object>} { users }
   */
  async getUsers() {
    const response = await api.get("/auth/users");
    return response.data;
  },

  /**
   * Create a new user (Admin+ only).
   * @param {Object} userData - { email, username, password, full_name, role }
   * @returns {Promise<Object>} { message, user }
   */
  async createUser(userData) {
    const response = await api.post("/auth/users", userData);
    return response.data;
  },

  /**
   * Update an existing user (Admin+ only).
   * @param {number} id - User ID
   * @param {Object} userData - Fields to update
   * @returns {Promise<Object>} { message }
   */
  async updateUser(id, userData) {
    const response = await api.put(`/auth/users/${id}`, userData);
    return response.data;
  },

  /**
   * Delete a user (Admin+ only).
   * @param {number} id - User ID
   * @returns {Promise<Object>} { message }
   */
  async deleteUser(id) {
    const response = await api.delete(`/auth/users/${id}`);
    return response.data;
  },

  /**
   * Reset a user's password (Admin+ only).
   * @param {number} id - User ID
   * @param {string} newPassword - New plain text password
   * @returns {Promise<Object>} { message }
   */
  async resetPassword(id, newPassword) {
    const response = await api.put(`/auth/users/${id}/reset-password`, { newPassword });
    return response.data;
  },

  /**
   * Activate or deactivate a user (Admin+ only).
   * @param {number} id - User ID
   * @param {number} isActive - 1 to activate, 0 to deactivate
   * @returns {Promise<Object>} { message }
   */
  async setUserStatus(id, isActive) {
    const response = await api.put(`/auth/users/${id}/status`, { is_active: isActive });
    return response.data;
  },
};

export default authService;
