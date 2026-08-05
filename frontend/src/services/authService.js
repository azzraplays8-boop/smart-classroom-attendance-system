/**
 * Authentication API service.
 * Handles login, logout, user profile, user management, roles, and pending approvals.
 */
import axios from "axios";
import { API_BASE_URL } from "../config/api";

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
   * First user becomes approved Super Admin. Others require an invitation code
   * and become pending approval (no token returned).
   * @param {Object} data - { full_name, username, email, password, confirm_password, invitation_code }
   * @returns {Promise<Object>} { message, token?, user?, pending? }
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
   * @param {Object} userData - { email, username, password, full_name, role, organization_id }
   * @returns {Promise<Object>} { message, user }
   */
  async createUser(userData) {
    const response = await api.post("/auth/users", userData);
    return response.data;
  },

  /**
   * Update an existing user (Admin+ only).
   * @param {number} id - User ID
   * @param {Object} userData - Fields to update incl. role & organization_id
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

  /**
   * Assign/change a user's role (Admin+ only).
   * @param {number} id - User ID
   * @param {string} role - Role key
   * @returns {Promise<Object>} { message }
   */
  async assignRole(id, role) {
    const response = await api.put(`/auth/users/${id}/role`, { role });
    return response.data;
  },

  /**
   * Assign a user to an organization (Admin+ only).
   * @param {number} id - User ID
   * @param {number|null} organizationId - Organization ID
   * @returns {Promise<Object>} { message }
   */
  async assignOrganization(id, organizationId) {
    const response = await api.put(`/auth/users/${id}/organization`, { organization_id: organizationId });
    return response.data;
  },

  /**
   * Get the list of roles + permissions (Admin+ only).
   * @returns {Promise<Object>} { roles }
   */
  async getRoles() {
    const response = await api.get("/auth/roles");
    return response.data;
  },

  /**
   * Get pending registrations (Admin+ only).
   * @returns {Promise<Object>} { pending }
   */
  async getPending() {
    const response = await api.get("/auth/pending");
    return response.data;
  },

  /**
   * Approve a pending registration (Admin+ only).
   * @param {number} id - Pending registration ID
   * @param {Object} opts - { role, organization_id }
   * @returns {Promise<Object>} { message }
   */
  async approvePending(id, opts = {}) {
    const response = await api.post(`/auth/pending/${id}/approve`, opts);
    return response.data;
  },

  /**
   * Reject a pending registration (Admin+ only).
   * @param {number} id - Pending registration ID
   * @returns {Promise<Object>} { message }
   */
  async rejectPending(id) {
    const response = await api.post(`/auth/pending/${id}/reject`);
    return response.data;
  },
};

export default authService;
