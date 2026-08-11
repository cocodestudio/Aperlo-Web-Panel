import { state } from './state.js';
import { db, storage, auth, ensureFontLoaded, showToast, showLoading, hideLoading, encryptTemplateData, ALIGNMENT_MAP, showLoginModal, hideLoginModal, populateFontDropdowns } from './shared.js';
import { loadTemplates } from './dashboard.js';



export function openEditor(template) {
  sessionStorage.setItem('fk_current_editing_template', JSON.stringify(template));
  window.location.href = 'editor.html';
}

export function initEditorPage() {
  const tplStr = sessionStorage.getItem('fk_current_editing_template');
  if (!tplStr) {
    window.location.href = 'index.html';
    return;
  }
  
  state.currentTemplate = JSON.parse(tplStr);
  state.selectedLayerIndex = -1;

  // Populate toolbar & metadata inputs
  document.getElementById("input-template-name").value = state.currentTemplate.name;
  document.getElementById("badge-template-category").textContent = state.currentTemplate.category;
  
  document.getElementById("select-meta-category").value = state.currentTemplate.category || "Minimal";
  document.getElementById("input-meta-description").value = state.currentTemplate.description || "";
  document.getElementById("input-meta-tags").value = (state.currentTemplate.tags || []).join(", ");
  document.getElementById("select-meta-headline-font").value = state.currentTemplate.headlineFont || "Outfit";
  document.getElementById("select-meta-subheadline-font").value = state.currentTemplate.subheadlineFont || "Outfit";

  // Pre-load default fonts
  ensureFontLoaded(state.currentTemplate.headlineFont);
  ensureFontLoaded(state.currentTemplate.subheadlineFont);
  state.currentTemplate.layout.forEach(layer => {
    if (layer.font) ensureFontLoaded(layer.font);
  });

  // Render Editor Workspace
  renderPreview();
  renderLayersList();
  deselectLayer();
}

export function createNewTemplate() {
  const newId = "tpl_" + Math.random().toString(36).substr(2, 9);
  const defaultTemplate = {
    id: newId,
    name: "New Template " + state.templates.length,
    category: "Minimal",
    thumbnailUrl: "",
    isPro: false,
    isDownloaded: false,
    localPath: "",
    fileSizeBytes: 150000,
    deviceType: "phone",
    description: "A beautiful custom designed template.",
    tags: ["custom", "free"],
    screenshotSlots: 1,
    headlineFont: "Outfit",
    subheadlineFont: "Outfit",
    createdAt: Date.now(),
    layout: [
      {
        type: "background",
        color: "#FAF9F6"
      },
      {
        type: "text",
        content: "Add Headline Here",
        x: 0.08,
        y: 0.12,
        width: 0.84,
        font_size: 0.075,
        bold: true,
        align: "center",
        color: "#141A14",
        max_lines: 2,
        line_height: 1.2
      },
      {
        type: "phone",
        x: 0.12,
        y: 0.40,
        width: 0.76,
        frame_color: "#1C1C1E",
        style: "dynamic_island"
      }
    ]
  };
  
  openEditor(defaultTemplate);
}



export function renderPreview() {
  const canvas = document.getElementById("main-editor-canvas");
  canvas.innerHTML = "";

  // Render layers in index order (first = background/bottom, last = front)
  state.currentTemplate.layout.forEach((layer, index) => {
    const isSelected = state.selectedLayerIndex === index;
    const layerHtml = getLayerHtml(layer, index, isSelected);
    canvas.insertAdjacentHTML("beforeend", layerHtml);
  });

  // Setup interactive drag listeners on selected elements
  setupDragHandlers();
}

