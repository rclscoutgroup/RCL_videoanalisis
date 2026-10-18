/**
 * TacticalStudio Pro - Suite de Videoanálisis Táctico & Telestration con Fabric.js + IndexedDB
 * Ejecución 100% en Cliente (Preparado para GitHub Pages)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar iconos Lucide
  lucide.createIcons();

  // ============================================================================
  // 1. SERVICIO DE PERSISTENCIA EN INDEXEDDB
  // ============================================================================
  const DB_NAME = 'TacticalStudioProDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  const ACTIVE_PROJECT_KEY = 'active_session_v1';

  class IndexedDBStorage {
    constructor() {
      this.db = null;
    }

    async init() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };

        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve();
        };

        request.onerror = (e) => reject(e.target.error);
      });
    }

    async saveProject(projectData) {
      if (!this.db) return;
      setDbStatus('Guardando...', false);
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ id: ACTIVE_PROJECT_KEY, updatedAt: Date.now(), ...projectData });
        tx.oncomplete = () => {
          setDbStatus('IndexedDB Sincronizado', true);
          resolve();
        };
        tx.onerror = (e) => reject(e.target.error);
      });
    }

    async loadProject() {
      if (!this.db) return null;
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(ACTIVE_PROJECT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    }
  }

  const dbService = new IndexedDBStorage();

  function setDbStatus(text, isSynced = true) {
    const dot = document.getElementById('db-status-dot');
    const label = document.getElementById('db-status-text');
    if (dot && label) {
      dot.className = `w-1.5 h-1.5 rounded-full ${isSynced ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`;
      label.textContent = text;
    }
  }

  // ============================================================================
  // 2. ESTADO GLOBAL DE LA APLICACIÓN
  // ============================================================================
  const BASE_CANVAS_W = 1280;
  const BASE_CANVAS_H = 720;

  const state = {
    videoLoaded: false,
    activeTeam: 'Local',
    activeClip: null,
    drawing: {
      tool: 'select', // 'select' | 'arrow' | 'curved-arrow' | 'spotlight' | 'zone' | 'player-tag' | 'freehand'
      color: '#ef4444',
      strokeWidth: 5,
      isDraggingShape: false,
      startX: 0,
      startY: 0,
      tempObject: null
    },
    tags: [
      // Ataque
      { id: 'tag_1', name: 'Ataque Posicional', category: 'Ataque', key: 'A' },
      { id: 'tag_2', name: 'Ruptura / Desmarque', category: 'Ataque', key: 'W' },
      { id: 'tag_3', name: 'Ocasión / Tiro', category: 'Ataque', key: 'S' },
      { id: 'tag_4', name: 'Gol', category: 'Ataque', key: 'G' },
      // Defensa
      { id: 'tag_5', name: 'Defensa Organizada', category: 'Defensa', key: 'D' },
      { id: 'tag_6', name: 'Recuperación', category: 'Defensa', key: 'R' },
      { id: 'tag_7', name: 'Presión Alta', category: 'Defensa', key: 'F' },
      { id: 'tag_8', name: 'Duelo Ganado', category: 'Defensa', key: 'E' },
      // Transiciones
      { id: 'tag_9', name: 'Pérdida', category: 'Transiciones', key: 'P' },
      { id: 'tag_10', name: 'Contraataque', category: 'Transiciones', key: 'T' },
      { id: 'tag_11', name: 'Repliegue Intensivo', category: 'Transiciones', key: 'X' },
      // ABP (Balón Parado)
      { id: 'tag_12', name: 'Córner', category: 'ABP', key: 'C' },
      { id: 'tag_13', name: 'ABP Lateral / Frontal', category: 'ABP', key: 'B' },
      { id: 'tag_14', name: 'Saque de Banda Táctico', category: 'ABP', key: 'V' }
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

  // Formato preciso 00:00.00 (minutos:segundos.centésimas)
  function formatTimePrecise(sec) {
    if (isNaN(sec) || sec < 0) return '00:00.00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    const hundredths = Math.floor((sec % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  function formatTimeShort(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function hexToRgba(hex, alpha = 0.25) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 239;
    const g = parseInt(clean.substring(2, 4), 16) || 68;
    const b = parseInt(clean.substring(4, 6), 16) || 68;
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
    }, 2600);
  }

  async function persistState() {
    await dbService.saveProject({
      tags: state.tags,
      clips: state.clips
    });
  }

  // ============================================================================
  // 4. INICIALIZACIÓN Y MOTOR VECTORIAL FABRIC.JS
  // ============================================================================
  // Configuración global de controles de selección en Fabric.js
  fabric.Object.prototype.set({
    transparentCorners: false,
    cornerColor: '#10b981',
    cornerStrokeColor: '#060913',
    borderColor: '#10b981',
    cornerSize: 9,
    cornerStyle: 'circle',
    padding: 4
  });

  const fabricCanvas = new fabric.Canvas('tactical-canvas', {
    width: BASE_CANVAS_W,
    height: BASE_CANVAS_H,
    selection: true,
    preserveObjectStacking: true
  });

  /**
   * Sincroniza milimétricamente el tamaño del contenedor de Fabric.js con el rectángulo
   * real renderizado del vídeo y aplica un factor de zoom proporcional sobre 1280x720.
   */
  function syncOverlayWithVideo() {
    const stageRect = videoStage.getBoundingClientRect();
    if (stageRect.width === 0 || stageRect.height === 0) return;

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

    const zoomScale = renderW / BASE_CANVAS_W;
    fabricCanvas.setDimensions({ width: renderW, height: renderH });
    fabricCanvas.setZoom(zoomScale);
    fabricCanvas.renderAll();
  }

  const stageObserver = new ResizeObserver(syncOverlayWithVideo);
  stageObserver.observe(videoStage);
  video.addEventListener('loadedmetadata', syncOverlayWithVideo);

  // ============================================================================
  // 5. CONSTRUCTORES DE OBJETOS TÁCTICOS VECTORIALES (FABRIC.JS)
  // ============================================================================

  /**
   * 1. Flecha Recta Táctica (Pase / Basculación)
   */
  function createStraightArrow(x1, y1, x2, y2, color, strokeWidth) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 16 + strokeWidth * 1.4;

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
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.65)', blur: 6, offsetX: 0, offsetY: 2 })
    });
  }

  /**
   * 2. Flecha Curva Discontinua (Desmarque / Conducción / Cambio de Orientación)
   */
  function createCurvedArrow(x1, y1, x2, y2, color, strokeWidth) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy) || 1;

    // Punto de control perpendicular para generar el arco de pase/desmarque
    const curvature = Math.min(90, dist * 0.28);
    const nx = -dy / dist;
    const ny = dx / dist;
    const cx = midX + nx * curvature;
    const cy = midY + ny * curvature;

    const pathStr = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    const curvePath = new fabric.Path(pathStr, {
      fill: '',
      stroke: color,
      strokeWidth: strokeWidth,
      strokeDashArray: [10, 7],
      strokeLineCap: 'round'
    });

    // Ángulo tangente en el extremo final de la curva cuadrática
    const tangentAngle = Math.atan2(y2 - cy, x2 - cx);
    const headLen = 16 + strokeWidth * 1.4;

    const head = new fabric.Triangle({
      left: x2,
      top: y2,
      width: headLen,
      height: headLen,
      fill: color,
      angle: (tangentAngle * 180) / Math.PI + 90,
      originX: 'center',
      originY: 'center'
    });

    return new fabric.Group([curvePath, head], {
      selectable: true,
      hasControls: true,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.65)', blur: 6, offsetX: 0, offsetY: 2 })
    });
  }

  /**
   * 3. Luz de Foco (Spotlight Broadcast):
   * Oscurece el campo con un velo negro semitransparente dejando un hueco circular de luz
   * sobre el jugador + anillo táctico y haz de luz superior. Totalmente movible y escalable.
   */
  function createSpotlightObject(x, y, radius = 65, accentColor = '#eab308') {
    const r = Math.max(30, radius);
    // Rectángulo gigante exterior + círculo interior en sentido opuesto (fillRule: 'evenodd')
    const outer = 3000;
    const pathData = [
      `M ${-outer} ${-outer} L ${outer} ${-outer} L ${outer} ${outer} L ${-outer} ${outer} Z`,
      `M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 Z`
    ].join(' ');

    const maskHole = new fabric.Path(pathData, {
      fill: 'rgba(6, 9, 19, 0.72)',
      fillRule: 'evenodd',
      originX: 'center',
      originY: 'center',
      selectable: false
    });

    // Haz de luz cónico vertical (estilo TV broadcast)
    const beamPoly = new fabric.Polygon(
      [
        { x: -r * 0.45, y: -r * 3.2 },
        { x: r * 0.45, y: -r * 3.2 },
        { x: r, y: 0 },
        { x: -r, y: 0 }
      ],
      {
        fill: 'rgba(255, 255, 255, 0.08)',
        originX: 'center',
        originY: 'bottom',
        top: 0,
        left: 0
      }
    );

    // Anillo táctico de base en perspectiva
    const baseRing = new fabric.Ellipse({
      rx: r,
      ry: r * 0.55,
      fill: 'transparent',
      stroke: accentColor,
      strokeWidth: 3,
      strokeDashArray: [8, 5],
      originX: 'center',
      originY: 'center',
      top: r * 0.25,
      left: 0
    });

    return new fabric.Group([maskHole, beamPoly, baseRing], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      selectable: true,
      hasControls: true
    });
  }

  /**
   * 4. Zona de Influencia / Espacio Táctico (Óvalo semitransparente)
   */
  function createTacticalZone(x1, y1, x2, y2, color, strokeWidth) {
    const rx = Math.max(15, Math.abs(x2 - x1) / 2);
    const ry = Math.max(10, Math.abs(y2 - y1) / 2);
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    return new fabric.Ellipse({
      left: centerX,
      top: centerY,
      rx: rx,
      ry: ry,
      originX: 'center',
      originY: 'center',
      fill: hexToRgba(color, 0.24),
      stroke: color,
      strokeWidth: strokeWidth,
      strokeDashArray: [8, 5],
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: 8 })
    });
  }

  /**
   * 5. Etiqueta de Jugador (Dorsal + Nombre/Rol flotante vectorial)
   */
  function createPlayerBadge(x, y, dorsalText, playerName, color) {
    const badgeCircle = new fabric.Circle({
      radius: 16,
      fill: color,
      stroke: '#ffffff',
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0
    });

    const numberTxt = new fabric.Text(String(dorsalText || '10'), {
      fontSize: 13,
      fontWeight: 'bold',
      fontFamily: 'JetBrains Mono, monospace',
      fill: color === '#ffffff' || color === '#eab308' ? '#060913' : '#ffffff',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0
    });

    const labelWidth = Math.max(76, playerName.length * 7.8 + 18);
    const labelRect = new fabric.Rect({
      width: labelWidth,
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

    const nameTxt = new fabric.Text(playerName, {
      fontSize: 11,
      fontWeight: 'bold',
      fontFamily: 'Inter, sans-serif',
      fill: '#f8fafc',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 28
    });

    return new fabric.Group([badgeCircle, numberTxt, labelRect, nameTxt], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      selectable: true,
      hasControls: true,
      shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.75)', blur: 8, offsetY: 3 })
    });
  }

  // ============================================================================
  // 6. GESTIÓN DE HERRAMIENTAS E INTERACCIÓN EN FABRIC.JS
  // ============================================================================
  function setActiveTool(toolName) {
    state.drawing.tool = toolName;

    document.querySelectorAll('.fabric-tool-btn').forEach(btn => {
      btn.classList.toggle('active-tool', btn.dataset.tool === toolName);
    });

    // Pausar el vídeo automáticamente al elegir cualquier herramienta de dibujo
    if (toolName !== 'select' && state.videoLoaded && !video.paused) {
      video.pause();
    }

    if (toolName === 'freehand') {
      fabricCanvas.isDrawingMode = true;
      fabricCanvas.freeDrawingBrush.color = state.drawing.color;
      fabricCanvas.freeDrawingBrush.width = state.drawing.strokeWidth;
      fabricCanvas.selection = false;
    } else if (toolName === 'select') {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = true;
      fabricCanvas.defaultCursor = 'default';
      fabricCanvas.forEachObject(obj => { obj.selectable = true; obj.evented = true; });
    } else {
      fabricCanvas.isDrawingMode = false;
      fabricCanvas.selection = false;
      fabricCanvas.discardActiveObject();
      fabricCanvas.defaultCursor = 'crosshair';
      fabricCanvas.forEachObject(obj => { obj.selectable = false; obj.evented = false; });
      fabricCanvas.renderAll();
    }
  }

  document.querySelectorAll('.fabric-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

  // Cambiar Color (Actualiza herramienta actual + objeto seleccionado en el Canvas)
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newColor = btn.dataset.color;
      state.drawing.color = newColor;

      document.querySelectorAll('.color-btn').forEach(b => {
        b.classList.remove('ring-2', 'ring-white', 'scale-110');
        b.classList.add('opacity-75');
      });
      btn.classList.add('ring-2', 'ring-white', 'scale-110');
      btn.classList.remove('opacity-75');

      if (fabricCanvas.isDrawingMode) {
        fabricCanvas.freeDrawingBrush.color = newColor;
      }

      // Si hay un objeto seleccionado en Fabric, aplicar el nuevo color
      const activeObj = fabricCanvas.getActiveObject();
      if (activeObj) {
        applyColorToFabricObject(activeObj, newColor);
        fabricCanvas.renderAll();
      }
    });
  });

  function applyColorToFabricObject(obj, color) {
    if (obj.type === 'group') {
      obj._objects.forEach(child => {
        if (child.type === 'line' || child.type === 'path') child.set('stroke', color);
        if (child.type === 'triangle' || child.type === 'circle') child.set('fill', color);
        if (child.type === 'ellipse') child.set('stroke', color);
      });
    } else if (obj.type === 'ellipse') {
      obj.set({ stroke: color, fill: hexToRgba(color, 0.24) });
    } else if (obj.type === 'path') {
      obj.set('stroke', color);
    }
  }

  document.getElementById('select-stroke-width').addEventListener('change', (e) => {
    state.drawing.strokeWidth = parseInt(e.target.value, 10);
    if (fabricCanvas.isDrawingMode) {
      fabricCanvas.freeDrawingBrush.width = state.drawing.strokeWidth;
    }
  });

  // Eventos de dibujo interactivo en el Canvas de Fabric
  fabricCanvas.on('mouse:down', (opt) => {
    const tool = state.drawing.tool;
    if (tool === 'select' || tool === 'freehand') return;

    if (state.videoLoaded && !video.paused) video.pause();

    const pointer = fabricCanvas.getPointer(opt.e);
    state.drawing.startX = pointer.x;
    state.drawing.startY = pointer.y;

    // Herramientas de clic directo (Spotlight y Etiqueta de Jugador)
    if (tool === 'spotlight') {
      const spot = createSpotlightObject(pointer.x, pointer.y, 70, state.drawing.color);
      fabricCanvas.add(spot);
      setActiveTool('select');
      fabricCanvas.setActiveObject(spot);
      fabricCanvas.renderAll();
      return;
    }

    if (tool === 'player-tag') {
      const input = prompt('Introduce "Dorsal - Nombre/Nota" (Ej: 8 - Pedri | Interior Libre):', '10 - Jugador Clave');
      if (input && input.trim() !== '') {
        const parts = input.split('-');
        const dorsal = parts.length > 1 ? parts[0].trim() : '10';
        const name = parts.length > 1 ? parts.slice(1).join('-').trim() : input.trim();
        const badge = createPlayerBadge(pointer.x, pointer.y, dorsal, name, state.drawing.color);
        fabricCanvas.add(badge);
        setActiveTool('select');
        fabricCanvas.setActiveObject(badge);
        fabricCanvas.renderAll();
      }
      return;
    }

    // Herramientas de arrastrar (Flecha recta, Flecha curva, Zona)
    state.drawing.isDraggingShape = true;
  });

  fabricCanvas.on('mouse:move', (opt) => {
    if (!state.drawing.isDraggingShape) return;
    const pointer = fabricCanvas.getPointer(opt.e);
    const { startX, startY, tool, color, strokeWidth } = state.drawing;

    if (state.drawing.tempObject) {
      fabricCanvas.remove(state.drawing.tempObject);
    }

    if (Math.hypot(pointer.x - startX, pointer.y - startY) < 8) return;

    if (tool === 'arrow') {
      state.drawing.tempObject = createStraightArrow(startX, startY, pointer.x, pointer.y, color, strokeWidth);
    } else if (tool === 'curved-arrow') {
      state.drawing.tempObject = createCurvedArrow(startX, startY, pointer.x, pointer.y, color, strokeWidth);
    } else if (tool === 'zone') {
      state.drawing.tempObject = createTacticalZone(startX, startY, pointer.x, pointer.y, color, strokeWidth);
    }

    if (state.drawing.tempObject) {
      state.drawing.tempObject.selectable = false;
      state.drawing.tempObject.evented = false;
      fabricCanvas.add(state.drawing.tempObject);
      fabricCanvas.renderAll();
    }
  });

  fabricCanvas.on('mouse:up', () => {
    if (!state.drawing.isDraggingShape) return;
    state.drawing.isDraggingShape = false;

    if (state.drawing.tempObject) {
      const finalObj = state.drawing.tempObject;
      state.drawing.tempObject = null;
      setActiveTool('select');
      fabricCanvas.setActiveObject(finalObj);
      fabricCanvas.renderAll();
    }
  });

  // Eliminar selección y limpiar Canvas
  function deleteSelectedObjects() {
    const activeObjects = fabricCanvas.getActiveObjects();
    if (activeObjects.length > 0) {
      activeObjects.forEach(obj => fabricCanvas.remove(obj));
      fabricCanvas.discardActiveObject();
      fabricCanvas.renderAll();
    }
  }

  function clearFabricCanvas() {
    fabricCanvas.clear();
    fabricCanvas.renderAll();
  }

  document.getElementById('btn-delete-selected').addEventListener('click', deleteSelectedObjects);
  document.getElementById('btn-clear-canvas').addEventListener('click', clearFabricCanvas);

  // Botón "Guardar Pizarra" en un clip directo
  document.getElementById('btn-save-drawing-to-clip').addEventListener('click', async () => {
    if (fabricCanvas.getObjects().length === 0) {
      notify('Dibuja primero algún elemento táctico sobre el vídeo.', 'warning');
      return;
    }
    await registerClipEvent({
      id: 'pizarra',
      name: 'Pizarra Táctica',
      category: 'Ataque'
    });
  });

  // ============================================================================
  // 7. CARGA Y CONTROL DEL REPRODUCTOR DE VÍDEO
  // ============================================================================
  function loadLocalVideoFile(file) {
    if (!file || !file.type.startsWith('video/')) {
      notify('Selecciona un archivo de vídeo válido (MP4, MOV, WebM).', 'error');
      return;
    }
    const url = URL.createObjectURL(file);
    video.src = url;
    video.load();
    state.videoLoaded = true;
    state.activeClip = null;
    document.getElementById('active-clip-indicator').classList.add('hidden');
    dropzone.classList.add('hidden');
    document.getElementById('loaded-video-name').textContent = file.name;
    notify(`Partido cargado: ${file.name}`, 'success');
  }

  document.getElementById('video-file-input').addEventListener('change', (e) => {
    if (e.target.files.length > 0) loadLocalVideoFile(e.target.files[0]);
  });

  document.getElementById('btn-trigger-upload').addEventListener('click', () => {
    document.getElementById('video-file-input').click();
  });

  // Soporte Drag & Drop de vídeo
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evName => {
    videoStage.addEventListener(evName, (e) => { e.preventDefault(); e.stopPropagation(); });
  });
  videoStage.addEventListener('dragover', () => dropzone.classList.remove('hidden'));
  videoStage.addEventListener('dragleave', () => { if (state.videoLoaded) dropzone.classList.add('hidden'); });
  videoStage.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) loadLocalVideoFile(e.dataTransfer.files[0]);
  });

  function togglePlay() {
    if (!state.videoLoaded) {
      notify('Carga primero un archivo de vídeo local.', 'warning');
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
    const btn = document.getElementById('btn-play-pause');
    btn.innerHTML = '<i data-lucide="pause" class="w-4 h-4"></i>';
    lucide.createIcons();
  });

  video.addEventListener('pause', () => {
    const btn = document.getElementById('btn-play-pause');
    btn.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i>';
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

    if (state.activeClip && video.currentTime >= state.activeClip.end) {
      video.pause();
      video.currentTime = state.activeClip.end;
      state.activeClip = null;
      document.getElementById('active-clip-indicator').classList.add('hidden');
    }
  });

  document.getElementById('btn-play-pause').addEventListener('click', togglePlay);

  function seekRelative(delta) {
    if (!state.videoLoaded) return;
    state.activeClip = null;
    document.getElementById('active-clip-indicator').classList.add('hidden');
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
  }

  document.getElementById('btn-back-5').addEventListener('click', () => seekRelative(-5));
  document.getElementById('btn-back-1').addEventListener('click', () => seekRelative(-1));
  document.getElementById('btn-fwd-1').addEventListener('click', () => seekRelative(1));
  document.getElementById('btn-fwd-5').addEventListener('click', () => seekRelative(5));
  document.getElementById('btn-frame-prev').addEventListener('click', () => { video.pause(); seekRelative(-0.04); });
  document.getElementById('btn-frame-next').addEventListener('click', () => { video.pause(); seekRelative(0.04); });

  // Velocidades de reproducción (0.25x, 0.5x, 1x, 1.5x, 2x)
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const rate = parseFloat(btn.dataset.rate);
      video.playbackRate = rate;
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
    document.getElementById('active-clip-indicator').classList.add('hidden');
  });

  // ============================================================================
  // 8. CAPTURA DE MINIATURAS (THUMBNAILS) Y CAPTURA PNG HD
  // ============================================================================
  function generateThumbnailBase64() {
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 240;
    thumbCanvas.height = 135;
    const tCtx = thumbCanvas.getContext('2d');

    if (state.videoLoaded && video.videoWidth > 0) {
      tCtx.drawImage(video, 0, 0, thumbCanvas.width, thumbCanvas.height);
    } else {
      // Fondo táctico si se etiqueta sin vídeo cargado
      tCtx.fillStyle = '#064e3b';
      tCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
      tCtx.strokeStyle = 'rgba(255,255,255,0.25)';
      tCtx.strokeRect(10, 10, thumbCanvas.width - 20, thumbCanvas.height - 20);
    }

    // Superponer los vectores de Fabric.js en la miniatura
    const fabricEl = fabricCanvas.lowerCanvasEl;
    if (fabricEl) {
      tCtx.drawImage(fabricEl, 0, 0, thumbCanvas.width, thumbCanvas.height);
    }

    return thumbCanvas.toDataURL('image/jpeg', 0.72);
  }

  document.getElementById('btn-snapshot-png').addEventListener('click', () => {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = (state.videoLoaded && video.videoWidth) ? video.videoWidth : 1920;
    outCanvas.height = (state.videoLoaded && video.videoHeight) ? video.videoHeight : 1080;
    const oCtx = outCanvas.getContext('2d');

    if (state.videoLoaded && video.videoWidth) {
      oCtx.drawImage(video, 0, 0, outCanvas.width, outCanvas.height);
    } else {
      oCtx.fillStyle = '#0f172a';
      oCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    }

    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
    oCtx.drawImage(fabricCanvas.lowerCanvasEl, 0, 0, outCanvas.width, outCanvas.height);

    const a = document.createElement('a');
    a.href = outCanvas.toDataURL('image/png');
    a.download = `tactical_snapshot_${formatTimeShort(video.currentTime).replace(':', 'm')}s.png`;
    a.click();
    notify('Fotograma HD con pizarra vectorial descargado.', 'success');
  });

  // ============================================================================
  // 9. SISTEMA DE TAGGING, LISTA DE CLIPS CON MINIATURA Y TIMELINE
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
          <span class="text-[10px] font-mono text-slate-500">${catTags.length} botones</span>
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

    // Serializar objetos vectoriales de Fabric.js si existen en pantalla
    const hasVectors = fabricCanvas.getObjects().length > 0;
    const fabricJson = hasVectors ? fabricCanvas.toJSON() : null;
    const thumbnail = generateThumbnailBase64();

    const clip = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      label: tag.name,
      category: tag.category,
      team: state.activeTeam,
      timestamp: +now.toFixed(2),
      start,
      end,
      note: '',
      thumbnail,
      fabricJson
    };

    state.clips.unshift(clip);
    await persistState();

    const btnEl = document.getElementById(`tag-btn-${tag.id}`);
    if (btnEl) {
      btnEl.classList.add('tag-active-flash');
      setTimeout(() => btnEl.classList.remove('tag-active-flash'), 250);
    }

    renderClipsList();
    renderTimeline();
    notify(`Clip registrado: ${tag.name} [${formatTimeShort(start)} - ${formatTimeShort(end)}]`, 'success');
  }

  function renderClipsList() {
    const listEl = document.getElementById('clips-list-container');
    const query = document.getElementById('input-filter-clips').value.trim().toLowerCase();
    const catFilter = document.getElementById('select-filter-category').value;

    document.getElementById('count-all-clips').textContent = state.clips.length;

    const filtered = state.clips.filter(c => {
      const matchCat = catFilter === 'ALL' || c.category === catFilter;
      const matchText =
        c.label.toLowerCase().includes(query) ||
        c.team.toLowerCase().includes(query) ||
        (c.note && c.note.toLowerCase().includes(query));
      return matchCat && matchText;
    });

    listEl.innerHTML = '';

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="h-44 flex flex-col items-center justify-center text-center text-slate-500">
          <p class="text-xs font-medium">No hay clips registrados</p>
          <p class="text-[11px] text-slate-600 mt-0.5">Pulsa un botón o su tecla de atajo (A, D, P, R...) durante el análisis</p>
        </div>
      `;
      return;
    }

    filtered.forEach(clip => {
      const meta = CATEGORY_META[clip.category] || CATEGORY_META['Ataque'];
      const hasDrawing = clip.fabricJson && clip.fabricJson.objects && clip.fabricJson.objects.length > 0;

      const item = document.createElement('div');
      item.className = 'bg-[#0f172a] border border-slate-800 hover:border-emerald-500/50 rounded-lg p-2 flex gap-2.5 transition cursor-pointer group';
      item.innerHTML = `
        <!-- Miniatura del Clip -->
        <div class="w-24 h-14 rounded bg-black border border-slate-800 overflow-hidden relative shrink-0">
          ${clip.thumbnail ? `<img src="${clip.thumbnail}" class="w-full h-full object-cover" alt="miniatura" />` : ''}
          <span class="absolute bottom-0.5 right-0.5 bg-black/80 text-[9px] font-mono px-1 rounded text-emerald-400">
            ${formatTimeShort(clip.timestamp)}
          </span>
          ${hasDrawing ? `<span class="absolute top-0.5 left-0.5 bg-amber-500 text-slate-950 text-[8px] font-bold px-1 rounded" title="Incluye pizarra vectorial Fabric.js">VECTOR</span>` : ''}
        </div>

        <!-- Información del Clip -->
        <div class="flex-1 min-w-0 flex flex-col justify-between">
          <div class="flex items-start justify-between gap-1">
            <div class="truncate">
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border ${meta.badge}">${clip.category}</span>
                <span class="text-[10px] font-semibold ${clip.team === 'Local' ? 'text-emerald-400' : 'text-sky-400'}">${clip.team}</span>
              </div>
              <h4 class="text-xs font-bold text-white truncate mt-0.5">${clip.label}</h4>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button data-act="edit" class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white text-xs" title="Editar clip / nota">
                <i data-lucide="pencil" class="w-3 h-3"></i>
              </button>
              <button data-act="del" class="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-xs" title="Eliminar clip">
                <i data-lucide="trash-2" class="w-3 h-3"></i>
              </button>
            </div>
          </div>

          ${clip.note ? `<p class="text-[10px] text-slate-400 truncate italic">"${clip.note}"</p>` : ''}

          <div class="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>${formatTimePrecise(clip.start)} → ${formatTimePrecise(clip.end)}</span>
            <span class="text-emerald-400 group-hover:underline font-sans font-semibold text-[10px]">Ver Clip ▶</span>
          </div>
        </div>
      `;

      // Al hacer clic en el registro, saltar al momento del clip y cargar su dibujo vectorial si tiene
      item.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        playClipAndLoadVectors(clip);
      });

      item.querySelector('[data-act="edit"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openEditClipModal(clip);
      });

      item.querySelector('[data-act="del"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        state.clips = state.clips.filter(c => c.id !== clip.id);
        await persistState();
        renderClipsList();
        renderTimeline();
      });

      listEl.appendChild(item);
    });

    lucide.createIcons();
  }

  function playClipAndLoadVectors(clip) {
    const hasDrawing = clip.fabricJson && clip.fabricJson.objects && clip.fabricJson.objects.length > 0;

    if (hasDrawing) {
      fabricCanvas.loadFromJSON(clip.fabricJson, () => {
        fabricCanvas.renderAll();
      });
    } else if (document.getElementById('chk-autoclear').checked) {
      clearFabricCanvas();
    }

    if (!state.videoLoaded) {
      notify('Pizarra del evento cargada. Sube el archivo de vídeo para reproducir la jugada.', 'info');
      return;
    }

    state.activeClip = clip;
    document.getElementById('active-clip-text').textContent = `${clip.label} (${clip.team}) • ${formatTimeShort(clip.start)} - ${formatTimeShort(clip.end)}`;
    document.getElementById('active-clip-indicator').classList.remove('hidden');

    // Si tiene pizarra vectorial asociada, saltamos al frame exacto en pausa para ver el dibujo táctico
    if (hasDrawing) {
      video.pause();
      video.currentTime = clip.timestamp;
      notify(`Mostrando pizarra táctica en ${formatTimePrecise(clip.timestamp)}`, 'info');
    } else {
      video.currentTime = clip.start;
      video.play();
    }
  }

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
      marker.title = `${clip.label} (${clip.team}) | ${formatTimeShort(clip.start)} - ${formatTimeShort(clip.end)}`;

      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        playClipAndLoadVectors(clip);
      });

      track.appendChild(marker);
    });
  }

  timelineArea.addEventListener('click', (e) => {
    if (!state.videoLoaded || !video.duration) return;
    const rect = timelineArea.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    state.activeClip = null;
    document.getElementById('active-clip-indicator').classList.add('hidden');
    video.currentTime = pct * video.duration;
  });

  document.getElementById('input-filter-clips').addEventListener('input', renderClipsList);
  document.getElementById('select-filter-category').addEventListener('change', renderClipsList);

  document.getElementById('btn-clear-all-clips').addEventListener('click', async () => {
    if (state.clips.length === 0) return;
    if (confirm('¿Eliminar todos los clips y marcas del proyecto actual?')) {
      state.clips = [];
      await persistState();
      renderClipsList();
      renderTimeline();
      notify('Proyecto limpiado.', 'info');
    }
  });

  // ============================================================================
  // 10. MODALES (EDICIÓN DE CLIP Y CREACIÓN DE BOTÓN PERSONALIZADO)
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

  document.getElementById('btn-update-clip-vectors').addEventListener('click', async () => {
    const id = document.getElementById('edit-clip-id').value;
    const idx = state.clips.findIndex(c => c.id === id);
    if (idx === -1) return;

    state.clips[idx].fabricJson = fabricCanvas.toJSON();
    state.clips[idx].thumbnail = generateThumbnailBase64();
    await persistState();
    renderClipsList();
    notify('Pizarra vectorial actual vinculada al clip.', 'success');
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
    notify('Cambios guardados en IndexedDB.', 'success');
  });

  // Modal Nuevo Botón de Etiquetado
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
      notify('Indica el nombre de la etiqueta y su tecla de atajo.', 'warning');
      return;
    }

    state.tags.push({
      id: 'tag_' + Date.now(),
      name,
      category,
      key
    });

    await persistState();
    renderTaggingMatrix();
    closeTagModal();
    notify(`Botón "${name}" (${key}) creado.`, 'success');
  });

  // ============================================================================
  // 11. EXPORTACIÓN E IMPORTACIÓN DE PROYECTOS (JSON & CSV)
  // ============================================================================
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const payload = {
      suite: 'TacticalStudio Pro',
      version: '3.0',
      exportedAt: new Date().toISOString(),
      tags: state.tags,
      clips: state.clips,
      activeCanvasVectors: fabricCanvas.toJSON()
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proyecto_tactico_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Proyecto JSON completo exportado.', 'success');
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
        if (data.activeCanvasVectors) {
          fabricCanvas.loadFromJSON(data.activeCanvasVectors, () => fabricCanvas.renderAll());
        }
        await persistState();
        renderTaggingMatrix();
        renderClipsList();
        renderTimeline();
        notify(`Proyecto restaurado (${state.clips.length} clips en IndexedDB).`, 'success');
      } catch (err) {
        notify('Archivo JSON inválido.', 'error');
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (state.clips.length === 0) {
      notify('No hay eventos registrados para exportar a CSV.', 'warning');
      return;
    }

    const headers = [
      'ID_Orden',
      'Categoria',
      'Etiqueta',
      'Equipo',
      'Momento_Exacto_Seg',
      'Inicio_Clip_Seg',
      'Fin_Clip_Seg',
      'Duracion_Seg',
      'Timecode_Inicio',
      'Timecode_Fin',
      'Tiene_Pizarra_Vectorial',
      'Nota_Tactica'
    ];

    const rows = [...state.clips].reverse().map((c, i) => [
      i + 1,
      `"${c.category}"`,
      `"${c.label.replace(/"/g, '""')}"`,
      `"${c.team}"`,
      c.timestamp,
      c.start,
      c.end,
      (c.end - c.start).toFixed(2),
      formatTimePrecise(c.start),
      formatTimePrecise(c.end),
      c.fabricJson && c.fabricJson.objects && c.fabricJson.objects.length > 0 ? 'SI' : 'NO',
      `"${(c.note || '').replace(/"/g, '""')}"`
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe_eventos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Informe CSV descargado para Excel.', 'success');
  });

  // ============================================================================
  // 12. ATAJOS DE TECLADO GLOBALES (HOTKEYS)
  // ============================================================================
  window.addEventListener('keydown', (e) => {
    const tagEl = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (tagEl === 'input' || tagEl === 'textarea' || tagEl === 'select') return;

    // Borrar objeto vectorial seleccionado en Fabric.js con Delete o Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (fabricCanvas.getActiveObjects().length > 0) {
        e.preventDefault();
        deleteSelectedObjects();
        return;
      }
    }

    // Play / Pause con Espacio
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
      return;
    }

    // Navegación con flechas Izquierda / Derecha (1s o 5s con Shift)
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

    // Frame a frame con ',' y '.'
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

    // Atajos de teclado de las etiquetas (A, D, P, R, etc.)
    const keyUpper = e.key.toUpperCase();
    const matchedTag = state.tags.find(t => t.key.toUpperCase() === keyUpper);
    if (matchedTag) {
      e.preventDefault();
      registerClipEvent(matchedTag);
    }
  });

  // ============================================================================
  // 13. ARRANQUE Y CARGA DESDE INDEXEDDB
  // ============================================================================
  try {
    await dbService.init();
    const saved = await dbService.loadProject();
    if (saved) {
      if (Array.isArray(saved.tags) && saved.tags.length > 0) state.tags = saved.tags;
      if (Array.isArray(saved.clips)) state.clips = saved.clips;
    }
  } catch (err) {
    console.warn('IndexedDB no disponible en este contexto:', err);
  }

  syncOverlayWithVideo();
  renderTaggingMatrix();
  renderClipsList();
  renderTimeline();
});
