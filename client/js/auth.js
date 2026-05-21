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
let isGoogleSigningIn = false;

window.signInWithGoogleFirebase = async function() {
  if (isGoogleSigningIn) return;
  isGoogleSigningIn = true;
  
  // Find Google button to add active loading states
  const googleBtn = document.querySelector('button[onclick="signInWithGoogleFirebase()"]');
  let originalBtnContent = '';
  if (googleBtn) {
    originalBtnContent = googleBtn.innerHTML;
    googleBtn.disabled = true;
    googleBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;border-color:var(--text) transparent transparent transparent;display:inline-block;margin:0 auto"></span>';
  }

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
    nexo.showApp(user);
  } catch (err) {
    console.error('Google Auth Error:', err);
    // Suppress notifications for expected user cancellations or conflict errors, but warn gently
    if (err.code === 'auth/cancelled-popup-request') {
      showToast('Authentication popup request reset.', 'info');
    } else if (err.code === 'auth/popup-closed-by-user') {
      showToast('Sign-In window closed.', 'warning');
    } else {
      showToast(err.message || 'Google Sign-In failed', 'danger');
    }
  } finally {
    isGoogleSigningIn = false;
    if (googleBtn) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = originalBtnContent;
    }
  }
};

// Helper to get the logged-in Firebase user if a session exists
function getFirebaseUser() {
  return new Promise((resolve) => {
    if (typeof firebase === 'undefined') return resolve(null);
    
    // Check if Firebase already has a currentUser synchronously
    if (firebase.auth().currentUser) {
      return resolve(firebase.auth().currentUser);
    }
    
    let resolved = false;
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(user);
      }
    });
    
    // Safeguard timeout (1.5 seconds) in case of slow initialization
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        resolve(null);
      }
    }, 1500);
  });
}

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
    if (typeof firebase !== 'undefined') {
      try {
        await firebase.auth().signOut();
      } catch (err) {
        console.error('Firebase sign out error:', err);
      }
    }
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
    } catch (refreshErr) {
      // If server-side cookie refresh fails, check if we have a Firebase session (Google Auth)
      try {
        const fbUser = await getFirebaseUser();
        if (fbUser) {
          const idToken = await fbUser.getIdToken();
          const user = await this.loginWithGoogle(idToken);
          return user;
        }
      } catch (fbErr) {
        console.error('Firebase auto-login session restoration failed:', fbErr);
      }
      return null;
    }
  },

  async saveOnboarding(payload) {
    const { data } = await api.post('/users/onboarding', payload);
    return data.data;
  }
};
