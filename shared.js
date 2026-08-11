import { state } from './state.js';


// Firebase Configuration (extracted from local google-services.json)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID
};

// Initialize Firebase compat
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();

// Global App State


export const SECRET_KEY = CryptoJS.enc.Utf8.parse(import.meta.env.VITE_SECRET_KEY);

export function encryptTemplateData(dataObj) {
  const jsonStr = JSON.stringify(dataObj);
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(jsonStr, SECRET_KEY, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });
  return CryptoJS.enc.Base64.stringify(iv) + ':' + encrypted.toString();
}

export function decryptTemplateData(encryptedString) {
  try {
    const parts = encryptedString.split(':');
    if (parts.length !== 2) return null;
    const iv = CryptoJS.enc.Base64.parse(parts[0]);
    const ciphertext = parts[1];
    const decrypted = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  } catch (e) {
    console.error("Decryption exception:", e);
    return null;
  }
}

// Available Google Fonts (premium curated font selection)
export let GOOGLE_FONTS = [
  "Outfit", "DM Sans", "Syne", "Inter", "Montserrat", "Poppins", 
  "Nunito", "Playfair Display", "Manrope", "Lato", "Caveat", "Merriweather"
];

// Async fetch complete Google Fonts list
fetch('https://raw.githubusercontent.com/jonathantneal/google-fonts-complete/master/google-fonts.json')
  .then(res => res.json())
  .then(data => {
    const allFonts = Object.keys(data);
    if (allFonts.length > 0) {
      GOOGLE_FONTS = allFonts;
      populateFontDropdowns();
    }
  }).catch(e => console.error("Error fetching font list:", e));

// Gradient direction mappers to CSS linear-gradient values
export const ALIGNMENT_MAP = {
  'topCenter': 'to bottom',
  'bottomCenter': 'to top',
  'topLeft': 'to bottom right',
  'bottomRight': 'to top left',
  'centerLeft': 'to right',
  'centerRight': 'to left',
  'bottomLeft': 'to top right',
  'topRight': 'to bottom left'
};


// Firebase instances need to be exported
export { db, storage, auth };






export function showLoginModal() {
  // Check if modal already exists
  if (document.getElementById("auth-modal")) return;

  const authOverlay = document.createElement("div");
  authOverlay.id = "auth-modal";
  authOverlay.className = "loading-overlay";
  authOverlay.innerHTML = `
    <div class="loader-card" style="width: 360px;">
      <img src="logo.png" class="logo-icon" style="margin: 0 auto 16px; display: block; width: 44px; height: 44px; border-radius: 50%; object-fit: cover;">
      <h3 style="font-family: var(--font-display); font-size: 22px; margin-bottom: 6px;">Developer Studio Login</h3>
      <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 20px;">Log in to create and edit Aperlo state.templates</p>
      
      <form id="auth-form" style="display: flex; flex-direction: column; gap: 12px; text-align: left; width: 100%;">
        <div class="form-group">
          <label>Email Address</label>
          <input type="text" id="auth-email" value="mastereditor8780@gmail.com" required placeholder="name@domain.com">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="auth-password" required placeholder="••••••••" style="font-family: var(--font-body); font-size: 13px; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); outline: none;">
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top: 8px; width: 100%;">Sign In</button>
      </form>
      <div id="auth-error" style="color: var(--color-destructive); font-size: 12px; font-weight: 700; margin-top: 12px; display: none;"></div>
    </div>
  `;
  document.body.appendChild(authOverlay);

  // Focus password
  document.getElementById("auth-password").focus();

  document.getElementById("auth-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const errorEl = document.getElementById("auth-error");
    
    errorEl.style.display = "none";
    
    auth.signInWithEmailAndPassword(email, password)
      .catch(err => {
        errorEl.textContent = err.message;
        errorEl.style.display = "block";
      });
  });
}

export function hideLoginModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.remove();
}

export function populateFontDropdowns() {
  let datalist = document.getElementById("google-fonts-list");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "google-fonts-list";
    document.body.appendChild(datalist);
  }
  datalist.innerHTML = "";
  GOOGLE_FONTS.forEach(font => {
    const option = document.createElement("option");
    option.value = font;
    datalist.appendChild(option);
  });
}

// Ensure Google Font stylesheet is appended dynamically to head
export function ensureFontLoaded(fontName) {
  if (!fontName) return;
  const fontId = `gfont-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(fontId)) return;
  
  const link = document.createElement('link');
  link.id = fontId;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/\s+/g, '+')}&display=swap`;
  document.head.appendChild(link);
}

// Toast alerts helper
export function showToast(message, isError = false) {
  const wrapper = document.getElementById("toast-wrapper");
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `
    <i data-lucide="${isError ? 'alert-circle' : 'check-circle-2'}" style="color: ${isError ? 'var(--color-destructive)' : 'var(--color-primary)'}"></i>
    <span class="toast-message">${message}</span>
    <button class="toast-close"><i data-lucide="x"></i></button>
  `;
  wrapper.appendChild(toast);
  lucide.createIcons();
  
  // Auto remove after 4 seconds
  const autoTimeout = setTimeout(() => {
    toast.remove();
  }, 4000);

  toast.querySelector(".toast-close").addEventListener("click", () => {
    clearTimeout(autoTimeout);
    toast.remove();
  });
}

export function showLoading(title, desc) {
  const overlay = document.getElementById("app-loading-overlay");
  document.getElementById("loading-overlay-title").textContent = title;
  document.getElementById("loading-overlay-desc").textContent = desc;
  overlay.classList.remove("hidden");
}

export function hideLoading() {
  document.getElementById("app-loading-overlay").classList.add("hidden");
}

