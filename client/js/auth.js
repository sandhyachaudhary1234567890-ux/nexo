// js/auth.js — Authentication service

window.authService = {
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.data.accessToken);
    return data.data.user;
  },

  async register(name, email, password) {
    const { data } = await api.post('/auth/register', { name, email, password });
    setToken(data.data.accessToken);
    return data.data.user;
  },

  async loginWithGoogle(credential) {
    const { data } = await api.post('/auth/google', { credential });
    setToken(data.data.accessToken);
    return data.data.user;
  },

  async logout() {
    try { await api.post('/auth/logout'); } catch {}
    clearToken();
  },

  async getMe() {
    const { data } = await api.get('/users/me');
    return data.data;
  },

  async checkAuth() {
    try {
      const { data } = await axios.post(
        'http://localhost:5000/api/auth/refresh', {},
        { withCredentials: true }
      );
      setToken(data.data.accessToken);
      const me = await this.getMe();
      return me;
    } catch { return null; }
  },

  async saveOnboarding(payload) {
    const { data } = await api.post('/users/onboarding', payload);
    return data.data;
  }
};
