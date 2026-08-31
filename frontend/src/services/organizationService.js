/**
 * Organization & Invitation Code API service.
 * All endpoints are Super Admin only.
 */
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { getStoredAuthToken } from "./apiClient";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getStoredAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const organizationService = {
  /**
   * List all organizations.
   * @returns {Promise<Object>} { organizations }
   */
  async getOrganizations() {
    const response = await api.get("/organizations");
    return response.data;
  },

  /**
   * Get a single organization.
   * @param {number} id
   * @returns {Promise<Object>} { organization }
   */
  async getOrganization(id) {
    const response = await api.get(`/organizations/${id}`);
    return response.data;
  },

  /**
   * Create an organization.
   * @param {Object} data - { name, department, description, org_code }
   * @returns {Promise<Object>} { message, organization }
   */
  async createOrganization(data) {
    const response = await api.post("/organizations", data);
    return response.data;
  },

  /**
   * Update an organization.
   * @param {number} id
   * @param {Object} data - { name, department, description, org_code, status }
   * @returns {Promise<Object>} { message }
   */
  async updateOrganization(id, data) {
    const response = await api.put(`/organizations/${id}`, data);
    return response.data;
  },

  /**
   * Archive (delete) an organization.
   * @param {number} id
   * @returns {Promise<Object>} { message }
   */
  async deleteOrganization(id) {
    const response = await api.delete(`/organizations/${id}`);
    return response.data;
  },

  /**
   * List invitation codes for an organization.
   * @param {number} id
   * @returns {Promise<Object>} { codes }
   */
  async getInvitationCodes(id) {
    const response = await api.get(`/organizations/${id}/codes`);
    return response.data;
  },

  /**
   * Generate an invitation code for an organization.
   * @param {number} id
   * @param {Object} data - { code?, expires_at?, max_uses? }
   * @returns {Promise<Object>} { message, code }
   */
  async createInvitationCode(id, data) {
    const response = await api.post(`/organizations/${id}/codes`, data);
    return response.data;
  },

  /**
   * Update an invitation code (status/max_uses/expiry).
   * @param {number} codeId
   * @param {Object} data - { status?, max_uses?, expires_at? }
   * @returns {Promise<Object>} { message }
   */
  async updateInvitationCode(codeId, data) {
    const response = await api.put(`/organizations/codes/${codeId}`, data);
    return response.data;
  },

  /**
   * Delete an invitation code.
   * @param {number} codeId
   * @returns {Promise<Object>} { message }
   */
  async deleteInvitationCode(codeId) {
    const response = await api.delete(`/organizations/codes/${codeId}`);
    return response.data;
  },

  /**
   * List members of an organization.
   * @param {number} id
   * @returns {Promise<Object>} { members }
   */
  async getOrganizationMembers(id) {
    const response = await api.get(`/organizations/${id}/members`);
    return response.data;
  },
};

export default organizationService;
