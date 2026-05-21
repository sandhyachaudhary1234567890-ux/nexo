// js/app.js — Main application controller: routing, auth, nav, utils

window.nexo = {
  user: null,

  async boot() {
    // Show loading
    const loader = document.getElementById('boot-loader');
    if (loader) loader.style.display = 'flex';

    try {
      const user = await authService.checkAuth();
      if (user) {
        this.user = user;
        this.showApp(user);
      } else {
        this.showScreen('auth');
      }
    } catch {
      this.showScreen('auth');
    } finally {
      if (loader) loader.style.display = 'none';
    }
  },

  showApp(user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('onboarding-screen').classList.remove('visible');
    const app = document.getElementById('app');
    app.classList.add('visible');

    this.updateUserChip(user);
    socketService.init(user._id);

    if (!user.onboarding?.completed) {
      document.getElementById('onboarding-screen').classList.add('visible');
      app.classList.remove('visible');
    } else {
      this.navigate('dashboard');
    }
  },

  showScreen(screen) {
    document.getElementById('auth-screen').style.display = screen === 'auth' ? 'flex' : 'none';
    document.getElementById('app').classList.toggle('visible', screen === 'app');
    document.getElementById('onboarding-screen').classList.toggle('visible', screen === 'onboarding');
  },

  updateUserChip(user) {
    const nameEl = document.getElementById('sidebar-user-name');
    const planEl = document.getElementById('sidebar-user-plan');
    const avatarEl = document.getElementById('sidebar-avatar');
    if (nameEl) nameEl.textContent = user.name || 'User';
    if (planEl) planEl.textContent = user.plan || 'free';
    if (avatarEl) avatarEl.textContent = (user.name || 'U')[0].toUpperCase();
  },

  navigate(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const pageEl = document.getElementById(`page-${page}`);
    const navEl = document.querySelector(`[data-page="${page}"]`);

    if (pageEl) pageEl.classList.add('active');
    if (navEl) navEl.classList.add('active');

    const titleEl = document.getElementById('page-title');
    const titles = {
      dashboard: 'Dashboard', leads: 'Leads', crm: 'CRM',
      outreach: 'Outreach', insights: 'AI Insights',
      calls: 'Calls', automations: 'Automations', analytics: 'Analytics'
    };
    if (titleEl) titleEl.textContent = titles[page] || page;

    // Initialize page
    const inits = {
      dashboard: () => initDashboard(),
      leads: () => initLeads(),
      crm: () => initCRM(),
      outreach: () => initOutreach(),
      insights: () => initInsights(),
      calls: () => initCalls(),
      automations: () => initAutomations(),
      analytics: () => initAnalytics()
    };
    inits[page]?.();
    this.currentPage = page;
  },

  async logout() {
    await authService.logout();
    socketService.disconnect();
    this.user = null;
    document.getElementById('app').classList.remove('visible');
    document.getElementById('auth-screen').style.display = 'flex';
  }
};

// ─── Auth Form Logic ────────────────────────────────────────────────────────

let _authMode = 'login';

function switchAuthTab(mode) {
  _authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-name-group').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
}

async function submitAuth(e) {
  e.preventDefault();
  const btn = document.getElementById('auth-submit-btn');
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name')?.value?.trim();

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Please wait...';

  try {
    let user;
    if (_authMode === 'login') {
      user = await authService.login(email, password);
    } else {
      if (!name) { showToast('Name is required', 'error'); return; }
      user = await authService.register(name, email, password);
    }
    nexo.user = user;
    nexo.showApp(user);
  } catch (err) {
    const msg = err.response?.data?.error || 'Authentication failed';
    showToast(msg, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = _authMode === 'login' ? 'Sign In' : 'Create Account';
  }
}

// ─── Onboarding ─────────────────────────────────────────────────────────────

let _onboardStep = 1;
const _onboardData = {};

function nextOnboardStep() {
  if (_onboardStep === 1) {
    _onboardData.businessType = document.getElementById('ob-business-type')?.value;
    _onboardData.targetCountry = document.getElementById('ob-country')?.value;
  } else if (_onboardStep === 2) {
    _onboardData.goals = document.getElementById('ob-goals')?.value;
  }
  _onboardStep++;
  document.querySelectorAll('.onboard-step').forEach((el, i) => {
    el.style.display = i + 1 === _onboardStep ? 'block' : 'none';
  });
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.className = `step-dot ${i + 1 < _onboardStep ? 'done' : i + 1 === _onboardStep ? 'active' : ''}`;
  });
}

async function finishOnboarding() {
  try {
    const res = await authService.saveOnboarding({ ..._onboardData, completed: true });
    if (res && res.user) {
      nexo.user = res.user;
    }
    document.getElementById('onboarding-screen').classList.remove('visible');
    nexo.showApp(nexo.user);
  } catch (err) {
    console.error('Onboarding Save Error:', err);
    showToast('Failed to save onboarding', 'error');
  }
}

// ─── Toast System ────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: 'check-circle', error: 'times-circle', info: 'info-circle', warning: 'exclamation-triangle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fas fa-${icons[type] || 'info-circle'}" style="color:var(--${type === 'error' ? 'red' : type === 'success' ? 'green' : type === 'warning' ? 'amber' : 'blue-light'})"></i>
    <span style="flex:1;font-size:0.85rem;color:var(--text)">${escHtml(message)}</span>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:0">
      <i class="fas fa-times" style="font-size:0.75rem"></i>
    </button>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showEmailModal(leadId) {
  showToast('AI email drafting — coming soon!', 'info');
}

// ─── Sidebar mobile toggle ────────────────────────────────────────────────────

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('open');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.showToast = showToast;
window.escHtml = escHtml;
window.showEmailModal = showEmailModal;
window.submitAuth = submitAuth;
window.switchAuthTab = switchAuthTab;
window.nextOnboardStep = nextOnboardStep;
window.finishOnboarding = finishOnboarding;
window.toggleSidebar = toggleSidebar;

document.addEventListener('DOMContentLoaded', () => nexo.boot());
