import { state } from './state.js';
import { db, storage, auth, ensureFontLoaded, showToast, showLoading, hideLoading, showLoginModal, hideLoginModal, decryptTemplateData, populateFontDropdowns } from './shared.js';
import { openEditor } from './editor.js';

export function loadLocalDrafts() {
  const localDrafts = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith("fk_draft_")) {
      try {
        const draft = JSON.parse(localStorage.getItem(key));
        if (draft && draft.id) {
          localDrafts.push(draft);
        }
      } catch (e) {
        console.error("Error parsing local draft " + key, e);
      }
    }
  }
  return localDrafts;
}

export function loadTemplates() {
  if (state.currentTab === 'local') {
    renderTemplatesGrid("All");
    return;
  }

  const grid = document.getElementById("dashboard-template-grid");
  
  // Show skeletons
  grid.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton-thumb"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text-short"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-thumb"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text-short"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-thumb"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text-short"></div>
    </div>
  `;

  db.collection("templates").get()
    .then((querySnapshot) => {
      state.templates = [];
      querySnapshot.forEach((doc) => {
        const rawData = doc.data();
        if (rawData.encryptedData) {
          const decrypted = decryptTemplateData(rawData.encryptedData);
          if (decrypted) {
            state.templates.push({ 
              id: doc.id, 
              category: rawData.category, 
              thumbnailUrl: rawData.thumbnailUrl, 
              totalUses: rawData.totalUses || 0,
              createdAt: rawData.createdAt || null,
              ...decrypted 
            });
          } else {
            console.error("Failed to decrypt template:", doc.id);
          }
        } else {
          state.templates.push({ 
            id: doc.id, 
            totalUses: rawData.totalUses || 0,
            ...rawData 
          });
        }
      });
      renderTemplatesGrid("All");
    })
    .catch((error) => {
      showToast("Error loading templates: " + error.message, true);
    });
}

export function renderTemplatesGrid(categoryFilter = "All") {
  const grid = document.getElementById("dashboard-template-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const listToFilter = state.currentTab === 'cloud' ? state.templates : loadLocalDrafts();

  // Update Hero Metric Chips
  const metricTemplates = document.getElementById("metric-total-templates");
  const metricUses = document.getElementById("metric-total-uses");
  if (metricTemplates) {
    metricTemplates.innerHTML = `<i data-lucide="layout-grid" style="width: 13px; height: 13px;"></i> ${listToFilter.length} Templates`;
  }
  if (metricUses) {
    const totalUsesSum = listToFilter.reduce((sum, t) => sum + (t.totalUses || 0), 0);
    metricUses.innerHTML = `<i data-lucide="flame" style="width: 13px; height: 13px; color: #E5583A;"></i> ${totalUsesSum.toLocaleString()} Total Uses`;
  }

  const filtered = categoryFilter === "All" 
    ? listToFilter 
    : listToFilter.filter(t => t.category === categoryFilter);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--color-text-muted);">
        <i data-lucide="folder-open" style="width: 48px; height: 48px; margin-bottom: 12px; stroke-width: 1.5;"></i>
        <h4>No templates found</h4>
        <p>There are no templates in category "${categoryFilter}"</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  filtered.forEach(template => {
    const card = document.createElement("div");
    card.className = "template-card";
    card.style.position = "relative";
    card.addEventListener("click", () => openEditor(template));

    // Fallback thumbnail visual if none exists
    const hasThumb = template.thumbnailUrl && template.thumbnailUrl.startsWith("http");
    const thumbHtml = hasThumb 
      ? `<img src="${template.thumbnailUrl}" alt="${template.name}" loading="lazy">` 
      : `<div style="width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:linear-gradient(135deg, #1A6B4A, #124B33); color:white; font-family:var(--font-display); padding:20px; text-align:center;">
          <div style="font-size:20px; font-weight:800; margin-bottom:8px;">${template.name}</div>
          <span style="font-size:11px; opacity:0.7;">No Thumbnail Uploaded</span>
         </div>`;

    const localLabel = state.currentTab === 'local' 
      ? `<span class="card-category" style="background-color: var(--color-accent); color: white; margin-left: 6px;">Draft</span>`
      : '';

    card.innerHTML = `
      <button class="card-delete-btn" title="Delete Template"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
      <div class="card-thumbnail">
        ${thumbHtml}
      </div>
      <div class="card-info">
        <div class="card-meta">
          <div>
            <span class="card-category">${template.category || "Minimal"}</span>
            ${localLabel}
          </div>
          <div class="card-meta-right">
            <span class="card-uses" title="Total Uses by App Creators"><i data-lucide="flame" style="width: 11px; height: 11px; color: #E5583A;"></i> ${(template.totalUses || 0).toLocaleString()}</span>
            <span class="card-slots"><i data-lucide="smartphone" style="width: 12px; height: 12px;"></i> ${template.screenshotSlots || 1}</span>
          </div>
        </div>
        <h4 class="card-title">${template.name}</h4>
      </div>
    `;

    // Bind delete click event handler
    card.querySelector(".card-delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTemplate(template);
    });

    // 3D Tilt micro-interaction on hover
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -6;
      const rotateY = ((x - centerX) / centerX) * 6;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px) scale(1.01)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });

    grid.appendChild(card);
  });
  
  lucide.createIcons();
}

export function deleteTemplate(template) {
  const confirmMsg = state.currentTab === 'cloud'
    ? `Are you sure you want to permanently delete "${template.name}" from Firestore and Storage? This cannot be undone.`
    : `Are you sure you want to delete local draft "${template.name}"?`;

  if (!confirm(confirmMsg)) return;

  if (state.currentTab === 'local') {
    localStorage.removeItem(`fk_draft_${template.id}`);
    showToast(`Deleted local draft "${template.name}"`);
    loadTemplates();
  } else {
    showLoading("Deleting Template...", "Deleting document and asset references from Firebase...");
    
    // 1. Delete thumbnail file from storage
    const thumbRef = storage.ref().child(`templates/${template.id}/thumbnail.png`);
    
    thumbRef.delete()
      .then(() => {
        return db.collection("templates").doc(template.id).delete();
      })
      .catch((err) => {
        console.warn("Storage thumbnail delete failed or didn't exist:", err.message);
        return db.collection("templates").doc(template.id).delete();
      })
      .then(() => {
        hideLoading();
        showToast(`Permanently deleted template "${template.name}"`);
        loadTemplates();
      })
      .catch(err => {
        hideLoading();
        showToast("Error deleting template: " + err.message, true);
      });
  }
}

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
  if (document.getElementById("dashboard-template-grid")) {
    initDashboard();
  }
});

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
