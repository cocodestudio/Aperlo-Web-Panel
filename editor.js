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

  // Total uses readout
  const usesCount = state.currentTemplate.totalUses || 0;
  const badgeUses = document.getElementById("label-template-uses");
  if (badgeUses) badgeUses.textContent = `${usesCount.toLocaleString()} uses`;
  const textMetaUses = document.getElementById("text-meta-uses");
  if (textMetaUses) textMetaUses.textContent = `${usesCount.toLocaleString()} app creators have used this template`;

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
    totalUses: 0,
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
    const bgType = layer.bg_type || (layer.grid_spacing ? 'grid' : (layer.dot_spacing ? 'dots' : (layer.stripe_spacing ? 'stripes' : (layer.ray_count ? 'rays' : (layer.gradient ? 'linear' : (layer.split_at !== undefined ? 'split' : 'solid'))))));
    let bgStyle = "";
    let innerSvg = "";

    const baseColor = layer.bg_color || layer.color || "#FAF9F6";
    const warp = Number(layer.bg_warp) || 0;

    if (bgType === 'grid') {
      bgStyle = `background-color: ${baseColor}; position: relative; overflow: hidden;`;
      const gridColor = layer.grid_color || layer.pattern_color || "#1A6B4A";
      const opacity = layer.grid_opacity !== undefined ? layer.grid_opacity : 0.15;
      const lineWidth = layer.grid_line_width || 1.5;
      const spacing = layer.grid_spacing || 32;
      const angle = layer.grid_angle || 0;

      if (warp > 0) {
        let gridPaths = "";
        const diag = Math.sqrt(390 * 390 + 844 * 844);
        if (angle !== 0) {
          for (let x = -diag; x <= diag; x += spacing) {
            let d = `M ${(x + Math.sin(-diag / 45 + x / 60) * (30 * warp)).toFixed(1)} ${-diag}`;
            for (let y = -diag + 15; y <= diag; y += 15) {
              const dx = Math.sin(y / 45 + x / 60) * (30 * warp);
              d += ` L ${(x + dx).toFixed(1)} ${y}`;
            }
            gridPaths += `<path d="${d}" fill="none" stroke="${gridColor}" stroke-width="${lineWidth}" stroke-opacity="${opacity}"/>`;
          }
          for (let y = -diag; y <= diag; y += spacing) {
            let d = `M ${-diag} ${(y + Math.cos(-diag / 45 + y / 60) * (30 * warp)).toFixed(1)}`;
            for (let x = -diag + 15; x <= diag; x += 15) {
              const dy = Math.cos(x / 45 + y / 60) * (30 * warp);
              d += ` L ${x} ${(y + dy).toFixed(1)}`;
            }
            gridPaths += `<path d="${d}" fill="none" stroke="${gridColor}" stroke-width="${lineWidth}" stroke-opacity="${opacity}"/>`;
          }
          innerSvg = `
            <svg viewBox="0 0 390 844" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
              <g transform="translate(195, 422) rotate(${angle})">
                ${gridPaths}
              </g>
            </svg>`;
        } else {
          for (let x = 0; x <= 390 + spacing; x += spacing) {
            let d = `M ${(x + Math.sin(x / 60) * (30 * warp)).toFixed(1)} 0`;
            for (let y = 15; y <= 844 + 15; y += 15) {
              const dx = Math.sin(y / 45 + x / 60) * (30 * warp);
              d += ` L ${(x + dx).toFixed(1)} ${y}`;
            }
            gridPaths += `<path d="${d}" fill="none" stroke="${gridColor}" stroke-width="${lineWidth}" stroke-opacity="${opacity}"/>`;
          }
          for (let y = 0; y <= 844 + spacing; y += spacing) {
            let d = `M 0 ${(y + Math.cos(y / 60) * (30 * warp)).toFixed(1)}`;
            for (let x = 15; x <= 390 + 15; x += 15) {
              const dy = Math.cos(x / 45 + y / 60) * (30 * warp);
              d += ` L ${x} ${(y + dy).toFixed(1)}`;
            }
            gridPaths += `<path d="${d}" fill="none" stroke="${gridColor}" stroke-width="${lineWidth}" stroke-opacity="${opacity}"/>`;
          }
          innerSvg = `
            <svg viewBox="0 0 390 844" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
              ${gridPaths}
            </svg>`;
        }
      } else {
        innerSvg = `
          <svg width="100%" height="100%" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
            <defs>
              <pattern id="bg-grid-pattern-${index}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle} 50 50)">
                <path d="M ${spacing} 0 L 0 0 0 ${spacing}" fill="none" stroke="${gridColor}" stroke-width="${lineWidth}" stroke-opacity="${opacity}"/>
              </pattern>
            </defs>
            <rect x="-100%" y="-100%" width="300%" height="300%" fill="url(#bg-grid-pattern-${index})"/>
          </svg>`;
      }
    } else if (bgType === 'dots') {
      bgStyle = `background-color: ${baseColor}; position: relative; overflow: hidden;`;
      const dotColor = layer.dot_color || layer.pattern_color || "#1A6B4A";
      const opacity = layer.dot_opacity !== undefined ? layer.dot_opacity : 0.20;
      const dotSize = layer.dot_size || 3;
      const spacing = layer.dot_spacing || 24;

      if (warp > 0) {
        let dotElements = "";
        for (let x = spacing / 2; x < 390 + spacing; x += spacing) {
          for (let y = spacing / 2; y < 844 + spacing; y += spacing) {
            const dx = Math.sin(y / 40 + x / 50) * (25 * warp);
            const dy = Math.cos(x / 40 + y / 50) * (25 * warp);
            dotElements += `<circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${dotSize / 2}" fill="${dotColor}" fill-opacity="${opacity}"/>`;
          }
        }
        innerSvg = `
          <svg viewBox="0 0 390 844" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
            ${dotElements}
          </svg>`;
      } else {
        innerSvg = `
          <svg width="100%" height="100%" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
            <defs>
              <pattern id="bg-dots-pattern-${index}" width="${spacing}" height="${spacing}" patternUnits="userSpaceOnUse">
                <circle cx="${spacing/2}" cy="${spacing/2}" r="${dotSize/2}" fill="${dotColor}" fill-opacity="${opacity}"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#bg-dots-pattern-${index})"/>
          </svg>`;
      }
    } else if (bgType === 'stripes') {
      bgStyle = `background-color: ${baseColor}; position: relative; overflow: hidden;`;
      const stripeColor = layer.stripe_color || layer.pattern_color || "#1A6B4A";
      const opacity = layer.stripe_opacity !== undefined ? layer.stripe_opacity : 0.15;
      const stripeWidth = layer.stripe_width || 8;
      const spacing = layer.stripe_spacing || 28;
      const angle = layer.stripe_angle !== undefined ? layer.stripe_angle : 45;
      const step = spacing + stripeWidth;

      if (warp > 0) {
        let stripePaths = "";
        const diag = Math.sqrt(390 * 390 + 844 * 844);
        for (let x = -diag; x <= diag; x += step) {
          let d = `M ${(x + Math.sin(-diag / 40) * (25 * warp)).toFixed(1)} ${-diag}`;
          for (let y = -diag + 20; y <= diag; y += 20) {
            const dx = Math.sin(y / 40) * (25 * warp);
            d += ` L ${(x + dx).toFixed(1)} ${y}`;
          }
          stripePaths += `<path d="${d}" fill="none" stroke="${stripeColor}" stroke-width="${stripeWidth}" stroke-opacity="${opacity}"/>`;
        }
        innerSvg = `
          <svg viewBox="0 0 390 844" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
            <g transform="translate(195, 422) rotate(${angle})">
              ${stripePaths}
            </g>
          </svg>`;
      } else {
        innerSvg = `
          <svg width="100%" height="100%" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
            <defs>
              <pattern id="bg-stripes-pattern-${index}" width="${step}" height="${step}" patternTransform="rotate(${angle} 50 50)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="${step}" stroke="${stripeColor}" stroke-width="${stripeWidth}" stroke-opacity="${opacity}"/>
              </pattern>
            </defs>
            <rect x="-100%" y="-100%" width="300%" height="300%" fill="url(#bg-stripes-pattern-${index})"/>
          </svg>`;
      }
    } else if (bgType === 'rays') {
      bgStyle = `background-color: ${baseColor}; position: relative; overflow: hidden;`;
      const rayColor = layer.ray_color || layer.pattern_color || "#1A6B4A";
      const opacity = layer.ray_opacity !== undefined ? layer.ray_opacity : 0.15;
      const count = layer.ray_count || 16;
      const stepDeg = 360 / count;

      let rayPaths = "";
      const radius = 2000;
      for (let r = 0; r < count; r += 2) {
        const a1 = (r * stepDeg * Math.PI) / 180;
        const a2 = ((r + 1) * stepDeg * Math.PI) / 180;
        if (warp > 0) {
          let d = "M 500 500";
          for (let rad = 30; rad <= radius; rad += 30) {
            const curA = a1 + (rad / radius) * (warp * 1.5);
            d += ` L ${(500 + rad * Math.cos(curA)).toFixed(1)} ${(500 + rad * Math.sin(curA)).toFixed(1)}`;
          }
          for (let rad = radius; rad >= 0; rad -= 30) {
            const curA = a2 + (rad / radius) * (warp * 1.5);
            d += ` L ${(500 + rad * Math.cos(curA)).toFixed(1)} ${(500 + rad * Math.sin(curA)).toFixed(1)}`;
          }
          d += " Z";
          rayPaths += `<path d="${d}" fill="${rayColor}" fill-opacity="${opacity}"/>`;
        } else {
          const x1 = 500 + radius * Math.cos(a1);
          const y1 = 500 + radius * Math.sin(a1);
          const x2 = 500 + radius * Math.cos(a2);
          const y2 = 500 + radius * Math.sin(a2);
          rayPaths += `<path d="M 500 500 L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${rayColor}" fill-opacity="${opacity}"/>`;
        }
      }

      innerSvg = `
        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
          ${rayPaths}
        </svg>`;
    } else if (bgType === 'linear' || (layer.gradient && layer.gradient.length >= 2)) {
      const grad = layer.gradient || ['#0082FF', '#0040A3'];
      const beginCSS = ALIGNMENT_MAP[layer.begin] || "to bottom";
      if (warp > 0) {
        const c1 = grad[0];
        const c2 = grad[grad.length - 1];
        let waveD1 = "M 0 844";
        for (let x = 0; x <= 390 + 10; x += 10) {
          const y = 844 * 0.5 + Math.sin((x / 390) * 2 * Math.PI) * (70 * warp);
          waveD1 += ` L ${x} ${y.toFixed(1)}`;
        }
        waveD1 += ` L 390 844 Z`;

        let waveD2 = "M 0 0";
        for (let x = 0; x <= 390 + 10; x += 10) {
          const y = 844 * 0.35 + Math.cos((x / 390) * 2.5 * Math.PI) * (60 * warp);
          waveD2 += ` L ${x} ${y.toFixed(1)}`;
        }
        waveD2 += ` L 390 0 Z`;

        bgStyle = `background: linear-gradient(${beginCSS}, ${grad.join(", ")}); position: relative; overflow: hidden;`;
        innerSvg = `
          <svg viewBox="0 0 390 844" preserveAspectRatio="none" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
            <path d="${waveD1}" fill="${c2}" fill-opacity="${(0.55 * warp).toFixed(2)}"/>
            <path d="${waveD2}" fill="${c1}" fill-opacity="${(0.45 * warp).toFixed(2)}"/>
          </svg>`;
      } else {
        bgStyle = `background: linear-gradient(${beginCSS}, ${grad.join(", ")});`;
      }
    } else if (bgType === 'split' || layer.split_at !== undefined) {
      const topColor = layer.top_color || "#FAF9F6";
      const bottomColor = layer.bottom_color || "#F5F7F5";
      const splitRatio = layer.split_at !== undefined ? layer.split_at : 0.5;
      if (warp > 0) {
        const splitY = 844 * splitRatio;
        let waveD = `M 0 0 L 0 ${splitY.toFixed(1)}`;
        for (let x = 0; x <= 390 + 10; x += 10) {
          const wave = Math.sin((x / 390) * 2 * Math.PI) * (50 * warp) + Math.cos((x / 390) * 4 * Math.PI) * (20 * warp);
          waveD += ` L ${x} ${(splitY + wave).toFixed(1)}`;
        }
        waveD += ` L 390 0 Z`;
        bgStyle = `background-color: ${bottomColor}; position: relative; overflow: hidden;`;
        innerSvg = `
          <svg viewBox="0 0 390 844" preserveAspectRatio="none" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none;">
            <path d="${waveD}" fill="${topColor}"/>
          </svg>`;
      } else {
        const splitPercent = (splitRatio * 100) + "%";
        bgStyle = `background: linear-gradient(to bottom, ${topColor} ${splitPercent}, ${bottomColor} ${splitPercent});`;
      }
    } else {
      bgStyle = `background-color: ${baseColor};`;
    }
    return `<div class="preview-background" style="${bgStyle}" data-index="${index}">${innerSvg}</div>`;
  }

  // Calculate absolute pixel coordinates from normalized fractions
  const left = (layer.x || 0) * 390;
  const top = (layer.y || 0) * 844;
  const width = (layer.width || 0.8) * 390;
  // height can be optional or computed based on aspect ratio/type
  const height = layer.height ? (layer.height * 844) : 'auto';
  const rotZ = layer.rotation || 0;
  const rotX = layer.rotation_x || 0;
  const rotY = layer.rotation_y || 0;
  const opacity = layer.opacity !== undefined ? layer.opacity : 1;

  let innerContent = "";
  let elementStyles = `
    position: absolute;
    left: ${left}px;
    top: ${top}px;
    width: ${width}px;
    ${height !== 'auto' ? `height: ${height}px;` : ''}
    transform: perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) rotate(${rotZ}deg);
    transform-style: preserve-3d;
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

      // Calculate proportional scale factor relative to standard base mockup width (296.4px)
      const aspectRatio = layer.aspect_ratio || (19.5 / 9);
      const frameWidth = width;
      const frameHeight = width * aspectRatio;
      const scaleFactor = frameWidth / 296.4;
      
      const scaledBezel = bezel * scaleFactor;
      const scaledRadius = radius * scaleFactor;
      const scaledScreenRadius = Math.max(0, scaledRadius - scaledBezel / 2);

      let notchHtml = "";
      if (style === 'dynamic_island') {
        const nw = Math.round(85 * scaleFactor);
        const nh = Math.round(22 * scaleFactor);
        const nt = Math.round(scaledBezel + 4);
        const nr = Math.round(20 * scaleFactor);
        notchHtml = `<div class="phone-notch-overlay dynamic_island" style="width:${nw}px; height:${nh}px; top:${nt}px; border-radius:${nr}px;"></div>`;
      } else if (style === 'bar_notch') {
        const nw = Math.round(110 * scaleFactor);
        const nh = Math.round(20 * scaleFactor);
        const nt = Math.round(scaledBezel);
        const nr = Math.round(12 * scaleFactor);
        notchHtml = `<div class="phone-notch-overlay bar_notch" style="width:${nw}px; height:${nh}px; top:${nt}px; border-bottom-left-radius:${nr}px; border-bottom-right-radius:${nr}px;"></div>`;
      } else if (style === 'punch_hole') {
        const nw = Math.round(14 * scaleFactor);
        const nh = Math.round(14 * scaleFactor);
        const nt = Math.round(scaledBezel + 6);
        notchHtml = `<div class="phone-notch-overlay punch_hole" style="width:${nw}px; height:${nh}px; top:${nt}px; border-radius:50%;"></div>`;
      }

      const logoSize = Math.round(40 * scaleFactor);
      const titleFontSize = Math.round(22 * scaleFactor);
      const contentGap = Math.round(8 * scaleFactor);

      const screenImage = layer.image || layer.image_url || layer.screenshot || layer.screenshot_url;
      const screenContent = screenImage 
        ? `<img src="${screenImage}" style="width:100%; height:100%; object-fit:cover; position:absolute; inset:0; border-radius:inherit;">`
        : `<div style="width:100%; height:100%; position:absolute; inset:0; background:white; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#1A6B4A; font-family:var(--font-display, 'Outfit', sans-serif); box-sizing:border-box; gap: ${contentGap}px; border-radius:inherit;">
            <img src="logo.png" style="width:${logoSize}px; height:${logoSize}px; object-fit:cover; border-radius:50%;">
            <div style="text-align:center; font-weight:600; font-size:${titleFontSize}px;">
              Aperlo
            </div>
          </div>`;

      const depth = layer.depth !== undefined ? Math.round(layer.depth) : 0;
      const depthColor = layer.depth_color || '#0F0F10';

      const shadowStyleChoice = layer.shadow_style || (layer.shadow !== false ? 'standard' : 'none');
      let shadowStyle = 'box-shadow: none;';
      const depthShadows = [];
      if (depth > 0) {
        for (let i = 1; i <= depth; i++) {
          depthShadows.push(`${i}px ${i}px 0px ${depthColor}`);
        }
      }

      if (shadowStyleChoice === 'standard' || shadowStyleChoice === 'floating_3d') {
        const sf = scaleFactor;
        const d = depth > 0 ? depth : 0;
        const stdLayers = [
          `0 ${Math.round(16 * sf + d)}px ${Math.round(32 * sf)}px rgba(0, 0, 0, 0.22)`,
          `0 ${Math.round(4 * sf + d)}px ${Math.round(8 * sf)}px rgba(0, 0, 0, 0.10)`
        ];
        shadowStyle = `box-shadow: ${[...depthShadows, ...stdLayers].join(', ')};`;
      } else if (shadowStyleChoice === 'subtle') {
        const sf = scaleFactor;
        const d = depth > 0 ? depth : 0;
        shadowStyle = `box-shadow: ${[...depthShadows, `0 ${Math.round(8 * sf + d)}px ${Math.round(16 * sf)}px rgba(0, 0, 0, 0.14)`].join(', ')};`;
      } else if (depthShadows.length > 0) {
        shadowStyle = `box-shadow: ${depthShadows.join(', ')};`;
      }

      // 3D Oval Floor Cast Shadow
      const hasFloorShadow = layer.floor_shadow !== false && layer.shadow !== false;
      const sDist = (layer.shadow_distance !== undefined ? Number(layer.shadow_distance) : 35) * scaleFactor;
      const sBlur = (layer.shadow_blur !== undefined ? Number(layer.shadow_blur) : 22) * scaleFactor;
      const sWidthRatio = layer.shadow_width_ratio !== undefined ? Number(layer.shadow_width_ratio) : 0.85;
      const sHeightRatio = layer.shadow_height_ratio !== undefined ? Number(layer.shadow_height_ratio) : 0.14;
      const sOpacity = layer.shadow_opacity !== undefined ? Number(layer.shadow_opacity) : 0.35;
      const floorShadowColor = layer.shadow_color || '#000000';

      const sWidth = Math.round(frameWidth * sWidthRatio);
      const sHeight = Math.round(frameWidth * sHeightRatio);

      let floorShadowHtml = "";
      if (hasFloorShadow) {
        floorShadowHtml = `
          <div class="floor-oval-shadow" style="
            position: absolute;
            left: 50%;
            bottom: -${Math.round(sDist + sHeight / 2)}px;
            transform: translateX(-50%);
            width: ${sWidth}px;
            height: ${sHeight}px;
            background: radial-gradient(ellipse at center, ${floorShadowColor} 0%, rgba(0,0,0,0) 75%);
            filter: blur(${Math.round(sBlur)}px);
            opacity: ${sOpacity};
            border-radius: 50%;
            pointer-events: none;
            z-index: 0;
          "></div>
        `;
      }

      elementStyles += `
        height: ${frameHeight}px;
      `;

      innerContent = `
        <div class="mockup-container" style="position: relative; overflow: visible;">
          ${floorShadowHtml}
          <div class="phone-bezel-frame" style="position: relative; z-index: 1; width: ${frameWidth}px; height: ${frameHeight}px; border-radius: ${scaledRadius}px; padding: ${scaledBezel}px; background-color: ${frameColor}; ${shadowStyle}">
            <!-- Simulated Notch cutout overlay -->
            ${notchHtml}
            
            <div class="phone-screen-area" style="border-radius: ${scaledScreenRadius}px;">
              ${screenContent}
            </div>
          </div>
        </div>
      `;
      break;

    case 'pattern':
    case 'pattern_overlay': {
      const pType = layer.pattern_type || layer.bg_type || 'grid';
      const pColor = layer.color || layer.pattern_color || '#1A6B4A';
      const pOpacity = Number(layer.opacity !== undefined ? layer.opacity : (layer.pattern_opacity !== undefined ? layer.pattern_opacity : 0.25));
      const pWarp = Number(layer.bg_warp !== undefined ? layer.bg_warp : (layer.warp || 0));
      
      const pWidth = (width !== 'auto') ? width : 390;
      const pHeight = (height !== 'auto') ? height : 844;
      elementStyles += `height: ${pHeight}px; pointer-events: auto;`;

      let patternSvg = "";
      if (pType === 'grid') {
        const spacing = Number(layer.grid_spacing) || 32;
        const lineWidth = Number(layer.grid_line_width) || 1.5;
        const angle = Number(layer.grid_angle) || 0;
        
        if (angle !== 0) {
          const diag = Math.sqrt(pWidth * pWidth + pHeight * pHeight);
          let gridPaths = "";
          if (pWarp > 0) {
            for (let x = -diag; x <= diag; x += spacing) {
              let d = `M ${(x + Math.sin(-diag / 45 + x / 60) * (30 * pWarp)).toFixed(1)} ${-diag}`;
              for (let y = -diag + 15; y <= diag; y += 15) {
                const dx = Math.sin(y / 45 + x / 60) * (30 * pWarp);
                d += ` L ${(x + dx).toFixed(1)} ${y.toFixed(1)}`;
              }
              gridPaths += `<path d="${d}" stroke="${pColor}" stroke-width="${lineWidth}" fill="none" opacity="${pOpacity}" />`;
            }
            for (let y = -diag; y <= diag; y += spacing) {
              let d = `M ${-diag} ${(y + Math.cos(-diag / 45 + y / 60) * (30 * pWarp)).toFixed(1)}`;
              for (let x = -diag + 15; x <= diag; x += 15) {
                const dy = Math.cos(x / 45 + y / 60) * (30 * pWarp);
                d += ` L ${(x + dy).toFixed(1)} ${(y + dy).toFixed(1)}`;
              }
              gridPaths += `<path d="${d}" stroke="${pColor}" stroke-width="${lineWidth}" fill="none" opacity="${pOpacity}" />`;
            }
          } else {
            for (let x = -diag; x <= diag; x += spacing) {
              gridPaths += `<line x1="${x}" y1="${-diag}" x2="${x}" y2="${diag}" stroke="${pColor}" stroke-width="${lineWidth}" opacity="${pOpacity}" />`;
            }
            for (let y = -diag; y <= diag; y += spacing) {
              gridPaths += `<line x1="${-diag}" y1="${y}" x2="${diag}" y2="${y}" stroke="${pColor}" stroke-width="${lineWidth}" opacity="${pOpacity}" />`;
            }
          }
          patternSvg = `<svg width="100%" height="100%" viewBox="0 0 ${pWidth} ${pHeight}" style="display:block; overflow:hidden;"><g transform="translate(${pWidth/2} ${pHeight/2}) rotate(${angle})">${gridPaths}</g></svg>`;
        } else {
          let gridPaths = "";
          if (pWarp > 0) {
            for (let x = 0; x <= pWidth + spacing; x += spacing) {
              let d = `M ${(x + Math.sin(x / 60) * (30 * pWarp)).toFixed(1)} 0`;
              for (let y = 15; y <= pHeight + 15; y += 15) {
                const dx = Math.sin(y / 45 + x / 60) * (30 * pWarp);
                d += ` L ${(x + dx).toFixed(1)} ${y.toFixed(1)}`;
              }
              gridPaths += `<path d="${d}" stroke="${pColor}" stroke-width="${lineWidth}" fill="none" opacity="${pOpacity}" />`;
            }
            for (let y = 0; y <= pHeight + spacing; y += spacing) {
              let d = `M 0 ${(y + Math.cos(y / 60) * (30 * pWarp)).toFixed(1)}`;
              for (let x = 15; x <= pWidth + 15; x += 15) {
                const dy = Math.cos(x / 45 + y / 60) * (30 * pWarp);
                d += ` L ${x.toFixed(1)} ${(y + dy).toFixed(1)}`;
              }
              gridPaths += `<path d="${d}" stroke="${pColor}" stroke-width="${lineWidth}" fill="none" opacity="${pOpacity}" />`;
            }
          } else {
            for (let x = 0; x <= pWidth + 1; x += spacing) {
              gridPaths += `<line x1="${x}" y1="0" x2="${x}" y2="${pHeight}" stroke="${pColor}" stroke-width="${lineWidth}" opacity="${pOpacity}" />`;
            }
            for (let y = 0; y <= pHeight + 1; y += spacing) {
              gridPaths += `<line x1="0" y1="${y}" x2="${pWidth}" y2="${y}" stroke="${pColor}" stroke-width="${lineWidth}" opacity="${pOpacity}" />`;
            }
          }
          patternSvg = `<svg width="100%" height="100%" viewBox="0 0 ${pWidth} ${pHeight}" style="display:block; overflow:hidden;">${gridPaths}</svg>`;
        }
      } else if (pType === 'dots') {
        const dotSize = Number(layer.dot_size) || 4;
        const spacing = Number(layer.dot_spacing) || 24;
        let dots = "";
        for (let x = spacing / 2; x < pWidth + spacing; x += spacing) {
          for (let y = spacing / 2; y < pHeight + spacing; y += spacing) {
            const dx = pWarp > 0 ? Math.sin(y / 40 + x / 50) * (25 * pWarp) : 0;
            const dy = pWarp > 0 ? Math.cos(x / 40 + y / 50) * (25 * pWarp) : 0;
            dots += `<circle cx="${(x + dx).toFixed(1)}" cy="${(y + dy).toFixed(1)}" r="${dotSize / 2}" fill="${pColor}" opacity="${pOpacity}" />`;
          }
        }
        patternSvg = `<svg width="100%" height="100%" viewBox="0 0 ${pWidth} ${pHeight}" style="display:block; overflow:hidden;">${dots}</svg>`;
      } else if (pType === 'stripes') {
        const stripeW = Number(layer.stripe_width) || 8;
        const spacing = Number(layer.stripe_spacing) || 28;
        const angle = Number(layer.stripe_angle) || 45;
        const diag = Math.sqrt(pWidth * pWidth + pHeight * pHeight);
        const step = spacing + stripeW;
        let stripes = "";
        if (pWarp > 0) {
          for (let x = -diag; x <= diag; x += step) {
            let d = `M ${(x + Math.sin(-diag / 40) * (25 * pWarp)).toFixed(1)} ${-diag}`;
            for (let y = -diag + 15; y <= diag; y += 15) {
              const dx = Math.sin(y / 40) * (25 * pWarp);
              d += ` L ${(x + dx).toFixed(1)} ${y.toFixed(1)}`;
            }
            stripes += `<path d="${d}" stroke="${pColor}" stroke-width="${stripeW}" fill="none" opacity="${pOpacity}" />`;
          }
        } else {
          for (let x = -diag; x <= diag; x += step) {
            stripes += `<line x1="${x}" y1="${-diag}" x2="${x}" y2="${diag}" stroke="${pColor}" stroke-width="${stripeW}" opacity="${pOpacity}" />`;
          }
        }
        patternSvg = `<svg width="100%" height="100%" viewBox="0 0 ${pWidth} ${pHeight}" style="display:block; overflow:hidden;"><g transform="translate(${pWidth/2} ${pHeight/2}) rotate(${angle})">${stripes}</g></svg>`;
      } else if (pType === 'rays') {
        const count = Number(layer.ray_count) || 16;
        const diag = Math.sqrt(pWidth * pWidth + pHeight * pHeight);
        const stepA = (2 * Math.PI) / count;
        let rays = "";
        for (let i = 0; i < count; i += 2) {
          const a1 = i * stepA;
          const a2 = a1 + stepA;
          if (pWarp > 0) {
            let d = `M ${pWidth/2} ${pHeight/2}`;
            for (let r = 15; r <= diag; r += 15) {
              const ca = a1 + (r / diag) * (pWarp * 1.5);
              d += ` L ${pWidth/2 + r * Math.cos(ca)} ${pHeight/2 + r * Math.sin(ca)}`;
            }
            for (let r = diag; r >= 0; r -= 15) {
              const ca = a2 + (r / diag) * (pWarp * 1.5);
              d += ` L ${pWidth/2 + r * Math.cos(ca)} ${pHeight/2 + r * Math.sin(ca)}`;
            }
            d += " Z";
            rays += `<path d="${d}" fill="${pColor}" opacity="${pOpacity}" />`;
          } else {
            const x1 = pWidth/2 + diag * Math.cos(a1);
            const y1 = pHeight/2 + diag * Math.sin(a1);
            const x2 = pWidth/2 + diag * Math.cos(a2);
            const y2 = pHeight/2 + diag * Math.sin(a2);
            rays += `<polygon points="${pWidth/2},${pHeight/2} ${x1},${y1} ${x2},${y2}" fill="${pColor}" opacity="${pOpacity}" />`;
          }
        }
        patternSvg = `<svg width="100%" height="100%" viewBox="0 0 ${pWidth} ${pHeight}" style="display:block; overflow:hidden;">${rays}</svg>`;
      }
      innerContent = patternSvg;
      break;
    }
    case 'shape':
      const sType = layer.shape_type || 'circle';
      const isGradient = layer.fill_type === 'gradient' || (layer.fill_type !== 'solid' && layer.gradient_colors && layer.gradient_colors.length >= 2);
      const gradColors = (layer.gradient_colors && layer.gradient_colors.length >= 2)
        ? layer.gradient_colors 
        : [layer.color || '#1A6B4A', layer.color_2 || '#2E9F6E'];
      const sColor = layer.color || '#1A6B4A';
      const gradAngle = layer.gradient_angle !== undefined ? Number(layer.gradient_angle) : 135;

      const shapeWidth = width;
      // if height is auto or missing, match width (square bounding box for circles/stars)
      const shapeHeight = height !== 'auto' ? height : shapeWidth;

      elementStyles += `
        height: ${shapeHeight}px;
      `;

      const angleRad = (gradAngle - 90) * (Math.PI / 180);
      const x1 = Math.round(50 + 50 * Math.cos(angleRad + Math.PI));
      const y1 = Math.round(50 + 50 * Math.sin(angleRad + Math.PI));
      const x2 = Math.round(50 + 50 * Math.cos(angleRad));
      const y2 = Math.round(50 + 50 * Math.sin(angleRad));
      const gradId = `shapeGrad_${index}_${Math.abs(Math.round(gradAngle))}`;

      const defsCode = isGradient ? `
        <defs>
          <linearGradient id="${gradId}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">
            <stop offset="0%" stop-color="${gradColors[0]}" />
            <stop offset="100%" stop-color="${gradColors[1]}" />
          </linearGradient>
        </defs>
      ` : '';

      const fillValue = isGradient ? `url(#${gradId})` : sColor;
      const strokeValue = isGradient ? `url(#${gradId})` : sColor;

      let svgCode = "";
      if (sType === 'svg' && layer.svg_content) {
        const encodedSvg = encodeURIComponent(layer.svg_content).replace(/'/g, "%27").replace(/"/g, "%22");
        const bgCSS = isGradient 
          ? `linear-gradient(${gradAngle}deg, ${gradColors[0]}, ${gradColors[1]})` 
          : sColor;
        innerContent = `
          <div style="width: 100%; height: 100%; background: ${bgCSS}; 
               -webkit-mask: url('data:image/svg+xml;utf8,${encodedSvg}') no-repeat center; 
               -webkit-mask-size: contain; 
               mask: url('data:image/svg+xml;utf8,${encodedSvg}') no-repeat center; 
               mask-size: contain;">
          </div>
        `;
      } else {
        if (sType === 'circle') {
          svgCode = `<circle cx="50" cy="50" r="48" fill="${fillValue}" />`;
        } else if (sType === 'rect') {
          svgCode = `<rect x="2" y="2" width="96" height="96" fill="${fillValue}" />`;
        } else if (sType === 'rounded_rect') {
          const rad = layer.corner_radius || 16;
          svgCode = `<rect x="2" y="2" width="96" height="96" rx="${rad}" ry="${rad}" fill="${fillValue}" />`;
        } else if (sType === 'ring') {
          const strokeW = layer.stroke_width || 8;
          svgCode = `<circle cx="50" cy="50" r="${50 - strokeW}" fill="none" stroke="${strokeValue}" stroke-width="${strokeW}" />`;
        } else if (sType === 'arc') {
          svgCode = `<path d="M 50,10 A 40,40 0 0,1 90,50 L 50,50 Z" fill="${fillValue}" />`;
        } else if (sType === 'polygon') {
          const sides = layer.sides || 6;
          let points = [];
          for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
            const x = 50 + 46 * Math.cos(angle);
            const y = 50 + 46 * Math.sin(angle);
            points.push(`${x},${y}`);
          }
          svgCode = `<polygon points="${points.join(' ')}" fill="${fillValue}" />`;
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
          svgCode = `<polygon points="${coords.join(' ')}" fill="${fillValue}" />`;
        } else if (sType === 'diamond') {
          svgCode = `<polygon points="50,4 96,50 50,96 4,50" fill="${fillValue}" />`;
        } else if (sType === 'heart') {
          svgCode = `<path d="M 50,25 C 50,10 20,10 20,35 C 20,55 35,72 50,90 C 65,72 80,55 80,35 C 80,10 50,10 50,25 Z" fill="${fillValue}" />`;
        } else if (sType === 'cross') {
          svgCode = `<polygon points="40,4 60,4 60,40 96,40 96,60 60,60 60,96 40,96 40,60 4,60 4,40 40,40" fill="${fillValue}" />`;
        } else if (sType === 'diagonal_split') {
          svgCode = `<polygon points="0,0 100,0 0,100" fill="${fillValue}" /><polygon points="100,0 100,100 0,100" fill="${layer.color2 || '#2E9F6E'}" opacity="0.8" />`;
        } else if (sType === 'blob') {
          svgCode = `<path d="M25,-32.8C33.3,-29.4,41.6,-22.9,46,-14.2C50.5,-5.5,51,5.5,47,15.1C43,24.7,34.4,32.8,25,37.3C15.6,41.8,5.3,42.7,-4.8,40.4C-14.8,38.1,-24.6,32.7,-32.1,25C-39.7,17.4,-44.9,7.6,-46.1,-3.1C-47.3,-13.7,-44.4,-25.1,-37.2,-31C-30,-37,-18.6,-37.4,-8.6,-38.7C1.5,-40.1,16.8,-36.2,25,-32.8Z" transform="translate(50 50) scale(0.9)" fill="${fillValue}" />`;
        }

        innerContent = `
          <svg viewBox="0 0 100 100" width="100%" height="100%" style="display:block;">
            ${defsCode}
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
      const featIcon = layer.icon || "âœ”";
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
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); // Prevents browser image ghost dragging & text selection
      e.stopPropagation(); // Prevents deselecting canvas
      
      const idx = parseInt(el.getAttribute("data-index"));
      if (idx === undefined || isNaN(idx)) return;
      
      selectLayer(idx);

      // Setup dragging state
      state.isDragging = true;
      state.dragStartX = e.clientX;
      state.dragStartY = e.clientY;

      const layerData = state.currentTemplate.layout[idx];
      state.dragInitialX = layerData.x !== undefined ? parseFloat(layerData.x) : (layerData.cx !== undefined ? parseFloat(layerData.cx) - (parseFloat(layerData.width || 0.8) / 2) : 0);
      state.dragInitialY = layerData.y !== undefined ? parseFloat(layerData.y) : (layerData.cy !== undefined ? parseFloat(layerData.cy) - (parseFloat(layerData.height || 0.4) / 2) : 0);
      
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
  e.preventDefault();

  const dx = e.clientX - state.dragStartX;
  const dy = e.clientY - state.dragStartY;

  // Virtual canvas is exactly 390x844
  const canvasW = 390;
  const canvasH = 844;
  const zoomScale = state.canvasScale || 1.0;
  
  const targetLayer = state.currentTemplate.layout[state.selectedLayerIndex];
  const newX = parseFloat((state.dragInitialX + (dx / zoomScale) / canvasW).toFixed(3));
  const newY = parseFloat((state.dragInitialY + (dy / zoomScale) / canvasH).toFixed(3));

  targetLayer.x = Math.max(-0.5, Math.min(1.5, newX));
  targetLayer.y = Math.max(-0.5, Math.min(1.5, newY));

  // Directly update active layer element style for instant 60fps responsiveness
  const activeEl = document.querySelector(`.preview-layer[data-index="${state.selectedLayerIndex}"]`);
  if (activeEl) {
    activeEl.style.left = `${targetLayer.x * 390}px`;
    activeEl.style.top = `${targetLayer.y * 844}px`;
  }

  // Update inputs if available
  const inputX = document.getElementById("slider-val-x");
  const labelX = document.getElementById("label-val-x");
  const inputY = document.getElementById("slider-val-y");
  const labelY = document.getElementById("label-val-y");
  if (inputX) inputX.value = targetLayer.x;
  if (labelX) labelX.textContent = targetLayer.x;
  if (inputY) inputY.value = targetLayer.y;
  if (labelY) labelY.textContent = targetLayer.y;
});

document.addEventListener("mouseup", () => {
  if (state.isDragging) {
    state.isDragging = false;
    saveTemplateDraft();
    renderPreview();
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
    if (layer.type === 'pattern' || layer.type === 'pattern_overlay') iconName = "grid";
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
  const targetLayer = (index === -2 || (index >= 0 && state.currentTemplate.layout[index]?.type === 'background'))
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
  document.getElementById("section-prop-pattern")?.classList.add("hidden");

  if (index === -2 || (targetLayer && targetLayer.type === 'background')) {
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
    document.getElementById("label-val-rotation").textContent = `${targetLayer.rotation || 0}Â°`;
    document.getElementById("slider-val-rotation-x").value = targetLayer.rotation_x || 0;
    document.getElementById("label-val-rotation-x").textContent = `${targetLayer.rotation_x || 0}Â°`;
    document.getElementById("slider-val-rotation-y").value = targetLayer.rotation_y || 0;
    document.getElementById("label-val-rotation-y").textContent = `${targetLayer.rotation_y || 0}Â°`;
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
    
    else if (targetLayer.type === 'pattern' || targetLayer.type === 'pattern_overlay') {
      document.getElementById("section-pos-dims").classList.remove("hidden");
      const secPattern = document.getElementById("section-prop-pattern");
      if (secPattern) {
        secPattern.classList.remove("hidden");
        const pType = targetLayer.pattern_type || targetLayer.bg_type || 'grid';
        document.getElementById("select-pattern-type").value = pType;
        togglePatternControlGroups(pType);

        const pColor = targetLayer.color || targetLayer.pattern_color || '#1A6B4A';
        document.getElementById("picker-pattern-color").value = pColor;
        document.getElementById("text-pattern-color").value = pColor;

        const pOpacity = targetLayer.opacity !== undefined ? targetLayer.opacity : (targetLayer.pattern_opacity !== undefined ? targetLayer.pattern_opacity : 0.25);
        document.getElementById("slider-pattern-opacity").value = Math.round(pOpacity * 100);
        document.getElementById("val-pattern-opacity").textContent = `${Math.round(pOpacity * 100)}%`;

        if (document.getElementById("slider-pattern-grid-spacing")) {
          document.getElementById("slider-pattern-grid-spacing").value = targetLayer.grid_spacing || 32;
          document.getElementById("val-pattern-grid-spacing").textContent = `${targetLayer.grid_spacing || 32}px`;
        }
        if (document.getElementById("slider-pattern-grid-linewidth")) {
          document.getElementById("slider-pattern-grid-linewidth").value = targetLayer.grid_line_width || 1.5;
          document.getElementById("val-pattern-grid-linewidth").textContent = `${targetLayer.grid_line_width || 1.5}px`;
        }
        if (document.getElementById("slider-pattern-grid-angle")) {
          document.getElementById("slider-pattern-grid-angle").value = targetLayer.grid_angle || 0;
          document.getElementById("val-pattern-grid-angle").textContent = `${targetLayer.grid_angle || 0}°`;
        }
        if (document.getElementById("slider-pattern-dot-size")) {
          document.getElementById("slider-pattern-dot-size").value = targetLayer.dot_size || 4;
          document.getElementById("val-pattern-dot-size").textContent = `${targetLayer.dot_size || 4}px`;
        }
        if (document.getElementById("slider-pattern-dot-spacing")) {
          document.getElementById("slider-pattern-dot-spacing").value = targetLayer.dot_spacing || 24;
          document.getElementById("val-pattern-dot-spacing").textContent = `${targetLayer.dot_spacing || 24}px`;
        }
        if (document.getElementById("slider-pattern-stripe-width")) {
          document.getElementById("slider-pattern-stripe-width").value = targetLayer.stripe_width || 8;
          document.getElementById("val-pattern-stripe-width").textContent = `${targetLayer.stripe_width || 8}px`;
        }
        if (document.getElementById("slider-pattern-stripe-spacing")) {
          document.getElementById("slider-pattern-stripe-spacing").value = targetLayer.stripe_spacing || 28;
          document.getElementById("val-pattern-stripe-spacing").textContent = `${targetLayer.stripe_spacing || 28}px`;
        }
        if (document.getElementById("slider-pattern-stripe-angle")) {
          document.getElementById("slider-pattern-stripe-angle").value = targetLayer.stripe_angle || 45;
          document.getElementById("val-pattern-stripe-angle").textContent = `${targetLayer.stripe_angle || 45}°`;
        }
        if (document.getElementById("slider-pattern-ray-count")) {
          document.getElementById("slider-pattern-ray-count").value = targetLayer.ray_count || 16;
          document.getElementById("val-pattern-ray-count").textContent = `${targetLayer.ray_count || 16}`;
        }
        if (document.getElementById("slider-pattern-warp")) {
          const warp = targetLayer.bg_warp !== undefined ? targetLayer.bg_warp : (targetLayer.warp || 0);
          document.getElementById("slider-pattern-warp").value = Math.round(warp * 100);
          document.getElementById("val-pattern-warp").textContent = `${Math.round(warp * 100)}%`;
        }
      }
    }
    else if (targetLayer.type === 'shape') {
      document.getElementById("section-prop-shape").classList.remove("hidden");
      
      document.getElementById("select-shape-type").value = targetLayer.shape_type || "circle";
      
      const isGrad = targetLayer.fill_type === 'gradient' || (targetLayer.gradient_colors && targetLayer.gradient_colors.length >= 2);
      const fillTypeSelect = document.getElementById("select-shape-fill-type");
      if (fillTypeSelect) fillTypeSelect.value = isGrad ? "gradient" : "solid";

      const solidGroup = document.getElementById("group-shape-solid");
      const gradGroup = document.getElementById("group-shape-gradient");
      if (solidGroup && gradGroup) {
        solidGroup.classList.toggle("hidden", isGrad);
        gradGroup.classList.toggle("hidden", !isGrad);
      }

      document.getElementById("picker-shape-color").value = targetLayer.color || "#1A6B4A";
      document.getElementById("text-shape-color").value = targetLayer.color || "#1A6B4A";

      const gradColors = targetLayer.gradient_colors && targetLayer.gradient_colors.length >= 2 
        ? targetLayer.gradient_colors 
        : [targetLayer.color || "#1A6B4A", targetLayer.color_2 || "#2E9F6E"];

      if (document.getElementById("picker-shape-grad-1")) {
        document.getElementById("picker-shape-grad-1").value = gradColors[0];
        document.getElementById("text-shape-grad-1").value = gradColors[0];
        document.getElementById("picker-shape-grad-2").value = gradColors[1];
        document.getElementById("text-shape-grad-2").value = gradColors[1];
        const angleVal = targetLayer.gradient_angle !== undefined ? targetLayer.gradient_angle : 135;
        document.getElementById("slider-val-shape-grad-angle").value = angleVal;
        document.getElementById("label-val-shape-grad-angle").textContent = `${angleVal}°`;
      }
      
      // Conditionally show/hide shape properties
      const sType = targetLayer.shape_type || "circle";
      toggleShapeControlGroups(sType, targetLayer);
    } 
    else if (targetLayer.type === 'phone') {
      document.getElementById("section-prop-phone").classList.remove("hidden");
      
      const phoneAspectRatio = targetLayer.aspect_ratio || (19.5 / 9);
      document.getElementById("slider-val-phone-height").value = phoneAspectRatio;
      document.getElementById("label-val-phone-height").textContent = `${phoneAspectRatio.toFixed(2)}x`;
      document.getElementById("slider-val-phone-depth").value = targetLayer.depth || 0;
      document.getElementById("label-val-phone-depth").textContent = `${targetLayer.depth || 0}px`;
      
      // Mockup Screen Image display
      const rawImgName = targetLayer.imageName || (targetLayer.image ? (targetLayer.image.startsWith('data:') ? 'Imported Image' : targetLayer.image.split('/').pop().split('\\').pop()) : null);
      const imgNameLabel = document.getElementById("label-phone-image-name");
      const clearImgBtn = document.getElementById("btn-clear-phone-image");
      if (rawImgName) {
        if (imgNameLabel) imgNameLabel.textContent = rawImgName;
        if (clearImgBtn) clearImgBtn.style.display = "inline-flex";
      } else {
        if (imgNameLabel) imgNameLabel.textContent = "Pick Image";
        if (clearImgBtn) clearImgBtn.style.display = "none";
      }

      document.getElementById("select-phone-style").value = targetLayer.style || "dynamic_island";
      document.getElementById("picker-phone-frame").value = targetLayer.frame_color || "#1C1C1E";
      document.getElementById("text-phone-frame").value = targetLayer.frame_color || "#1C1C1E";
      document.getElementById("slider-val-phone-bezel").value = targetLayer.bezel || 8;
      document.getElementById("label-val-phone-bezel").textContent = `${targetLayer.bezel || 8}px`;
      document.getElementById("slider-val-phone-radius").value = targetLayer.radius || 38;
      document.getElementById("label-val-phone-radius").textContent = `${targetLayer.radius || 38}px`;
      
      const shadowStyleSelect = document.getElementById("select-phone-shadow-style");
      if (shadowStyleSelect) {
        shadowStyleSelect.value = targetLayer.shadow_style || (targetLayer.shadow !== false ? "standard" : "none");
      }

      // 3D Floor Shadow inspector fields
      const hasFloorShadow = targetLayer.floor_shadow !== false && targetLayer.shadow !== false;
      const floorCheckbox = document.getElementById("checkbox-phone-floor-shadow");
      if (floorCheckbox) floorCheckbox.checked = hasFloorShadow;
      const floorGroup = document.getElementById("group-phone-floor-shadow");
      if (floorGroup) floorGroup.classList.toggle("hidden", !hasFloorShadow);

      const sDist = targetLayer.shadow_distance !== undefined ? targetLayer.shadow_distance : 35;
      const sBlur = targetLayer.shadow_blur !== undefined ? targetLayer.shadow_blur : 22;
      const sWidthPct = Math.round((targetLayer.shadow_width_ratio !== undefined ? targetLayer.shadow_width_ratio : 0.85) * 100);
      const sHeightPct = Math.round((targetLayer.shadow_height_ratio !== undefined ? targetLayer.shadow_height_ratio : 0.14) * 100);
      const sOpacityPct = Math.round((targetLayer.shadow_opacity !== undefined ? targetLayer.shadow_opacity : 0.35) * 100);
      const sColor = targetLayer.shadow_color || "#000000";

      const distInput = document.getElementById("slider-val-phone-shadow-dist");
      const distLabel = document.getElementById("label-val-phone-shadow-dist");
      if (distInput) { distInput.value = sDist; distLabel.textContent = `${sDist}px`; }

      const blurInput = document.getElementById("slider-val-phone-shadow-blur");
      const blurLabel = document.getElementById("label-val-phone-shadow-blur");
      if (blurInput) { blurInput.value = sBlur; blurLabel.textContent = `${sBlur}px`; }

      const widthInput = document.getElementById("slider-val-phone-shadow-width");
      const widthLabel = document.getElementById("label-val-phone-shadow-width");
      if (widthInput) { widthInput.value = sWidthPct; widthLabel.textContent = `${sWidthPct}%`; }

      const heightInput = document.getElementById("slider-val-phone-shadow-height");
      const heightLabel = document.getElementById("label-val-phone-shadow-height");
      if (heightInput) { heightInput.value = sHeightPct; heightLabel.textContent = `${sHeightPct}%`; }

      const opacityInput = document.getElementById("slider-val-phone-shadow-opacity");
      const opacityLabel = document.getElementById("label-val-phone-shadow-opacity");
      if (opacityInput) { opacityInput.value = sOpacityPct; opacityLabel.textContent = `${sOpacityPct}%`; }

      const colorPicker = document.getElementById("picker-phone-shadow-color");
      const colorText = document.getElementById("text-phone-shadow-color");
      if (colorPicker) { colorPicker.value = sColor; colorText.value = sColor; }
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
      document.getElementById("input-feature-icon").value = targetLayer.icon || "âœ”";
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

export 
function togglePatternControlGroups(pType) {
  const gGrid = document.getElementById("group-pattern-grid");
  const gDots = document.getElementById("group-pattern-dots");
  const gStripes = document.getElementById("group-pattern-stripes");
  const gRays = document.getElementById("group-pattern-rays");

  if (gGrid) gGrid.classList.toggle("hidden", pType !== 'grid');
  if (gDots) gDots.classList.toggle("hidden", pType !== 'dots');
  if (gStripes) gStripes.classList.toggle("hidden", pType !== 'stripes');
  if (gRays) gRays.classList.toggle("hidden", pType !== 'rays');
}

function toggleShapeControlGroups(shapeType, targetLayer) {
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
  const gridGroup = document.getElementById("group-bg-grid");
  const dotsGroup = document.getElementById("group-bg-dots");
  const stripesGroup = document.getElementById("group-bg-stripes");
  const raysGroup = document.getElementById("group-bg-rays");

  if (solidGroup) solidGroup.classList.add("hidden");
  if (gradGroup) gradGroup.classList.add("hidden");
  if (splitGroup) splitGroup.classList.add("hidden");
  if (gridGroup) gridGroup.classList.add("hidden");
  if (dotsGroup) dotsGroup.classList.add("hidden");
  if (stripesGroup) stripesGroup.classList.add("hidden");
  if (raysGroup) raysGroup.classList.add("hidden");

  const bgType = layer.bg_type || (layer.grid_spacing ? 'grid' : (layer.dot_spacing ? 'dots' : (layer.stripe_spacing ? 'stripes' : (layer.ray_count ? 'rays' : (layer.gradient ? 'linear' : (layer.split_at !== undefined ? 'split' : 'solid'))))));

  if (bgType === 'grid') {
    typeSelect.value = "grid";
    if (gridGroup) gridGroup.classList.remove("hidden");
    const bgCol = layer.bg_color || layer.color || "#FAF9F6";
    const lineCol = layer.grid_color || layer.pattern_color || "#1A6B4A";
    const lineWidth = layer.grid_line_width || 1.5;
    const spacing = layer.grid_spacing || 32;
    const opacity = layer.grid_opacity !== undefined ? layer.grid_opacity : 0.15;
    const angle = layer.grid_angle || 0;

    if (document.getElementById("picker-bg-grid-bg")) document.getElementById("picker-bg-grid-bg").value = bgCol;
    if (document.getElementById("text-bg-grid-bg")) document.getElementById("text-bg-grid-bg").value = bgCol;
    if (document.getElementById("picker-bg-grid-line")) document.getElementById("picker-bg-grid-line").value = lineCol;
    if (document.getElementById("text-bg-grid-line")) document.getElementById("text-bg-grid-line").value = lineCol;
    if (document.getElementById("slider-val-bg-grid-line-width")) document.getElementById("slider-val-bg-grid-line-width").value = lineWidth;
    if (document.getElementById("label-val-bg-grid-line-width")) document.getElementById("label-val-bg-grid-line-width").textContent = lineWidth;
    if (document.getElementById("slider-val-bg-grid-spacing")) document.getElementById("slider-val-bg-grid-spacing").value = spacing;
    if (document.getElementById("label-val-bg-grid-spacing")) document.getElementById("label-val-bg-grid-spacing").textContent = spacing;
    if (document.getElementById("slider-val-bg-grid-opacity")) document.getElementById("slider-val-bg-grid-opacity").value = opacity;
    if (document.getElementById("label-val-bg-grid-opacity")) document.getElementById("label-val-bg-grid-opacity").textContent = `${Math.round(opacity * 100)}%`;
    if (document.getElementById("slider-val-bg-grid-angle")) document.getElementById("slider-val-bg-grid-angle").value = angle;
    if (document.getElementById("label-val-bg-grid-angle")) document.getElementById("label-val-bg-grid-angle").textContent = `${angle}°`;
  } else if (bgType === 'dots') {
    typeSelect.value = "dots";
    if (dotsGroup) dotsGroup.classList.remove("hidden");
    const bgCol = layer.bg_color || layer.color || "#FAF9F6";
    const dotCol = layer.dot_color || layer.pattern_color || "#1A6B4A";
    const dotSize = layer.dot_size || 3.0;
    const spacing = layer.dot_spacing || 24;
    const opacity = layer.dot_opacity !== undefined ? layer.dot_opacity : 0.20;

    if (document.getElementById("picker-bg-dots-bg")) document.getElementById("picker-bg-dots-bg").value = bgCol;
    if (document.getElementById("text-bg-dots-bg")) document.getElementById("text-bg-dots-bg").value = bgCol;
    if (document.getElementById("picker-bg-dots-color")) document.getElementById("picker-bg-dots-color").value = dotCol;
    if (document.getElementById("text-bg-dots-color")) document.getElementById("text-bg-dots-color").value = dotCol;
    if (document.getElementById("slider-val-bg-dot-size")) document.getElementById("slider-val-bg-dot-size").value = dotSize;
    if (document.getElementById("label-val-bg-dot-size")) document.getElementById("label-val-bg-dot-size").textContent = dotSize;
    if (document.getElementById("slider-val-bg-dot-spacing")) document.getElementById("slider-val-bg-dot-spacing").value = spacing;
    if (document.getElementById("label-val-bg-dot-spacing")) document.getElementById("label-val-bg-dot-spacing").textContent = spacing;
    if (document.getElementById("slider-val-bg-dot-opacity")) document.getElementById("slider-val-bg-dot-opacity").value = opacity;
    if (document.getElementById("label-val-bg-dot-opacity")) document.getElementById("label-val-bg-dot-opacity").textContent = `${Math.round(opacity * 100)}%`;
  } else if (bgType === 'stripes') {
    typeSelect.value = "stripes";
    if (stripesGroup) stripesGroup.classList.remove("hidden");
    const bgCol = layer.bg_color || layer.color || "#FAF9F6";
    const stripeCol = layer.stripe_color || layer.pattern_color || "#1A6B4A";
    const width = layer.stripe_width || 8;
    const spacing = layer.stripe_spacing || 28;
    const opacity = layer.stripe_opacity !== undefined ? layer.stripe_opacity : 0.15;
    const angle = layer.stripe_angle !== undefined ? layer.stripe_angle : 45;

    if (document.getElementById("picker-bg-stripes-bg")) document.getElementById("picker-bg-stripes-bg").value = bgCol;
    if (document.getElementById("text-bg-stripes-bg")) document.getElementById("text-bg-stripes-bg").value = bgCol;
    if (document.getElementById("picker-bg-stripes-color")) document.getElementById("picker-bg-stripes-color").value = stripeCol;
    if (document.getElementById("text-bg-stripes-color")) document.getElementById("text-bg-stripes-color").value = stripeCol;
    if (document.getElementById("slider-val-bg-stripe-width")) document.getElementById("slider-val-bg-stripe-width").value = width;
    if (document.getElementById("label-val-bg-stripe-width")) document.getElementById("label-val-bg-stripe-width").textContent = width;
    if (document.getElementById("slider-val-bg-stripe-spacing")) document.getElementById("slider-val-bg-stripe-spacing").value = spacing;
    if (document.getElementById("label-val-bg-stripe-spacing")) document.getElementById("label-val-bg-stripe-spacing").textContent = spacing;
    if (document.getElementById("slider-val-bg-stripe-opacity")) document.getElementById("slider-val-bg-stripe-opacity").value = opacity;
    if (document.getElementById("label-val-bg-stripe-opacity")) document.getElementById("label-val-bg-stripe-opacity").textContent = `${Math.round(opacity * 100)}%`;
    if (document.getElementById("slider-val-bg-stripe-angle")) document.getElementById("slider-val-bg-stripe-angle").value = angle;
    if (document.getElementById("label-val-bg-stripe-angle")) document.getElementById("label-val-bg-stripe-angle").textContent = `${angle}°`;
  } else if (bgType === 'rays') {
    typeSelect.value = "rays";
    if (raysGroup) raysGroup.classList.remove("hidden");
    const bgCol = layer.bg_color || layer.color || "#FAF9F6";
    const rayCol = layer.ray_color || layer.pattern_color || "#1A6B4A";
    const count = layer.ray_count || 16;
    const opacity = layer.ray_opacity !== undefined ? layer.ray_opacity : 0.15;

    if (document.getElementById("picker-bg-rays-bg")) document.getElementById("picker-bg-rays-bg").value = bgCol;
    if (document.getElementById("text-bg-rays-bg")) document.getElementById("text-bg-rays-bg").value = bgCol;
    if (document.getElementById("picker-bg-rays-color")) document.getElementById("picker-bg-rays-color").value = rayCol;
    if (document.getElementById("text-bg-rays-color")) document.getElementById("text-bg-rays-color").value = rayCol;
    if (document.getElementById("slider-val-bg-ray-count")) document.getElementById("slider-val-bg-ray-count").value = count;
    if (document.getElementById("label-val-bg-ray-count")) document.getElementById("label-val-bg-ray-count").textContent = count;
    if (document.getElementById("slider-val-bg-ray-opacity")) document.getElementById("slider-val-bg-ray-opacity").value = opacity;
    if (document.getElementById("label-val-bg-ray-opacity")) document.getElementById("label-val-bg-ray-opacity").textContent = `${Math.round(opacity * 100)}%`;
  } else if (bgType === 'linear' || (layer.gradient && layer.gradient.length >= 2)) {
    typeSelect.value = "linear";
    if (gradGroup) gradGroup.classList.remove("hidden");
    document.getElementById("picker-bg-grad-start").value = layer.gradient ? layer.gradient[0] : "#0082FF";
    document.getElementById("text-bg-grad-start").value = layer.gradient ? layer.gradient[0] : "#0082FF";
    document.getElementById("picker-bg-grad-end").value = layer.gradient ? layer.gradient[1] : "#0040A3";
    document.getElementById("text-bg-grad-end").value = layer.gradient ? layer.gradient[1] : "#0040A3";
    document.getElementById("select-bg-grad-begin").value = layer.begin || "topCenter";
    document.getElementById("select-bg-grad-end-dir").value = layer.end || "bottomCenter";
  } else if (bgType === 'split' || layer.split_at !== undefined) {
    typeSelect.value = "split";
    if (splitGroup) splitGroup.classList.remove("hidden");
    document.getElementById("picker-bg-split-top").value = layer.top_color || "#FAF9F6";
    document.getElementById("text-bg-split-top").value = layer.top_color || "#FAF9F6";
    document.getElementById("picker-bg-split-bottom").value = layer.bottom_color || "#F5F7F5";
    document.getElementById("text-bg-split-bottom").value = layer.bottom_color || "#F5F7F5";
    document.getElementById("slider-val-bg-split-at").value = layer.split_at || 0.5;
    document.getElementById("label-val-bg-split-at").textContent = layer.split_at || 0.5;
  } else {
    typeSelect.value = "solid";
    if (solidGroup) solidGroup.classList.remove("hidden");
    document.getElementById("picker-bg-solid").value = layer.color || "#FAF9F6";
    document.getElementById("text-bg-solid").value = layer.color || "#FAF9F6";
  }

  // Handle Warp Effect slider visibility (not for solid)
  const warpGroup = document.getElementById("group-bg-warp");
  if (warpGroup) {
    if (bgType === 'solid') {
      warpGroup.classList.add("hidden");
    } else {
      warpGroup.classList.remove("hidden");
      const warpSlider = document.getElementById("slider-val-bg-warp");
      const warpLabel = document.getElementById("label-val-bg-warp");
      const warpVal = Math.round((Number(layer.bg_warp) || 0) * 100);
      if (warpSlider) warpSlider.value = warpVal;
      if (warpLabel) warpLabel.textContent = `${warpVal}%`;
    }
  }
}



export function addLayer(type) {
  let newLayer = { type, pinning: 'safe' };
  
  if (type === 'pattern' || type === 'pattern_overlay') {
    newLayer.pattern_type = "grid";
    newLayer.color = "#1A6B4A";
    newLayer.opacity = 0.25;
    newLayer.grid_spacing = 32;
    newLayer.grid_line_width = 1.5;
    newLayer.grid_angle = 0;
    newLayer.bg_warp = 0;
    newLayer.x = 0;
    newLayer.y = 0;
    newLayer.width = 1.0;
    newLayer.height = 1.0;
    newLayer.pinning = 'bleed';
  } 
  else if (type === 'text') {
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
    newLayer.icon = "âœ¦";
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
    newLayer.icon = "âœ”";
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
            
            // Return to dashboard
            window.location.href = 'index.html';
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

  safeAddListener("btn-create-template", "click", createNewTemplate);
  
  if (document.getElementById("btn-save-draft")) {
    safeAddListener("btn-save-draft", "click", () => {
      saveTemplateDraft();
      showToast("Template draft saved locally");
    });
  }

  if (document.getElementById("btn-push-firestore")) {
    safeAddListener("btn-push-firestore", "click", pushTemplateToFirestore);
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
    safeAddListener("btn-zoom-in", "click", () => {
      state.canvasScale = Math.min(1.5, state.canvasScale + 0.1);
      updateCanvasZoom();
    });
  }

  if (document.getElementById("btn-zoom-out")) {
    safeAddListener("btn-zoom-out", "click", () => {
      state.canvasScale = Math.max(0.4, state.canvasScale - 0.1);
      updateCanvasZoom();
    });
  }

  // Quick Alignment bindings
  if (document.getElementById("btn-align-left")) {
    safeAddListener("btn-align-left", "click", () => alignSelectedLayer('left'));
    safeAddListener("btn-align-center-h", "click", () => alignSelectedLayer('center-h'));
    safeAddListener("btn-align-right", "click", () => alignSelectedLayer('right'));
    safeAddListener("btn-align-top", "click", () => alignSelectedLayer('top'));
    safeAddListener("btn-align-center-v", "click", () => alignSelectedLayer('center-v'));
    safeAddListener("btn-align-bottom", "click", () => alignSelectedLayer('bottom'));

    // Duplicate active layer binding
    safeAddListener("btn-duplicate-selected-layer", "click", () => {
      if (state.selectedLayerIndex >= 0) {
        duplicateLayer(state.selectedLayerIndex);
      }
    });

    // Delete active layer binding
    safeAddListener("btn-delete-selected-layer", "click", () => {
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
    safeAddListener("slider-val-rotation", "input", (e) => {
      const val = parseInt(e.target.value);
      document.getElementById("label-val-rotation").textContent = `${val}Â°`;
      updateSelectedLayerField("rotation", val);
    });

    safeAddListener("slider-val-rotation-x", "input", (e) => {
      const val = parseInt(e.target.value);
      document.getElementById("label-val-rotation-x").textContent = `${val}Â°`;
      updateSelectedLayerField("rotation_x", val);
    });

    safeAddListener("slider-val-rotation-y", "input", (e) => {
      const val = parseInt(e.target.value);
      document.getElementById("label-val-rotation-y").textContent = `${val}Â°`;
      updateSelectedLayerField("rotation_y", val);
    });

    safeAddListener("slider-val-opacity", "input", (e) => {
      const val = parseFloat(e.target.value);
      document.getElementById("label-val-opacity").textContent = `${Math.round(val * 100)}%`;
      updateSelectedLayerField("opacity", val);
    });
  }

  // Background control handlers
  if (document.getElementById("select-bg-type")) {
    safeAddListener("select-bg-type", "change", (e) => {
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
      if (val === 'solid') delete bgLayer.bg_warp;

      bgLayer.bg_type = val;

      if (val === 'solid') {
        bgLayer.color = "#FAF9F6";
      } else if (val === 'linear') {
        bgLayer.gradient = ["#0082FF", "#0040A3"];
        bgLayer.begin = "topCenter";
        bgLayer.end = "bottomCenter";
      } else if (val === 'grid') {
        bgLayer.bg_color = "#FAF9F6";
        bgLayer.grid_color = "#1A6B4A";
        bgLayer.grid_line_width = 1.5;
        bgLayer.grid_spacing = 32;
        bgLayer.grid_opacity = 0.15;
        bgLayer.grid_angle = 0;
      } else if (val === 'dots') {
        bgLayer.bg_color = "#FAF9F6";
        bgLayer.dot_color = "#1A6B4A";
        bgLayer.dot_size = 3.0;
        bgLayer.dot_spacing = 24;
        bgLayer.dot_opacity = 0.20;
      } else if (val === 'stripes') {
        bgLayer.bg_color = "#FAF9F6";
        bgLayer.stripe_color = "#1A6B4A";
        bgLayer.stripe_width = 8;
        bgLayer.stripe_spacing = 28;
        bgLayer.stripe_opacity = 0.15;
        bgLayer.stripe_angle = 45;
      } else if (val === 'rays') {
        bgLayer.bg_color = "#FAF9F6";
        bgLayer.ray_color = "#1A6B4A";
        bgLayer.ray_count = 16;
        bgLayer.ray_opacity = 0.15;
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

  // --- Grid Pickers & Sliders ---
  bindColorInput("picker-bg-grid-bg", "text-bg-grid-bg", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.bg_color = color;
    renderPreview();
  });
  bindColorInput("picker-bg-grid-line", "text-bg-grid-line", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.grid_color = color;
    renderPreview();
  });
  bindSlider("slider-val-bg-grid-line-width", "label-val-bg-grid-line-width", "grid_line_width", false);
  bindSlider("slider-val-bg-grid-spacing", "label-val-bg-grid-spacing", "grid_spacing", false);
  bindSlider("slider-val-bg-grid-opacity", "label-val-bg-grid-opacity", "grid_opacity", false, (v) => `${Math.round(v * 100)}%`);
  bindSlider("slider-val-bg-grid-angle", "label-val-bg-grid-angle", "grid_angle", false, (v) => `${v}°`);

  // --- Dots Pickers & Sliders ---
  bindColorInput("picker-bg-dots-bg", "text-bg-dots-bg", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.bg_color = color;
    renderPreview();
  });
  bindColorInput("picker-bg-dots-color", "text-bg-dots-color", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.dot_color = color;
    renderPreview();
  });
  bindSlider("slider-val-bg-dot-size", "label-val-bg-dot-size", "dot_size", false);
  bindSlider("slider-val-bg-dot-spacing", "label-val-bg-dot-spacing", "dot_spacing", false);
  bindSlider("slider-val-bg-dot-opacity", "label-val-bg-dot-opacity", "dot_opacity", false, (v) => `${Math.round(v * 100)}%`);

  // --- Stripes Pickers & Sliders ---
  bindColorInput("picker-bg-stripes-bg", "text-bg-stripes-bg", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.bg_color = color;
    renderPreview();
  });
  bindColorInput("picker-bg-stripes-color", "text-bg-stripes-color", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.stripe_color = color;
    renderPreview();
  });
  bindSlider("slider-val-bg-stripe-width", "label-val-bg-stripe-width", "stripe_width", false);
  bindSlider("slider-val-bg-stripe-spacing", "label-val-bg-stripe-spacing", "stripe_spacing", false);
  bindSlider("slider-val-bg-stripe-opacity", "label-val-bg-stripe-opacity", "stripe_opacity", false, (v) => `${Math.round(v * 100)}%`);
  bindSlider("slider-val-bg-stripe-angle", "label-val-bg-stripe-angle", "stripe_angle", false, (v) => `${v}°`);

  // --- Rays Pickers & Sliders ---
  bindColorInput("picker-bg-rays-bg", "text-bg-rays-bg", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.bg_color = color;
    renderPreview();
  });
  bindColorInput("picker-bg-rays-color", "text-bg-rays-color", (color) => {
    const bg = state.currentTemplate.layout.find(l => l.type === 'background');
    bg.ray_color = color;
    renderPreview();
  });
  bindSlider("slider-val-bg-ray-count", "label-val-bg-ray-count", "ray_count", false);
  bindSlider("slider-val-bg-ray-opacity", "label-val-bg-ray-opacity", "ray_opacity", false, (v) => `${Math.round(v * 100)}%`);

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
    safeAddListener("select-bg-grad-begin", "change", (e) => {
      const bg = state.currentTemplate.layout.find(l => l.type === 'background');
      bg.begin = e.target.value;
      renderPreview();
    });

    safeAddListener("select-bg-grad-end-dir", "change", (e) => {
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

  bindSlider("slider-val-bg-split-at", "label-val-bg-split-at", "split_at", false);

  // Text Property Handlers
  if (document.getElementById("textarea-text-content")) {
    safeAddListener("textarea-text-content", "input", (e) => {
      updateSelectedLayerField("content", e.target.value);
    });

    safeAddListener("select-text-font", "change", (e) => {
      ensureFontLoaded(e.target.value);
      updateSelectedLayerField("font", e.target.value);
    });

    bindColorInput("picker-text-color", "text-text-color", (color) => {
      updateSelectedLayerField("color", color);
    });

    safeAddListener("select-text-align", "change", (e) => {
      updateSelectedLayerField("align", e.target.value);
    });

    safeAddListener("select-text-weight", "change", (e) => {
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
    safeAddListener("select-shape-type", "change", (e) => {
      const val = e.target.value;
      updateSelectedLayerField("shape_type", val);
      toggleShapeControlGroups(val, state.currentTemplate.layout[state.selectedLayerIndex]);
    });
  }

  safeAddListener("select-shape-fill-type", "change", (e) => {
    const val = e.target.value;
    const isGrad = val === "gradient";
    updateSelectedLayerField("fill_type", val);
    
    if (isGrad) {
      const c1 = document.getElementById("picker-shape-grad-1")?.value || "#1A6B4A";
      const c2 = document.getElementById("picker-shape-grad-2")?.value || "#2E9F6E";
      updateSelectedLayerField("gradient_colors", [c1, c2]);
    } else {
      const sCol = document.getElementById("picker-shape-color")?.value || "#1A6B4A";
      updateSelectedLayerField("color", sCol);
      if (state.selectedLayerIndex >= 0) {
        delete state.currentTemplate.layout[state.selectedLayerIndex].gradient_colors;
      }
    }

    const solidGroup = document.getElementById("group-shape-solid");
    const gradGroup = document.getElementById("group-shape-gradient");
    if (solidGroup) solidGroup.classList.toggle("hidden", isGrad);
    if (gradGroup) gradGroup.classList.toggle("hidden", !isGrad);
    
    renderPreview();
    saveTemplateDraft();
  });

  bindColorInput("picker-shape-color", "text-shape-color", (color) => {
    updateSelectedLayerField("color", color);
    if (state.selectedLayerIndex >= 0) {
      state.currentTemplate.layout[state.selectedLayerIndex].fill_type = 'solid';
      delete state.currentTemplate.layout[state.selectedLayerIndex].gradient_colors;
    }
    renderPreview();
  });

  bindColorInput("picker-shape-grad-1", "text-shape-grad-1", (color) => {
    const c2 = document.getElementById("picker-shape-grad-2")?.value || "#2E9F6E";
    updateSelectedLayerField("fill_type", "gradient");
    updateSelectedLayerField("color", color);
    updateSelectedLayerField("gradient_colors", [color, c2]);
    renderPreview();
  });

  bindColorInput("picker-shape-grad-2", "text-shape-grad-2", (color) => {
    const c1 = document.getElementById("picker-shape-grad-1")?.value || "#1A6B4A";
    updateSelectedLayerField("fill_type", "gradient");
    updateSelectedLayerField("color_2", color);
    updateSelectedLayerField("gradient_colors", [c1, color]);
    renderPreview();
  });

  bindSlider("slider-val-shape-grad-angle", "label-val-shape-grad-angle", "gradient_angle", false, (v) => `${Math.round(v)}°`);
  
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
    safeAddListener("select-phone-style", "change", (e) => {
      updateSelectedLayerField("style", e.target.value);
    });
  }

  if (document.getElementById("select-phone-shadow-style")) {
    safeAddListener("select-phone-shadow-style", "change", (e) => {
      const val = e.target.value;
      updateSelectedLayerField("shadow_style", val);
      updateSelectedLayerField("shadow", val !== "none");
    });
  }

  // 3D Oval Floor Shadow handlers
  const floorShadowCheckbox = document.getElementById("checkbox-phone-floor-shadow");
  if (floorShadowCheckbox) {
    floorShadowCheckbox.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      updateSelectedLayerField("floor_shadow", isChecked);
      const floorGroup = document.getElementById("group-phone-floor-shadow");
      if (floorGroup) floorGroup.classList.toggle("hidden", !isChecked);
    });
  }

  bindSlider("slider-val-phone-shadow-dist", "label-val-phone-shadow-dist", "shadow_distance", false, (v) => `${Math.round(v)}px`);
  bindSlider("slider-val-phone-shadow-blur", "label-val-phone-shadow-blur", "shadow_blur", false, (v) => `${Math.round(v)}px`);
  bindSlider("slider-val-phone-shadow-width", "label-val-phone-shadow-width", "shadow_width_ratio", true, (v) => `${Math.round(v)}%`);
  bindSlider("slider-val-phone-shadow-height", "label-val-phone-shadow-height", "shadow_height_ratio", true, (v) => `${Math.round(v)}%`);
  bindSlider("slider-val-phone-shadow-opacity", "label-val-phone-shadow-opacity", "shadow_opacity", true, (v) => `${Math.round(v)}%`);

  bindColorInput("picker-phone-shadow-color", "text-phone-shadow-color", (color) => {
    updateSelectedLayerField("shadow_color", color);
  });

  bindColorInput("picker-phone-frame", "text-phone-frame", (color) => {
    updateSelectedLayerField("frame_color", color);
  });

  bindSlider("slider-val-phone-height", "label-val-phone-height", "aspect_ratio", false, (v) => `${v.toFixed(2)}x`);
  bindSlider("slider-val-phone-depth", "label-val-phone-depth", "depth", false, (v) => `${Math.round(v)}px`);
  bindSlider("slider-val-phone-bezel", "label-val-phone-bezel", "bezel");
  bindSlider("slider-val-phone-radius", "label-val-phone-radius", "radius");

  // Phone Mockup Image Picker listeners
  const pickImgBtn = document.getElementById("btn-pick-phone-image");
  const fileInput = document.getElementById("input-phone-image");
  const clearImgBtn = document.getElementById("btn-clear-phone-image");

  if (pickImgBtn && fileInput) {
    pickImgBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const targetLayer = state.currentTemplate.layout[state.selectedLayerIndex];
          if (targetLayer) {
            targetLayer.image = ev.target.result;
            targetLayer.imageName = file.name;
            const lbl = document.getElementById("label-phone-image-name");
            if (lbl) lbl.textContent = file.name;
            if (clearImgBtn) clearImgBtn.style.display = "inline-flex";
            renderPreview();
            saveTemplateDraft();
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  if (clearImgBtn) {
    clearImgBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const targetLayer = state.currentTemplate.layout[state.selectedLayerIndex];
      if (targetLayer) {
        delete targetLayer.image;
        delete targetLayer.imageName;
        delete targetLayer.image_url;
        delete targetLayer.screenshot;
        delete targetLayer.screenshot_url;
        const lbl = document.getElementById("label-phone-image-name");
        if (lbl) lbl.textContent = "Pick Image";
        clearImgBtn.style.display = "none";
        renderPreview();
        saveTemplateDraft();
      }
    });
  }

  // Background Warp slider listener
  const warpSlider = document.getElementById("slider-val-bg-warp");
  if (warpSlider) {
    warpSlider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      const bgLayer = state.currentTemplate.layout.find(l => l.type === 'background');
      if (bgLayer) {
        bgLayer.bg_warp = val / 100;
        const lbl = document.getElementById("label-val-bg-warp");
        if (lbl) lbl.textContent = `${val}%`;
        renderPreview();
        saveTemplateDraft();
      }
    });
  }

  // Badge Property Handlers
  if (document.getElementById("input-badge-content")) {
    safeAddListener("input-badge-content", "input", (e) => {
      updateSelectedLayerField("content", e.target.value);
    });

    safeAddListener("input-badge-icon", "input", (e) => {
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
    safeAddListener("input-feature-content", "input", (e) => {
      updateSelectedLayerField("content", e.target.value);
    });

    safeAddListener("input-feature-icon", "input", (e) => {
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
    safeAddListener("slider-val-frosted-opacity", "input", (e) => {
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
  if (state.selectedLayerIndex === -1) return;
  if (state.selectedLayerIndex === -2) {
    const bgLayer = state.currentTemplate.layout.find(l => l.type === 'background');
    if (bgLayer) {
      bgLayer[field] = value;
      renderPreview();
      saveTemplateDraft();
    }
    return;
  }
  state.currentTemplate.layout[state.selectedLayerIndex][field] = value;
  renderPreview();
  saveTemplateDraft();
}

// Helper: Safe Event Listener attachment
function safeAddListener(idOrEl, event, handler) {
  const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  if (el) {
    el.addEventListener(event, handler);
  }
}

// Helper: Bind input slider element to label value output and update target template state fields
function bindSlider(sliderId, labelId, fieldKey, isPercentage = false, formatFn = null) {
  const slider = document.getElementById(sliderId);
  const label = document.getElementById(labelId);
  if (!slider || !label) return;
  
  slider.addEventListener("input", (e) => {
    const rawVal = parseFloat(e.target.value);
    if (formatFn) {
      label.textContent = formatFn(rawVal);
    } else if (isPercentage) {
      label.textContent = `${Math.round(rawVal)}%`;
    } else {
      label.textContent = rawVal;
    }
    
    const finalVal = isPercentage ? (rawVal / 100.0) : rawVal;
    updateSelectedLayerField(fieldKey, finalVal);
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

