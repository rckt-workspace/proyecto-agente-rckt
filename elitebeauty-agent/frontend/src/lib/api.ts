import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

export const api = axios.create({
  baseURL: BASE,
  timeout: 40000,
});

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const sendChat = (message: string, channel = 'whatsapp') =>
  api.post('/api/chat', { message, channel }, { timeout: 120000 }).then(r => r.data);

// ─── Conversations ────────────────────────────────────────────────────────────
export const getConversations = (params?: Record<string, string>) =>
  api.get('/api/conversations', { params }).then(r => r.data);

export const getConversation = (id: string) =>
  api.get(`/api/conversations/${id}`).then(r => r.data);

export const patchConversation = (id: string, data: Record<string, string>) =>
  api.patch(`/api/conversations/${id}`, data).then(r => r.data);

// ─── Leads ────────────────────────────────────────────────────────────────────
export const getLeads = (params?: Record<string, string>) =>
  api.get('/api/leads', { params }).then(r => r.data);

export const patchLead = (id: string, data: Record<string, string>) =>
  api.patch(`/api/leads/${id}`, data).then(r => r.data);

export const exportLeadsUrl = () => `${BASE}/api/leads/export`;

// ─── Analytics ────────────────────────────────────────────────────────────────
export const getOverview = () => api.get('/api/analytics/overview').then(r => r.data);

export const getMessagesByDay = (period = '7d') =>
  api.get('/api/analytics/messages', { params: { period } }).then(r => r.data);

export const getLeadsStats = (period = '30d') =>
  api.get('/api/analytics/leads', { params: { period } }).then(r => r.data);

export const getResponseTime = (period = '7d') =>
  api.get('/api/analytics/response_time', { params: { period } }).then(r => r.data);

export const getTopIntents = () =>
  api.get('/api/analytics/top_intents').then(r => r.data);

// ─── Docs (RAG) ───────────────────────────────────────────────────────────────
export const getDocs = () => api.get('/api/docs').then(r => r.data);

export const createDoc = (data: Record<string, string>) =>
  api.post('/api/docs', data).then(r => r.data);

export const updateDoc = (id: string, data: Record<string, string>) =>
  api.put(`/api/docs/${id}`, data).then(r => r.data);

export const deleteDoc = (id: string) => api.delete(`/api/docs/${id}`).then(r => r.data);

export const embedDoc = (id: string) =>
  api.post(`/api/docs/${id}/embed`).then(r => r.data);

export const uploadDoc = (formData: FormData) =>
  api.post('/api/docs/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);

// ─── Config ───────────────────────────────────────────────────────────────────
export const getConfig = () => api.get('/api/config').then(r => r.data);

export const setConfig = (key: string, value: string) =>
  api.put(`/api/config/${key}`, { value }).then(r => r.data);

// ─── WA Bridge ────────────────────────────────────────────────────────────────
export const getWAStatus = () => api.get('/api/wa/status').then(r => r.data);
export const getWAQR = () => api.get('/api/wa/qr').then(r => r.data);
