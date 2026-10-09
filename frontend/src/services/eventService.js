import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true // though backend is configured for this, we primarily use Bearer token
});

// Interceptor to inject token if present
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken') || sessionStorage.getItem('token') || localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getPublicEvents = async (params) => {
  const response = await api.get('/api/events', { params });
  return response.data;
};

export const getEventById = async (id) => {
  const response = await api.get(`/api/events/${id}`);
  return response.data;
};

export const getNotifications = async () => {
  const response = await api.get('/api/notifications');
  return response.data;
};
