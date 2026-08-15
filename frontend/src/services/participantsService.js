/**
 * Participants API service.
 * Handles participant CRUD operations with automatic authentication.
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

const participantsService = {
  /**
   * Get all participants.
   * @returns {Promise<Object>} { participants }
   */
  async getParticipants() {
    const response = await api.get("/participants");
    return response.data;
  },

  /**
   * Get a single participant by ID.
   * @param {number} id
   * @returns {Promise<Object>} { participant }
   */
  async getParticipant(id) {
    const response = await api.get(`/participants/${id}`);
    return response.data;
  },

  /**
   * Create a new participant.
   * @param {Object} data - Participant data
   * @returns {Promise<Object>} { message, id, participant }
   */
  async createParticipant(data) {
    const response = await api.post("/participants", data);
    return response.data;
  },

  /**
   * Update an existing participant.
   * @param {number} id
   * @param {Object} data - Fields to update
   * @returns {Promise<Object>} { message }
   */
  async updateParticipant(id, data) {
    const response = await api.put(`/participants/${id}`, data);
    return response.data;
  },

  /**
   * Delete a participant.
   * @param {number} id
   * @returns {Promise<Object>} { message }
   */
  async deleteParticipant(id) {
    const response = await api.delete(`/participants/${id}`);
    return response.data;
  },

  /**
   * Delete all participants.
   * @returns {Promise<Object>} { message }
   */
  async deleteAllParticipants() {
    const response = await api.delete("/participants");
    return response.data;
  },

  /**
   * Upload participant photo.
   * @param {number} id - Participant ID
   * @param {File} photoFile - Photo file to upload
   * @returns {Promise<Object>} { message }
   */
  async uploadPhoto(id, photoFile) {
    const formData = new FormData();
    formData.append("photo", photoFile);
    const response = await api.post(`/participants/${id}/photo`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  /**
   * Delete participant photo.
   * @param {number} id - Participant ID
   * @returns {Promise<Object>} { message }
   */
  async deletePhoto(id) {
    const response = await api.delete(`/participants/${id}/photo`);
    return response.data;
  },

  /**
   * Get import history.
   * @returns {Promise<Object>} { imports }
   */
  async getImportHistory() {
    const response = await api.get("/participants/imports");
    return response.data;
  },

  /**
   * Import participants from file.
   * @param {File} file - Excel/CSV file to import
   * @param {Object} options - { duplicateMode?, skipHeader? }
   * @returns {Promise<Object>} { message, summary }
   */
  async importParticipants(file, options = {}) {
    const formData = new FormData();
    formData.append("file", file);
    if (options.duplicateMode) {
      formData.append("duplicateMode", options.duplicateMode);
    }
    if (options.skipHeader !== undefined) {
      formData.append("skipHeader", options.skipHeader ? "1" : "0");
    }
    const response = await api.post("/participants/import", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
};

export default participantsService;