// Generates correct inline CSS & HTML structures matching Flutter template layouts
export function getLayerHtml(layer, index, isSelected) {
  const selectedClass = isSelected ? "selected-element" : "";
  
  // Background element is always positioned at 100% of canvas
  if (layer.type === 'background') {
    let bgStyle = "";
    if (layer.gradient && layer.gradient.length >= 2) {
      const beginCSS = ALIGNMENT_MAP[layer.begin] || "to bottom";
      bgStyle = `background: linear-gradient(${beginCSS}, ${layer.gradient.join(", ")});`;
    } else if (layer.split_at !== undefined) {
      const splitPercent = (layer.split_at * 100) + "%";
      const topColor = layer.top_color || "#FAF9F6";
      const bottomColor = layer.bottom_color || "#F5F7F5";
      bgStyle = `background: linear-gradient(to bottom, ${topColor} ${splitPercent}, ${bottomColor} ${splitPercent});`;
    } else {
      bgStyle = `background-color: ${layer.color || '#FAF9F6'};`;
    }
    return `<div class="preview-background" style="${bgStyle}" data-index="${index}"></div>`;
  }

  // Calculate absolute pixel coordinates from normalized fractions
  const left = (layer.x || 0) * 390;
  const top = (layer.y || 0) * 844;
  const width = (layer.width || 0.8) * 390;
  // height can be optional or computed based on aspect ratio/type
  const height = layer.height ? (layer.height * 844) : 'auto';
  const rotation = layer.rotation || 0;
  const opacity = layer.opacity !== undefined ? layer.opacity : 1;

  let innerContent = "";
  let elementStyles = `
    position: absolute;
    left: ${left}px;
    top: ${top}px;
    width: ${width}px;
    ${height !== 'auto' ? `height: ${height}px;` : ''}
    transform: rotate(${rotation}deg);
    opacity: ${opacity};
    z-index: ${index + 1};
  `;

  switch (layer.type) {
    case 'text':
      const font = layer.font || state.currentTemplate.headlineFont || 'Outfit';
      ensureFontLoaded(font);
      
      // Process text placeholders: replace {headline} and {subheadline} with dummy text if empty
      let textContent = layer.content || "";
      if (textContent.includes("{headline}")) textContent = textContent.replace("{headline}", "Premium App Mockups");
      if (textContent.includes("{subheadline}")) textContent = textContent.replace("{subheadline}", "Build stunning screenshots in seconds");

      const alignment = layer.align || "center";
      const fontSize = (layer.font_size || 0.08) * 390; // scale relative to canvas width
      const fontWeight = layer.bold ? '700' : (layer.weight ? layer.weight.replace('w', '') : '400');
      const letterSpacing = layer.letter_spacing ? `${layer.letter_spacing}px` : 'normal';
      const lineHeight = layer.line_height || 1.25;

      elementStyles += `
        font-family: '${font}', sans-serif;
        font-size: ${fontSize}px;
        font-weight: ${fontWeight};
        color: ${layer.color || '#141A14'};
        text-align: ${alignment};
        letter-spacing: ${letterSpacing};
        line-height: ${lineHeight};
        word-wrap: break-word;
        white-space: pre-wrap;
      `;
      innerContent = textContent;
      break;

    case 'phone':
      const style = layer.style || 'dynamic_island';
      const frameColor = layer.frame_color || '#1C1C1E';
      const bezel = layer.bezel || 8;
      const radius = layer.radius || 38;
      const enableShadow = layer.shadow !== false;

      // Draw custom CSS mockup device bezel frame
      const frameWidth = width;
      const frameHeight = width * (19.5 / 9); // iOS standard aspect ratio 19.5:9
      
      elementStyles += `
        height: ${frameHeight}px;
      `;

      innerContent = `
        <div class="mockup-container">
          <div class="phone-bezel-frame" style="width: ${frameWidth}px; height: ${frameHeight}px; border-radius: ${radius}px; padding: ${bezel}px; background-color: ${frameColor}; ${enableShadow ? 'box-shadow: 0 15px 35px rgba(0,0,0,0.25);' : 'box-shadow: none;'}">
            <!-- Simulated Notch cutout overlays -->
            ${style !== 'none' ? `<div class="phone-notch-overlay ${style}"></div>` : ''}
            
            <div class="phone-screen-area" style="border-radius: ${radius - bezel/2}px;">
              <!-- High-fidelity visual mockup layout placeholder -->
              <div style="width:100%; height:100%; background:white; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#1A6B4A; font-family:var(--font-display, 'Outfit', sans-serif); box-sizing:border-box; gap: 8px;">
                <img src="logo.png" style="width:40px; height:40px; object-fit:cover; border-radius:50%;">
                <div style="text-align:center; font-weight:600; font-size:24px;">
                  Aperlo
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      break;

    case 'shape':
      const sType = layer.shape_type || 'circle';
      const sColor = layer.color || '#1A6B4A';
      const shapeWidth = width;
      // if height is auto or missing, match width (square bounding box for circles/stars)
      const shapeHeight = height !== 'auto' ? height : shapeWidth;

      elementStyles += `
        height: ${shapeHeight}px;
      `;

      let svgCode = "";
      if (sType === 'svg' && layer.svg_content) {
        const encodedSvg = encodeURIComponent(layer.svg_content).replace(/'/g, "%27").replace(/"/g, "%22");
        innerContent = `
          <div style="width: 100%; height: 100%; background-color: ${sColor}; 
               -webkit-mask: url('data:image/svg+xml;utf8,${encodedSvg}') no-repeat center; 
               -webkit-mask-size: contain; 
               mask: url('data:image/svg+xml;utf8,${encodedSvg}') no-repeat center; 
               mask-size: contain;">
          </div>
        `;
      } else {
        if (sType === 'circle') {
        svgCode = `<circle cx="50" cy="50" r="48" fill="${sColor}" />`;
      } else if (sType === 'rect') {
        svgCode = `<rect x="2" y="2" width="96" height="96" fill="${sColor}" />`;
      } else if (sType === 'rounded_rect') {
        const rad = layer.corner_radius || 16;
        // corner radius is mapped as ratio or percentage relative to width
        svgCode = `<rect x="2" y="2" width="96" height="96" rx="${rad}" ry="${rad}" fill="${sColor}" />`;
      } else if (sType === 'ring') {
        const strokeW = layer.stroke_width || 8;
        svgCode = `<circle cx="50" cy="50" r="${50 - strokeW}" fill="none" stroke="${sColor}" stroke-width="${strokeW}" />`;
      } else if (sType === 'arc') {
        svgCode = `<path d="M 50,10 A 40,40 0 0,1 90,50 L 50,50 Z" fill="${sColor}" />`;
      } else if (sType === 'polygon') {
        const sides = layer.sides || 6;
        let points = [];
        for (let i = 0; i < sides; i++) {
          const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
          const x = 50 + 46 * Math.cos(angle);
          const y = 50 + 46 * Math.sin(angle);
          points.push(`${x},${y}`);
        }
        svgCode = `<polygon points="${points.join(' ')}" fill="${sColor}" />`;
      } else if (sType === 'star') {
        const points = layer.points || 5;
        let coords = [];
        for (let i = 0; i < points * 2; i++) {
          const r = i % 2 === 0 ? 46 : 20;
          const angle = (i * Math.PI / points) - Math.PI / 2;
          const x = 50 + r * Math.cos(angle);
          const y = 50 + r * Math.sin(angle);
          coords.push(`${x},${y}`);
        }
        svgCode = `<polygon points="${coords.join(' ')}" fill="${sColor}" />`;
      } else if (sType === 'diamond') {
        svgCode = `<polygon points="50,4 96,50 50,96 4,50" fill="${sColor}" />`;
      } else if (sType === 'heart') {
        svgCode = `<path d="M 50,30 A 20,20,0,0,1,90,30 A 20,20,0,0,1,50,70 A 20,20,0,0,1,10,30 A 20,20,0,0,1,50,30 Z" transform="translate(0, 10)" fill="${sColor}" />`;
      } else if (sType === 'cross') {
        svgCode = `<polygon points="40,4 60,4 60,40 96,40 96,60 60,60 60,96 40,96 40,60 4,60 4,40 40,40" fill="${sColor}" />`;
      } else if (sType === 'diagonal_split') {
        svgCode = `<polygon points="0,0 100,0 0,100" fill="${sColor}" /><polygon points="100,0 100,100 0,100" fill="${layer.color2 || sColor}" opacity="0.8" />`;
      } else if (sType === 'blob') {
        // Render stylized rounded blob SVG
        svgCode = `<path d="M25,-32.8C33.3,-29.4,41.6,-22.9,46,-14.2C50.5,-5.5,51,5.5,47,15.1C43,24.7,34.4,32.8,25,37.3C15.6,41.8,5.3,42.7,-4.8,40.4C-14.8,38.1,-24.6,32.7,-32.1,25C-39.7,17.4,-44.9,7.6,-46.1,-3.1C-47.3,-13.7,-44.4,-25.1,-37.2,-31C-30,-37,-18.6,-37.4,-8.6,-38.7C1.5,-40.1,16.8,-36.2,25,-32.8Z" transform="translate(50 50) scale(0.9)" fill="${sColor}" />`;
      }

      innerContent = `
        <svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block;">
          ${svgCode}
        </svg>
      `;
      }
      break;

    case 'badge':
      const badgeBg = layer.color || '#E8F5E9';
      const badgeTextCol = layer.text_color || '#1A6B4A';
      const badgeRad = layer.corner_radius || 12;
      const badgeText = layer.content || "NEW RELEASE";
      const badgeIcon = layer.icon || "";
      const badgeFontSize = (layer.font_size || 0.02) * 390;

      elementStyles += `
        background-color: ${badgeBg};
        border-radius: ${badgeRad}px;
        color: ${badgeTextCol};
        ${layer.border_color ? `border: 1.5px solid ${layer.border_color};` : ''}
      `;
      
      innerContent = `
        <div class="badge-element" style="font-size:${badgeFontSize}px; font-weight:700; font-family:var(--font-body);">
          ${badgeIcon ? `<span>${badgeIcon}</span>` : ''}
          <span>${badgeText}</span>
        </div>
      `;
      break;

    case 'feature_row':
      const featText = layer.content || "Awesome feature bullet";
      const featIcon = layer.icon || "✔";
      const featIconBg = layer.icon_bg || "#E8F5E9";
      const featIconCol = layer.icon_color || "#1A6B4A";
      const featTextCol = layer.text_color || "#141A14";
      const featSize = (layer.font_size || 0.035) * 390;
      
      innerContent = `
        <div class="feature-row-element" style="font-family:var(--font-body); font-size:${featSize}px; color:${featTextCol};">
          <div class="feature-item-box">
            <div class="feature-item-icon" style="background-color:${featIconBg}; color:${featIconCol}; width:${featSize * 1.5}px; height:${featSize * 1.5}px; font-size:${featSize * 0.9}px;">
              ${featIcon}
            </div>
            <div style="font-weight:${layer.bold ? '700' : '500'};">${featText}</div>
          </div>
        </div>
      `;
      break;

    case 'frosted_panel':
      const blurSigma = layer.blur || 12;
      const glassBg = layer.color || '#FFFFFF';
      const glassOpacity = layer.opacity !== undefined ? layer.opacity : 0.5;
      const glassBorderCol = layer.border_color || '#FFFFFF';
      const glassRad = layer.corner_radius || 16;
      
      // Extract RGB values for background overlay transparency
      const hex = glassBg.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) || 255;
      const g = parseInt(hex.substring(2, 4), 16) || 255;
      const b = parseInt(hex.substring(4, 6), 16) || 255;

      elementStyles += `
        backdrop-filter: blur(${blurSigma}px);
        -webkit-backdrop-filter: blur(${blurSigma}px);
        background-color: rgba(${r}, ${g}, ${b}, ${glassOpacity});
        border: 1px solid ${glassBorderCol};
        border-radius: ${glassRad}px;
      `;
      break;

    case 'divider':
      const divThick = layer.thickness || 2;
      elementStyles += `
        background-color: ${layer.color || '#E2E8F0'};
        height: ${divThick}px;
      `;
      break;

    case 'accent_bar':
      const barHeight = layer.height ? (layer.height * 844) : 8;
      elementStyles += `
        background-color: ${layer.color || '#1A6B4A'};
        height: ${barHeight}px;
        border-radius: 4px;
      `;
      break;
  }

  return `<div class="preview-layer ${selectedClass}" style="${elementStyles}" data-index="${index}">${innerContent}</div>`;
}



export function setupDragHandlers() {
  const previewLayers = document.querySelectorAll(".preview-layer");
  
  previewLayers.forEach(el => {
    // Left-click on canvas overlays selects them
    el.addEventListener("mousedown", (e) => {
      const idx = parseInt(el.getAttribute("data-index"));
      if (idx === undefined || isNaN(idx)) return;
      
      e.stopPropagation(); // prevent empty canvas click deselect
      selectLayer(idx);

      // Setup dragging state
      state.isDragging = true;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;
      state.dragInitialX = parseFloat(state.currentTemplate.layout[idx].x) || 0;
      state.dragInitialY = parseFloat(state.currentTemplate.layout[idx].y) || 0;
      
      el.style.cursor = "grabbing";
    });

    el.addEventListener("mouseup", () => {
      el.style.cursor = "move";
    });
  });
}

// Global mouse listeners for dragging
document.addEventListener("mousemove", (e) => {
  if (!state.isDragging || state.selectedLayerIndex < 0) return;

  const dx = e.clientX - state.dragStartX;
  const dy = e.clientY - state.dragStartY;

  // Convert pixel offsets relative to scaled viewport sizes
  // virtual canvas is exactly 390x844
  const canvasW = 390;
  const canvasH = 847;
  
  const targetLayer = state.currentTemplate.layout[state.selectedLayerIndex];
  const newX = state.dragInitialX + (dx / state.canvasScale) / canvasW;
  const newY = state.dragInitialY + (dy / state.canvasScale) / canvasH;

  // Bound coordinates to reasonable canvas bounds
  targetLayer.x = parseFloat(Math.max(-0.5, Math.min(1.5, newX)).toFixed(3));
  targetLayer.y = parseFloat(Math.max(-0.5, Math.min(1.5, newY)).toFixed(3));

  // Live update properties input displays & render canvas
  document.getElementById("slider-val-x").value = targetLayer.x;
  document.getElementById("label-val-x").textContent = targetLayer.x;
  document.getElementById("slider-val-y").value = targetLayer.y;
  document.getElementById("label-val-y").textContent = targetLayer.y;

  renderPreview();
});

document.addEventListener("mouseup", () => {
  if (state.isDragging) {
    state.isDragging = false;
    // Save draft auto-locally on drop
    saveTemplateDraft();
  }
});

// Click background canvas deselects active selected layer
const mainCanvas = document.getElementById("main-editor-canvas");
if (mainCanvas) {
  mainCanvas.addEventListener("mousedown", (e) => {
    if (e.target === mainCanvas || e.target.classList.contains("preview-background")) {
      // Select background config panel
      selectLayer(-2);
    }
  });
}



export function renderLayersList() {
  const container = document.getElementById("layers-list-container");
  container.innerHTML = "";
  
  document.getElementById("layer-count").textContent = `${state.currentTemplate.layout.length} elements`;

  // Draw layers. Render list backwards so top elements in list represent front items (highest index)
  for (let i = state.currentTemplate.layout.length - 1; i >= 0; i--) {
    const layer = state.currentTemplate.layout[i];
    
    // Skip background from layers reordering list as it's static at the base
    if (layer.type === 'background') continue;

    const isActive = state.selectedLayerIndex === i;
    const activeClass = isActive ? "active" : "";

    let iconName = "square";
    if (layer.type === 'text') iconName = "type";
    if (layer.type === 'phone') iconName = "smartphone";
    if (layer.type === 'shape') iconName = "shapes";
    if (layer.type === 'badge') iconName = "tag";
    if (layer.type === 'feature_row') iconName = "list";
    if (layer.type === 'frosted_panel') iconName = "layers";
    if (layer.type === 'divider') iconName = "minus";

    const layerTitle = layer.type.charAt(0).toUpperCase() + layer.type.slice(1);
    const subDesc = layer.type === 'text' ? `"${layer.content.substr(0, 15)}..."` : (layer.shape_type || "");

    const row = document.createElement("div");
    row.className = `layer-item ${activeClass}`;
    row.setAttribute("data-index", i);
    
    row.innerHTML = `
      <div class="layer-icon"><i data-lucide="${iconName}" style="width: 15px; height: 15px;"></i></div>
      <div class="layer-name">${layerTitle} <span style="opacity: 0.6; font-weight: normal; font-size:10px;">${subDesc}</span></div>
      <div class="layer-actions">
        <button class="layer-btn btn-move-up" title="Move Up"><i data-lucide="chevron-up" style="width: 14px; height: 14px;"></i></button>
        <button class="layer-btn btn-move-down" title="Move Down"><i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i></button>
        <button class="layer-btn btn-duplicate" title="Duplicate"><i data-lucide="copy" style="width: 13px; height: 13px; color:var(--color-primary);"></i></button>
        <button class="layer-btn btn-delete" title="Delete"><i data-lucide="trash" style="width: 14px; height: 14px; color:var(--color-destructive);"></i></button>
      </div>
    `;

    // Click to select
    row.addEventListener("click", (e) => {
      if (e.target.closest('.layer-btn')) return; // ignore move/delete clicks
      selectLayer(i);
    });

    // Move layer higher (moves it forward towards screen)
    row.querySelector(".btn-move-up").addEventListener("click", (e) => {
      e.stopPropagation();
      moveLayer(i, 1);
    });

    // Move layer lower (moves it backwards)
    row.querySelector(".btn-move-down").addEventListener("click", (e) => {
      e.stopPropagation();
      moveLayer(i, -1);
    });

    // Duplicate layer
    row.querySelector(".btn-duplicate").addEventListener("click", (e) => {
      e.stopPropagation();
      duplicateLayer(i);
    });

    // Delete layer
    row.querySelector(".btn-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteLayer(i);
    });

    container.appendChild(row);
  }

  lucide.createIcons();
}

export function selectLayer(index) {
  state.selectedLayerIndex = index;

  // Reset selected styles in list
  document.querySelectorAll(".layer-item").forEach(el => {
    el.classList.remove("active");
    if (parseInt(el.getAttribute("data-index")) === index) {
      el.classList.add("active");
    }
  });

  // Re-draw selected border outlines
  renderPreview();

  // Populate Right Properties panel
  const placeholder = document.getElementById("properties-placeholder");
  const container = document.getElementById("properties-controls-container");
  
  if (index === -1) {
    placeholder.classList.remove("hidden");
    container.classList.add("hidden");
    return;
  }

  placeholder.classList.add("hidden");
  container.classList.remove("hidden");

  // Show/Hide property control categories based on type
  const targetLayer = index === -2 
    ? state.currentTemplate.layout.find(l => l.type === 'background')
    : state.currentTemplate.layout[index];

  document.getElementById("prop-title-layer-name").textContent = targetLayer.type.toUpperCase() + " LAYER";

  // Hide all settings sections initially
  document.getElementById("section-pos-dims").classList.add("hidden");
  document.getElementById("section-prop-background").classList.add("hidden");
  document.getElementById("section-prop-text").classList.add("hidden");
  document.getElementById("section-prop-shape").classList.add("hidden");
  document.getElementById("section-prop-phone").classList.add("hidden");
  document.getElementById("section-prop-badge").classList.add("hidden");
  document.getElementById("section-prop-feature-row").classList.add("hidden");
  document.getElementById("section-prop-frosted").classList.add("hidden");

  if (index === -2) {
    // Background properties
    document.getElementById("section-prop-background").classList.remove("hidden");
    setupBackgroundPropsForm(targetLayer);
  } else {
    // Normal elements properties
    document.getElementById("section-pos-dims").classList.remove("hidden");
    
    // Position inputs setup
    document.getElementById("slider-val-x").value = targetLayer.x || 0;
    document.getElementById("label-val-x").textContent = targetLayer.x || 0;
    document.getElementById("slider-val-y").value = targetLayer.y || 0;
    document.getElementById("label-val-y").textContent = targetLayer.y || 0;
    document.getElementById("slider-val-width").value = targetLayer.width || 0.8;
    document.getElementById("label-val-width").textContent = targetLayer.width || 0.8;
    
    if (targetLayer.height) {
      document.getElementById("group-prop-height").classList.remove("hidden");
      document.getElementById("slider-val-height").value = targetLayer.height;
      document.getElementById("label-val-height").textContent = targetLayer.height;
    } else {
      document.getElementById("group-prop-height").classList.add("hidden");
    }

    document.getElementById("slider-val-rotation").value = targetLayer.rotation || 0;
    document.getElementById("label-val-rotation").textContent = `${targetLayer.rotation || 0}°`;
    document.getElementById("slider-val-opacity").value = targetLayer.opacity !== undefined ? targetLayer.opacity : 1;
    document.getElementById("label-val-opacity").textContent = `${Math.round((targetLayer.opacity !== undefined ? targetLayer.opacity : 1) * 100)}%`;

    // Type conditional forms
    if (targetLayer.type === 'text') {
      document.getElementById("section-prop-text").classList.remove("hidden");
      
      document.getElementById("textarea-text-content").value = targetLayer.content || "";
      document.getElementById("select-text-font").value = targetLayer.font || state.currentTemplate.headlineFont || "Outfit";
      document.getElementById("picker-text-color").value = targetLayer.color || "#141A14";
      document.getElementById("text-text-color").value = targetLayer.color || "#141A14";
      document.getElementById("select-text-align").value = targetLayer.align || "center";
      document.getElementById("select-text-weight").value = targetLayer.weight || (targetLayer.bold ? "w700" : "w400");
      document.getElementById("slider-val-font-size").value = targetLayer.font_size || 0.08;
      document.getElementById("label-val-font-size").textContent = targetLayer.font_size || 0.08;
      document.getElementById("slider-val-line-height").value = targetLayer.line_height || 1.25;
      document.getElementById("label-val-line-height").textContent = targetLayer.line_height || 1.25;
      document.getElementById("slider-val-letter-spacing").value = targetLayer.letter_spacing || 0;
      document.getElementById("label-val-letter-spacing").textContent = targetLayer.letter_spacing || 0;
    } 
    else if (targetLayer.type === 'shape') {
      document.getElementById("section-prop-shape").classList.remove("hidden");
      
      document.getElementById("select-shape-type").value = targetLayer.shape_type || "circle";
      document.getElementById("picker-shape-color").value = targetLayer.color || "#1A6B4A";
      document.getElementById("text-shape-color").value = targetLayer.color || "#1A6B4A";
      
      // Conditionally show/hide shape properties
      const sType = targetLayer.shape_type || "circle";
      toggleShapeControlGroups(sType, targetLayer);
    } 
    else if (targetLayer.type === 'phone') {
      document.getElementById("section-prop-phone").classList.remove("hidden");
      
      document.getElementById("select-phone-style").value = targetLayer.style || "dynamic_island";
      document.getElementById("picker-phone-frame").value = targetLayer.frame_color || "#1C1C1E";
      document.getElementById("text-phone-frame").value = targetLayer.frame_color || "#1C1C1E";
      document.getElementById("slider-val-phone-bezel").value = targetLayer.bezel || 8;
      document.getElementById("label-val-phone-bezel").textContent = `${targetLayer.bezel || 8}px`;
      document.getElementById("slider-val-phone-radius").value = targetLayer.radius || 38;
      document.getElementById("label-val-phone-radius").textContent = `${targetLayer.radius || 38}px`;
      document.getElementById("checkbox-phone-shadow").checked = targetLayer.shadow !== false;
    }
    else if (targetLayer.type === 'badge') {
      document.getElementById("section-prop-badge").classList.remove("hidden");
      
      document.getElementById("input-badge-content").value = targetLayer.content || "";
      document.getElementById("input-badge-icon").value = targetLayer.icon || "";
      document.getElementById("picker-badge-bg").value = targetLayer.color || "#E8F5E9";
      document.getElementById("text-badge-bg").value = targetLayer.color || "#E8F5E9";
      document.getElementById("picker-badge-text").value = targetLayer.text_color || "#1A6B4A";
      document.getElementById("text-badge-text").value = targetLayer.text_color || "#1A6B4A";
    }
    else if (targetLayer.type === 'feature_row') {
      document.getElementById("section-prop-feature-row").classList.remove("hidden");
      
      document.getElementById("input-feature-content").value = targetLayer.content || "";
      document.getElementById("input-feature-icon").value = targetLayer.icon || "✔";
      document.getElementById("picker-feature-icon-bg").value = targetLayer.icon_bg || "#E8F5E9";
      document.getElementById("text-feature-icon-bg").value = targetLayer.icon_bg || "#E8F5E9";
      document.getElementById("picker-feature-icon-color").value = targetLayer.icon_color || "#1A6B4A";
      document.getElementById("text-feature-icon-color").value = targetLayer.icon_color || "#1A6B4A";
    }
    else if (targetLayer.type === 'frosted_panel') {
      document.getElementById("section-prop-frosted").classList.remove("hidden");
      
      document.getElementById("slider-val-frosted-blur").value = targetLayer.blur || 12;
      document.getElementById("label-val-frosted-blur").textContent = targetLayer.blur || 12;
      document.getElementById("picker-frosted-tint").value = targetLayer.color || "#FFFFFF";
      document.getElementById("text-frosted-tint").value = targetLayer.color || "#FFFFFF";
      document.getElementById("slider-val-frosted-opacity").value = targetLayer.opacity !== undefined ? targetLayer.opacity : 0.5;
      document.getElementById("label-val-frosted-opacity").textContent = `${Math.round((targetLayer.opacity !== undefined ? targetLayer.opacity : 0.5) * 100)}%`;
      document.getElementById("picker-frosted-border").value = targetLayer.border_color || "#FFFFFF";
      document.getElementById("text-frosted-border").value = targetLayer.border_color || "#FFFFFF";
    }
  }
}

export function deselectLayer() {
  state.selectedLayerIndex = -1;
  document.getElementById("properties-placeholder").classList.remove("hidden");
  document.getElementById("properties-controls-container").classList.add("hidden");
  renderPreview();
}

export function toggleShapeControlGroups(shapeType, targetLayer) {
  // Select items
  const rGroup = document.querySelector(".id-prop-corner-radius");
  const sGroup = document.querySelector(".id-prop-stroke-width");
  const sideGroup = document.querySelector(".id-prop-sides");
  const ptsGroup = document.querySelector(".id-prop-points");
  const svgGroup = document.querySelector(".id-prop-svg");

  if (rGroup) rGroup.classList.add("hidden");
  if (sGroup) sGroup.classList.add("hidden");
  if (sideGroup) sideGroup.classList.add("hidden");
  if (ptsGroup) ptsGroup.classList.add("hidden");
  if (svgGroup) svgGroup.classList.add("hidden");

  if (shapeType === 'rounded_rect') {
    rGroup.classList.remove("hidden");
    document.getElementById("slider-val-corner-radius").value = targetLayer.corner_radius || 16;
    document.getElementById("label-val-corner-radius").textContent = targetLayer.corner_radius || 16;
  }
  else if (shapeType === 'ring') {
    sGroup.classList.remove("hidden");
    document.getElementById("slider-val-stroke-width").value = targetLayer.stroke_width || 8;
    document.getElementById("label-val-stroke-width").textContent = targetLayer.stroke_width || 8;
  }
  else if (shapeType === 'polygon') {
    sideGroup.classList.remove("hidden");
    document.getElementById("slider-val-sides").value = targetLayer.sides || 6;
    document.getElementById("label-val-sides").textContent = targetLayer.sides || 6;
  }
  else if (shapeType === 'star') {
    if (ptsGroup) ptsGroup.classList.remove("hidden");
    document.getElementById("slider-val-points").value = targetLayer.points || 5;
    document.getElementById("label-val-points").textContent = targetLayer.points || 5;
  }
  else if (shapeType === 'svg') {
    if (svgGroup) svgGroup.classList.remove("hidden");
  }
}

export function setupBackgroundPropsForm(layer) {
  const typeSelect = document.getElementById("select-bg-type");
  const solidGroup = document.getElementById("group-bg-solid-color");
  const gradGroup = document.getElementById("group-bg-gradient");
  const splitGroup = document.getElementById("group-bg-split");

  solidGroup.classList.add("hidden");
  gradGroup.classList.add("hidden");
  splitGroup.classList.add("hidden");

  if (layer.gradient && layer.gradient.length >= 2) {
    typeSelect.value = "linear";
    gradGroup.classList.remove("hidden");
    document.getElementById("picker-bg-grad-start").value = layer.gradient[0];
    document.getElementById("text-bg-grad-start").value = layer.gradient[0];
    document.getElementById("picker-bg-grad-end").value = layer.gradient[1];
    document.getElementById("text-bg-grad-end").value = layer.gradient[1];
    document.getElementById("select-bg-grad-begin").value = layer.begin || "topCenter";
    document.getElementById("select-bg-grad-end-dir").value = layer.end || "bottomCenter";
  } else if (layer.split_at !== undefined) {
    typeSelect.value = "split";
    splitGroup.classList.remove("hidden");
    document.getElementById("picker-bg-split-top").value = layer.top_color || "#FAF9F6";
    document.getElementById("text-bg-split-top").value = layer.top_color || "#FAF9F6";
    document.getElementById("picker-bg-split-bottom").value = layer.bottom_color || "#F5F7F5";
    document.getElementById("text-bg-split-bottom").value = layer.bottom_color || "#F5F7F5";
    document.getElementById("slider-val-bg-split-at").value = layer.split_at || 0.5;
    document.getElementById("label-val-bg-split-at").textContent = layer.split_at || 0.5;
  } else {
    typeSelect.value = "solid";
    solidGroup.classList.remove("hidden");
    document.getElementById("picker-bg-solid").value = layer.color || "#FAF9F6";
    document.getElementById("text-bg-solid").value = layer.color || "#FAF9F6";
  }
}



export function addLayer(type) {
  let newLayer = { type, pinning: 'safe' };
  
  if (type === 'text') {
    newLayer.content = "New Heading Text";
    newLayer.x = 0.1;
    newLayer.y = 0.25;
    newLayer.width = 0.8;
    newLayer.font_size = 0.07;
    newLayer.bold = true;
    newLayer.align = "center";
    newLayer.color = "#141A14";
  } 
  else if (type === 'shape') {
    newLayer.shape_type = "circle";
    newLayer.x = 0.25;
    newLayer.y = 0.35;
    newLayer.width = 0.5;
    newLayer.color = "#1A6B4A";
  } 
  else if (type === 'phone') {
    newLayer.x = 0.1;
    newLayer.y = 0.45;
    newLayer.width = 0.8;
    newLayer.frame_color = "#1C1C1E";
    newLayer.style = "dynamic_island";
  } 
  else if (type === 'badge') {
    newLayer.content = "FEATURE TAG";
    newLayer.icon = "✦";
    newLayer.x = 0.3;
    newLayer.y = 0.08;
    newLayer.width = 0.4;
    newLayer.color = "#E8F5E9";
    newLayer.text_color = "#1A6B4A";
    newLayer.font_size = 0.018;
    newLayer.corner_radius = 8;
  }
  else if (type === 'feature_row') {
    newLayer.content = "Premium bullet feature text";
    newLayer.icon = "✔";
    newLayer.x = 0.1;
    newLayer.y = 0.55;
    newLayer.width = 0.8;
    newLayer.icon_bg = "#E8F5E9";
    newLayer.icon_color = "#1A6B4A";
    newLayer.font_size = 0.032;
    newLayer.bold = true;
  }
  else if (type === 'frosted_panel') {
    newLayer.x = 0.08;
    newLayer.y = 0.15;
    newLayer.width = 0.84;
    newLayer.height = 0.25;
    newLayer.blur = 12;
    newLayer.color = "#FFFFFF";
    newLayer.opacity = 0.5;
    newLayer.border_color = "#FFFFFF";
    newLayer.corner_radius = 16;
  }
  else if (type === 'divider') {
    newLayer.x = 0.1;
    newLayer.y = 0.38;
    newLayer.width = 0.8;
    newLayer.thickness = 2;
    newLayer.color = "#E2E8F0";
  }
  else if (type === 'accent_bar') {
    newLayer.x = 0.4;
    newLayer.y = 0.2;
    newLayer.width = 0.2;
    newLayer.height = 0.01;
    newLayer.color = "#1A6B4A";
  }

  // Insert layer at top (end of layout array)
  state.currentTemplate.layout.push(newLayer);
  
  // Select the newly added layer
  state.selectedLayerIndex = state.currentTemplate.layout.length - 1;

  renderPreview();
  renderLayersList();
  selectLayer(state.selectedLayerIndex);
  
  showToast(`Added ${type} layer`);
  saveTemplateDraft();
}

export function moveLayer(index, direction) {
  const newIndex = index + direction;
  
  // Check bounds. Background must stay at index 0 (can't move items behind bg, nor bg itself)
  if (newIndex <= 0 || newIndex >= state.currentTemplate.layout.length) return;
  
  // Swap positions in array
  const temp = state.currentTemplate.layout[index];
  state.currentTemplate.layout[index] = state.currentTemplate.layout[newIndex];
  state.currentTemplate.layout[newIndex] = temp;

  // Maintain correct selection index mapping
  if (state.selectedLayerIndex === index) {
    state.selectedLayerIndex = newIndex;
  } else if (state.selectedLayerIndex === newIndex) {
    state.selectedLayerIndex = index;
  }

  renderPreview();
  renderLayersList();
  selectLayer(state.selectedLayerIndex);
  saveTemplateDraft();
}

export function deleteLayer(index) {
  if (index === 0 && state.currentTemplate.layout[index].type === 'background') {
    showToast("Cannot delete background layer", true);
    return;
  }

  const name = state.currentTemplate.layout[index].type;
  state.currentTemplate.layout.splice(index, 1);
  
  // Reset selection index
  state.selectedLayerIndex = -1;
  
  renderPreview();
  renderLayersList();
  deselectLayer();

  showToast(`Deleted ${name} layer`);
  saveTemplateDraft();
}

export function duplicateLayer(index) {
  if (index < 0 || index >= state.currentTemplate.layout.length) return;
  const original = state.currentTemplate.layout[index];
  if (original.type === 'background') {
    showToast("Cannot duplicate background layer", true);
    return;
  }

  // Create deep copy of the layer
  const clone = JSON.parse(JSON.stringify(original));

  // Offset clone position slightly so it is visibly distinct
  clone.x = parseFloat(Math.min(1.0, (clone.x || 0) + 0.05).toFixed(3));
  clone.y = parseFloat(Math.min(1.0, (clone.y || 0) + 0.05).toFixed(3));

  // Insert clone directly above original
  state.currentTemplate.layout.splice(index + 1, 0, clone);

  // Select duplicated layer
  state.selectedLayerIndex = index + 1;

  renderPreview();
  renderLayersList();
  selectLayer(state.selectedLayerIndex);

  showToast(`Duplicated ${original.type} layer`);
  saveTemplateDraft();
}

export function alignSelectedLayer(direction) {
  if (state.selectedLayerIndex < 0) return;
  const layer = state.currentTemplate.layout[state.selectedLayerIndex];
  if (layer.type === 'background') return;

  const w = parseFloat(layer.width) || 0.8;
  
  // Approximate height based on type
  let h = 0.15; // default fallback
  if (layer.height) {
    h = parseFloat(layer.height);
  } else if (layer.type === 'phone') {
    h = w * (390 * 19.5) / (9 * 844); // ~1.001 * w
  } else if (layer.type === 'text') {
    h = (parseFloat(layer.font_size) || 0.08) * 1.5; // simple approximation for text block
  }

  switch (direction) {
    case 'left':
      layer.x = 0;
      break;
    case 'center-h':
      layer.x = parseFloat(((1 - w) / 2).toFixed(3));
      break;
    case 'right':
      layer.x = parseFloat((1 - w).toFixed(3));
      break;
    case 'top':
      layer.y = 0;
      break;
    case 'center-v':
      layer.y = parseFloat(((1 - h) / 2).toFixed(3));
      break;
    case 'bottom':
      layer.y = parseFloat((1 - h).toFixed(3));
      break;
  }

  // Update input displays
  document.getElementById("slider-val-x").value = layer.x;
  document.getElementById("label-val-x").textContent = layer.x;
  document.getElementById("slider-val-y").value = layer.y;
  document.getElementById("label-val-y").textContent = layer.y;

  renderPreview();
  saveTemplateDraft();
}



export function saveTemplateDraft() {
  if (!state.currentTemplate) return;
  localStorage.setItem(`fk_draft_${state.currentTemplate.id}`, JSON.stringify(state.currentTemplate));
  sessionStorage.setItem('fk_current_editing_template', JSON.stringify(state.currentTemplate));
}

// Renders canvas dynamically, converts to PNG blob, uploads to storage, and pushes metadata configuration to firestore
export function pushTemplateToFirestore() {
  if (!state.currentUser) {
    showToast("Please login first to upload templates", true);
    return;
  }

  // 1. Gather all metadata from inputs
  state.currentTemplate.name = document.getElementById("input-template-name").value.trim() || "Untitled Template";
  state.currentTemplate.category = document.getElementById("select-meta-category").value;
  state.currentTemplate.description = document.getElementById("input-meta-description").value.trim();
  state.currentTemplate.tags = document.getElementById("input-meta-tags").value.split(",").map(t => t.trim()).filter(t => t.length > 0);
  state.currentTemplate.headlineFont = document.getElementById("select-meta-headline-font").value;
  state.currentTemplate.subheadlineFont = document.getElementById("select-meta-subheadline-font").value;

  // Deduce screenshot slots (count number of phone elements)
  const phoneCount = state.currentTemplate.layout.filter(l => l.type === 'phone').length;
  state.currentTemplate.screenshotSlots = phoneCount || 1;

  showLoading("Saving Template...", "Rendering canvas into high-resolution preview...");

  // Deselect active layer outline for screenshot capture
  const previousSelection = state.selectedLayerIndex;
  deselectLayer();

  // Let DOM render deselect border before capture
  setTimeout(() => {
    document.fonts.ready.then(() => {
      const canvasContainer = document.getElementById("main-editor-canvas");
      const zoomWrapper = document.getElementById("canvas-zoom-wrapper");
      const oldTransform = zoomWrapper.style.transform;
      
      // Temporarily remove zoom scale for pristine rendering of border-radius & text
      zoomWrapper.style.transform = "scale(1)";
      
      // Call html2canvas to rasterize DOM canvas to native HTML5 canvas
      html2canvas(canvasContainer, {
        scale: 2, // High resolution thumbnail
        useCORS: true,
        backgroundColor: null
      }).then(htmlCanvas => {
        zoomWrapper.style.transform = oldTransform;
        
        // Re-select original layer
        if (previousSelection >= 0) selectLayer(previousSelection);

        showLoading("Saving Template...", "Uploading thumbnail image to Firebase Storage...");

      htmlCanvas.toBlob(blob => {
        if (!blob) {
          hideLoading();
          showToast("Error generating canvas screenshot", true);
          return;
        }

        const thumbRef = storage.ref().child(`templates/${state.currentTemplate.id}/thumbnail.png`);
        
        // Upload image to Storage bucket
        thumbRef.put(blob, { contentType: 'image/png' })
          .then(snapshot => snapshot.ref.getDownloadURL())
          .then(downloadUrl => {
            
            showLoading("Saving Template...", "Saving document schema configurations to Firestore...");

            // 2. Add thumbnail link and write template configuration
            state.currentTemplate.thumbnailUrl = downloadUrl;
            state.currentTemplate.isPro = false; // Always FREE

            // Clean schema properties
            // Prepare layout for encryption
            const unencryptedData = {
              name: state.currentTemplate.name,
              isPro: false,
              isDownloaded: false,
              localPath: "",
              fileSizeBytes: state.currentTemplate.fileSizeBytes || 150000,
              deviceType: state.currentTemplate.deviceType || "phone",
              description: state.currentTemplate.description,
              tags: state.currentTemplate.tags,
              screenshotSlots: state.currentTemplate.screenshotSlots,
              headlineFont: state.currentTemplate.headlineFont,
              subheadlineFont: state.currentTemplate.subheadlineFont,
              layout: state.currentTemplate.layout
            };

            const encryptedPayload = encryptTemplateData(unencryptedData);
            
            const docData = {
              id: state.currentTemplate.id,
              category: state.currentTemplate.category,
              thumbnailUrl: state.currentTemplate.thumbnailUrl,
              createdAt: state.currentTemplate.createdAt || null,
              encryptedData: encryptedPayload
            };

            return db.collection("templates").doc(state.currentTemplate.id).set(docData);
          })
          .then(() => {
            hideLoading();
            showToast("Template successfully pushed to Firestore!");
            
            // Clean local draft
            localStorage.removeItem(`fk_draft_${state.currentTemplate.id}`);
            
            // Return to dashboard and reload listings
            if (window.location.pathname.includes('editor.html')) {
              window.location.href = 'index.html';
            } else {
              document.getElementById("view-editor").classList.add("hidden");
              document.getElementById("view-dashboard").classList.remove("hidden");
              loadTemplates();
            }
          })
          .catch(err => {
            hideLoading();
            showToast("Firebase Error: " + err.message, true);
          });

      }, 'image/png');
    }).catch(err => {
        zoomWrapper.style.transform = oldTransform;
        hideLoading();
        showToast("Canvas Rendering failed: " + err.message, true);
      });
    });
  }, 200);
}



export function setupEventListeners() {
  
  // Navigation & Primary actions
  const btnCopyLlmPrompt = document.getElementById("btn-copy-llm-prompt");
  if (btnCopyLlmPrompt) {
    btnCopyLlmPrompt.addEventListener("click", () => {
      if (!state.currentTemplate) return;
      
      const promptText = `I have created a screenshot template for an app store. Here are the elements on the canvas:

Background: ${state.currentTemplate.layout[0]?.type === 'background' ? JSON.stringify(state.currentTemplate.layout[0]) : 'Not specified'}
Other Elements (Layers):
${state.currentTemplate.layout.slice(1).map((l, i) => `Layer ${i + 1} (${l.type}): ${JSON.stringify(l)}`).join('\n')}

Fonts used: Headline: ${state.currentTemplate.headlineFont}, Subheadline: ${state.currentTemplate.subheadlineFont}

Please generate the following metadata for this template:
1. Template Name (catchy, max 4 words)
2. Short Description (compelling, 1-2 sentences)
3. Category (Must be exactly one of: Minimal, Bold, Gradient, Dark, 3D Mockup, Illustration, Typography)
4. Tags (comma separated, max 5 tags)

Output strictly in JSON format matching this structure:
{
  "name": "...",
  "description": "...",
  "category": "...",
  "tags": "..."
}`;
      navigator.clipboard.writeText(promptText).then(() => {
        showToast("LLM Prompt copied to clipboard!");
      }).catch(err => {
        showToast("Failed to copy prompt", true);
      });
    });
  }

  const btnHeaderLogo = document.getElementById("header-logo-btn");
  if (btnHeaderLogo) {
    btnHeaderLogo.addEventListener("click", () => {
      if (state.currentUser && window.location.pathname.includes('editor.html')) {
        window.location.href = 'index.html';
      }
    });
  }

  const btnDashboardView = document.getElementById("btn-dashboard-view");
  if (btnDashboardView) {
    btnDashboardView.addEventListener("click", () => {
      if (window.location.pathname.includes('editor.html')) {
        window.location.href = 'index.html';
      }
    });
  }

  const btnBackDashboard = document.getElementById("btn-back-dashboard");
  if (btnBackDashboard) {
    btnBackDashboard.addEventListener("click", () => {
      window.location.href = 'index.html';
    });
  }

  // Tab switching bindings
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

  document.getElementById("btn-create-template").addEventListener("click", createNewTemplate);
  
  if (document.getElementById("btn-save-draft")) {
    document.getElementById("btn-save-draft").addEventListener("click", () => {
      saveTemplateDraft();
      showToast("Template draft saved locally");
    });
  }

  if (document.getElementById("btn-push-firestore")) {
    document.getElementById("btn-push-firestore").addEventListener("click", pushTemplateToFirestore);
  }

  // Category filter chips binding
  const filterChips = document.querySelectorAll(".filter-chip");
  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      renderTemplatesGrid(chip.getAttribute("data-category"));
    });
  });

  // Zoom Controls
  if (document.getElementById("btn-zoom-in")) {
    document.getElementById("btn-zoom-in").addEventListener("click", () => {
      state.canvasScale = Math.min(1.5, state.canvasScale + 0.1);
      updateCanvasZoom();
    });
  }

  if (document.getElementById("btn-zoom-out")) {
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
      state.canvasScale = Math.max(0.4, state.canvasScale - 0.1);
      updateCanvasZoom();
    });
  }

  // Quick Alignment bindings
  if (document.getElementById("btn-align-left")) {
    document.getElementById("btn-align-left").addEventListener("click", () => alignSelectedLayer('left'));
    document.getElementById("btn-align-center-h").addEventListener("click", () => alignSelectedLayer('center-h'));
    document.getElementById("btn-align-right").addEventListener("click", () => alignSelectedLayer('right'));
    document.getElementById("btn-align-top").addEventListener("click", () => alignSelectedLayer('top'));
    document.getElementById("btn-align-center-v").addEventListener("click", () => alignSelectedLayer('center-v'));
    document.getElementById("btn-align-bottom").addEventListener("click", () => alignSelectedLayer('bottom'));

    // Duplicate active layer binding
    document.getElementById("btn-duplicate-selected-layer").addEventListener("click", () => {
      if (state.selectedLayerIndex >= 0) {
        duplicateLayer(state.selectedLayerIndex);
      }
    });

    // Delete active layer binding
    document.getElementById("btn-delete-selected-layer").addEventListener("click", () => {
      if (state.selectedLayerIndex >= 0) {
        deleteLayer(state.selectedLayerIndex);
      }
    });
  }

  // Add Elements events
  document.querySelectorAll(".add-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-type");
      addLayer(type);
    });
  });

  // Position sliders listeners
  bindSlider("slider-val-x", "label-val-x", "x");
  bindSlider("slider-val-y", "label-val-y", "y");
  bindSlider("slider-val-width", "label-val-width", "width");
  bindSlider("slider-val-height", "label-val-height", "height");
  
  // Position sliders listeners (Editor only)
  if (document.getElementById("slider-val-rotation")) {
    document.getElementById("slider-val-rotation").addEventListener("input", (e) => {
      const val = parseInt(e.target.value);
      document.getElementById("label-val-rotation").textContent = `${val}°`;
      updateSelectedLayerField("rotation", val);
    });

    document.getElementById("slider-val-opacity").addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById("label-val-opacity").textContent = `${Math.round(val * 100)}%`;
      updateSelectedLayerField("opacity", val);
    });
  }

  // Background control handlers
  if (document.getElementById("select-bg-type")) {
    document.getElementById("select-bg-type").addEventListener("change", (e) => {
      const val = e.target.value;
      const bgLayer = state.currentTemplate.layout.find(l => l.type === 'background');
      
      // Clean old formats
      delete bgLayer.color;
      delete bgLayer.gradient;
      delete bgLayer.begin;
      delete bgLayer.end;
      delete bgLayer.split_at;
      delete bgLayer.top_color;
      delete bgLayer.bottom_color;

      if (val === 'solid') {
        bgLayer.color = "#FAF9F6";
      } else if (val === 'linear') {
        bgLayer.gradient = ["#0082FF", "#0040A3"];
        bgLayer.begin = "topCenter";
        bgLayer.end = "bottomCenter";
      } else if (val === 'split') {
        bgLayer.split_at = 0.5;
        bgLayer.top_color = "#FAF9F6";
        bgLayer.bottom_color = "#F5F7F5";
      }
      
      setupBackgroundPropsForm(bgLayer);
      renderPreview();
      saveTemplateDraft();
    });
  }

  // Color Pickers (Background)
  bindColorInput("picker-bg-solid", "text-bg-solid", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.color = color;
    renderPreview();
  });

  bindColorInput("picker-bg-grad-start", "text-bg-grad-start", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    if (bg.gradient) bg.gradient[0] = color;
    renderPreview();
  });

  bindColorInput("picker-bg-grad-end", "text-bg-grad-end", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    if (bg.gradient) bg.gradient[1] = color;
    renderPreview();
  });

  if (document.getElementById("select-bg-grad-begin")) {
    document.getElementById("select-bg-grad-begin").addEventListener("change", (e) => {
      const bg = state.currentTemplate.layout.find(l => l.type === 'background');
      bg.begin = e.target.value;
      renderPreview();
    });

    document.getElementById("select-bg-grad-end-dir").addEventListener("change", (e) => {
      const bg = state.currentTemplate.layout.find(l => l.type === 'background');
      bg.end = e.target.value;
      renderPreview();
    });
  }

  bindColorInput("picker-bg-split-top", "text-bg-split-top", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.top_color = color;
    renderPreview();
  });

  bindColorInput("picker-bg-split-bottom", "text-bg-split-bottom", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.bottom_color = color;
    renderPreview();
  });

  bindSlider("slider-val-bg-split-at", "label-val-bg-split-at", "split_at", true);

  // Text Property Handlers
  if (document.getElementById("textarea-text-content")) {
    document.getElementById("textarea-text-content").addEventListener("input", (e) => {
      updateSelectedLayerField("content", e.target.value);
    });

    document.getElementById("select-text-font").addEventListener("change", (e) => {
      ensureFontLoaded(e.target.value);
      updateSelectedLayerField("font", e.target.value);
    });

    document.getElementById("select-text-align").addEventListener("change", (e) => {
      updateSelectedLayerField("align", e.target.value);
    });

    document.getElementById("select-text-weight").addEventListener("change", (e) => {
      const val = e.target.value;
      const l = state.currentTemplate.layout[state.selectedLayerIndex];
      if (val === 'w700') {
        l.bold = true;
        delete l.weight;
      } else {
        l.bold = false;
        l.weight = val;
      }
      renderPreview();
      saveTemplateDraft();
    });
  }

  bindSlider("slider-val-font-size", "label-val-font-size", "font_size");
  bindSlider("slider-val-line-height", "label-val-line-height", "line_height");
  bindSlider("slider-val-letter-spacing", "label-val-letter-spacing", "letter_spacing");

  // Shape Property Handlers
  if (document.getElementById("select-shape-type")) {
    document.getElementById("select-shape-type").addEventListener("change", (e) => {
      const val = e.target.value;
      updateSelectedLayerField("shape_type", val);
      toggleShapeControlGroups(val, state.currentTemplate.layout[state.selectedLayerIndex]);
    });
  }

  bindColorInput("picker-shape-color", "text-shape-color", (color) => {
    updateSelectedLayerField("color", color);
  });
  
  // Custom SVG Upload Logic
  const svgInput = document.getElementById("input-svg-upload");
  if (svgInput) {
    svgInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file && file.type === "image/svg+xml") {
        const reader = new FileReader();
        reader.onload = function(evt) {
          const rawSVG = evt.target.result;
          // Save the entire valid SVG document so Flutter can parse it
          updateSelectedLayerField("svg_content", rawSVG);
        };
        reader.readAsText(file);
      } else {
        showToast("Please upload a valid SVG file", "error");
      }
    });
  }

  bindSlider("slider-val-corner-radius", "label-val-corner-radius", "corner_radius");
  bindSlider("slider-val-stroke-width", "label-val-stroke-width", "stroke_width");
  bindSlider("slider-val-sides", "label-val-sides", "sides");
  bindSlider("slider-val-points", "label-val-points", "points");

  // Phone Mockup Property Handlers
  if (document.getElementById("select-phone-style")) {
    document.getElementById("select-phone-style").addEventListener("change", (e) => {
      updateSelectedLayerField("style", e.target.value);
    });

    document.getElementById("checkbox-phone-shadow").addEventListener("change", (e) => {
      updateSelectedLayerField("shadow", e.target.checked);
    });
  }

  bindColorInput("picker-phone-frame", "text-phone-frame", (color) => {
    updateSelectedLayerField("frame_color", color);
  });

  bindSlider("slider-val-phone-bezel", "label-val-phone-bezel", "bezel");
  bindSlider("slider-val-phone-radius", "label-val-phone-radius", "radius");

  // Badge Property Handlers
  if (document.getElementById("input-badge-content")) {
    document.getElementById("input-badge-content").addEventListener("input", (e) => {
      updateSelectedLayerField("content", e.target.value);
    });

    document.getElementById("input-badge-icon").addEventListener("input", (e) => {
      updateSelectedLayerField("icon", e.target.value);
    });
  }

  bindColorInput("picker-badge-bg", "text-badge-bg", (color) => {
    updateSelectedLayerField("color", color);
  });

  bindColorInput("picker-badge-text", "text-badge-text", (color) => {
    updateSelectedLayerField("text_color", color);
  });

  // Feature Row Property Handlers
  if (document.getElementById("input-feature-content")) {
    document.getElementById("input-feature-content").addEventListener("input", (e) => {
      updateSelectedLayerField("content", e.target.value);
    });

    document.getElementById("input-feature-icon").addEventListener("input", (e) => {
      updateSelectedLayerField("icon", e.target.value);
    });
  }

  bindColorInput("picker-feature-icon-bg", "text-feature-icon-bg", (color) => {
    updateSelectedLayerField("icon_bg", color);
  });

  bindColorInput("picker-feature-icon-color", "text-feature-icon-color", (color) => {
    updateSelectedLayerField("icon_color", color);
  });

  // Frosted Panel Handlers
  bindSlider("slider-val-frosted-blur", "label-val-frosted-blur", "blur");
  
  bindColorInput("picker-frosted-tint", "text-frosted-tint", (color) => {
    updateSelectedLayerField("color", color);
  });

  if (document.getElementById("slider-val-frosted-opacity")) {
    document.getElementById("slider-val-frosted-opacity").addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById("label-val-frosted-opacity").textContent = `${Math.round(val * 100)}%`;
      updateSelectedLayerField("opacity", val);
    });
  }
  
  bindColorInput("picker-frosted-border", "text-frosted-border", (color) => {
    updateSelectedLayerField("border_color", color);
  });
}

function updateCanvasZoom() {
  document.getElementById("canvas-zoom-wrapper").style.transform = `scale(${state.canvasScale})`;
  document.getElementById("zoom-percentage").textContent = `${Math.round(state.canvasScale * 100)}%`;
}

function updateSelectedLayerField(field, value) {
  if (state.selectedLayerIndex < 0) return;
  state.currentTemplate.layout[state.selectedLayerIndex][field] = value;
  renderPreview();
  saveTemplateDraft();
}

// Helper: Bind input slider element to label value output and update target template state fields
function bindSlider(sliderId, labelId, fieldKey, isGlobalBg = false) {
  const slider = document.getElementById(sliderId);
  const label = document.getElementById(labelId);
  if (!slider || !label) return;
  
  slider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    label.textContent = val;
    
    if (isGlobalBg) {
      const bg = state.currentTemplate.layout.find(l => l.type === 'background');
      bg[fieldKey] = val;
      renderPreview();
    } else {
      updateSelectedLayerField(fieldKey, val);
    }
  });
}

// Helper: Synchronize standard input color pickers and text inputs, triggering updates in layout values
function bindColorInput(pickerId, textId, updateCallback) {
  const picker = document.getElementById(pickerId);
  const text = document.getElementById(textId);
  if (!picker || !text) return;

  picker.addEventListener("input", (e) => {
    const color = e.target.value;
    text.value = color.toUpperCase();
    updateCallback(color);
    saveTemplateDraft();
  });

  text.addEventListener("change", (e) => {
    let color = e.target.value.trim();
    // Validate standard hex formats
    if (/^#[0-9A-F]{6}$/i.test(color)) {
      picker.value = color;
      updateCallback(color);
      saveTemplateDraft();
    } else if (/^[0-9A-F]{6}$/i.test(color)) {
      color = "#" + color;
      picker.value = color;
      text.value = color.toUpperCase();
      updateCallback(color);
      saveTemplateDraft();
    } else {
      text.value = picker.value.toUpperCase();
    }
  });
}

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
  if (document.getElementById("main-editor-canvas")) {
    initEditor();
  }
});
