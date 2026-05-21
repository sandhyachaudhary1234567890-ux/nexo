// js/api.js — Axios API client with auto-refresh interceptor

const BASE_URL = 'http://localhost:5000/api';

let _accessToken = null;
let _refreshing = false;
let _queue = [];

const api = axios.create({ baseURL: BASE_URL, withCredentials: true, timeout: 30000 });

api.interceptors.request.use(cfg => {
  if (_accessToken) cfg.headers.Authorization = `Bearer ${_accessToken}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  async err => {
    const orig = err.config;
    if (err.response?.status === 401 && !orig._retry && !orig.url?.includes('/auth/refresh')) {
      if (_refreshing) {
        return new Promise((res, rej) => _queue.push({ res, rej }))
          .then(t => { orig.headers.Authorization = `Bearer ${t}`; return api(orig); });
      }
      orig._retry = true;
      _refreshing = true;
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        _accessToken = data.data.accessToken;
        _queue.forEach(p => p.res(_accessToken));
        _queue = [];
        orig.headers.Authorization = `Bearer ${_accessToken}`;
        return api(orig);
      } catch {
        _accessToken = null;
        _queue.forEach(p => p.rej());
        _queue = [];
        window.nexo?.showScreen('auth');
        return Promise.reject(err);
      } finally {
        _refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

window.setToken = t => { _accessToken = t; };
window.clearToken = () => { _accessToken = null; };
window.api = api;
