/**
 * RCL Video Análisis - Suite Profesional de Análisis Táctico y Telestration
 * Desarrollado para RCL Scout Group | Ejecución 100% en Cliente (GitHub Pages)
 */

document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();

  // URL directa a raw.githubusercontent.com (con soporte CORS directo sin redirección 302)
  const RCL_LOGO_RAW_URL = 'https://raw.githubusercontent.com/rclscoutgroup/portal-scouting/main/RCL_Scout_Logo2.png';
  const rclLogoImg = new Image();
  rclLogoImg.crossOrigin = 'anonymous';
  rclLogoImg.src = RCL_LOGO_RAW_URL;

  // ============================================================================
  // 1. PERSISTENCIA EN INDEXEDDB
  // ============================================================================
  const DB_NAME = 'RCLVideoAnalisisDB';
  const DB_VERSION = 3;
  const STORE_NAME = 'rcl_projects';
  const PROJECT_KEY = 'rcl_active_session';

  class RCLDatabase {
    constructor() {
      this.db = null;
    }

    async init() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          this.db = e.target.result;
          resolve();
        };
        req.onerror = (e) => reject(e.target.error);
      });
    }

    async save(data) {
      if (!this.db) return;
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        tx.objectStore(STORE_NAME).put({ id: PROJECT_KEY, updatedAt: Date.now(), ...data });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    }

    async load() {
      if (!this.db) return null;
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_NAME], 'readonly');
        const req = tx.objectStore(STORE_NAME).get(PROJECT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    }
  }

  const dbService = new RCLDatabase();

  // ============================================================================
  // 2. ESTADO GLOBAL DE LA APLICACIÓN
  // ============================================================================
  const BASE_W = 1280;
  const BASE_H = 720;

  const state = {
    videoLoaded: false,
    activeTeam: 'Local',
    selectedClipId: null, // ID del clip actualmente seleccionado para meterle o editarle la pizarra
    activeClip: null,     // Clip actualmente en reproducción
    hasShownClipDrawing: false, // Controla la pausa automática en el segundo de la pizarra durante la reproducción
    playlistQueue: [],
    isPlayingPlaylist: false,
    drawing: {
      tool: 'select',
      color: '#eab308',
      size: 65,
      useHatchPattern: true,
      isDragging: false,
      startX: 0,
      startY: 0,
      tempObject: null,
      chainNodes: [],
      chainLines: [],
      polygonPoints: [],
      polygonPreviewObjects: []
    },
    tags: [
      { id: 't1', name: 'Construcción / Salida', category: 'Ataque', key: 'A' },
      { id: 't2', name: 'Ruptura al Espacio', category: 'Ataque', key: 'W' },
      { id: 't3', name: 'Finalización / Ocasión', category: 'Ataque', key: 'S' },
      { id: 't4', name: 'Gol', category: 'Ataque', key: 'G' },
      { id: 't5', name: 'Línea Defensiva / Basculación', category: 'Defensa', key: 'D' },
      { id: 't6', name: 'Recuperación', category: 'Defensa', key: 'R' },
      { id: 't7', name: 'Presión Alta (Salto)', category: 'Defensa', key: 'F' },
      { id: 't8', name: 'Duelo Defensivo', category: 'Defensa', key: 'E' },
      { id: 't9', name: 'Pérdida Peligrosa', category: 'Transiciones', key: 'P' },
      { id: 't10', name: 'Transición Ofensiva', category: 'Transiciones', key: 'T' },
      { id: 't11', name: 'Repliegue Defensivo', category: 'Transiciones', key: 'X' },
      { id: 't12', name: 'Córner Táctico', category: 'ABP', key: 'C' },
      { id: 't13', name: 'Falta Lateral / Frontal', category: 'ABP', key: 'B' },
      { id: 't14', name: 'Saque de Banda', category: 'ABP', key: 'V' }
    ],
    clips: []
  };

  const CATEGORY_META = {
    'Ataque': {
      color: '#10b981',
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      btn: 'bg-[#1e293b] hover:bg-emerald-950/60 border-emerald-500/40 hover:border-emerald-400',
      key: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    },
    'Defensa': {
      color: '#0ea5e9',
      badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      btn: 'bg-[#1e293b] hover:bg-sky-950/60 border-sky-500/40 hover:border-sky-400',
      key: 'bg-sky-500/20 text-sky-300 border-sky-500/40'
    },
    'Transiciones': {
      color: '#f59e0b',
      badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      btn: 'bg-[#1e293b] hover:bg-amber-950/60 border-amber-500/40 hover:border-amber-400',
      key: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    },
    'ABP': {
      color: '#a855f7',
      badge: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      btn: 'bg-[#1e293b] hover:bg-purple-950/60 border-purple-500/40 hover:border-purple-400',
      key: 'bg-purple-500/20 text-purple-300 border-purple-500/40'
    }
  };

  // ============================================================================
  // 3. REFERENCIAS DOM Y UTILIDADES
  // ============================================================================
  const video = document.getElementById('main-video');
  const videoStage = document.getElementById('video-stage');
  const canvasWrapper = document.getElementById('canvas-overlay-wrapper');
  const dropzone = document.getElementById('video-dropzone');
  const timecodeCurrent = document.getElementById('timecode-current');
  const timecodeDuration = document.getElementById('timecode-duration');
  const timelinePlayhead = document.getElementById('timeline-playhead');
  const timelineArea = document.getElementById('timeline-interactive-area');
  const sizeSlider = document.getElementById('slider-object-size');
  const sizeLabel = document.getElementById('label-object-size');
  const btnFinishChain = document.getElementById('btn-finish-chain');
  const helperBanner = document.getElementById('drawing-helper-banner');

  function formatTimePrecise(sec) {
    if (isNaN(sec) || sec < 0) return '00:00.00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const cs = Math.floor((sec % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  function formatTimeShort(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function hexToRgba(hex, alpha = 0.28) {
    const clean = (hex || '#eab308').replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 234;
    const g = parseInt(clean.substring(2, 4), 16) || 179;
    const b = parseInt(clean.substring(4, 6), 16) || 8;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function notify(msg, type = 'info') {
    const wrapper = document.getElementById('toast-wrapper');
    const el = document.createElement('div');
    const styles = {
      success: 'border-emerald-500/50 bg-[#0f172a]/95 text-emerald-300',
      warning: 'border-amber-500/50 bg-[#0f172a]/95 text-amber-300',
      error: 'border-rose-500/50 bg-[#0f172a]/95 text-rose-300',
      info: 'border-sky-500/50 bg-[#0f172a]/95 text-sky-300'
    };
    el.className = `px-3.5 py-2 rounded-lg border text-xs font-medium shadow-xl backdrop-blur flex items-center gap-2 transition-all duration-300 ${styles[type] || styles.info}`;
    el.innerHTML = `<span>${msg}</span>`;
    wrapper.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 2800);
  }

  async function persistState() {
    await dbService.save({
      tags: state.tags,
      clips: state.clips
    });
  }

  // ============================================================================
  // 4. INICIALIZACIÓN DE FABRIC.JS Y GENERADOR DE TRAMA RAYADA PRO
  // ============================================================================
  fabric.Object.prototype.set({
    transparentCorners: false,
    cornerColor: '#10b981',
    cornerStrokeColor: '#060913',
    borderColor: '#10b981',
    cornerSize: 10,
    cornerStyle: 'circle',
    padding: 4
  });

  const fabricCanvas = new fabric.Canvas('tactical-canvas', {
    width: BASE_W,
    height: BASE_H,
    selection: true,
    preserveObjectStacking: true
  });

  function syncOverlayWithVideo() {
    const stageRect = videoStage.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return;

    const videoRatio = (video.videoWidth && video.videoHeight)
      ? (video.videoWidth / video.videoHeight)
      : (16 / 9);
    const stageRatio = stageRect.width / stageRect.height;

    let renderW, renderH;
    if (stageRatio > videoRatio) {
      renderH = stageRect.height;
      renderW = renderH * videoRatio;
    } else {
      renderW = stageRect.width;
      renderH = renderW / videoRatio;
    }

    canvasWrapper.style.width = `${renderW}px`;
    canvasWrapper.style.height = `${renderH}px`;

    const zoom = renderW / BASE_W;
    fabricCanvas.setDimensions({ width: renderW, height: renderH });
    fabricCanvas.setZoom(zoom);
    fabricCanvas.renderAll();
  }

  new ResizeObserver(syncOverlayWithVideo).observe(videoStage);
  video.addEventListener('loadedmetadata', syncOverlayWithVideo);

  /**
   * Patrón vectorial de Trama Rayada Diagonal (idéntico al sombreado táctico de LongoMatch/Metrica)
   */
  function createDiagonalHatchPattern(colorHex = '#10b981') {
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 22;
    patternCanvas.height = 22;
    const pCtx = patternCanvas.getContext('2d');

    pCtx.fillStyle = hexToRgba(colorHex, 0.14);
    pCtx.fillRect(0, 0, 22, 22);

    pCtx.strokeStyle = 'rgba(10, 15, 29, 0.72)';
    pCtx.lineWidth = 4.5;
    pCtx.lineCap = 'round';
    pCtx.beginPath();
    pCtx.moveTo(4, 18);
    pCtx.lineTo(18, 4);
    pCtx.stroke();

    pCtx.strokeStyle = hexToRgba(colorHex, 0.85);
    pCtx.lineWidth = 2;
    pCtx.beginPath();
    pCtx.moveTo(4, 18);
    pCtx.lineTo(18, 4);
    pCtx.stroke();

    return new fabric.Pattern({
      source: patternCanvas,
      repeat: 'repeat'
    });
  }

  function getZoneFill(colorHex) {
    return state.drawing.useHatchPattern
      ? createDiagonalHatchPattern(colorHex)
      : hexToRgba(colorHex, 0.26);
  }

  document.getElementById('btn-toggle-hatch').addEventListener('click', () => {
    state.drawing.useHatchPattern = !state.drawing.useHatchPattern;
    const btn = document.getElementById('btn-toggle-hatch');
    const lbl = document.getElementById('hatch-mode-label');
    if (state.drawing.useHatchPattern) {
      btn.className = 'px-2 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 transition';
      lbl.textContent = 'Trama Rayada';
    } else {
      btn.className = 'px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold flex items-center gap-1 transition';
      lbl.textContent = 'Sólido Suave';
    }

    const active = fabricCanvas.getActiveObject();
    if (active && (active.tacticalType === 'zone' || active.type === 'polygon')) {
      active.set('fill', getZoneFill(state.drawing.color));
      fabricCanvas.renderAll();
    }
  });

  // ============================================================================
  // 5. FÁBRICA DE ELEMENTOS TÁCTICOS DE ÉLITE (ENLACES, POLÍGONOS, SPOTLIGHTS)
  // ============================================================================

  /**
   * A. ANILLO 3D DE JUGADOR PARA ENLACE ESTILO LONGOMATCH
   */
  function createLongoMatchPlayerNode(x, y, color = '#eab308', radius = 38) {
    const rx = radius;
    const ry = Math.round(radius * 0.42);

    const baseDisk = new fabric.Ellipse({
      rx: rx,
      ry: ry,
      fill: hexToRgba(color, 0.72),
      stroke: color,
      strokeWidth: 3,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
      shadow: new fabric.Shadow({ color: color, blur: 12, offsetX: 0, offsetY: 2 })
    });

    const upperCrown = new fabric.Ellipse({
      rx: rx * 1.04,
      ry: ry * 1.08,
      fill: hexToRgba(color, 0.22),
      stroke: color,
      strokeWidth: 4,
      strokeDashArray: [7, 5],
      originX: 'center',
      originY: 'center',
      left: 0,
      top: -6
    });

    const innerRing = new fabric.Ellipse({
      rx: rx * 0.6,
      ry: ry * 0.6,
      fill: 'transparent',
      stroke: '#ffffff',
      strokeWidth: 1.5,
      opacity: 0.7,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0
    });

    return new fabric.Group([baseDisk, upperCrown, innerRing], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      selectable: true,
      hasControls: true,
      tacticalType: 'chain-node',
      customColor: color,
      customSize: radius,
      connectedLines: []
    });
  }

  function createLongoMatchLinkLine(nodeA, nodeB) {
    const line = new fabric.Line([nodeA.left, nodeA.top, nodeB.left, nodeB.top], {
      stroke: '#ea580c',
      strokeWidth: 5,
      strokeLineCap: 'round',
      selectable: false,
      evented: false,
      tacticalType: 'chain-line',
      nodeStart: nodeA,
      nodeEnd: nodeB,
      shadow: new fabric.Shadow({ color: 'rgba(239, 68, 68, 0.85)', blur: 8 })
    });

    nodeA.connectedLines.push(line);
    nodeB.connectedLines.push(line);
    return line;
  }

  fabricCanvas.on('object:moving', (e) => {
    const obj = e.target;
    if (obj && obj.tacticalType === 'chain-node' && Array.isArray(obj.connectedLines)) {
      obj.connectedLines.forEach(line => {
        if (line.nodeStart === obj) {
          line.set({ x1: obj.left, y1: obj.top });
        } else if (line.nodeEnd === obj) {
          line.set({ x2: obj.left, y2: obj.top });
        }
        line.setCoords();
      });
      fabricCanvas.renderAll();
    }
  });

  /**
   * B. LUZ DE FOCO (SPOTLIGHT) AJUSTABLE EN TAMAÑO Y COLOR UNA VEZ PUESTO
   */
  function createSpotlightObject(x, y, radius = 65, color = '#eab308') {
    const r = Math.max(25, radius);
    const outer = 3200;

    const maskPathStr = [
      `M ${-outer} ${-outer} L ${outer} ${-outer} L ${outer} ${outer} L ${-outer} ${outer} Z`,
      `M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 Z`
    ].join(' ');

    const darkOverlay = new fabric.Path(maskPathStr, {
      fill: 'rgba(6, 9, 19, 0.72)',
      fillRule: 'evenodd',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0
    });

    const lightBeam = new fabric.Polygon(
      [
        { x: -r * 0.42, y: -r * 3.4 },
        { x: r * 0.42, y: -r * 3.4 },
        { x: r, y: 0 },
        { x: -r, y: 0 }
      ],
      {
        fill: hexToRgba(color, 0.12),
        originX: 'center',
        originY: 'bottom',
        left: 0,
        top: 0
      }
    );

    const glowRing = new fabric.Ellipse({
      rx: r,
      ry: r * 0.48,
      fill: hexToRgba(color, 0.18),
      stroke: color,
      strokeWidth: 4,
      strokeDashArray: [9, 5],
      originX: 'center',
      originY: 'center',
      left: 0,
      top: r * 0.22,
      shadow: new fabric.Shadow({ color: color, blur: 14 })
    });

    return new fabric.Group([darkOverlay, lightBeam, glowRing], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      selectable: true,
      hasControls: true,
      tacticalType: 'spotlight',
      customColor: color,
      customSize: r
    });
  }

  /**
   * C. FLECHAS RECTAS Y CURVAS
   */
  function createStraightArrow(x1, y1, x2, y2, color, strokeWidth = 5) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 18 + strokeWidth * 1.4;

    const line = new fabric.Line([x1, y1, x2, y2], {
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: 'round',
      originX: 'center',
      originY: 'center'
    });

    const head = new fabric.Triangle({
      left: x2,
      top: y2,
      width: headLen,
      height: headLen,
      fill: color,
      angle: (angle * 180) / Math.PI + 90,
      originX: 'center',
      originY: 'center'
    });

    return new fabric.Group([line, head], {
      selectable: true,
      hasControls: true,
      tacticalType: 'arrow',
      customColor: color,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.65)', blur: 6, offsetY: 2 })
    });
  }

  function createCurvedArrow(x1, y1, x2, y2, color, strokeWidth = 5) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;
    const curveOffset = Math.min(95, dist * 0.28);
    const cx = midX + (-dy / dist) * curveOffset;
    const cy = midY + (dx / dist) * curveOffset;

    const path = new fabric.Path(`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, {
      fill: '',
      stroke: color,
      strokeWidth: strokeWidth,
      strokeDashArray: [10, 7],
      strokeLineCap: 'round'
    });

    const tangent = Math.atan2(y2 - cy, x2 - cx);
    const headLen = 18 + strokeWidth * 1.4;
    const head = new fabric.Triangle({
      left: x2,
      top: y2,
      width: headLen,
      height: headLen,
      fill: color,
      angle: (tangent * 180) / Math.PI + 90,
      originX: 'center',
      originY: 'center'
    });

    return new fabric.Group([path, head], {
      selectable: true,
      hasControls: true,
      tacticalType: 'curved-arrow',
      customColor: color,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.65)', blur: 6, offsetY: 2 })
    });
  }

  /**
   * D. RECTÁNGULOS Y ÓVALOS DE ZONA
   */
  function createRectZone(x1, y1, x2, y2, color) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.max(20, Math.abs(x2 - x1));
    const height = Math.max(20, Math.abs(y2 - y1));

    return new fabric.Rect({
      left,
      top,
      width,
      height,
      rx: 6,
      ry: 6,
      fill: getZoneFill(color),
      stroke: color,
      strokeWidth: 3,
      strokeDashArray: [8, 5],
      tacticalType: 'zone',
      customColor: color,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 8 })
    });
  }

  function createOvalZone(x1, y1, x2, y2, color) {
    const rx = Math.max(15, Math.abs(x2 - x1) / 2);
    const ry = Math.max(12, Math.abs(y2 - y1) / 2);

    return new fabric.Ellipse({
      left: (x1 + x2) / 2,
      top: (y1 + y2) / 2,
      rx,
      ry,
      originX: 'center',
      originY: 'center',
      fill: getZoneFill(color),
      stroke: color,
      strokeWidth: 3,
      strokeDashArray: [8, 5],
      tacticalType: 'zone',
      customColor: color,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 8 })
    });
  }

  /**
   * E. ETIQUETA DE JUGADOR
   */
  function createPlayerBadge(x, y, dorsal, name, color) {
    const circle = new fabric.Circle({
      radius: 16,
      fill: color,
      stroke: '#ffffff',
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0
    });

    const numTxt = new fabric.Text(String(dorsal || '10'), {
      fontSize: 13,
      fontWeight: 'bold',
      fontFamily: 'JetBrains Mono, monospace',
      fill: color === '#ffffff' || color === '#eab308' ? '#060913' : '#ffffff',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0
    });

    const boxW = Math.max(78, name.length * 7.8 + 18);
    const rect = new fabric.Rect({
      width: boxW,
      height: 22,
      rx: 5,
      ry: 5,
      fill: 'rgba(15, 23, 42, 0.92)',
      stroke: color,
      strokeWidth: 1.5,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 28
    });

    const nameTxt = new fabric.Text(name, {
      fontSize: 11,
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      fill: '#f8fafc',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 28
    });

    return new fabric.Group([circle, numTxt, rect, nameTxt], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      selectable: true,
      hasControls: true,
      tacticalType: 'player-tag',
      customColor: color,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.75)', blur: 8, offsetY: 3 })
    });
  }

  // ============================================================================
  // 6. EDICIÓN EN VIVO DE TAMAÑO Y COLOR DE SPOTLIGHTS Y OBJETOS COLOCADOS
  // ============================================================================
  function syncControlsWithSelectedObject() {
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    if (active.tacticalType === 'spotlight' || active.tacticalType === 'chain-node') {
      const currentRadius = Math.round((active.customSize || 65) * (active.scaleX || 1));
      sizeSlider.value = Math.min(160, Math.max(25, currentRadius));
      sizeLabel.textContent = sizeSlider.value;
    } else {
      const approxSize = Math.round((active.scaleX || 1) * 65);
      sizeSlider.value = Math.min(160, Math.max(25, approxSize));
      sizeLabel.textContent = sizeSlider.value;
    }
  }

  fabricCanvas.on('selection:created', syncControlsWithSelectedObject);
  fabricCanvas.on('selection:updated', syncControlsWithSelectedObject);

  sizeSlider.addEventListener('input', (e) => {
    const newVal = parseInt(e.target.value, 10);
    sizeLabel.textContent = newVal;
    state.drawing.size = newVal;

    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    if (active.tacticalType === 'spotlight') {
      const posX = active.left;
      const posY = active.top;
      const col = active.customColor || state.drawing.color;
      fabricCanvas.remove(active);
      const updatedSpot = createSpotlightObject(posX, posY, newVal, col);
      fabricCanvas.add(updatedSpot);
      fabricCanvas.setActiveObject(updatedSpot);
      fabricCanvas.renderAll();
    } else if (active.tacticalType === 'chain-node') {
      const baseSize = active.customSize || 38;
      active.scale(newVal / baseSize);
      fabricCanvas.renderAll();
    } else {
      active.scale(newVal / 65);
      fabricCanvas.renderAll();
    }
  });

  function applyNewColor(newColor) {
    state.drawing.color = newColor;
    document.getElementById('input-custom-color').value = newColor;

    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    active.customColor = newColor;

    if (active.tacticalType === 'spotlight') {
      const posX = active.left;
      const posY = active.top;
      const currentRadius = Math.round((active.customSize || 65) * (active.scaleX || 1));
      fabricCanvas.remove(active);
      const newSpot = createSpotlightObject(posX, posY, currentRadius, newColor);
      fabricCanvas.add(newSpot);
      fabricCanvas.setActiveObject(newSpot);
    } else if (active.tacticalType === 'chain-node') {
      const [baseDisk, upperCrown] = active._objects;
      baseDisk.set({
        fill: hexToRgba(newColor, 0.72),
        stroke: newColor,
        shadow: new fabric.Shadow({ color: newColor, blur: 12, offsetY: 2 })
      });
      upperCrown.set({ fill: hexToRgba(newColor, 0.22), stroke: newColor });
    } else if (active.tacticalType === 'zone' || active.type === 'polygon') {
      active.set({
        stroke: newColor,
        fill: getZoneFill(newColor)
      });
    } else if (active.type === 'group') {
      active._objects.forEach(child => {
        if (child.type === 'line' || child.type === 'path') child.set('stroke', newColor);
        if (child.type === 'triangle' || child.type === 'circle') child.set('fill', newColor);
        if (child.type === 'rect') child.set('stroke', newColor);
      });
    }

    fabricCanvas.renderAll();
  }

  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-btn').forEach(b => {
        b.classList.remove('ring-2', 'ring-white', 'scale-110');
        b.classList.add('opacity-75');
      });
      btn.classList.add('ring-2', 'ring-white', 'scale-110');
      btn.classList.remove('opacity-75');
      applyNewColor(btn.dataset.color);
    });
  });

  document.getElementById('input-custom-color').addEventListener('input', (e) => {
    applyNewColor(e.target.value);
  });

  // ============================================================================
  // 7. FLUJO DE DIBUJO: ENLACES LONGOMATCH, POLÍGONOS Y HERRAMIENTAS
  // ============================================================================
  function finalizeActiveChainOrPolygon() {
    if (state.drawing.chainNodes.length > 0) {
      state.drawing.chainNodes = [];
      state.drawing.chainLines = [];
      notify('Enlace completado. Pulsa "Guardar en Clip" para integrarlo en el clip actual.', 'success');
    }

    if (state.drawing.polygonPoints.length >= 3) {
      state.drawing.polygonPreviewObjects.forEach(o => fabricCanvas.remove(o));
      state.drawing.polygonPreviewObjects = [];

      const poly = new fabric.Polygon(state.drawing.polygonPoints, {
        fill: getZoneFill(state.drawing.color),
        stroke: state.drawing.color,
        strokeWidth: 3,
        strokeDashArray: [8, 5],
        selectable: true,
        hasControls: true,
        tacticalType: 'zone',
        customColor: state.drawing.color,
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.55)', blur: 8 })
      });

      state.drawing.polygonPoints = [];
      fabricCanvas.add(poly);
      fabricCanvas.setActiveObject(poly);
      fabricCanvas.renderAll();
      notify('Polígono creado. Pulsa "Guardar en Clip" para integrarlo en el clip.', 'success');
    } else if (state.drawing.polygonPoints.length > 0) {
      state.drawing.polygonPreviewObjects.forEach(o => fabricCanvas.remove(o));
      state.drawing.polygonPreviewObjects = [];
      state.drawing.polygonPoints = [];
    }

    btnFinishChain.classList.add('hidden');
    btnFinishChain.classList.remove('flex');
    helperBanner.classList.add('hidden');
  }

  function setActiveTool(toolName) {
    if (state.drawing.tool === 'chain-link' || state.drawing.tool === 'polygon-zone') {
      finalizeActiveChainOrPolygon();
    }

    state.drawing.tool = toolName;
    document.querySelectorAll('.fabric-tool-btn').forEach(btn => {
      btn.classList.toggle('active-tool', btn.dataset.tool === toolName);
    });

    if (toolName !== 'select' && state.videoLoaded && !video.paused) {
      video.pause();
    }

    if (toolName === 'chain-link' || toolName === 'polygon-zone') {
      btnFinishChain.classList.remove('hidden');
      btnFinishChain.classList.add('flex');
      helperBanner.classList.remove('hidden');
    }

    if (toolName === 'select') {
      fabricCanvas.selection = true;
      fabricCanvas.defaultCursor = 'default';
      fabricCanvas.forEachObject(obj => {
        if (obj.tacticalType !== 'chain-line') {
          obj.selectable = true;
          obj.evented = true;
        }
      });
    } else {
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.defaultCursor = 'crosshair';
      fabricCanvas.forEachObject(obj => {
        obj.selectable = false;
        obj.evented = false;
      });
      fabricCanvas.renderAll();
    }
  }

  document.querySelectorAll('.fabric-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

  btnFinishChain.addEventListener('click', () => setActiveTool('select'));

  fabricCanvas.on('mouse:down', (opt) => {
    const tool = state.drawing.tool;
    if (tool === 'select') return;

    if (state.videoLoaded && !video.paused) video.pause();
    const pt = fabricCanvas.getPointer(opt.e);

    if (tool === 'chain-link') {
      const nodeRadius = Math.max(28, Math.min(60, Math.round(state.drawing.size * 0.6)));
      const newNode = createLongoMatchPlayerNode(pt.x, pt.y, state.drawing.color, nodeRadius);
      newNode.selectable = false;
      newNode.evented = false;

      if (state.drawing.chainNodes.length > 0) {
        const prevNode = state.drawing.chainNodes[state.drawing.chainNodes.length - 1];
        const linkLine = createLongoMatchLinkLine(prevNode, newNode);
        fabricCanvas.add(linkLine);
        linkLine.sendToBack();
        state.drawing.chainLines.push(linkLine);
      }

      fabricCanvas.add(newNode);
      state.drawing.chainNodes.push(newNode);
      fabricCanvas.renderAll();
      return;
    }

    if (tool === 'polygon-zone') {
      state.drawing.polygonPoints.push({ x: pt.x, y: pt.y });

      const vertexDot = new fabric.Circle({
        left: pt.x,
        top: pt.y,
        radius: 5,
        fill: state.drawing.color,
        stroke: '#ffffff',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        selectable: false,
        evented: false
      });
      fabricCanvas.add(vertexDot);
      state.drawing.polygonPreviewObjects.push(vertexDot);

      const pts = state.drawing.polygonPoints;
      if (pts.length > 1) {
        const prev = pts[pts.length - 2];
        const seg = new fabric.Line([prev.x, prev.y, pt.x, pt.y], {
          stroke: state.drawing.color,
          strokeWidth: 2.5,
          strokeDashArray: [6, 4],
          selectable: false,
          evented: false
        });
        fabricCanvas.add(seg);
        state.drawing.polygonPreviewObjects.push(seg);
      }
      fabricCanvas.renderAll();
      return;
    }

    if (tool === 'spotlight') {
      const spot = createSpotlightObject(pt.x, pt.y, state.drawing.size, state.drawing.color);
      fabricCanvas.add(spot);
      setActiveTool('select');
      fabricCanvas.setActiveObject(spot);
      fabricCanvas.renderAll();
      return;
    }

    if (tool === 'player-tag') {
      const text = prompt('Dorsal y Nombre/Rol (Ej: 6 - Zubimendi | Pivote):', '10 - Jugador');
      if (text && text.trim()) {
        const parts = text.split('-');
        const dorsal = parts.length > 1 ? parts[0].trim() : '10';
        const name = parts.length > 1 ? parts.slice(1).join('-').trim() : text.trim();
        const badge = createPlayerBadge(pt.x, pt.y, dorsal, name, state.drawing.color);
        fabricCanvas.add(badge);
        setActiveTool('select');
        fabricCanvas.setActiveObject(badge);
        fabricCanvas.renderAll();
      }
      return;
    }

    state.drawing.isDragging = true;
    state.drawing.startX = pt.x;
    state.drawing.startY = pt.y;
  });

  fabricCanvas.on('mouse:dblclick', () => {
    if (state.drawing.tool === 'chain-link' || state.drawing.tool === 'polygon-zone') {
      setActiveTool('select');
    }
  });

  fabricCanvas.on('mouse:move', (opt) => {
    if (!state.drawing.isDragging) return;
    const pt = fabricCanvas.getPointer(opt.e);
    const { startX, startY, tool, color } = state.drawing;

    if (state.drawing.tempObject) {
      fabricCanvas.remove(state.drawing.tempObject);
    }

    if (Math.hypot(pt.x - startX, pt.y - startY) < 8) return;

    if (tool === 'rect-zone') {
      state.drawing.tempObject = createRectZone(startX, startY, pt.x, pt.y, color);
    } else if (tool === 'oval-zone') {
      state.drawing.tempObject = createOvalZone(startX, startY, pt.x, pt.y, color);
    } else if (tool === 'arrow') {
      state.drawing.tempObject = createStraightArrow(startX, startY, pt.x, pt.y, color);
    } else if (tool === 'curved-arrow') {
      state.drawing.tempObject = createCurvedArrow(startX, startY, pt.x, pt.y, color);
    }

    if (state.drawing.tempObject) {
      state.drawing.tempObject.selectable = false;
      state.drawing.tempObject.evented = false;
      fabricCanvas.add(state.drawing.tempObject);
      fabricCanvas.renderAll();
    }
  });

  fabricCanvas.on('mouse:up', () => {
    if (!state.drawing.isDragging) return;
    state.drawing.isDragging = false;

    if (state.drawing.tempObject) {
      const created = state.drawing.tempObject;
      state.drawing.tempObject = null;
      setActiveTool('select');
      fabricCanvas.setActiveObject(created);
      fabricCanvas.renderAll();
    }
  });

  function deleteSelectedObjects() {
    const activeObjs = fabricCanvas.getActiveObjects();
    if (activeObjs.length === 0) return;

    activeObjs.forEach(obj => {
      if (obj.tacticalType === 'chain-node' && Array.isArray(obj.connectedLines)) {
        obj.connectedLines.forEach(line => fabricCanvas.remove(line));
      }
      fabricCanvas.remove(obj);
    });
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
  }

  function clearFabricCanvas() {
    state.drawing.chainNodes = [];
    state.drawing.chainLines = [];
    state.drawing.polygonPoints = [];
    state.drawing.polygonPreviewObjects = [];
    fabricCanvas.clear();
    fabricCanvas.renderAll();
  }

  document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedObjects);
  document.getElementById('btn-clear-canvas').addEventListener('click', clearFabricCanvas);

  /**
   * GUARDAR PIZARRA DENTRO DEL CLIP (SIN DUPLICAR CLIPS)
   * 1. Si hay un clip seleccionado (state.selectedClipId), mete la pizarra dentro de ese clip.
   * 2. Si no hay clip seleccionado pero el vídeo está detenido dentro del rango [start, end] de un clip existente, lo mete ahí.
   * 3. Solo si no existe ningún clip en ese tiempo crea uno nuevo.
   */
  document.getElementById('btn-save-drawing-clip').addEventListener('click', async () => {
    // Cerrar enlaces o polígonos abiertos antes de serializar
    if (state.drawing.tool === 'chain-link' || state.drawing.tool === 'polygon-zone') {
      setActiveTool('select');
    }

    if (fabricCanvas.getObjects().length === 0) {
      notify('Dibuja primero en la pizarra para guardarla dentro del clip.', 'warning');
      return;
    }

    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();

    const now = state.videoLoaded ? +video.currentTime.toFixed(2) : 0;

    // Buscar clip destino: primero el clip seleccionado, si no uno que contenga el tiempo actual
    let targetClip = state.clips.find(c => c.id === state.selectedClipId);
    if (!targetClip) {
      targetClip = state.clips.find(c => now >= c.start && now <= c.end);
    }

    if (targetClip) {
      targetClip.fabricJson = fabricCanvas.toJSON(['tacticalType', 'customColor', 'customSize']);
      // Guardamos el segundo exacto dentro del clip donde el analista pausó y dibujó la pizarra
      targetClip.drawTimestamp = (now >= targetClip.start && now <= targetClip.end)
        ? now
        : targetClip.timestamp;
      targetClip.thumbnail = generateThumbnailBase64();
      state.selectedClipId = targetClip.id;

      await persistState();
      renderClipsList();
      renderTimeline();
      notify(`Pizarra integrada dentro del clip "${targetClip.label}" (en ${formatTimeShort(targetClip.drawTimestamp)}) sin duplicar.`, 'success');
    } else {
      // Si no había ningún clip creado en ese momento, creamos uno nuevo con la pizarra integrada
      await registerClipEvent({ id: 'pizarra', name: 'Pizarra Táctica RCL', category: 'Ataque' });
    }
  });

  // ============================================================================
  // 8. REPRODUCTOR DE VÍDEO Y PAUSA AUTOMÁTICA EN LA PIZARRA DEL CLIP
  // ============================================================================
  function loadLocalVideo(file) {
    if (!file || !file.type.startsWith('video/')) {
      notify('Selecciona un archivo de vídeo válido (MP4, MOV, WebM).', 'error');
      return;
    }
    video.src = URL.createObjectURL(file);
    video.load();
    state.videoLoaded = true;
    state.activeClip = null;
    state.isPlayingPlaylist = false;
    document.getElementById('active-clip-indicator').classList.add('hidden');
    dropzone.classList.add('hidden');
    document.getElementById('loaded-video-name').textContent = file.name;
    notify(`Partido cargado en RCL Video Análisis: ${file.name}`, 'success');
  }

  document.getElementById('video-file-input').addEventListener('change', (e) => {
    if (e.target.files.length > 0) loadLocalVideo(e.target.files[0]);
  });
  document.getElementById('btn-trigger-upload').addEventListener('click', () => {
    document.getElementById('video-file-input').click();
  });

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
    videoStage.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); });
  });
  videoStage.addEventListener('dragover', () => dropzone.classList.remove('hidden'));
  videoStage.addEventListener('dragleave', () => { if (state.videoLoaded) dropzone.classList.add('hidden'); });
  videoStage.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) loadLocalVideo(e.dataTransfer.files[0]);
  });

  function togglePlay() {
    if (!state.videoLoaded) {
      notify('Carga primero un vídeo de partido.', 'warning');
      return;
    }
    if (video.paused) {
      if (document.getElementById('chk-autoclear').checked && fabricCanvas.getObjects().length > 0) {
        clearFabricCanvas();
      }
      video.play();
    } else {
      video.pause();
    }
  }

  video.addEventListener('play', () => {
    document.getElementById('btn-play-pause').innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>';
    lucide.createIcons();
  });

  video.addEventListener('pause', () => {
    document.getElementById('btn-play-pause').innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
    lucide.createIcons();
  });

  video.addEventListener('loadedmetadata', () => {
    timecodeDuration.textContent = formatTimePrecise(video.duration);
    syncOverlayWithVideo();
    renderTimeline();
  });

  video.addEventListener('timeupdate', () => {
    timecodeCurrent.textContent = formatTimePrecise(video.currentTime);
    if (video.duration) {
      const pct = Math.min(100, Math.max(0, (video.currentTime / video.duration) * 100));
      timelinePlayhead.style.left = `${pct}%`;
    }

    if (state.activeClip) {
      const clip = state.activeClip;
      const hasVectors = clip.fabricJson && clip.fabricJson.objects && clip.fabricJson.objects.length > 0;
      const targetDrawSec = clip.drawTimestamp !== undefined ? clip.drawTimestamp : clip.timestamp;

      // Si el clip tiene una pizarra guardada adentro y llegamos a su segundo exacto, mostrar la pizarra automáticamente
      if (hasVectors && !state.hasShownClipDrawing && video.currentTime >= targetDrawSec) {
        state.hasShownClipDrawing = true;
        video.pause();
        loadVectorsIntoCanvas(clip.fabricJson, targetCanvas => targetCanvas.renderAll());
        notify(`Pizarra del clip mostrada en ${formatTimePrecise(targetDrawSec)}. Pulsa Espacio para continuar el clip.`, 'info');
        return;
      }

      // Fin del clip
      if (video.currentTime >= clip.end) {
        if (state.isPlayingPlaylist && state.playlistQueue.length > 0) {
          const nextClip = state.playlistQueue.shift();
          playClip(nextClip, true);
        } else {
          video.pause();
          state.activeClip = null;
          state.isPlayingPlaylist = false;
        }
      }
    }
  });

  document.getElementById('btn-play-pause').addEventListener('click', togglePlay);

  function seekRelative(delta) {
    if (!state.videoLoaded) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  }

  document.getElementById('btn-back-5').addEventListener('click', () => seekRelative(-5));
  document.getElementById('btn-back-1').addEventListener('click', () => seekRelative(-1));
  document.getElementById('btn-fwd-1').addEventListener('click', () => seekRelative(1));
  document.getElementById('btn-fwd-5').addEventListener('click', () => seekRelative(5));
  document.getElementById('btn-frame-prev').addEventListener('click', () => { video.pause(); seekRelative(-0.04); });
  document.getElementById('btn-frame-next').addEventListener('click', () => { video.pause(); seekRelative(0.04); });

  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      video.playbackRate = parseFloat(btn.dataset.rate);
      document.querySelectorAll('.speed-btn').forEach(b => {
        b.className = 'speed-btn px-2 py-0.5 rounded text-slate-400 hover:text-white transition';
      });
      btn.className = 'speed-btn px-2 py-0.5 rounded bg-[#1e293b] text-emerald-400 font-bold transition';
    });
  });

  document.getElementById('btn-mute').addEventListener('click', () => {
    video.muted = !video.muted;
    document.getElementById('btn-mute').innerHTML = video.muted
      ? '<i data-lucide="volume-x" class="w-4 h-4 text-rose-400"></i>'
      : '<i data-lucide="volume-2" class="w-4 h-4"></i>';
    lucide.createIcons();
  });

  document.getElementById('btn-stop-clip').addEventListener('click', () => {
    state.activeClip = null;
    state.selectedClipId = null;
    state.isPlayingPlaylist = false;
    state.playlistQueue = [];
    video.pause();
    document.getElementById('active-clip-indicator').classList.add('hidden');
    renderClipsList();
  });

  // ============================================================================
  // 9. CAPTURA DE MINIATURAS Y SNAPSHOT FULL HD CON LOGO RCL
  // ============================================================================
  function generateThumbnailBase64() {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (state.videoLoaded && video.videoWidth > 0) {
      ctx.drawImage(video, 0, 0, c.width, c.height);
    } else {
      ctx.fillStyle = '#064e3b';
      ctx.fillRect(0, 0, c.width, c.height);
    }

    if (fabricCanvas.lowerCanvasEl) {
      ctx.drawImage(fabricCanvas.lowerCanvasEl, 0, 0, c.width, c.height);
    }
    return c.toDataURL('image/jpeg', 0.85);
  }

  document.getElementById('btn-snapshot-png').addEventListener('click', () => {
    const out = document.createElement('canvas');
    out.width = (state.videoLoaded && video.videoWidth) ? video.videoWidth : 1920;
    out.height = (state.videoLoaded && video.videoHeight) ? video.videoHeight : 1080;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (state.videoLoaded && video.videoWidth) {
      ctx.drawImage(video, 0, 0, out.width, out.height);
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, out.width, out.height);
    }

    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
    ctx.drawImage(fabricCanvas.lowerCanvasEl, 0, 0, out.width, out.height);

    try {
      if (rclLogoImg.complete && rclLogoImg.naturalWidth > 0) {
        const logoSize = Math.round(out.height * 0.08);
        ctx.drawImage(rclLogoImg, out.width - logoSize - 28, 24, logoSize, logoSize);
      }
    } catch (e) {}

    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `RCL_Video_Analisis_${formatTimeShort(video.currentTime).replace(':', 'm')}s.png`;
    a.click();
    notify('Captura Full HD de RCL Video Análisis descargada.', 'success');
  });

  // ============================================================================
  // 10. TAGGING, INTEGRACIÓN DE PIZARRA EN CLIP Y GESTIÓN DE PLAYLIST
  // ============================================================================
  const btnHome = document.getElementById('btn-team-home');
  const btnAway = document.getElementById('btn-team-away');

  btnHome.addEventListener('click', () => {
    state.activeTeam = 'Local';
    btnHome.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-emerald-600 text-white transition';
    btnAway.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-[#1e293b] text-slate-400 hover:text-white transition';
  });

  btnAway.addEventListener('click', () => {
    state.activeTeam = 'Visitante';
    btnAway.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-sky-600 text-white transition';
    btnHome.className = 'px-2.5 py-1 rounded text-xs font-semibold bg-[#1e293b] text-slate-400 hover:text-white transition';
  });

  function renderTaggingMatrix() {
    const container = document.getElementById('tagging-matrix-container');
    container.innerHTML = '';

    ['Ataque', 'Defensa', 'Transiciones', 'ABP'].forEach(cat => {
      const catTags = state.tags.filter(t => t.category === cat);
      const meta = CATEGORY_META[cat] || CATEGORY_META['Ataque'];

      const block = document.createElement('div');
      block.className = 'bg-[#0a0f1d] border border-slate-800/90 rounded-lg p-2.5';
      block.innerHTML = `
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.badge}">${cat}</span>
          <span class="text-[10px] font-mono text-slate-500">${catTags.length} tags</span>
        </div>
        <div class="grid grid-cols-2 gap-1.5 tag-grid"></div>
      `;

      const grid = block.querySelector('.tag-grid');
      catTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.id = `tag-btn-${tag.id}`;
        btn.className = `border rounded-md px-2.5 py-1.5 text-left text-xs font-medium flex items-center justify-between gap-1.5 transition text-slate-100 ${meta.btn}`;
        btn.innerHTML = `
          <span class="truncate">${tag.name}</span>
          <kbd class="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border shrink-0 ${meta.key}">${tag.key}</kbd>
        `;
        btn.addEventListener('click', () => registerClipEvent(tag));
        grid.appendChild(btn);
      });

      container.appendChild(block);
    });
  }

  async function registerClipEvent(tag) {
    const now = state.videoLoaded ? video.currentTime : 0;
    const duration = (state.videoLoaded && video.duration) ? video.duration : 5400;

    const pre = Math.max(0, parseFloat(document.getElementById('input-preroll').value) || 5);
    const post = Math.max(1, parseFloat(document.getElementById('input-postroll').value) || 5);

    const start = Math.max(0, +(now - pre).toFixed(2));
    const end = Math.min(duration, +(now + post).toFixed(2));

    const hasVectors = fabricCanvas.getObjects().length > 0;
    const fabricJson = hasVectors ? fabricCanvas.toJSON(['tacticalType', 'customColor', 'customSize']) : null;
    const thumbnail = generateThumbnailBase64();

    const clip = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      label: tag.name,
      category: tag.category,
      team: state.activeTeam,
      timestamp: +now.toFixed(2),
      drawTimestamp: +now.toFixed(2),
      start,
      end,
      note: '',
      selected: true,
      thumbnail,
      fabricJson
    };

    state.clips.unshift(clip);
    state.selectedClipId = clip.id;
    await persistState();

    const btnEl = document.getElementById(`tag-btn-${tag.id}`);
    if (btnEl) {
      btnEl.classList.add('tag-active-flash');
      setTimeout(() => btnEl.classList.remove('tag-active-flash'), 250);
    }

    renderClipsList();
    renderTimeline();
    notify(`Clip creado: ${tag.name} (${formatTimeShort(start)} - ${formatTimeShort(end)})`, 'success');
  }

  function getFilteredClips() {
    const query = document.getElementById('input-filter-clips').value.trim().toLowerCase();
    const catFilter = document.getElementById('select-filter-category').value;

    return state.clips.filter(c => {
      const matchCat = catFilter === 'ALL' || c.category === catFilter;
      const matchText =
        c.label.toLowerCase().includes(query) ||
        c.team.toLowerCase().includes(query) ||
        (c.note && c.note.toLowerCase().includes(query));
      return matchCat && matchText;
    });
  }

  function getActivePlaylistClips() {
    const filtered = getFilteredClips();
    const checked = filtered.filter(c => c.selected !== false);
    return checked.length > 0 ? checked : filtered;
  }

  function renderClipsList() {
    const listEl = document.getElementById('clips-list-container');
    document.getElementById('count-all-clips').textContent = state.clips.length;
    const filtered = getFilteredClips();

    listEl.innerHTML = '';

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="h-44 flex flex-col items-center justify-center text-center text-slate-500">
          <p class="text-xs font-medium">Sin clips en la lista actual</p>
          <p class="text-[11px] text-slate-600 mt-0.5">Etiqueta primero los clips y luego haz clic en cualquiera para añadirle su pizarra</p>
        </div>
      `;
      return;
    }

    filtered.forEach(clip => {
      const meta = CATEGORY_META[clip.category] || CATEGORY_META['Ataque'];
      const hasDrawing = clip.fabricJson && clip.fabricJson.objects && clip.fabricJson.objects.length > 0;
      const isSelected = clip.id === state.selectedClipId;

      const item = document.createElement('div');
      item.className = `bg-[#0f172a] border border-slate-800 hover:border-emerald-500/50 rounded-lg p-2 flex items-center gap-2.5 transition cursor-pointer group ${isSelected ? 'clip-card-active' : ''}`;
      item.innerHTML = `
        <!-- Checkbox para Playlist / Exportación -->
        <input type="checkbox" data-act="check" ${clip.selected !== false ? 'checked' : ''} class="accent-emerald-500 rounded cursor-pointer shrink-0" title="Incluir en la exportación MP4" />

        <!-- Miniatura -->
        <div class="w-24 h-14 rounded bg-black border border-slate-800 overflow-hidden relative shrink-0">
          ${clip.thumbnail ? `<img src="${clip.thumbnail}" class="w-full h-full object-cover" alt="clip" />` : ''}
          <span class="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] font-mono px-1 rounded text-emerald-400">
            ${formatTimeShort(clip.start)}-${formatTimeShort(clip.end)}
          </span>
          ${hasDrawing ? `<span class="absolute top-0.5 left-0.5 bg-amber-500 text-slate-950 text-[8px] font-extrabold px-1 rounded shadow" title="Pizarra integrada en ${formatTimeShort(clip.drawTimestamp || clip.timestamp)}">PIZARRA</span>` : ''}
        </div>

        <!-- Detalles -->
        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div class="flex items-start justify-between gap-1">
            <div class="truncate">
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border ${meta.badge}">${clip.category}</span>
                <span class="text-[10px] font-semibold ${clip.team === 'Local' ? 'text-emerald-400' : 'text-sky-400'}">${clip.team}</span>
                ${isSelected ? `<span class="text-[8px] bg-emerald-500 text-slate-950 font-bold px-1 rounded">ACTIVO</span>` : ''}
              </div>
              <h4 class="text-xs font-bold text-white truncate mt-0.5">${clip.label}</h4>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button data-act="draw-here" class="p-1 rounded hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 text-xs" title="Ir al momento de la pizarra de este clip para dibujarla o editarla">
                <i data-lucide="pen-tool" class="w-3 h-3"></i>
              </button>
              <button data-act="edit" class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white text-xs" title="Editar tiempos o nota del clip">
                <i data-lucide="sliders-horizontal" class="w-3 h-3"></i>
              </button>
              <button data-act="del" class="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-xs" title="Eliminar clip">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
          </div>

          ${clip.note ? `<p class="text-[10px] text-slate-400 truncate italic">"${clip.note}"</p>` : ''}

          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-0.5">
            <span>${hasDrawing ? `Pizarra en ${formatTimePrecise(clip.drawTimestamp || clip.timestamp)}` : `Duración: ${(clip.end - clip.start).toFixed(1)}s`}</span>
            <span class="text-emerald-400 group-hover:underline font-sans font-semibold text-[10px]">Ver Clip ▶</span>
          </div>
        </div>
      `;

      item.querySelector('[data-act="check"]').addEventListener('change', async (e) => {
        e.stopPropagation();
        clip.selected = e.target.checked;
        await persistState();
      });

      // Clic en la tarjeta: selecciona este clip y lo reproduce desde su inicio (mostrando su pizarra cuando llegue al segundo de la pizarra)
      item.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        state.isPlayingPlaylist = false;
        playClip(clip, false);
      });

      // Botón rápido de pluma: salta directamente al fotograma clave del clip en pausa para dibujar o editar su pizarra sin duplicarlo
      item.querySelector('[data-act="draw-here"]').addEventListener('click', (e) => {
        e.stopPropagation();
        selectClipForDrawing(clip);
      });

      item.querySelector('[data-act="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditClipModal(clip);
      });

      item.querySelector('[data-act="del"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (state.selectedClipId === clip.id) state.selectedClipId = null;
        state.clips = state.clips.filter(c => c.id !== clip.id);
        await persistState();
        renderClipsList();
        renderTimeline();
      });

      listEl.appendChild(item);
    });

    lucide.createIcons();
  }

  function loadVectorsIntoCanvas(json, callback) {
    if (!json || !json.objects || json.objects.length === 0) {
      clearFabricCanvas();
      if (callback) callback(fabricCanvas);
      return;
    }
    fabricCanvas.loadFromJSON(json, () => {
      fabricCanvas.getObjects().forEach(obj => {
        if (obj.tacticalType === 'zone' && state.drawing.useHatchPattern) {
          obj.set('fill', createDiagonalHatchPattern(obj.customColor || obj.stroke || '#10b981'));
        }
      });
      fabricCanvas.renderAll();
      if (callback) callback(fabricCanvas);
    });
  }

  function selectClipForDrawing(clip) {
    state.selectedClipId = clip.id;
    state.activeClip = clip;
    state.hasShownClipDrawing = true;
    renderClipsList();

    document.getElementById('active-clip-text').textContent = `EDITANDO PIZARRA: ${clip.label} (${clip.team})`;
    document.getElementById('active-clip-indicator').classList.remove('hidden');

    if (state.videoLoaded) {
      video.pause();
      video.currentTime = clip.drawTimestamp !== undefined ? clip.drawTimestamp : clip.timestamp;
    }

    loadVectorsIntoCanvas(clip.fabricJson);
    notify(`Clip "${clip.label}" activo. Dibuja en pantalla y pulsa "Guardar en Clip".`, 'info');
  }

  function playClip(clip, isPlaylistMode = false) {
    state.selectedClipId = clip.id;
    state.activeClip = clip;
    state.hasShownClipDrawing = false;
    renderClipsList();

    clearFabricCanvas();

    if (!state.videoLoaded) {
      loadVectorsIntoCanvas(clip.fabricJson);
      notify('Pizarra cargada. Carga el vídeo del partido para reproducir el clip.', 'info');
      return;
    }

    const prefix = isPlaylistMode ? '[LISTA] ' : '';
    document.getElementById('active-clip-text').textContent = `${prefix}${clip.label} (${clip.team}) • ${formatTimeShort(clip.start)} - ${formatTimeShort(clip.end)}`;
    document.getElementById('active-clip-indicator').classList.remove('hidden');

    video.currentTime = clip.start;
    video.play();
  }

  document.getElementById('btn-play-playlist').addEventListener('click', () => {
    if (!state.videoLoaded) {
      notify('Carga primero un archivo de vídeo local.', 'warning');
      return;
    }
    const list = [...getActivePlaylistClips()].reverse();
    if (list.length === 0) {
      notify('No hay clips seleccionados en la lista.', 'warning');
      return;
    }
    state.isPlayingPlaylist = true;
    const first = list.shift();
    state.playlistQueue = list;
    playClip(first, true);
    notify(`Reproduciendo Lista (${list.length + 1} clips)...`, 'info');
  });

  document.getElementById('chk-select-all-clips').addEventListener('change', async (e) => {
    const checked = e.target.checked;
    getFilteredClips().forEach(c => { c.selected = checked; });
    await persistState();
    renderClipsList();
  });

  document.getElementById('btn-export-playlist-json').addEventListener('click', () => {
    const list = getActivePlaylistClips();
    if (list.length === 0) {
      notify('No hay clips seleccionados para exportar.', 'warning');
      return;
    }
    const payload = {
      suite: 'RCL Video Análisis - Playlist',
      organization: 'RCL Scout Group',
      exportedAt: new Date().toISOString(),
      clipsCount: list.length,
      tags: state.tags,
      clips: list
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `RCL_Playlist_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    notify(`Lista exportada (${list.length} clips).`, 'success');
  });

  // ============================================================================
  // 11. MOTOR DE EXPORTACIÓN DE VÍDEO EN .MP4 (ALTA CALIDAD + VECTORES HD)
  // ============================================================================
  const modalVideoExport = document.getElementById('modal-video-export');
  let cancelExportFlag = false;

  document.getElementById('btn-export-merged-video').addEventListener('click', () => {
    if (!state.videoLoaded) {
      notify('Carga primero el vídeo del partido para exportar los clips en MP4.', 'warning');
      return;
    }
    const clipsToExport = getActivePlaylistClips();
    if (clipsToExport.length === 0) {
      notify('No hay clips seleccionados para exportar.', 'warning');
      return;
    }
    document.getElementById('export-progress-box').classList.add('hidden');
    document.getElementById('btn-start-video-export').disabled = false;
    modalVideoExport.classList.remove('hidden');
  });

  const closeVideoExportModal = () => {
    cancelExportFlag = true;
    modalVideoExport.classList.add('hidden');
  };

  document.getElementById('btn-close-video-export').addEventListener('click', closeVideoExportModal);
  document.getElementById('btn-cancel-video-export').addEventListener('click', closeVideoExportModal);

  function waitVideoSeek(targetSec) {
    return new Promise((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = targetSec;
    });
  }

  /**
   * Detecta el mejor códec MP4 / H.264 soportado por el navegador para garantizar máxima calidad y archivo .mp4
   */
  function getBestMp4MimeType() {
    const candidates = [
      'video/mp4;codecs=avc1.64002A,mp4a.40.2', // H.264 High Profile 1080p MP4
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // H.264 Baseline MP4
      'video/mp4;codecs=avc1',
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm'
    ];
    for (const type of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  /**
   * Renderiza el JSON de Fabric.js en un StaticCanvas independiente a la resolución exacta de exportación (1080p/720p)
   * evitando cualquier pixelación o borrosidad.
   */
  function renderHighResVectorsOffscreen(fabricJson, targetW, targetH) {
    return new Promise((resolve) => {
      if (!fabricJson || !fabricJson.objects || fabricJson.objects.length === 0) {
        resolve(null);
        return;
      }
      const tempCanvasEl = document.createElement('canvas');
      tempCanvasEl.width = targetW;
      tempCanvasEl.height = targetH;

      const staticFabric = new fabric.StaticCanvas(tempCanvasEl, {
        width: targetW,
        height: targetH
      });

      const scaleFactor = targetW / BASE_W;
      staticFabric.setZoom(scaleFactor);

      staticFabric.loadFromJSON(fabricJson, () => {
        staticFabric.getObjects().forEach(obj => {
          if (obj.tacticalType === 'zone' && state.drawing.useHatchPattern) {
            obj.set('fill', createDiagonalHatchPattern(obj.customColor || obj.stroke || '#10b981'));
          }
        });
        staticFabric.renderAll();
        resolve(staticFabric.lowerCanvasEl);
      });
    });
  }

  document.getElementById('btn-start-video-export').addEventListener('click', async () => {
    const clips = [...getActivePlaylistClips()].reverse();
    if (clips.length === 0) return;

    cancelExportFlag = false;
    const qualityProfile = document.getElementById('select-export-quality').value;
    const pauseOnDrawings = document.getElementById('chk-export-pause-drawings').checked;
    const freezeDurationMs = parseInt(document.getElementById('select-freeze-duration').value, 10) || 3000;
    const showLowerThird = document.getElementById('chk-export-overlay-title').checked;

    // Configurar resolución y bitrate óptimo para mantener máxima nitidez con peso contenido
    let exportW = 1920;
    let exportH = 1080;
    let targetBitrate = 8000000; // 8 Mbps para 1080p

    if (qualityProfile === '720p') {
      exportW = 1280;
      exportH = 720;
      targetBitrate = 4500000; // 4.5 Mbps para 720p
    } else if (qualityProfile === 'native' && video.videoWidth && video.videoHeight) {
      exportW = video.videoWidth;
      exportH = video.videoHeight;
      targetBitrate = 6500000;
    }

    const progressBox = document.getElementById('export-progress-box');
    const progressStatus = document.getElementById('export-progress-status');
    const progressPct = document.getElementById('export-progress-pct');
    const progressBar = document.getElementById('export-progress-bar');
    const startBtn = document.getElementById('btn-start-video-export');

    progressBox.classList.remove('hidden');
    startBtn.disabled = true;

    const recCanvas = document.createElement('canvas');
    recCanvas.width = exportW;
    recCanvas.height = exportH;
    const rCtx = recCanvas.getContext('2d', { alpha: false });
    rCtx.imageSmoothingEnabled = true;
    rCtx.imageSmoothingQuality = 'high';

    const stream = recCanvas.captureStream(30);
    const mimeType = getBestMp4MimeType();

    const recorderOptions = { videoBitsPerSecond: targetBitrate };
    if (mimeType) recorderOptions.mimeType = mimeType;

    const recorder = new MediaRecorder(stream, recorderOptions);
    const recordedChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    const recordingFinished = new Promise((resolve) => {
      recorder.onstop = () => resolve();
    });

    const scaleUI = exportH / 720;

    const drawCompositeFrame = (clip, highResVectorCanvas = null) => {
      rCtx.fillStyle = '#000000';
      rCtx.fillRect(0, 0, exportW, exportH);
      rCtx.drawImage(video, 0, 0, exportW, exportH);

      if (highResVectorCanvas) {
        rCtx.drawImage(highResVectorCanvas, 0, 0, exportW, exportH);
      }

      if (showLowerThird) {
        const boxX = Math.round(28 * scaleUI);
        const boxY = Math.round(exportH - 74 * scaleUI);
        const boxW = Math.round(500 * scaleUI);
        const boxH = Math.round(48 * scaleUI);

        rCtx.fillStyle = 'rgba(10, 15, 29, 0.88)';
        rCtx.fillRect(boxX, boxY, boxW, boxH);
        rCtx.fillStyle = '#10b981';
        rCtx.fillRect(boxX, boxY, Math.round(6 * scaleUI), boxH);

        rCtx.font = `bold ${Math.round(17 * scaleUI)}px Inter, sans-serif`;
        rCtx.fillStyle = '#ffffff';
        rCtx.fillText(`${clip.label.toUpperCase()} (${clip.team})`, boxX + Math.round(18 * scaleUI), boxY + Math.round(23 * scaleUI));

        rCtx.font = `${Math.round(11.5 * scaleUI)}px JetBrains Mono, monospace`;
        rCtx.fillStyle = '#94a3b8';
        rCtx.fillText(`RCL VIDEO ANÁLISIS • ${formatTimeShort(clip.start)} - ${formatTimeShort(clip.end)}`, boxX + Math.round(18 * scaleUI), boxY + Math.round(40 * scaleUI));

        try {
          if (rclLogoImg.complete && rclLogoImg.naturalWidth > 0) {
            const logoSz = Math.round(54 * scaleUI);
            rCtx.drawImage(rclLogoImg, exportW - logoSz - Math.round(24 * scaleUI), Math.round(20 * scaleUI), logoSz, logoSz);
          }
        } catch (err) {}
      }
    };

    recorder.start(100);
    video.pause();

    for (let i = 0; i < clips.length; i++) {
      if (cancelExportFlag) break;

      const clip = clips[i];
      const hasVectors = clip.fabricJson && clip.fabricJson.objects && clip.fabricJson.objects.length > 0;
      const drawTargetSec = clip.drawTimestamp !== undefined ? clip.drawTimestamp : clip.timestamp;

      progressStatus.textContent = `Renderizando clip ${i + 1}/${clips.length}: ${clip.label}`;
      const pct = Math.round((i / clips.length) * 100);
      progressPct.textContent = `${pct}%`;
      progressBar.style.width = `${pct}%`;

      // Pre-renderizar la pizarra vectorial del clip a resolución Full HD/HD nativa
      const hiResVectorLayer = hasVectors
        ? await renderHighResVectorsOffscreen(clip.fabricJson, exportW, exportH)
        : null;

      await waitVideoSeek(clip.start);

      let pausedForDrawing = false;
      await video.play();

      await new Promise((resolveClip) => {
        const stepFrame = () => {
          if (cancelExportFlag) {
            video.pause();
            resolveClip();
            return;
          }

          if (pauseOnDrawings && hiResVectorLayer && !pausedForDrawing && video.currentTime >= drawTargetSec) {
            pausedForDrawing = true;
            video.pause();
            const freezeStart = performance.now();
            const freezeLoop = () => {
              if (cancelExportFlag) { resolveClip(); return; }
              drawCompositeFrame(clip, hiResVectorLayer);
              if (performance.now() - freezeStart < freezeDurationMs) {
                requestAnimationFrame(freezeLoop);
              } else {
                video.play();
                requestAnimationFrame(stepFrame);
              }
            };
            requestAnimationFrame(freezeLoop);
            return;
          }

          drawCompositeFrame(clip, (!pauseOnDrawings && hiResVectorLayer) ? hiResVectorLayer : null);

          if (video.currentTime >= clip.end || video.ended) {
            video.pause();
            resolveClip();
          } else {
            requestAnimationFrame(stepFrame);
          }
        };

        requestAnimationFrame(stepFrame);
      });
    }

    recorder.stop();
    await recordingFinished;

    if (!cancelExportFlag && recordedChunks.length > 0) {
      progressPct.textContent = '100%';
      progressBar.style.width = '100%';
      progressStatus.textContent = '¡Archivo MP4 generado con éxito!';

      const blob = new Blob(recordedChunks, { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RCL_Video_Analisis_${new Date().toISOString().slice(0, 10)}.mp4`;
      a.click();
      notify('Vídeo .MP4 en alta calidad descargado correctamente.', 'success');
      setTimeout(() => modalVideoExport.classList.add('hidden'), 800);
    }

    startBtn.disabled = false;
  });

  // ============================================================================
  // 12. TIMELINE INTERACTIVO
  // ============================================================================
  function renderTimeline() {
    ['Ataque', 'Defensa', 'Transiciones', 'ABP'].forEach(cat => {
      const track = document.getElementById(`timeline-track-${cat}`);
      if (track) track.innerHTML = '';
    });

    const duration = (state.videoLoaded && video.duration) ? video.duration : 5400;

    state.clips.forEach(clip => {
      const track = document.getElementById(`timeline-track-${clip.category}`);
      if (!track) return;

      const meta = CATEGORY_META[clip.category] || CATEGORY_META['Ataque'];
      const leftPct = Math.max(0, Math.min(99.4, (clip.start / duration) * 100));
      const widthPct = Math.max(0.6, Math.min(100 - leftPct, ((clip.end - clip.start) / duration) * 100));

      const marker = document.createElement('div');
      marker.className = 'timeline-clip-marker';
      marker.style.left = `${leftPct}%`;
      marker.style.width = `${widthPct}%`;
      marker.style.backgroundColor = meta.color;
      if (clip.id === state.selectedClipId) {
        marker.style.outline = '2px solid #ffffff';
      }
      marker.title = `${clip.label} (${clip.team}) | ${formatTimeShort(clip.start)} - ${formatTimeShort(clip.end)}`;

      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        state.isPlayingPlaylist = false;
        playClip(clip, false);
      });

      track.appendChild(marker);
    });
  }

  timelineArea.addEventListener('click', (e) => {
    if (!state.videoLoaded || !video.duration) return;
    const rect = timelineArea.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = pct * video.duration;
  });

  document.getElementById('input-filter-clips').addEventListener('input', renderClipsList);
  document.getElementById('select-filter-category').addEventListener('change', renderClipsList);

  document.getElementById('btn-clear-all-clips').addEventListener('click', async () => {
    if (state.clips.length === 0) return;
    if (confirm('¿Eliminar todos los clips registrados del proyecto actual?')) {
      state.clips = [];
      state.selectedClipId = null;
      await persistState();
      renderClipsList();
      renderTimeline();
      notify('Clips eliminados.', 'info');
    }
  });

  // ============================================================================
  // 13. MODALES DE EDICIÓN Y EXPORTACIÓN JSON / CSV
  // ============================================================================
  const modalEditClip = document.getElementById('modal-edit-clip');

  function openEditClipModal(clip) {
    document.getElementById('edit-clip-id').value = clip.id;
    document.getElementById('edit-clip-label').value = clip.label;
    document.getElementById('edit-clip-team').value = clip.team;
    document.getElementById('edit-clip-start').value = clip.start;
    document.getElementById('edit-clip-end').value = clip.end;
    document.getElementById('edit-clip-note').value = clip.note || '';
    modalEditClip.classList.remove('hidden');
  }

  const closeEditModal = () => modalEditClip.classList.add('hidden');
  document.getElementById('btn-close-edit-modal').addEventListener('click', closeEditModal);
  document.getElementById('btn-cancel-edit-modal').addEventListener('click', closeEditModal);

  document.getElementById('btn-remove-clip-vectors').addEventListener('click', async () => {
    const id = document.getElementById('edit-clip-id').value;
    const idx = state.clips.findIndex(c => c.id === id);
    if (idx === -1) return;

    state.clips[idx].fabricJson = null;
    clearFabricCanvas();
    state.clips[idx].thumbnail = generateThumbnailBase64();
    await persistState();
    renderClipsList();
    closeEditModal();
    notify('Pizarra eliminada del clip (el clip se mantiene intacto).', 'info');
  });

  document.getElementById('btn-save-edit-modal').addEventListener('click', async () => {
    const id = document.getElementById('edit-clip-id').value;
    const idx = state.clips.findIndex(c => c.id === id);
    if (idx === -1) return;

    const startVal = parseFloat(document.getElementById('edit-clip-start').value) || 0;
    const endVal = parseFloat(document.getElementById('edit-clip-end').value) || startVal + 5;

    state.clips[idx].label = document.getElementById('edit-clip-label').value.trim() || 'Evento';
    state.clips[idx].team = document.getElementById('edit-clip-team').value;
    state.clips[idx].start = Math.max(0, startVal);
    state.clips[idx].end = Math.max(startVal + 0.5, endVal);
    state.clips[idx].note = document.getElementById('edit-clip-note').value.trim();

    await persistState();
    renderClipsList();
    renderTimeline();
    closeEditModal();
    notify('Clip actualizado.', 'success');
  });

  const modalNewTag = document.getElementById('modal-new-tag');
  document.getElementById('btn-open-new-tag').addEventListener('click', () => {
    document.getElementById('input-tag-name').value = '';
    document.getElementById('input-tag-shortcut').value = '';
    modalNewTag.classList.remove('hidden');
  });

  const closeTagModal = () => modalNewTag.classList.add('hidden');
  document.getElementById('btn-close-tag-modal').addEventListener('click', closeTagModal);
  document.getElementById('btn-cancel-tag-modal').addEventListener('click', closeTagModal);

  document.getElementById('btn-save-tag-modal').addEventListener('click', async () => {
    const name = document.getElementById('input-tag-name').value.trim();
    const category = document.getElementById('select-tag-category').value;
    const key = document.getElementById('input-tag-shortcut').value.trim().toUpperCase();

    if (!name || !key) {
      notify('Completa el nombre y la tecla rápida.', 'warning');
      return;
    }

    state.tags.push({ id: 'tag_' + Date.now(), name, category, key });
    await persistState();
    renderTaggingMatrix();
    closeTagModal();
    notify(`Botón "${name}" [${key}] añadido.`, 'success');
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    const payload = {
      suite: 'RCL Video Análisis',
      organization: 'RCL Scout Group',
      exportedAt: new Date().toISOString(),
      tags: state.tags,
      clips: state.clips
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `RCL_Proyecto_Tactico_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    notify('Proyecto JSON exportado.', 'success');
  });

  document.getElementById('input-import-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data.tags)) state.tags = data.tags;
        if (Array.isArray(data.clips)) state.clips = data.clips;
        await persistState();
        renderTaggingMatrix();
        renderClipsList();
        renderTimeline();
        notify(`Proyecto cargado (${state.clips.length} clips).`, 'success');
      } catch (err) {
        notify('Archivo JSON inválido.', 'error');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    const list = getActivePlaylistClips();
    if (list.length === 0) {
      notify('No hay clips para exportar a CSV.', 'warning');
      return;
    }

    const headers = [
      'Orden',
      'Categoria',
      'Etiqueta',
      'Equipo',
      'Inicio_Seg',
      'Fin_Seg',
      'Segundo_Pizarra',
      'Duracion_Seg',
      'Inicio_MMSS',
      'Fin_MMSS',
      'Tiene_Pizarra',
      'Nota_Tactica'
    ];

    const rows = [...list].reverse().map((c, i) => [
      i + 1,
      `"${c.category}"`,
      `"${c.label.replace(/"/g, '""')}"`,
      `"${c.team}"`,
      c.start,
      c.end,
      c.drawTimestamp || c.timestamp,
      (c.end - c.start).toFixed(2),
      formatTimePrecise(c.start),
      formatTimePrecise(c.end),
      c.fabricJson && c.fabricJson.objects && c.fabricJson.objects.length > 0 ? 'SI' : 'NO',
      `"${(c.note || '').replace(/"/g, '""')}"`
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `RCL_Informe_Eventos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    notify('Informe CSV exportado.', 'success');
  });

  // ============================================================================
  // 14. ATAJOS DE TECLADO (HOTKEYS)
  // ============================================================================
  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

    if (e.key === 'Enter' || e.key === 'Escape') {
      if (state.drawing.tool === 'chain-link' || state.drawing.tool === 'polygon-zone') {
        e.preventDefault();
        setActiveTool('select');
        return;
      }
    }

    // Ctrl+S guarda rápidamente la pizarra dentro del clip activo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      document.getElementById('btn-save-drawing-clip').click();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (fabricCanvas.getActiveObjects().length > 0) {
        e.preventDefault();
        deleteSelectedObjects();
        return;
      }
    }

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
      return;
    }

    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      seekRelative(e.shiftKey ? -5 : -1);
      return;
    }
    if (e.code === 'ArrowRight') {
      e.preventDefault();
      seekRelative(e.shiftKey ? 5 : 1);
      return;
    }

    if (e.key === ',') {
      e.preventDefault();
      video.pause();
      seekRelative(-0.04);
      return;
    }
    if (e.key === '.') {
      e.preventDefault();
      video.pause();
      seekRelative(0.04);
      return;
    }

    const keyUpper = e.key.toUpperCase();
    const matchedTag = state.tags.find(t => t.key.toUpperCase() === keyUpper);
    if (matchedTag) {
      e.preventDefault();
      registerClipEvent(matchedTag);
    }
  });

  // ============================================================================
  // 15. INICIALIZACIÓN DE LA SUITE
  // ============================================================================
  try {
    await dbService.init();
    const saved = await dbService.load();
    if (saved) {
      if (Array.isArray(saved.tags) && saved.tags.length > 0) state.tags = saved.tags;
      if (Array.isArray(saved.clips)) state.clips = saved.clips;
    }
  } catch (err) {
    console.warn('IndexedDB aviso:', err);
  }

  syncOverlayWithVideo();
  renderTaggingMatrix();
  renderClipsList();
  renderTimeline();
});
