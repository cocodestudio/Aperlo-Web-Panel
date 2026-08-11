const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'app.js');
let code = fs.readFileSync(appJsPath, 'utf-8');

// Replace globals with state.<var>
const globals = [
  'templates', 'currentTemplate', 'selectedLayerIndex', 'canvasScale',
  'isDragging', 'dragStartX', 'dragStartY', 'dragInitialX', 'dragInitialY',
  'currentUser', 'currentTab'
];

globals.forEach(g => {
  const regex = new RegExp(`(?<![\\.\\w])(${g})(?!\\s*:)`, 'g');
  code = code.replace(regex, `state.$1`);
});

// Remove global let declarations
const declRegex = /let state\.(templates|currentTemplate|selectedLayerIndex|canvasScale|isDragging|dragStartX|dragStartY|dragInitialX|dragInitialY|currentUser|currentTab)[^\n]*\n/g;
code = code.replace(declRegex, '');

// Split by blocks
const blocks = code.split('// ═══════════════════════════════════════════════════════════');

const header = blocks[2]; // Firebase config
const encryption = blocks[4]; // ENCRYPTION LOGIC
const initAuth = blocks[6]; // INITIALIZATION & AUTHENTICATION
const dashboard = blocks[8]; // DATA FETCHING & HOME DASHBOARD
const editorActions = blocks[10];
const liveRendering = blocks[12];
const dragLogic = blocks[14];
const layersPanel = blocks[16];
const addMoveDelete = blocks[18];
const persistence = blocks[20];
const eventListeners = blocks[22];

// Make state.js
const stateCode = `export const state = {
  templates: [],
  currentTemplate: null,
  selectedLayerIndex: -1,
  canvasScale: 0.8,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  dragInitialX: 0,
  dragInitialY: 0,
  currentUser: null,
  currentTab: "cloud"
};
`;
fs.writeFileSync(path.join(__dirname, 'state.js'), stateCode);

// We need to export functions in shared, dashboard, editor.
// A simple way is to export all functions and variables.
function addExports(str) {
  str = str.replace(/^function (\w+)/gm, 'export function $1');
  str = str.replace(/^const (\w+)\s*=/gm, 'export const $1 =');
  str = str.replace(/^let (\w+)\s*=/gm, 'export let $1 =');
  return str;
}

const sharedImports = `import { state } from './state.js';\n`;

// Build shared.js
let sharedCode = sharedImports + header + encryption + `
// Firebase instances need to be exported
export { db, storage, auth };
`;

// Extract helper functions from initAuth block (showLoginModal, hideLoginModal, populateFontDropdowns, ensureFontLoaded, showToast, showLoading, hideLoading)
// Actually, it's easier to put the entire encryption and helpers in shared.js
// Wait, initAuth also has initApp() and DOMContentLoaded. 
// We should remove DOMContentLoaded from shared.js
let helpersCode = initAuth.replace(/document\.addEventListener\("DOMContentLoaded".*?\}\);/s, '');
helpersCode = helpersCode.replace(/function initApp\(\) \{[\s\S]*?\n\}/, ''); // We will handle init logic in dashboard/editor

sharedCode += addExports(helpersCode);
fs.writeFileSync(path.join(__dirname, 'shared.js'), sharedCode);

// Dashboard and Editor need init functions.
let dashboardCode = `import { state } from './state.js';
import { db, storage, auth, ensureFontLoaded, showToast, showLoading, hideLoading, showLoginModal, hideLoginModal, decryptTemplateData, populateFontDropdowns } from './shared.js';
import { openEditor } from './editor.js';

` + addExports(dashboard);

// Wait, initApp for dashboard:
dashboardCode += `
export function initDashboard() {
  populateFontDropdowns();
  lucide.createIcons();
  
  auth.onAuthStateChanged((user) => {
    if (user) {
      state.currentUser = user;
      const btnDashboard = document.getElementById("btn-dashboard-view");
      const btnCreate = document.getElementById("btn-create-template");
      if (btnDashboard) btnDashboard.classList.remove("hidden");
      if (btnCreate) btnCreate.classList.remove("hidden");
      hideLoginModal();
      
      loadTemplates();
    } else {
      state.currentUser = null;
      const btnDashboard = document.getElementById("btn-dashboard-view");
      const btnCreate = document.getElementById("btn-create-template");
      if (btnDashboard) btnDashboard.classList.add("hidden");
      if (btnCreate) btnCreate.classList.add("hidden");
      showLoginModal();
    }
  });

  setupDashboardEventListeners();
}

document.addEventListener("DOMContentLoaded", () => {
  if (!window.location.pathname.includes('editor.html')) {
    initDashboard();
  }
});

// Setup event listeners for dashboard
function setupDashboardEventListeners() {
  const tabCloud = document.getElementById("tab-cloud");
  if (tabCloud) {
    tabCloud.addEventListener("click", () => {
      state.currentTab = 'cloud';
      tabCloud.classList.add("active");
      document.getElementById("tab-local").classList.remove("active");
      loadTemplates();
    });
  }

  const tabLocal = document.getElementById("tab-local");
  if (tabLocal) {
    tabLocal.addEventListener("click", () => {
      state.currentTab = 'local';
      tabLocal.classList.add("active");
      document.getElementById("tab-cloud").classList.remove("active");
      loadTemplates();
    });
  }

  document.getElementById("btn-create-template")?.addEventListener("click", () => {
    // We need createNewTemplate from editor.js, imported later.
    import('./editor.js').then(module => module.createNewTemplate());
  });

  const filterChips = document.querySelectorAll(".filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderTemplatesGrid(chip.getAttribute("data-category"));
    });
  });
}
`;
fs.writeFileSync(path.join(__dirname, 'dashboard.js'), dashboardCode);

let editorCode = `import { state } from './state.js';
import { db, storage, auth, ensureFontLoaded, showToast, showLoading, hideLoading, encryptTemplateData, ALIGNMENT_MAP, showLoginModal, hideLoginModal, populateFontDropdowns } from './shared.js';
import { loadTemplates } from './dashboard.js';

` + addExports(editorActions) + addExports(liveRendering) + dragLogic + addExports(layersPanel) + addExports(addMoveDelete) + addExports(persistence) + eventListeners;

// Modify editorCode init to be similar to dashboard
editorCode += `
export function initEditor() {
  populateFontDropdowns();
  lucide.createIcons();
  
  auth.onAuthStateChanged((user) => {
    if (user) {
      state.currentUser = user;
      const btnDashboard = document.getElementById("btn-dashboard-view");
      const btnCreate = document.getElementById("btn-create-template");
      if (btnDashboard) btnDashboard.classList.remove("hidden");
      if (btnCreate) btnCreate.classList.remove("hidden");
      hideLoginModal();
      
      initEditorPage();
    } else {
      state.currentUser = null;
      const btnDashboard = document.getElementById("btn-dashboard-view");
      const btnCreate = document.getElementById("btn-create-template");
      if (btnDashboard) btnDashboard.classList.add("hidden");
      if (btnCreate) btnCreate.classList.add("hidden");
      showLoginModal();
    }
  });

  setupEventListeners();
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes('editor.html')) {
    initEditor();
  }
});
`;
// Fix some exports in editor code for setupEventListeners since it was replaced
editorCode = editorCode.replace(/function setupEventListeners/, 'export function setupEventListeners');
editorCode = editorCode.replace(/function setupDragHandlers/, 'export function setupDragHandlers');

fs.writeFileSync(path.join(__dirname, 'editor.js'), editorCode);

console.log('Done generating state.js, shared.js, dashboard.js, editor.js');
