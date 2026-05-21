// js/auth.js — Authentication service

// Initialize Firebase with your Web App config
const firebaseConfig = {
  apiKey: "AIzaSyDzKU-Kk9ZTWo2jnAcAJsG89XwFqfHbQqc",
  authDomain: "clixora-dfe76.firebaseapp.com",
  projectId: "clixora-dfe76",
  storageBucket: "clixora-dfe76.firebasestorage.app",
  messagingSenderId: "868089053618",
  appId: "1:868089053618:web:1757f30ab5e68613bbe4ab",
  measurementId: "G-C92XLJQCND"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
} else {
  console.warn("Firebase SDK not loaded. Please make sure script tags are working.");
}

// Global Firebase Google Sign-In helper function
window.signInWithGoogleFirebase = async function() {
  try {
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK is not loaded. Check your internet connection.');
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    showToast('Connecting to Google Sign-In...', 'info');
    
    const result = await firebase.auth().signInWithPopup(provider);
    const idToken = await result.user.getIdToken();
    
    showToast('Google login success! Linking Nexo account...', 'info');
    
    // Call authService.loginWithGoogle with the retrieved ID Token
    const user = await authService.loginWithGoogle(idToken);
    
    showToast(`Welcome back, ${user.name}!`, 'success');
    
    // Set user on local state and transition to dashboard
    nexo.user = user;
    nexo.updateUI();
    nexo.navigate('dashboard');
  } catch (err) {
    console.error('Google Auth Error:', err);
    showToast(err.message || 'Google Sign-In failed', 'danger');
  }
};

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
