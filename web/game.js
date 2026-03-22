const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');
ctx.imageSmoothingEnabled = false;

/** Monde bureau : taille logique fixe, mise à l’échelle dans le canvas (tout voir sur mobile / portrait). */
const LOGICAL_W = 1280;
const LOGICAL_H = 675;
/** Marges intérieures : gauche/droite plus étroites qu’haut/bas pour élargir la carte (moins de vide latéral). */
const ROOM_PAD_X = 18;
const ROOM_PAD_Y = 30;
const INNER_W = LOGICAL_W - 2 * ROOM_PAD_X;
const INNER_H = LOGICAL_H - 2 * ROOM_PAD_Y;

function makeOfficeRoom() {
  return { x: ROOM_PAD_X, y: ROOM_PAD_Y, w: INNER_W, h: INNER_H };
}

let currentMap = 'office';
let room = makeOfficeRoom();
let objects = [];
/** Historiques Gemini : Aldo (Data & IA) / Sandro (serveurs) / Manu (archives) / Alice (Service Formation) */
let npcAldoChatHistory = [];
let npcSandroChatHistory = [];
let npcManuChatHistory = [];
let npcAliceChatHistory = [];
let chatPersona = 'aldo';

// Set canvas to match displayed size (CSS + safe-area) — évite décalage buffer / affichage
function resizeCanvas() {
  let w = Math.round(canvas.clientWidth);
  let h = Math.round(canvas.clientHeight);
  if (!w || !h) {
    w = window.innerWidth;
    h = window.innerHeight;
  }
  w = Math.max(1, w);
  h = Math.max(1, h);
  canvas.width = w;
  canvas.height = h;
  /** La pièce reste en coordonnées logiques (LOGICAL_W × LOGICAL_H) — pas de recalcul au resize. */
}

let resizeCanvasRaf = 0;
function scheduleResizeCanvas() {
  if (resizeCanvasRaf) return;
  resizeCanvasRaf = requestAnimationFrame(() => {
    resizeCanvasRaf = 0;
resizeCanvas();
  });
}

// Initial resize (double frame : layout parfois 0 avant premier paint sur mobile)
resizeCanvas();
requestAnimationFrame(() => resizeCanvas());

window.addEventListener('resize', scheduleResizeCanvas);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', scheduleResizeCanvas);
  window.visualViewport.addEventListener('scroll', scheduleResizeCanvas);
}

/** Code porte salle serveurs + porte salle administrateur (ingame). */
const SERVER_ROOM_CODE = '5284';
/** Escape game FYNE (salle serveurs) — ouverture depuis la baie « Escape ». */
const FYNE_ESCAPE_GAME_URL = 'https://fyne-escapegame.vercel.app/';

function isFyneEscapeModalOpen() {
  const el = document.getElementById('fyneEscapeModal');
  return !!(el && el.style.display === 'flex');
}

function openFyneEscapeModal() {
  const modal = document.getElementById('fyneEscapeModal');
  const s1 = document.getElementById('fyneEscapeStep1');
  const s2 = document.getElementById('fyneEscapeStep2');
  const urlLine = document.getElementById('fyneEscapeUrlLine');
  if (!modal) return;
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  if (urlLine) urlLine.textContent = FYNE_ESCAPE_GAME_URL;
  modal.style.display = 'flex';
  setMessage('Escape FYNE — choisis dans la fenêtre (le site ne s’ouvre qu’après clic sur « Ouvrir »).');
}

function closeFyneEscapeModal() {
  const modal = document.getElementById('fyneEscapeModal');
  const s1 = document.getElementById('fyneEscapeStep1');
  const s2 = document.getElementById('fyneEscapeStep2');
  if (modal) modal.style.display = 'none';
  if (s1) s1.style.display = 'block';
  if (s2) s2.style.display = 'none';
  setMessage('Explore la pièce…');
}

function fyneEscapeContinueToStep2() {
  const s1 = document.getElementById('fyneEscapeStep1');
  const s2 = document.getElementById('fyneEscapeStep2');
  if (s1) s1.style.display = 'none';
  if (s2) s2.style.display = 'block';
}

function fyneEscapeConfirmOpenSite() {
  window.open(FYNE_ESCAPE_GAME_URL, '_blank', 'noopener,noreferrer');
  closeFyneEscapeModal();
  setMessage('Escape Game FYNE ouvert dans un nouvel onglet.');
}

// ===== MAPS SYSTEM =====
const maps = {
  apartment: {
    id: 'apartment',
    name: 'Mon Appartement',
    bgColor: '#1a2635',
    zones: [
      {
        key: 'salon',
        name: 'Salon',
        x: ROOM_PAD_X,
        y: ROOM_PAD_Y,
        w: Math.floor(INNER_W * 0.5),
        h: Math.floor(INNER_H * 0.6),
        color: '#3d4a5c'
      },
      {
        key: 'chambre',
        name: 'Chambre',
        x: ROOM_PAD_X + Math.floor(INNER_W * 0.5),
        y: ROOM_PAD_Y,
        w: Math.floor(INNER_W * 0.5) - 10,
        h: Math.floor(INNER_H * 0.6),
        color: '#4a3a5c'
      },
      {
        key: 'cuisine',
        name: 'Cuisine',
        x: ROOM_PAD_X,
        y: ROOM_PAD_Y + Math.floor(INNER_H * 0.6),
        w: INNER_W,
        h: Math.floor(INNER_H * 0.4) - 10,
        color: '#5a5a3a'
      }
    ],
    objects: [
      // Salon
      { type: 'door', x: 350, y: 100, w: 20, h: 60, text: 'Porte vers le bureau', mapTo: 'office', targetX: 100, targetY: 450 },
      { type: 'sofa', x: 100, y: 150, w: 120, h: 60, text: 'Canapé confortable' },
      { type: 'tv', x: 250, y: 180, w: 80, h: 50, text: 'Télévision' },
      { type: 'plant', x: 80, y: 80, w: 40, h: 70, text: 'Plante d\'intérieur' },
      
      // Chambre
      { type: 'bed', x: 450, y: 100, w: 150, h: 100, text: 'Mon lit' },
      { type: 'desk', x: 450, y: 220, w: 100, h: 50, text: 'Bureau personnel' },
      { type: 'chair', x: 500, y: 270, w: 40, h: 30, text: 'Chaise confortable' },
      
      // Cuisine
      { type: 'counter', x: 100, y: 450, w: 200, h: 50, text: 'Plan de travail' },
      { type: 'table', x: 150, y: 320, w: 100, h: 80, text: 'Table à manger' }
    ]
  },
  
  office: {
    id: 'office',
    name: 'Bureau de l\'Entreprise',
    bgColor: '#2a2d3a',
    zones: [],
    objects: []
  }
};

/** Gauche : espace commun (haut) ; bande basse = Service Formation | couloir | coin café. Aile droite : serveurs + Réglementations ; bas = Data & IA. */
function getRightWingMetrics(room) {
  const rx = room.x;
  const ry = room.y;
  const W = room.w;
  const H = room.h;
  const splitX = rx + Math.floor(W * 0.64);
  const rightW = Math.floor(W * 0.34) - 10;
  const partitionY = ry + Math.floor(H * 0.5);
  const halfW = Math.floor(rightW / 2);
  return {
    splitX,
    rightW,
    partitionY,
    halfW,
    serverZone: { x: splitX, y: ry, w: halfW, h: partitionY - ry },
    archivesZone: { x: splitX + halfW, y: ry, w: rightW - halfW, h: partitionY - ry },
    salleInfoZone: { x: splitX, y: partitionY, w: rightW, h: ry + H - partitionY }
  };
}

function getEspaceCommunAndFormationZones(rx, ry, W, H) {
  const marginBottom = 38;
  const innerH = H - marginBottom;
  const openW = Math.floor(W * 0.62);
  /** Espace commun plus haut → bande basse (couloir / café) commence plus bas, loin sous la porte Département Data & IA. */
  const openH = Math.floor(innerH * 0.79);
  /** Bande basse jusqu’au bas de la pièce (sinon ~38 px sans couleur ni murs alignés en bas). */
  const lowerH = H - openH;
  const lowerY = ry + openH;
  /** Couloir central entre Service Formation (gauche) et coin café (droite). */
  const corridorW = 58;
  const innerBand = openW - corridorW;
  const leftW = Math.floor(innerBand / 2);
  const rightW = innerBand - leftW;
  /** Coin café : même rectangle que le Service Formation (bande basse pleine hauteur, colonne droite). */
  return {
    open: { x: rx, y: ry, w: openW, h: openH },
    lowerY,
    lowerH,
    corridorW,
    leftW,
    rightW,
    serviceFormation: { x: rx, y: lowerY, w: leftW, h: lowerH },
    corridor: { x: rx + leftW, y: lowerY, w: corridorW, h: lowerH },
    cafeDetente: { x: rx + leftW + corridorW, y: lowerY, w: rightW, h: lowerH }
  };
}

/**
 * Salle administrateur — même largeur que le Service Formation (`leftW`), ancrée haut-gauche de l’espace commun ;
 * profondeur = moitié de la hauteur de l’espace commun (le reste de l’espace reste libre au sud).
 */
function getAdminRoomGeometry() {
  const sp = getEspaceCommunAndFormationZones(room.x, room.y, room.w, room.h);
  const oz = sp.open;
  const lowerY = sp.lowerY;
  const t = 14;
  const doorW = 14;
  const ax = oz.x;
  const ay = oz.y;
  const aw = sp.leftW;
  const openH = lowerY - ay;
  const ah = Math.floor(openH / 2);
  const doorH = Math.min(58, Math.max(42, Math.floor(ah * 0.12)));
  const doorY = ay + Math.floor((ah - doorH) / 2);
  const ex = ax + aw - doorW;
  const gy = ay + ah - t;
  return { ax, ay, aw, ah, t, doorW, doorH, doorY, ex, gy };
}

function getOfficeZonesFromRoom() {
  const rx = room.x;
  const ry = room.y;
  const W = room.w;
  const H = room.h;
  const m = getRightWingMetrics(room);
  const sp = getEspaceCommunAndFormationZones(rx, ry, W, H);
  const adm = getAdminRoomGeometry();
  return [
    {
      key: 'admin_bureau',
      name: 'Salle administrateur',
      x: adm.ax,
      y: adm.ay,
      w: adm.aw,
      h: adm.ah,
      color: '#2b3548',
      hideLabel: true
    },
    {
      key: 'open',
      name: 'Espace commun',
      hideLabel: true,
      x: sp.open.x,
      y: sp.open.y,
      w: sp.open.w,
      h: sp.open.h,
      color: '#4b566f'
    },
    {
      key: 'service_formation',
      name: 'Service Formation',
      x: sp.serviceFormation.x,
      y: sp.serviceFormation.y,
      w: sp.serviceFormation.w,
      h: sp.serviceFormation.h,
      color: '#3d4a5c'
    },
    {
      key: 'couloir_cafe',
      name: 'Couloir',
      hideLabel: true,
      x: sp.corridor.x,
      y: sp.corridor.y,
      w: sp.corridor.w,
      h: sp.corridor.h,
      color: '#4b566f'
    },
    {
      key: 'cafe_detente',
      name: 'Coin café et détente',
      x: sp.cafeDetente.x,
      y: sp.cafeDetente.y,
      w: sp.cafeDetente.w,
      h: sp.cafeDetente.h,
      color: '#4a3d42'
    },
      {
        key: 'server',
      name: 'Salle des serveurs FYNE',
      x: m.serverZone.x,
      y: m.serverZone.y,
      w: m.serverZone.w,
      h: m.serverZone.h,
      color: '#2b3548'
    },
    {
      key: 'archives',
      name: 'Réglementations',
      x: m.archivesZone.x,
      y: m.archivesZone.y,
      w: m.archivesZone.w,
      h: m.archivesZone.h,
      color: '#4a3d52'
    },
    {
      key: 'salle_info',
      name: 'Département Data & IA',
      x: m.salleInfoZone.x,
      y: m.salleInfoZone.y,
      w: m.salleInfoZone.w,
      h: m.salleInfoZone.h,
        color: '#6a5a48'
      }
  ];
}

function stripOfficeStructureObjects() {
  objects = objects.filter(o => !o._officeStructure);
}

/** Baies FYNE : hauteur divisée par 2 (moins imposant, plus d’espace libre au-dessus de la console). */
function getFyneRackLayout(sz) {
  const consoleH = Math.min(56, sz.h - 28);
  const rackY = sz.y + 12;
  const maxRackBottom = sz.y + sz.h - consoleH - 22;
  const rackHFull = Math.min(78, Math.max(48, maxRackBottom - rackY));
  const rackH = Math.max(24, Math.floor(rackHFull / 2));
  return { consoleH, rackY, rackH };
}

function applyOfficeStructure() {
  stripOfficeStructureObjects();
  const m = getRightWingMetrics(room);
  const { splitX, rightW, partitionY, halfW, serverZone: sz, archivesZone: az } = m;
  const ry = room.y;
  const H = room.h;
  const dh = partitionY - ry;
  /** Mur vertical espace commun | aile droite — portes parallèles au mur, centrées sur chaque segment, ouverture côté espace commun. */
  const wallX = splitX - 8;
  const wallW = 14;
  const doorW = 14;
  const minPad = 10;
  const mark = o => ({ ...o, _officeStructure: true });

  const dhTop = partitionY - ry;
  const doorHTop = Math.min(66, Math.max(28, dhTop - minPad * 2));
  const doorTopY = ry + Math.floor((dhTop - doorHTop) / 2);

  const dhBot = ry + H - partitionY;
  const doorHBot = Math.min(66, Math.max(28, dhBot - minPad * 2));
  /** Plus haut dans la moitié basse qu’une porte centrée : s’éloigne du bandeau couloir / coin café (espace commun). */
  const doorBotY = partitionY + Math.floor((dhBot - doorHBot) / 4);

  if (doorTopY > ry + 6) {
    objects.push(mark({ type: 'wall', x: wallX, y: ry, w: wallW, h: doorTopY - ry, text: 'Mur séparateur', solid: true }));
  }
  objects.push(
    mark({
      type: 'door',
      x: wallX,
      y: doorTopY,
      w: doorW,
      h: doorHTop,
      text: 'Porte — salle des serveurs FYNE (espace commun)',
      locked: false,
      open: false,
      solid: true
    })
  );
  if (doorTopY + doorHTop < partitionY - 6) {
    objects.push(
      mark({
        type: 'wall',
        x: wallX,
        y: doorTopY + doorHTop,
        w: wallW,
        h: partitionY - (doorTopY + doorHTop),
        text: 'Mur séparateur',
        solid: true
      })
    );
  }

  if (doorBotY > partitionY + 6) {
    objects.push(mark({ type: 'wall', x: wallX, y: partitionY, w: wallW, h: doorBotY - partitionY, text: 'Mur séparateur', solid: true }));
  }
  objects.push(
    mark({
      type: 'door',
      x: wallX,
      y: doorBotY,
      w: doorW,
      h: doorHBot,
      text: 'Porte — Département Data & IA (espace commun)',
      locked: false,
      open: false,
      solid: true
    })
  );
  if (doorBotY + doorHBot < ry + H - 6) {
    objects.push(
      mark({
        type: 'wall',
        x: wallX,
        y: doorBotY + doorHBot,
        w: wallW,
        h: ry + H - (doorBotY + doorHBot),
        text: 'Mur séparateur',
        solid: true
      })
    );
  }

  const midX = splitX + halfW - 5;
  const doorArchH = Math.min(48, Math.max(28, dh - 24));
  const doorArchY = ry + Math.floor(dh / 2 - doorArchH / 2);
  if (doorArchY > ry + 4) {
    objects.push(mark({ type: 'wall', x: midX, y: ry, w: 10, h: doorArchY - ry, text: 'Mur', solid: true }));
  }
  objects.push(
    mark({
      type: 'door',
      x: midX,
      y: doorArchY,
      w: 10,
      h: doorArchH,
      text: 'Porte serveurs ↔ archives',
      locked: false,
      open: false,
      solid: true
    })
  );
  if (doorArchY + doorArchH < partitionY - 4) {
    objects.push(
      mark({
        type: 'wall',
        x: midX,
        y: doorArchY + doorArchH,
        w: 10,
        h: partitionY - (doorArchY + doorArchH),
        text: 'Mur',
        solid: true
      })
    );
  }

  {
    /** Trois sites FYNE (Recrutement, Escape, Formation) — allées larges pour circuler entre les baies. */
    const marginX = 6;
    const rackCount = 3;
    const siteNames = ['Recrutement', 'Escape', 'Formation'];
    const innerW = sz.w - 2 * marginX;
    const minAisle = 26;
    let rackW = Math.floor((innerW - 2 * minAisle) / rackCount);
    rackW = Math.max(16, Math.min(rackW, 36));
    let aisle = Math.floor((innerW - rackCount * rackW) / (rackCount - 1));
    while (aisle < 24 && rackW > 14) {
      rackW--;
      aisle = Math.floor((innerW - rackCount * rackW) / (rackCount - 1));
    }
    const { rackY, rackH } = getFyneRackLayout(sz);
    let rx = sz.x + marginX + Math.max(0, Math.floor((innerW - (rackCount * rackW + (rackCount - 1) * aisle)) / 2));
    for (let i = 0; i < rackCount; i++) {
      objects.push(
        mark({
          type: 'rack',
          x: rx,
          y: rackY,
          w: rackW,
          h: rackH,
          text: `Baie ${siteNames[i]}`,
          siteLabel: siteNames[i],
          maintenance: false,
          solid: true
        })
      );
      rx += rackW + aisle;
    }
  }
  const consoleH = Math.min(56, sz.h - 28);
  objects.push(
    mark({
      type: 'serverConsole',
      x: sz.x + Math.max(6, Math.floor((sz.w - 104) / 2)),
      y: sz.y + sz.h - consoleH - 10,
      w: 104,
      h: consoleH,
      text: 'Console de supervision (E) — postes, défis, bases',
      solid: true
    })
  );

  {
    const gap = 16;
    const margin = 8;
    let pcW = WORKSTATION.PC_W;
    const minPcW = 58;
    while (pcW >= minPcW && 2 * pcW + gap + 2 * margin > az.w) {
      pcW -= 2;
    }
    const chairW = Math.max(22, Math.min(WORKSTATION.CHAIR_W, pcW - 4));
    const { PC_H, CHAIR_H } = WORKSTATION;
    const py = az.y + 10;
    const cy = py + (WORKSTATION.CHAIR_OFFSET_Y - WORKSTATION.PC_OFFSET_Y);
    const x0 = az.x + margin;
    objects.push(
      mark({
        type: 'complianceTable',
        station: 'aiAct',
        x: x0,
        y: py,
        w: pcW,
        h: PC_H,
        text: 'Poste IA Act (UE) — réglementation & risques (E)',
        solid: true
      }),
      mark({
        type: 'complianceChair',
        station: 'aiAct',
        x: x0 + Math.floor((pcW - chairW) / 2),
        y: cy,
        w: chairW,
        h: CHAIR_H,
        text: 'Chaise — poste IA Act',
        solid: true
      }),
      mark({
        type: 'complianceTable',
        station: 'rgpd',
        x: x0 + pcW + gap,
        y: py,
        w: pcW,
        h: PC_H,
        text: 'Poste RGPD — traitements & droits (E)',
        solid: true
      }),
      mark({
        type: 'complianceChair',
        station: 'rgpd',
        x: x0 + pcW + gap + Math.floor((pcW - chairW) / 2),
        y: cy,
        w: chairW,
        h: CHAIR_H,
        text: 'Chaise — poste RGPD',
        solid: true
      })
    );
  }

  /** Mur horizontal plein entre salle serveurs/archives et Département Data & IA — accès uniquement via l’espace commun (portes sur le mur vertical). */
  const partWallH = 14;
  const partWallY = partitionY - Math.floor(partWallH / 2);
  objects.push(
    mark({
      type: 'wall',
      x: splitX,
      y: partWallY,
      w: rightW,
      h: partWallH,
      text: 'Mur — salle serveurs & archives / Département Data & IA',
      solid: true
    })
  );

  {
    /** Salle administrateur — murs pleins, porte verticale est (PIN 5284), mobilier type salle serveurs. */
    const geo = getAdminRoomGeometry();
    const { ax, ay, aw, ah, t, doorW, doorH, doorY, ex, gy } = geo;
    const topH = Math.max(1, doorY - ay);
    const botH = Math.max(1, ay + ah - (doorY + doorH));
    objects.push(
      mark({ type: 'wall', x: ax, y: ay, w: aw, h: t, text: 'Mur — salle administrateur', solid: true }),
      mark({ type: 'wall', x: ax, y: ay, w: t, h: ah, text: 'Mur', solid: true }),
      mark({ type: 'wall', x: ax, y: gy, w: aw, h: t, text: 'Mur', solid: true }),
      mark({ type: 'wall', x: ex, y: ay, w: doorW, h: topH, text: 'Mur', solid: true }),
      mark({ type: 'wall', x: ex, y: doorY + doorH, w: doorW, h: botH, text: 'Mur', solid: true }),
      mark({
        type: 'door',
        x: ex,
        y: doorY,
        w: doorW,
        h: doorH,
        text: 'Porte — salle administrateur (PIN, E)',
        locked: true,
        open: false,
        solid: true,
        adminDoor: true,
        openTarget: 0,
        openProgress: 0
      })
    );
    const pcW = Math.min(WORKSTATION.PC_W, aw - 28);
    const chairW = Math.max(22, Math.min(WORKSTATION.CHAIR_W, pcW - 4));
    const { PC_H, CHAIR_H } = WORKSTATION;
    /** Poste contre le mur nord ; chaise au sud (vers le centre de la pièce). */
    const py = ay + t + 10;
    const cy = py + (WORKSTATION.CHAIR_OFFSET_Y - WORKSTATION.PC_OFFSET_Y);
    const x0 = ax + Math.floor((aw - pcW) / 2);
    objects.push(
      mark({
        type: 'adminTable',
        x: x0,
        y: py,
        w: pcW,
        h: PC_H,
        text: 'Poste administration — prompts PNJ & vue ateliers (O une fois assis)',
        solid: true
      }),
      mark({
        type: 'adminChair',
        x: x0 + Math.floor((pcW - chairW) / 2),
        y: cy,
        w: chairW,
        h: CHAIR_H,
        text: 'Chaise — poste administration',
        solid: true
      })
    );
  }
  const spBand = getEspaceCommunAndFormationZones(room.x, room.y, room.w, room.h);
  const rx = room.x;
  const openW = spBand.open.w;
  const lw = spBand.lowerY;
  const lh = spBand.lowerH;
  const corridorWallW = 10;
  const hWallH = 14;
  const northY = lw - Math.floor(hWallH / 2);
  const southY = lw + lh - Math.floor(hWallH / 2);
  const b1 = rx + spBand.leftW;
  const b2 = rx + spBand.leftW + spBand.corridorW;
  const doorH = Math.min(44, Math.max(28, lh - 16));
  const doorY = lw + Math.floor((lh - doorH) / 2);

  /** Murs extérieurs : les salles sont fermées ; entrée depuis l’espace commun uniquement au-dessus du couloir, puis par les portes. */
  objects.push(
    mark({
      type: 'wall',
      x: rx,
      y: northY,
      w: spBand.leftW,
      h: hWallH,
      text: 'Mur — Service Formation',
      solid: true
    }),
    mark({
      type: 'wall',
      x: rx + spBand.leftW + spBand.corridorW,
      y: northY,
      w: spBand.rightW,
      h: hWallH,
      text: 'Mur — Coin café et détente',
      solid: true
    }),
    mark({
      type: 'wall',
      x: rx,
      y: lw,
      w: corridorWallW,
      h: lh,
      text: 'Mur',
      solid: true
    }),
    mark({
      type: 'wall',
      x: rx + openW - corridorWallW,
      y: lw,
      w: corridorWallW,
      h: lh,
      text: 'Mur',
      solid: true
    }),
    mark({
      type: 'wall',
      x: rx,
      y: southY,
      w: spBand.leftW,
      h: hWallH,
      text: 'Mur',
      solid: true
    }),
    mark({
      type: 'wall',
      x: rx + spBand.leftW,
      y: southY,
      w: spBand.corridorW,
      h: hWallH,
      text: 'Mur — couloir',
      solid: true
    }),
    mark({
      type: 'wall',
      x: rx + spBand.leftW + spBand.corridorW,
      y: southY,
      w: spBand.rightW,
      h: hWallH,
      text: 'Mur',
      solid: true
    })
  );

  function addVerticalDoorWall(boundaryX, doorLabel) {
    const wx = boundaryX - corridorWallW;
    if (doorY > lw + 4) {
      objects.push(
        mark({
          type: 'wall',
          x: wx,
          y: lw,
          w: corridorWallW,
          h: doorY - lw,
          text: 'Mur — couloir',
          solid: true
        })
      );
    }
    objects.push(
      mark({
        type: 'door',
        x: wx,
        y: doorY,
        w: corridorWallW,
        h: doorH,
        text: doorLabel,
        locked: false,
        open: false,
        solid: true
      })
    );
    if (doorY + doorH < lw + lh - 4) {
      objects.push(
        mark({
          type: 'wall',
          x: wx,
          y: doorY + doorH,
          w: corridorWallW,
          h: lw + lh - (doorY + doorH),
          text: 'Mur — couloir',
          solid: true
        })
      );
    }
  }

  addVerticalDoorWall(b1, 'Porte Service Formation ↔ couloir');
  addVerticalDoorWall(b2, 'Porte couloir ↔ café');

  const zonesOs = getOfficeZonesFromRoom();
  const sfZ = zonesOs.find(z => z.key === 'service_formation');
  if (sfZ) {
    let pcW = WORKSTATION.PC_W;
    const minPcW = 58;
    while (pcW >= minPcW && pcW + 12 > sfZ.w) {
      pcW -= 2;
    }
    const chairW = Math.max(22, Math.min(WORKSTATION.CHAIR_W, pcW - 4));
    const py = sfZ.y + 10;
    const cy = py + (WORKSTATION.CHAIR_OFFSET_Y - WORKSTATION.PC_OFFSET_Y);
    const x0 = sfZ.x + Math.max(4, Math.floor((sfZ.w - pcW) / 2));
    objects.push(
      mark({
        type: 'formationTable',
        x: x0,
        y: py,
        w: pcW,
        h: WORKSTATION.PC_H,
        text: FORMATION_DESK.TEXT_PC,
        solid: true
      }),
      mark({
        type: 'formationChair',
        x: x0 + Math.floor((pcW - chairW) / 2),
        y: cy,
        w: chairW,
        h: WORKSTATION.CHAIR_H,
        text: FORMATION_DESK.TEXT_CHAIR,
        solid: true
      })
    );
  }

  const cafZ = zonesOs.find(z => z.key === 'cafe_detente');
  if (cafZ && cafZ.w > 36) {
    const tw = Math.min(56, cafZ.w - 10);
    const th = 32;
    const tx = cafZ.x + Math.floor((cafZ.w - tw) / 2);
    const ty = cafZ.y + Math.max(8, Math.floor(cafZ.h * 0.2));
    objects.push(
      mark({
        type: 'cafeTable',
        x: tx,
        y: ty,
        w: tw,
        h: th,
        text: 'Table café — pause, échanges',
        solid: true
      })
    );
    if (cafZ.w > 48) {
      objects.push(
        mark({
          type: 'vending',
          x: cafZ.x + cafZ.w - 34,
          y: cafZ.y + 10,
          w: 28,
          h: 42,
          stock: 6,
          text: 'Distributeur',
          solid: true
        })
      );
    }
  }
}

// ----- Département Data & IA : Python (gauche) + Cyber (centre) + SQL (droite) -----
const WORKSTATION = {
  PC_W: 95,
  PC_H: 54,
  CHAIR_W: 30,
  CHAIR_H: 24,
  PC_OFFSET_Y: 12,
  CHAIR_OFFSET_Y: 72
};

const SQL_CAFE = {
  ...WORKSTATION,
  TEXT_PC: 'Ordinateur SQL — Département Data & IA.',
  TEXT_CHAIR: 'Chaise devant le PC SQL.'
};

const PYTHON_DESK = {
  ...WORKSTATION,
  TEXT_PC: 'Poste Python — Département Data & IA.',
  TEXT_CHAIR: 'Chaise devant le PC Python.'
};

const CYBER_DESK = {
  ...WORKSTATION,
  TEXT_PC: 'Poste cybersécurité — Département Data & IA.',
  TEXT_CHAIR: 'Chaise devant le poste cyber.'
};

const FORMATION_DESK = {
  ...WORKSTATION,
  TEXT_PC: 'Poste Service Formation — plan personnalisé (E)',
  TEXT_CHAIR: 'Chaise — Service Formation'
};

/** Métriques communes : zone Data & IA, rangée de PC, etc. */
function getSalleInfoLayoutMetrics(room) {
  const m = getRightWingMetrics(room);
  const { splitX, rightW, partitionY } = m;
  const margin = 10;
  const gap = 16;
  let pcW = WORKSTATION.PC_W;
  const minPcW = 58;
  while (pcW >= minPcW && 3 * pcW + 2 * gap + 2 * margin > rightW) {
    pcW -= 2;
  }
  const chairW = Math.max(22, Math.min(WORKSTATION.CHAIR_W, pcW - 4));
  const rowW = 3 * pcW + 2 * gap;
  let x0 = splitX + Math.max(margin, Math.floor((rightW - rowW) / 2));
  if (x0 + rowW > splitX + rightW - margin) {
    x0 = splitX + margin;
  }
  const py = partitionY + WORKSTATION.PC_OFFSET_Y;
  const cy = partitionY + WORKSTATION.CHAIR_OFFSET_Y;
  const chairBottom = cy + WORKSTATION.CHAIR_H;
  const zone = {
    x: m.salleInfoZone.x,
    y: m.salleInfoZone.y,
    w: m.salleInfoZone.w,
    h: m.salleInfoZone.h
  };
  return {
    splitX,
    rightW,
    partitionY,
    margin,
    gap,
    pcW,
    chairW,
    rowW,
    x0,
    py,
    cy,
    chairBottom,
    zone
  };
}

function layoutSalleInfoWorkstations(room) {
  const m = getSalleInfoLayoutMetrics(room);
  const { x0, py, cy, pcW, gap } = m;
  const { PC_H } = WORKSTATION;
  const { TEXT_PC: SQL_TPC, TEXT_CHAIR: SQL_TCH } = SQL_CAFE;
  const { TEXT_PC: PY_TPC, TEXT_CHAIR: PY_TCH } = PYTHON_DESK;
  const { TEXT_PC: CY_TPC, TEXT_CHAIR: CY_TCH } = CYBER_DESK;
  const chairW = m.chairW;

  // Rangée en bas de la zone : Cyber (gauche) | Python (centre) | SQL (droite) — cyber opposé à SQL
  return [
    { type: 'cyberTable', x: x0, y: py, w: pcW, h: PC_H, text: CY_TPC },
    {
      type: 'cyberChair',
      x: x0 + Math.floor((pcW - chairW) / 2),
      y: cy,
      w: chairW,
      h: WORKSTATION.CHAIR_H,
      text: CY_TCH
    },
    { type: 'pythonTable', x: x0 + pcW + gap, y: py, w: pcW, h: PC_H, text: PY_TPC },
    {
      type: 'pythonChair',
      x: x0 + pcW + gap + Math.floor((pcW - chairW) / 2),
      y: cy,
      w: chairW,
      h: WORKSTATION.CHAIR_H,
      text: PY_TCH
    },
    { type: 'sqlTable', x: x0 + 2 * (pcW + gap), y: py, w: pcW, h: PC_H, text: SQL_TPC },
    {
      type: 'sqlChair',
      x: x0 + 2 * (pcW + gap) + Math.floor((pcW - chairW) / 2),
      y: cy,
      w: chairW,
      h: WORKSTATION.CHAIR_H,
      text: SQL_TCH
    }
  ];
}

function isSqlCafeObject(obj) {
  return obj && (obj.type === 'sqlTable' || obj.type === 'sqlChair');
}

function isPythonDeskObject(obj) {
  return obj && (obj.type === 'pythonTable' || obj.type === 'pythonChair');
}

function isCyberDeskObject(obj) {
  return obj && (obj.type === 'cyberTable' || obj.type === 'cyberChair');
}

function isSalleInfoWorkstation(obj) {
  return isSqlCafeObject(obj) || isPythonDeskObject(obj) || isCyberDeskObject(obj);
}

function isSalleInfoDecor(obj) {
  return obj && obj.salleInfoDecor === true;
}

/** Deux plantes — côté postes Cyber et SQL (dessinées avant les postes). */
function layoutSalleInfoDecor(room) {
  const m = getSalleInfoLayoutMetrics(room);
  const { x0, pcW, gap, zone: z } = m;
  const out = [];
  const deco = o => ({ ...o, salleInfoDecor: true, solid: o.solid !== false });

  const plantW = 26;
  const plantH = 36;
  const plantY = z.y + 14;

  const cyberPlantX = Math.max(z.x + 4, x0 - plantW - 8);
  out.push(
    deco({
      type: 'plant',
      x: cyberPlantX,
      y: plantY,
      w: plantW,
      h: plantH,
      text: 'Plante — à côté du poste Cyber.',
      solid: true
    })
  );

  const sqlDeskRight = x0 + 2 * (pcW + gap) + pcW;
  const sqlPlantX = Math.min(z.x + z.w - plantW - 4, sqlDeskRight + 8);
  out.push(
    deco({
      type: 'plant',
      x: sqlPlantX,
      y: plantY,
      w: plantW,
      h: plantH,
      text: 'Plante — à côté du poste SQL.',
      solid: true
    })
  );

  return out;
}

/** Chaise de bureau vue de dessus — siège, dossier, accoudoirs, colonne, étoile 5 roues */
function drawOfficeChair(obj, palette) {
  const { x, y, w, h } = obj;
  const cx = x + w / 2;
  const seatY = y + 1;
  const seatH = Math.max(8, h - 3);
  const backH = Math.max(10, Math.round(h * 0.52));
  const armW = Math.max(2, Math.round(w * 0.12));
  const baseY = y + h + 2;
  const wheelR = Math.max(2, Math.min(3.5, w * 0.11));

  ctx.save();

  // Ombre au sol
  ctx.fillStyle = 'rgba(8, 10, 18, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 1, w * 0.52, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Roues + bras (étoile) — dessinés d’abord pour passer sous le siège
  const spoke = w * 0.38 + wheelR;
  for (let i = 0; i < 5; i++) {
    const ang = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    const wx = cx + Math.cos(ang) * spoke;
    const wy = baseY + Math.sin(ang) * (h * 0.08);
    ctx.strokeStyle = palette.metal;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 3);
    ctx.lineTo(wx, wy);
    ctx.stroke();
    ctx.fillStyle = '#14161c';
    ctx.beginPath();
    ctx.arc(wx, wy, wheelR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d424d';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Manchon / colonne sous l’assise
  ctx.fillStyle = palette.metal;
  ctx.fillRect(cx - 2, y + h - 5, 4, 7);
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 2, y + h - 5, 4, 7);

  // Dossier (vers le haut de l’écran = devant le bureau)
  ctx.fillStyle = palette.backDark;
  ctx.fillRect(x + 2, y - backH + 2, w - 4, backH - 2);
  ctx.fillStyle = palette.backLight;
  ctx.fillRect(x + 4, y - backH + 4, w - 8, Math.max(3, backH * 0.22));
  ctx.strokeStyle = palette.backMesh;
  ctx.lineWidth = 1;
  const meshN = h >= 22 ? 3 : 2;
  for (let i = 1; i <= meshN; i++) {
    const my = y - backH + 6 + (i * (backH - 10)) / (meshN + 1);
    ctx.beginPath();
    ctx.moveTo(x + 4, my);
    ctx.lineTo(x + w - 4, my);
    ctx.stroke();
  }
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y - backH + 2, w - 4, backH - 2);

  // Accoudoirs
  ctx.fillStyle = palette.arm;
  ctx.fillRect(x - armW + 1, seatY + 3, armW, seatH - 6);
  ctx.fillRect(x + w - 1, seatY + 3, armW, seatH - 6);
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - armW + 1, seatY + 3, armW, seatH - 6);
  ctx.strokeRect(x + w - 1, seatY + 3, armW, seatH - 6);

  // Assise (coussin)
  ctx.fillStyle = palette.seatDark;
  ctx.fillRect(x + 1, seatY, w - 2, seatH);
  ctx.fillStyle = palette.seatLight;
  ctx.fillRect(x + 3, seatY + 2, w - 8, Math.max(4, Math.floor(seatH * 0.35)));
  // Couture bord assise
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, seatY, w - 2, seatH);

  // Léger reflet plastique dossier / siège
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(x + 3, seatY + 2, 3, seatH - 4);

  ctx.restore();
}

const CHAIR_PALETTE_NEUTRAL = {
  seatDark: '#3a3d4a',
  seatLight: '#565b6e',
  arm: '#2a2d38',
  backDark: '#323643',
  backLight: '#4a5060',
  backMesh: '#22252e',
  outline: '#1a1c24',
  metal: '#6a6d78'
};

const CHAIR_PALETTE_PYTHON = {
  seatDark: '#1f4a32',
  seatLight: '#2f6b4a',
  arm: '#163828',
  backDark: '#1a3d2c',
  backLight: '#2a5c40',
  backMesh: '#0f281c',
  outline: '#0c1f16',
  metal: '#4d6a58'
};

const CHAIR_PALETTE_SQL = {
  seatDark: '#2a3f5e',
  seatLight: '#3d5c88',
  arm: '#1f2f48',
  backDark: '#243a5a',
  backLight: '#355a85',
  backMesh: '#162538',
  outline: '#101a2a',
  metal: '#5a6e88'
};

const CHAIR_PALETTE_CYBER = {
  seatDark: '#3a2548',
  seatLight: '#5c3a6e',
  arm: '#281a32',
  backDark: '#321f40',
  backLight: '#4d3260',
  backMesh: '#1a1220',
  outline: '#140c1a',
  metal: '#6a5a78'
};

const CHAIR_PALETTE_ADMIN = {
  seatDark: '#3a4558',
  seatLight: '#4d5a72',
  arm: '#2a3444',
  backDark: '#323e50',
  backLight: '#465a70',
  backMesh: '#1e2834',
  outline: '#1a222c',
  metal: '#5a6e88'
};

/** Bureau + écran vus de dessus (appartement ou postes Data & IA) */
function drawPcDesk(obj, preset) {
  const x = obj.x;
  const y = obj.y;
  const w = obj.w;
  const h = obj.h;
  const cx = x + w / 2;
  ctx.save();

  let woodBase;
  let woodHi;
  let woodEdge;
  let woodDark;
  if (preset === 'home') {
    woodBase = '#4d4034';
    woodHi = '#5e5044';
    woodEdge = '#3a2f26';
    woodDark = '#352b22';
  } else if (preset === 'sql') {
    woodBase = '#4f4336';
    woodHi = '#5f5346';
    woodEdge = '#3d3228';
    woodDark = '#362c24';
  } else if (preset === 'cyber') {
    woodBase = '#3a3248';
    woodHi = '#4a4058';
    woodEdge = '#2a2438';
    woodDark = '#2a2234';
  } else if (preset === 'aiAct') {
    woodBase = '#3a3248';
    woodHi = '#4a4058';
    woodEdge = '#2a2438';
    woodDark = '#2a2234';
  } else if (preset === 'rgpd') {
    woodBase = '#4f4336';
    woodHi = '#5f5346';
    woodEdge = '#3d3228';
    woodDark = '#362c24';
  } else if (preset === 'formation') {
    woodBase = '#4f4336';
    woodHi = '#5f5346';
    woodEdge = '#3d3228';
    woodDark = '#362c24';
  } else if (preset === 'admin') {
    woodBase = '#454a52';
    woodHi = '#555c66';
    woodEdge = '#323840';
    woodDark = '#2c3038';
  } else {
    woodBase = '#423c33';
    woodHi = '#524a40';
    woodEdge = '#322c26';
    woodDark = '#2e2820';
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 3, w * 0.5, h * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = woodDark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = woodBase;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = woodHi;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  for (let row = 3; row < h - 6; row += 6) {
    ctx.beginPath();
    ctx.moveTo(x + 3, y + row);
    ctx.lineTo(x + w - 3, y + row + 1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = woodEdge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  const legW = Math.max(3, Math.floor(w * 0.04));
  const legH = 5;
  ctx.fillStyle = '#252018';
  ctx.fillRect(x + 5, y + h - 1, legW, legH);
  ctx.fillRect(x + w - 5 - legW, y + h - 1, legW, legH);

  const padX = Math.max(7, Math.floor(w * 0.09));
  const topMargin = 3;
  const screenH = Math.max(20, Math.min(Math.floor(h * 0.56), 38));
  const sx = x + padX;
  const sy = y + topMargin;
  const sw = w - 2 * padX;
  const standH = 4;

  ctx.fillStyle = '#1a1d26';
  ctx.fillRect(sx - 2, sy - 2, sw + 4, screenH + 4);
  ctx.strokeStyle =
    preset === 'sql'
      ? '#6b7faa'
      : preset === 'python'
        ? '#ffd43b'
        : preset === 'cyber'
          ? '#00d4aa'
          : preset === 'aiAct'
            ? '#6b9ae8'
            : preset === 'rgpd'
              ? '#5ab88a'
              : preset === 'formation'
                ? '#5a9a8a'
                : preset === 'admin'
                  ? '#c9a227'
                  : '#5a6270';
  ctx.lineWidth = 2;
  ctx.strokeRect(sx - 2, sy - 2, sw + 4, screenH + 4);

  const ix = sx;
  const iy = sy;
  const iw = sw;
  const ih = screenH;
  let grad;
  if (preset === 'home') {
    grad = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    grad.addColorStop(0, '#1f3d58');
    grad.addColorStop(0.5, '#152a3d');
    grad.addColorStop(1, '#0c141c');
    ctx.fillStyle = grad;
  } else if (preset === 'sql') {
    grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    grad.addColorStop(0, '#153560');
    grad.addColorStop(0.45, '#0a1a32');
    grad.addColorStop(1, '#040810');
    ctx.fillStyle = grad;
  } else if (preset === 'cyber') {
    grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    grad.addColorStop(0, '#1a0a28');
    grad.addColorStop(0.5, '#0f1830');
    grad.addColorStop(1, '#050810');
    ctx.fillStyle = grad;
  } else if (preset === 'aiAct') {
    grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    grad.addColorStop(0, '#152a48');
    grad.addColorStop(0.5, '#0a1830');
    grad.addColorStop(1, '#050810');
    ctx.fillStyle = grad;
  } else if (preset === 'rgpd') {
    grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    grad.addColorStop(0, '#153560');
    grad.addColorStop(0.45, '#0a1a28');
    grad.addColorStop(1, '#040810');
    ctx.fillStyle = grad;
  } else if (preset === 'formation') {
    grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    grad.addColorStop(0, '#1a4538');
    grad.addColorStop(0.5, '#0a2820');
    grad.addColorStop(1, '#040810');
    ctx.fillStyle = grad;
  } else if (preset === 'admin') {
    grad = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    grad.addColorStop(0, '#3a3520');
    grad.addColorStop(0.5, '#1a1810');
    grad.addColorStop(1, '#040810');
    ctx.fillStyle = grad;
  } else {
    grad = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    grad.addColorStop(0, '#242424');
    grad.addColorStop(1, '#0c0c0c');
    ctx.fillStyle = grad;
  }
  ctx.fillRect(ix, iy, iw, ih);

  if (preset === 'home') {
    ctx.fillStyle = 'rgba(130, 200, 255, 0.22)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih * 0.42);
  } else if (preset === 'sql') {
    ctx.fillStyle = 'rgba(90, 140, 255, 0.18)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
  } else if (preset === 'cyber') {
    ctx.fillStyle = 'rgba(0, 212, 170, 0.14)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
    ctx.fillStyle = 'rgba(180, 90, 255, 0.08)';
    ctx.fillRect(ix + 4, iy + ih * 0.35, iw - 8, ih * 0.25);
  } else if (preset === 'aiAct') {
    ctx.fillStyle = 'rgba(100, 160, 255, 0.16)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
  } else if (preset === 'rgpd') {
    ctx.fillStyle = 'rgba(90, 200, 150, 0.14)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
  } else if (preset === 'formation') {
    ctx.fillStyle = 'rgba(100, 200, 160, 0.16)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
  } else if (preset === 'admin') {
    ctx.fillStyle = 'rgba(201, 162, 39, 0.2)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
  } else {
    ctx.fillStyle = 'rgba(255, 212, 59, 0.1)';
    ctx.fillRect(ix + 2, iy + 2, iw - 4, ih - 4);
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(ix + 3, iy + 3, iw * 0.38, ih * 0.28);

  const lineCol =
    preset === 'python'
      ? 'rgba(255, 212, 59, 0.75)'
      : preset === 'sql'
        ? 'rgba(140, 185, 255, 0.65)'
        : preset === 'cyber'
          ? 'rgba(0, 212, 170, 0.55)'
          : preset === 'aiAct'
            ? 'rgba(130, 190, 255, 0.65)'
            : preset === 'rgpd'
              ? 'rgba(120, 220, 180, 0.6)'
              : preset === 'formation'
                ? 'rgba(120, 210, 180, 0.62)'
                : preset === 'admin'
                  ? 'rgba(201, 162, 39, 0.55)'
                  : 'rgba(170, 210, 255, 0.4)';
  ctx.fillStyle = lineCol;
  const lineH = Math.max(2, Math.floor(ih / 8));
  for (let i = 0; i < 3; i++) {
    const lw = iw - 12 - (i % 2) * 12;
    ctx.fillRect(ix + 5, iy + 5 + i * (lineH + 3), lw, 2);
  }

  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (preset === 'sql') {
    ctx.fillStyle = '#b8d4ff';
    ctx.fillText('SQL', cx, iy + ih * 0.62);
  } else if (preset === 'python') {
    ctx.fillStyle = '#ffd43b';
    ctx.fillText('Py', cx, iy + ih * 0.62);
  } else if (preset === 'cyber') {
    ctx.save();
    const fsMain = Math.max(11, Math.min(15, Math.floor(w * 0.14)));
    const fsSub = Math.max(8, fsMain - 3);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 255, 200, 0.55)';
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#7dffec';
    ctx.font = `bold ${fsMain}px Arial`;
    ctx.fillText('CYBER', cx, iy + ih * 0.38);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c9a0ff';
    ctx.font = `bold ${fsSub}px Arial`;
    ctx.fillText('SEC', cx, iy + ih * 0.62);
    ctx.fillStyle = 'rgba(0, 212, 170, 0.9)';
    ctx.font = `${Math.max(7, fsSub - 1)}px Arial`;
    ctx.fillText('● ● ●', cx, iy + ih * 0.82);
    ctx.restore();
  } else if (preset === 'aiAct') {
    ctx.fillStyle = '#b8d8ff';
    ctx.fillText('IA Act', cx, iy + ih * 0.62);
  } else if (preset === 'rgpd') {
    ctx.fillStyle = '#b8f0d4';
    ctx.fillText('RGPD', cx, iy + ih * 0.62);
  } else if (preset === 'formation') {
    ctx.fillStyle = '#b8f0dc';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('PLAN', cx, iy + ih * 0.58);
  } else if (preset === 'admin') {
    ctx.fillStyle = '#e8c84a';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('ADM', cx, iy + ih * 0.58);
  } else {
    ctx.fillStyle = 'rgba(200, 230, 255, 0.9)';
    ctx.font = '10px Arial';
    ctx.fillText('>_', cx, iy + ih * 0.58);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  if (preset === 'home') {
    ctx.fillStyle = '#1e2d1e';
    ctx.fillRect(sx + sw - 8, sy - 1, 5, 3);
    ctx.fillStyle = '#5ddf6a';
    ctx.fillRect(sx + sw - 6, sy, 2, 1);
  }

  ctx.fillStyle = '#3a3e4a';
  ctx.fillRect(cx - 5, sy + screenH + 2, 10, standH);
  ctx.strokeStyle = '#2a2e38';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 5, sy + screenH + 2, 10, standH);

  const ky = sy + screenH + 2 + standH + 3;
  const kH = Math.min(11, y + h - ky - 5);
  if (kH > 4) {
    const kx = x + padX + 3;
    const kw = w - 2 * padX - 6;
    ctx.fillStyle = '#252830';
    ctx.fillRect(kx, ky, kw, kH);
    ctx.strokeStyle = '#151820';
    ctx.strokeRect(kx, ky, kw, kH);
    ctx.fillStyle = '#3a3f4a';
    const keyW = Math.max(4, Math.floor((kw - 16) / 9));
    for (let k = 0; k < 8 && k * (keyW + 2) < kw - 10; k++) {
      ctx.fillRect(kx + 4 + k * (keyW + 2), ky + 2, keyW, Math.max(3, kH - 4));
    }
    ctx.fillStyle = '#c8cdd8';
    ctx.fillRect(x + w - padX - 13, ky + 1, 9, Math.min(6, kH - 2));
    ctx.strokeStyle = '#8a909c';
    ctx.strokeRect(x + w - padX - 13, ky + 1, 9, Math.min(6, kH - 2));
  }

  ctx.restore();
}

/** Table à manger — plateau bois + pieds (sans écran) */
function drawWoodenDiningTable(obj) {
  const { x, y, w, h } = obj;
  const cx = x + w / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 2, w * 0.48, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  const base = '#5d4d3e';
  const hi = '#6e5d4e';
  const edge = '#3d3228';
  const dark = '#453a30';
  ctx.fillStyle = dark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = base;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = hi;
  ctx.globalAlpha = 0.35;
  for (let row = 4; row < h - 4; row += 7) {
    ctx.beginPath();
    ctx.moveTo(x + 4, y + row);
    ctx.lineTo(x + w - 4, y + row + 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  const lw = Math.max(3, Math.floor(w * 0.05));
  ctx.fillStyle = '#2c241c';
  ctx.fillRect(x + 6, y + h - 1, lw, 5);
  ctx.fillRect(x + w - 6 - lw, y + h - 1, lw, 5);
  ctx.fillRect(cx - lw / 2, y + h - 1, lw, 5);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(x + w * 0.35, y + h * 0.35, 10, 8);
  ctx.fillStyle = 'rgba(200, 80, 60, 0.35)';
  ctx.beginPath();
  ctx.arc(x + w * 0.65, y + h * 0.45, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Téléviseur — cadre + écran avec dégradé et pied */
function drawTelevision(obj) {
  const { x, y, w, h } = obj;
  const cx = x + w / 2;
  ctx.save();
  ctx.fillStyle = '#222226';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a4a52';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  const pad = Math.max(5, Math.floor(Math.min(w, h) * 0.08));
  const sx = x + pad;
  const sy = y + pad;
  const sw = w - 2 * pad;
  const sh = h - 2 * pad;
  const g = ctx.createLinearGradient(sx, sy, sx, sy + sh);
  g.addColorStop(0, '#1a3555');
  g.addColorStop(0.4, '#102238');
  g.addColorStop(1, '#060a12');
  ctx.fillStyle = g;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = 'rgba(120, 170, 255, 0.2)';
  ctx.fillRect(sx + 2, sy + 2, sw - 4, sh * 0.35);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(sx + 3, sy + 3, sw * 0.32, sh * 0.22);

  ctx.strokeStyle = '#0a0a0c';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx, sy, sw, sh);

  ctx.fillStyle = '#1a1a1e';
  ctx.fillRect(cx - 8, y + h - 2, 16, 5);
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(cx - 2, y + h - 4, 4, 3);

  ctx.restore();
}

function getAldoWalkBounds() {
  const z = getSalleInfoZone();
  if (!z) {
    return {
      minX: room.x + 8,
      minY: room.y + 8,
      maxX: room.x + room.w - aldoNpc.size - 8,
      maxY: room.y + room.h - aldoNpc.size - 8
    };
  }
  const pad = 12;
  return {
    minX: z.x + pad,
    minY: z.y + pad,
    maxX: z.x + z.w - aldoNpc.size - pad,
    maxY: z.y + z.h - aldoNpc.size - pad
  };
}

function placeAldoNpcInSalleInfo() {
  const z = getSalleInfoZone();
  if (!z) return;
  const b = getAldoWalkBounds();
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  aldoNpc.x = clamp(cx, b.minX, Math.max(b.minX, b.maxX));
  aldoNpc.y = clamp(cy, b.minY, Math.max(b.minY, b.maxY));
  if (isBlockedAtEntity(aldoNpc.x, aldoNpc.y, aldoNpc.size)) {
    aldoNpc.x = b.minX + 24;
    aldoNpc.y = b.minY + 32;
  }
  aldoNpc.wanderTimer = 0.3;
  aldoNpc.vx = 0;
  aldoNpc.vy = 1;
  aldoNpc.behaviorCooldown = 3 + Math.random() * 3;
  aldoNpc.homeX = aldoNpc.x;
  aldoNpc.homeY = aldoNpc.y;
}

/**
 * Bande praticable sous les baies FYNE et au-dessus de la console — évite le mur bas (cloison Data & IA)
 * et la console, et rapproche Sandro de la porte vers l’espace commun (côté gauche).
 */
function getSandroWalkBounds() {
  const m = getRightWingMetrics(room);
  const z = m.serverZone;
  const sz = z;
  const padX = 8;
  const marginY = 8;
  const consoleH = Math.min(56, sz.h - 28);
  const consoleTopY = sz.y + sz.h - consoleH - 10;
  const { rackY, rackH } = getFyneRackLayout(sz);
  const walkMinY = rackY + rackH + marginY;
  const walkMaxY = consoleTopY - sandroNpc.size - marginY;
  const minX = sz.x + padX;
  const maxX = sz.x + sz.w - sandroNpc.size - padX;
  if (walkMaxY >= walkMinY + 6) {
    return { minX, minY: walkMinY, maxX, maxY: walkMaxY };
  }
  const guardBottom = 30;
  return {
    minX,
    minY: sz.y + Math.floor(sz.h * 0.4),
    maxX,
    maxY: sz.y + sz.h - sandroNpc.size - guardBottom
  };
}

function placeSandroNpc() {
  const b = getSandroWalkBounds();
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const tries = [
    [cx, cy],
    [b.minX + 20, cy],
    [cx, b.minY + 10],
    [b.minX + 14, b.minY + 8]
  ];
  let placed = false;
  for (const [tx, ty] of tries) {
    const px = clamp(tx, b.minX, Math.max(b.minX, b.maxX));
    const py = clamp(ty, b.minY, Math.max(b.minY, b.maxY));
    if (!isBlockedAtEntity(px, py, sandroNpc.size)) {
      sandroNpc.x = px;
      sandroNpc.y = py;
      placed = true;
      break;
    }
  }
  if (!placed) {
    sandroNpc.x = b.minX + 18;
    sandroNpc.y = b.minY + 6;
  }
  sandroNpc.wanderTimer = 0.35;
  /** Vers la gauche = vers la porte de l’espace commun (détection des portes en pause café). */
  sandroNpc.vx = -1;
  sandroNpc.vy = 0;
  sandroNpc.homeX = sandroNpc.x;
  sandroNpc.homeY = sandroNpc.y;
}

function trySandroMove(dx, dy) {
  const b = getSandroWalkBounds();
  const targetX = clamp(sandroNpc.x + dx, b.minX, Math.max(b.minX, b.maxX));
  const targetY = clamp(sandroNpc.y + dy, b.minY, Math.max(b.minY, b.maxY));
  if (!isBlockedAtEntity(targetX, targetY, sandroNpc.size)) {
    sandroNpc.x = targetX;
    sandroNpc.y = targetY;
    return true;
  }
  return false;
}

function updateSandroNpc(dt) {
  if (currentMap !== 'office') return;

  sandroNpc.wanderTimer -= dt;
  if (sandroNpc.wanderTimer <= 0) {
    sandroNpc.wanderTimer = 1.4 + Math.random() * 2.4;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ];
    const pick = dirs[Math.floor(Math.random() * dirs.length)];
    sandroNpc.vx = pick[0];
    sandroNpc.vy = pick[1];
  }

  const len = Math.hypot(sandroNpc.vx, sandroNpc.vy) || 1;
  const dx = (sandroNpc.vx / len) * sandroNpc.speed * dt;
  const dy = (sandroNpc.vy / len) * sandroNpc.speed * dt;

  sandroNpc.moving = Math.abs(dx) + Math.abs(dy) > 0.001;
  if (sandroNpc.moving) {
    if (Math.abs(sandroNpc.vx) > Math.abs(sandroNpc.vy)) {
      sandroNpc.direction = sandroNpc.vx > 0 ? 'right' : 'left';
    } else if (sandroNpc.vy !== 0) {
      sandroNpc.direction = sandroNpc.vy > 0 ? 'down' : 'up';
    }
    sandroNpc.walkCycle += dt * sandroNpc.walkSpeed;
  } else {
    sandroNpc.walkCycle = 0;
  }

  const moved = trySandroMove(dx, dy);
  if (!moved && sandroNpc.moving) {
    sandroNpc.wanderTimer = 0;
  }
}

/**
 * Bande sous les postes conformité — évite le mur bas (cloison Data & IA) et les tables.
 */
function getManuWalkBounds() {
  const m = getRightWingMetrics(room);
  const z = getArchivesZone();
  const az = z || m.archivesZone;
  const partitionY = m.partitionY;
  const padX = 8;
  const py = az.y + 10;
  const cy = py + (WORKSTATION.CHAIR_OFFSET_Y - WORKSTATION.PC_OFFSET_Y);
  const furnitureBottom = Math.max(py + WORKSTATION.PC_H, cy + WORKSTATION.CHAIR_H);
  const walkMinY = furnitureBottom + 8;
  const wallGuard = 24;
  const walkMaxY = partitionY - manuNpc.size - wallGuard;
  const minX = az.x + padX;
  const maxX = az.x + az.w - manuNpc.size - padX;
  if (walkMaxY >= walkMinY + 6) {
    return { minX, minY: walkMinY, maxX, maxY: walkMaxY };
  }
  const guardBottom = 28;
  return {
    minX,
    minY: az.y + Math.floor(az.h * 0.42),
    maxX,
    maxY: az.y + az.h - manuNpc.size - guardBottom
  };
}

function placeManuNpc() {
  const b = getManuWalkBounds();
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const tries = [
    [cx, cy],
    [b.minX + 22, cy],
    [cx, b.minY + 8],
    [b.minX + 16, b.minY + 6]
  ];
  let placed = false;
  for (const [tx, ty] of tries) {
    const px = clamp(tx, b.minX, Math.max(b.minX, b.maxX));
    const py = clamp(ty, b.minY, Math.max(b.minY, b.maxY));
    if (!isBlockedAtEntity(px, py, manuNpc.size)) {
      manuNpc.x = px;
      manuNpc.y = py;
      placed = true;
      break;
    }
  }
  if (!placed) {
    manuNpc.x = b.minX + 18;
    manuNpc.y = b.minY + 6;
  }
  manuNpc.wanderTimer = 0.4;
  manuNpc.vx = -1;
  manuNpc.vy = 0;
  manuNpc.homeX = manuNpc.x;
  manuNpc.homeY = manuNpc.y;
}

function getAliceWalkBounds() {
  const zones = getOfficeZonesFromRoom();
  const z = zones.find(zz => zz.key === 'service_formation');
  if (!z) {
    return {
      minX: room.x + 8,
      minY: room.y + 8,
      maxX: room.x + room.w - aliceNpc.size - 8,
      maxY: room.y + room.h - aliceNpc.size - 8
    };
  }
  const pad = 10;
  return {
    minX: z.x + pad,
    minY: z.y + pad,
    maxX: z.x + z.w - aliceNpc.size - pad,
    maxY: z.y + z.h - aliceNpc.size - pad
  };
}

function placeAliceNpc() {
  if (currentMap !== 'office') return;
  const b = getAliceWalkBounds();
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  aliceNpc.x = clamp(cx, b.minX, Math.max(b.minX, b.maxX));
  aliceNpc.y = clamp(cy, b.minY, Math.max(b.minY, b.maxY));
  if (isBlockedAtEntity(aliceNpc.x, aliceNpc.y, aliceNpc.size)) {
    aliceNpc.x = b.minX + 16;
    aliceNpc.y = b.minY + 28;
  }
  aliceNpc.wanderTimer = 0.35;
  aliceNpc.vx = 0;
  aliceNpc.vy = 1;
  aliceNpc.homeX = aliceNpc.x;
  aliceNpc.homeY = aliceNpc.y;
}

function tryAliceMove(dx, dy) {
  const b = getAliceWalkBounds();
  const targetX = clamp(aliceNpc.x + dx, b.minX, Math.max(b.minX, b.maxX));
  const targetY = clamp(aliceNpc.y + dy, b.minY, Math.max(b.minY, b.maxY));
  if (!isBlockedAtEntity(targetX, targetY, aliceNpc.size)) {
    aliceNpc.x = targetX;
    aliceNpc.y = targetY;
    return true;
  }
  return false;
}

function tryManuMove(dx, dy) {
  const b = getManuWalkBounds();
  const targetX = clamp(manuNpc.x + dx, b.minX, Math.max(b.minX, b.maxX));
  const targetY = clamp(manuNpc.y + dy, b.minY, Math.max(b.minY, b.maxY));
  if (!isBlockedAtEntity(targetX, targetY, manuNpc.size)) {
    manuNpc.x = targetX;
    manuNpc.y = targetY;
    return true;
  }
  return false;
}

function updateManuNpc(dt) {
  if (currentMap !== 'office') return;

  manuNpc.wanderTimer -= dt;
  if (manuNpc.wanderTimer <= 0) {
    manuNpc.wanderTimer = 1.5 + Math.random() * 2.2;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ];
    const pick = dirs[Math.floor(Math.random() * dirs.length)];
    manuNpc.vx = pick[0];
    manuNpc.vy = pick[1];
  }

  const len = Math.hypot(manuNpc.vx, manuNpc.vy) || 1;
  const dx = (manuNpc.vx / len) * manuNpc.speed * dt;
  const dy = (manuNpc.vy / len) * manuNpc.speed * dt;

  manuNpc.moving = Math.abs(dx) + Math.abs(dy) > 0.001;
  if (manuNpc.moving) {
    if (Math.abs(manuNpc.vx) > Math.abs(manuNpc.vy)) {
      manuNpc.direction = manuNpc.vx > 0 ? 'right' : 'left';
    } else if (manuNpc.vy !== 0) {
      manuNpc.direction = manuNpc.vy > 0 ? 'down' : 'up';
    }
    manuNpc.walkCycle += dt * manuNpc.walkSpeed;
  } else {
    manuNpc.walkCycle = 0;
  }

  const moved = tryManuMove(dx, dy);
  if (!moved && manuNpc.moving) {
    manuNpc.wanderTimer = 0;
  }
}

function updateAliceNpc(dt) {
  if (currentMap !== 'office') return;

  aliceNpc.wanderTimer -= dt;
  if (aliceNpc.wanderTimer <= 0) {
    aliceNpc.wanderTimer = 1.4 + Math.random() * 2.2;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ];
    const pick = dirs[Math.floor(Math.random() * dirs.length)];
    aliceNpc.vx = pick[0];
    aliceNpc.vy = pick[1];
  }

  const len = Math.hypot(aliceNpc.vx, aliceNpc.vy) || 1;
  const dx = (aliceNpc.vx / len) * aliceNpc.speed * dt;
  const dy = (aliceNpc.vy / len) * aliceNpc.speed * dt;

  aliceNpc.moving = Math.abs(dx) + Math.abs(dy) > 0.001;
  if (aliceNpc.moving) {
    if (Math.abs(aliceNpc.vx) > Math.abs(aliceNpc.vy)) {
      aliceNpc.direction = aliceNpc.vx > 0 ? 'right' : 'left';
    } else if (aliceNpc.vy !== 0) {
      aliceNpc.direction = aliceNpc.vy > 0 ? 'down' : 'up';
    }
    aliceNpc.walkCycle += dt * aliceNpc.walkSpeed;
  } else {
    aliceNpc.walkCycle = 0;
  }

  const moved = tryAliceMove(dx, dy);
  if (!moved && aliceNpc.moving) {
    aliceNpc.wanderTimer = 0;
  }
}

function applySalleInfoLayout() {
  aldoNpc.seatedChair = null;
  aldoNpc.mode = 'wander';
  aldoNpc.atPcTimer = 0;
  objects = objects.filter(o => !isSalleInfoWorkstation(o) && !isSalleInfoDecor(o));
  objects.push(...layoutSalleInfoDecor(room));
  objects.push(...layoutSalleInfoWorkstations(room));
  placeAldoNpcInSalleInfo();
}

function drawSalleInfoWorkstation(obj) {
  if (obj.type === 'sqlTable') {
    drawPcDesk(obj, 'sql');
    return;
  }
  if (obj.type === 'pythonTable') {
    drawPcDesk(obj, 'python');
    return;
  }
  if (obj.type === 'cyberTable') {
    drawPcDesk(obj, 'cyber');
    return;
  }
  if (obj.type === 'pythonChair') {
    drawOfficeChair(obj, CHAIR_PALETTE_PYTHON);
    return;
  }
  if (obj.type === 'cyberChair') {
    drawOfficeChair(obj, CHAIR_PALETTE_CYBER);
    return;
  }
  if (obj.type === 'sqlChair') {
    drawOfficeChair(obj, CHAIR_PALETTE_SQL);
    return;
  }
}

function interactSalleInfo(target) {
  if (
    (target.type === 'sqlChair' || target.type === 'pythonChair' || target.type === 'cyberChair') &&
    aldoNpc.seatedChair === target
  ) {
    setMessage(
      'Aldo prépare et teste les exercices sur ce poste — choisissez un autre poste ou attendez qu’il se relève.'
    );
    return true;
  }
  if (target.type === 'sqlChair') {
    seatedOn = target;
    player.speed = 0;
    player.x = target.x + target.w / 2 - player.size / 2;
    player.y = target.y - player.size + 6;
    setMessage('Poste SQL : touche O pour ouvrir l’atelier.');
    return true;
  }
  if (target.type === 'pythonChair') {
    seatedOn = target;
    player.speed = 0;
    player.x = target.x + target.w / 2 - player.size / 2;
    player.y = target.y - player.size + 6;
    setMessage('Poste Python : touche O pour ouvrir l’atelier.');
    return true;
  }
  if (target.type === 'cyberChair') {
    seatedOn = target;
    player.speed = 0;
    player.x = target.x + target.w / 2 - player.size / 2;
    player.y = target.y - player.size + 6;
    setMessage('Poste cybersécurité : touche O pour ouvrir le module.');
    return true;
  }
  if (target.type === 'sqlTable') {
    setMessage('PC SQL — asseyez-vous face à l’écran, puis touche O.');
    return true;
  }
  if (target.type === 'pythonTable') {
    setMessage('PC Python — asseyez-vous face à l’écran, puis touche O.');
    return true;
  }
  if (target.type === 'cyberTable') {
    setMessage('Poste cybersécurité — asseyez-vous face à l’écran, puis touche O.');
    return true;
  }
  return false;
}

// Get current map data
function getCurrentMapData() {
  return maps[currentMap];
}

// Get zones for current map
function getCurrentZones() {
  if (currentMap === 'office') {
    return getOfficeZonesFromRoom();
  }
  const mapData = getCurrentMapData();
  return mapData ? mapData.zones : [];
}

function getSalleInfoZone() {
  return getCurrentZones().find(z => z.key === 'salle_info');
}

function getArchivesZone() {
  return getCurrentZones().find(z => z.key === 'archives');
}

// Get objects for current map
function getCurrentObjects() {
  const mapData = getCurrentMapData();
  return mapData ? mapData.objects : [];
}

// Keyboard state tracking
const keys = new Set();

const player = {
  x: 100,
  y: 200,
  size: 24,
  speed: 195,
  direction: 'down',
  moving: false,
  walkCycle: 0,
  walkFrame: 0,
  walkSpeed: 9
};

const basePlayerSpeed = player.speed;

/** Aldo — formateur Département Data & IA (pédagogie, ateliers, veille session). */
const aldoNpc = {
  x: 0,
  y: 0,
  size: 24,
  direction: 'down',
  moving: false,
  walkCycle: 0,
  walkSpeed: 9,
  speed: 48,
  wanderTimer: 0,
  vx: 0,
  vy: 0,
  /** Référence vers la chaise (objet `objects`) quand Aldo est au poste pour préparer / tester. */
  seatedChair: null,
  atPcTimer: 0,
  /** wander | sit | approach */
  mode: 'wander',
  approachMsg: '',
  behaviorCooldown: 0,
  thoughtTimer: 2.2,
  thoughtIndex: 0,
  homeX: 0,
  homeY: 0
};

/** Sandro — responsable salle serveurs (infra, défis, conformité). */
const sandroNpc = {
  x: 0,
  y: 0,
  size: 24,
  direction: 'down',
  moving: false,
  walkCycle: 0,
  walkSpeed: 9,
  speed: 42,
  wanderTimer: 0,
  vx: 0,
  vy: 0,
  thoughtTimer: 3.4,
  thoughtIndex: 0,
  homeX: 0,
  homeY: 0
};

/** Manu — référent IA Act (UE) & RGPD (zone archives, indépendant d’Aldo et Sandro). */
const manuNpc = {
  x: 0,
  y: 0,
  size: 24,
  direction: 'down',
  moving: false,
  walkCycle: 0,
  walkSpeed: 9,
  speed: 40,
  wanderTimer: 0,
  vx: 0,
  vy: 0,
  thoughtTimer: 2.8,
  thoughtIndex: 0,
  homeX: 0,
  homeY: 0
};

/** Alice — référente Service Formation (plans, parcours, accueil métier). */
const aliceNpc = {
  x: 0,
  y: 0,
  size: 24,
  direction: 'down',
  moving: false,
  walkCycle: 0,
  walkSpeed: 9,
  speed: 44,
  wanderTimer: 0,
  vx: 0,
  vy: 0,
  thoughtTimer: 2.5,
  thoughtIndex: 0,
  homeX: 0,
  homeY: 0
};

const OUTFIT_SANDRO = {
  skin: '#c4a57b',
  hair: '#1a1a1a',
  tshirt: '#2a5a6a',
  tshirtShade: '#1a3a48',
  jeans: '#3a4550',
  jeansShade: '#2a3238',
  shoe: '#dce6f7'
};

const OUTFIT_MANU = {
  skin: '#d4b896',
  hair: '#4a3a2a',
  tshirt: '#2d4a38',
  tshirtShade: '#1a3024',
  jeans: '#3a3842',
  jeansShade: '#2a2830',
  shoe: '#c8c4bc'
};

const OUTFIT_ALICE = {
  skin: '#e8c4b0',
  hair: '#5c4033',
  tshirt: '#6b4c7a',
  tshirtShade: '#4a3258',
  jeans: '#4a5568',
  jeansShade: '#343d4a',
  shoe: '#dce6f7'
};

let seatedOn = null;
let currentZone = '';
/** Porte salle admin en attente de validation PIN (modal). */
let pendingAdminDoor = null;
let adminPinBuffer = '';

// Initialize game
function initializeMap(mapId) {
  currentMap = 'office';
  room = makeOfficeRoom();
  const mapData = maps.office;
  objects = JSON.parse(JSON.stringify(mapData.objects));
  applyOfficeStructure();
  applySalleInfoLayout();
  normalizeAllDoors();
  placeSandroNpc();
  placeManuNpc();
  placeAliceNpc();

  const spawn = getAdminOfficeSpawn();
  player.x = spawn.x;
  player.y = spawn.y;
  ensureValidSpawn();

  seatedOn = null;
  currentZone = '';
  setMessage(
    `${mapData.name} — salle administrateur (PIN au clavier, puis E au bureau / console).`
  );
}

// Change map with transition (disabled in mono-map mode)
function changeMap(newMapId, newX, newY) {
  initializeMap('office');
}

// Keyboard input handling
document.addEventListener('keydown', e => {
  keys.add(e.code);
  
  // Character switching
  if (e.code === 'KeyC') {
    if (isWorkshopModalOpen() || isFormationServiceModalOpen()) return;
    switchCharacter();
  }
  
  // Interaction with chairs (E key)
  if (e.code === 'KeyE') {
    if (
      isNpcChatOpen() ||
      isServerControlOpen() ||
      isWelcomeKioskOpen() ||
      isAdminPinModalOpen() ||
      isWorkshopModalOpen() ||
      isFormationServiceModalOpen() ||
      isFyneEscapeModalOpen()
    ) {
      return;
    }
    const target = nearestInteractable();
    interactWithObject(target);
  }
  
  // Interaction with computers (O key) — selon la chaise où tu es assis
  if (e.code === 'KeyO') {
    if (
      isNpcChatOpen() ||
      isServerControlOpen() ||
      isWelcomeKioskOpen() ||
      isWorkshopModalOpen() ||
      isFormationServiceModalOpen()
    ) {
      return;
    }
    if (seatedOn && seatedOn.type === 'sqlChair') {
      openSQLChallenge();
    } else if (seatedOn && seatedOn.type === 'pythonChair') {
      openPythonAtelier();
    } else if (seatedOn && seatedOn.type === 'cyberChair') {
      openCyberAtelier();
    } else if (seatedOn && seatedOn.type === 'adminChair') {
      openWelcomeKioskModal({ section: 'pnj' });
    } else if (seatedOn && seatedOn.type === 'formationChair') {
      openFormationServiceModal();
    } else if (seatedOn && seatedOn.type === 'complianceChair') {
      const line = pickComplianceScenario(seatedOn.station);
      const notes = loadSessionHints().rgpdNotes || [];
      const extra =
        notes.length > 0 ? ` — Registre (session) : ${notes.slice(-4).join(' · ')}` : '';
      setMessage(`${line}${extra} (Manu : E pour le chat.)`);
    } else {
      setMessage('Assieds-toi sur une chaise devant un PC (E), puis O — atelier, plan formation ou mise en situation conformité.');
    }
  }
});

document.addEventListener('keyup', e => {
  keys.delete(e.code);
});

const characterSkins = [
  { name: 'Personnage 1', style: 'cap' },
  { name: 'Personnage 2', style: 'office' }
];

let activeCharacterIndex = 0;

function currentCharacter() {
  return characterSkins[activeCharacterIndex];
}

function switchCharacter() {
  activeCharacterIndex = (activeCharacterIndex + 1) % characterSkins.length;
  const character = currentCharacter();
  setMessage(`Personnage actif: ${character.name}`);
}

/** Tenue du joueur (même géométrie que les PNJ, couleurs différentes) */
function getPlayerOutfit() {
  const character = currentCharacter();
  const defaultColor = character.style === 'cap' ? '#d24a4a' : '#3a5a9a';
  const hair = character.style === 'cap' ? defaultColor : '#2a1a0a';
  return {
    skin: '#c4a57b',
    hair,
    tshirt: character.style === 'cap' ? '#4a7a2a' : '#3a5a9a',
    tshirtShade: character.style === 'cap' ? '#2a5a0a' : '#2a3a6a',
    jeans: '#6d90c6',
    jeansShade: '#5373a7',
    shoe: '#dce6f7'
  };
}

const OUTFIT_ALDO = {
  skin: '#c4a57b',
  hair: '#3d2818',
  tshirt: '#5a4a78',
  tshirtShade: '#3a3048',
  jeans: '#4a5a68',
  jeansShade: '#36424d',
  shoe: '#262c34'
};

function setMessage(text) {
  messageEl.textContent = text;
}

function isNpcChatOpen() {
  const el = document.getElementById('npcChatModal');
  return el && el.style.display === 'flex';
}

function isServerControlOpen() {
  const el = document.getElementById('serverControlModal');
  return el && el.style.display === 'flex';
}

/** Ateliers PC (SQL / Python / cyber) — bloque déplacement et relèvement (E) tant que la fenêtre est ouverte. */
function isWorkshopModalOpen() {
  const sql = document.getElementById('sqlModal');
  const py = document.getElementById('pythonModal');
  const cy = document.getElementById('cyberModal');
  return (
    (sql && sql.style.display === 'flex') ||
    (py && py.style.display === 'flex') ||
    (cy && cy.style.display === 'flex')
  );
}

function isDown(...codes) {
  return codes.some(c => keys.has(c));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getEntityHitbox(px, py, size) {
  const insetX = 5;
  const insetTop = 9;
  const insetBottom = 2;
  return {
    x: px + insetX,
    y: py + insetTop,
    w: size - insetX * 2,
    h: size - insetTop - insetBottom
  };
}

function getPlayerHitbox(x = player.x, y = player.y) {
  return getEntityHitbox(x, y, player.size);
}

function isSolid(obj) {
  return obj.solid !== false;
}

function isBlockedAt(x, y) {
  return isBlockedAtEntity(x, y, player.size);
}

function isBlockedAtEntity(x, y, size) {
  const next = getEntityHitbox(x, y, size);
  for (const obj of objects) {
    if (isSolid(obj) && intersects(next, obj)) {
      return true;
    }
  }
  return false;
}

function getAdminOfficeSpawn() {
  const door = objects.find(o => o.type === 'door' && o.adminDoor);
  if (door) {
    /** Devant la porte (côté espace commun, à l’est de la salle). */
    const x = Math.floor(door.x + door.w + 12);
    const y = Math.floor(door.y + door.h / 2 - player.size / 2);
    return {
      x: clamp(x, room.x, room.x + room.w - player.size),
      y: clamp(y, room.y, room.y + room.h - player.size)
    };
  }
  return { x: room.x + 100, y: room.y + 450 };
}

function ensureValidSpawn() {
  if (!isBlockedAt(player.x, player.y)) return;

  const candidates = [
    getAdminOfficeSpawn(),
    { x: room.x + 56, y: room.y + room.h - 80 },
    { x: room.x + 56, y: room.y + 56 },
    { x: room.x + 420, y: room.y + room.h - 80 }
  ];

  for (const spot of candidates) {
    if (!isBlockedAt(spot.x, spot.y)) {
      player.x = spot.x;
      player.y = spot.y;
      return;
    }
  }
}

function tryMove(dx, dy) {
  const targetX = clamp(player.x + dx, room.x, room.x + room.w - player.size);
  const targetY = clamp(player.y + dy, room.y, room.y + room.h - player.size);

  if (!isBlockedAt(targetX, targetY)) {
    player.x = targetX;
    player.y = targetY;
  }
}

function tryAldoMove(dx, dy) {
  const b = getAldoWalkBounds();
  const targetX = clamp(aldoNpc.x + dx, b.minX, Math.max(b.minX, b.maxX));
  const targetY = clamp(aldoNpc.y + dy, b.minY, Math.max(b.minY, b.maxY));
  if (!isBlockedAtEntity(targetX, targetY, aldoNpc.size)) {
    aldoNpc.x = targetX;
    aldoNpc.y = targetY;
    return true;
  }
  return false;
}

function isPlayerInSalleInfoZone() {
  const z = zoneAtPlayer();
  return z && z.key === 'salle_info';
}

function getSalleInfoChairs() {
  return objects.filter(
    o =>
      o &&
      (o.type === 'pythonChair' || o.type === 'cyberChair' || o.type === 'sqlChair')
  );
}

function clearAldoFromChair() {
  aldoNpc.seatedChair = null;
  aldoNpc.mode = 'wander';
  aldoNpc.atPcTimer = 0;
  aldoNpc.moving = false;
  aldoNpc.walkCycle = 0;
  placeAldoNpcInSalleInfo();
  aldoNpc.behaviorCooldown = 5 + Math.random() * 4;
}

function seatAldoAtChair(chair) {
  if (!chair) return;
  aldoNpc.seatedChair = chair;
  aldoNpc.mode = 'sit';
  aldoNpc.x = chair.x + chair.w / 2 - aldoNpc.size / 2;
  aldoNpc.y = chair.y - aldoNpc.size + 6;
  aldoNpc.direction = 'up';
  aldoNpc.moving = false;
  aldoNpc.walkCycle = 0;
  aldoNpc.vx = 0;
  aldoNpc.vy = 0;
  aldoNpc.atPcTimer = 14 + Math.random() * 12;
}

function buildAldoApproachMessage() {
  const prof = loadWelcomeProfile();
  const p = (prof.firstName || prof.displayName || '').trim();
  const lines = [];
  if (seatedOn) {
    if (seatedOn.type === 'sqlChair') {
      lines.push(
        p
          ? `${p}, je vérifie que tout est fluide côté SQL — indice ou reformulation, je suis là (E).`
          : 'Je reste disponible pour le SQL : indice ou reformulation (E pour m’écrire).'
      );
    } else if (seatedOn.type === 'pythonChair') {
      lines.push(
        p
          ? `${p}, besoin d’un regard sur votre script Python ? Je peux vous guider pas à pas.`
          : 'Pour Python : je peux vous aider à débloquer une erreur ou une consigne.'
      );
    } else if (seatedOn.type === 'cyberChair') {
      lines.push(
        p
          ? `${p}, le module cyber suit une logique précise — je peux reformuler une question si besoin.`
          : 'Module cybersécurité : je peux reformuler une question ou un concept.'
      );
    }
  }
  lines.push(
    p
      ? `${p}, je surveille la session au Département Data & IA — asseyez-vous à un poste (E) ou venez me voir.`
      : 'Je veille sur la session : postes SQL, Python, cyber — asseyez-vous ou ouvrez le chat (E).'
  );
  lines.push(
    'Je teste et mets à jour les exercices sur les postes : votre parcours est adapté au profil borne d’accueil.'
  );
  return lines[Math.floor(Math.random() * lines.length)];
}

function tryAldoSitAtWorkstation() {
  const chairs = getSalleInfoChairs().filter(ch => ch !== seatedOn);
  if (!chairs.length) return;
  const chair = chairs[Math.floor(Math.random() * chairs.length)];
  seatAldoAtChair(chair);
}

function updateAldoNpc(dt) {
  if (currentMap !== 'office') return;

  if (aldoNpc.seatedChair && seatedOn === aldoNpc.seatedChair) {
    clearAldoFromChair();
    return;
  }

  if (aldoNpc.mode === 'sit' && aldoNpc.seatedChair) {
    aldoNpc.atPcTimer -= dt;
    if (aldoNpc.atPcTimer <= 0) {
      clearAldoFromChair();
    }
    return;
  }

  if (aldoNpc.mode === 'approach') {
    const px = player.x + player.size / 2;
    const py = player.y + player.size / 2;
    const ax = aldoNpc.x + aldoNpc.size / 2;
    const ay = aldoNpc.y + aldoNpc.size / 2;
    const dx = px - ax;
    const dy = py - ay;
    const dist = Math.hypot(dx, dy);
    if (dist < 46) {
      aldoNpc.mode = 'wander';
      aldoNpc.moving = false;
      aldoNpc.walkCycle = 0;
      if (aldoNpc.approachMsg) {
        setMessage(aldoNpc.approachMsg);
        aldoNpc.approachMsg = '';
      }
      aldoNpc.behaviorCooldown = 10 + Math.random() * 8;
      return;
    }
    const len = dist || 1;
    const step = aldoNpc.speed * 1.15 * dt;
    const mvx = (dx / len) * Math.min(step, dist);
    const mvy = (dy / len) * Math.min(step, dist);
    aldoNpc.moving = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      aldoNpc.direction = dx > 0 ? 'right' : 'left';
    } else if (dy !== 0) {
      aldoNpc.direction = dy > 0 ? 'down' : 'up';
    }
    aldoNpc.walkCycle += dt * aldoNpc.walkSpeed;
    const moved = tryAldoMove(mvx, mvy);
    if (!moved) {
      aldoNpc.mode = 'wander';
      aldoNpc.behaviorCooldown = 4;
    }
    return;
  }

  aldoNpc.behaviorCooldown -= dt;
  if (aldoNpc.behaviorCooldown <= 0) {
    if (isPlayerInSalleInfoZone() && !isWorkshopModalOpen()) {
      aldoNpc.behaviorCooldown = 9 + Math.random() * 10;
      const r = Math.random();
      if (r < 0.38) {
        tryAldoSitAtWorkstation();
        return;
      }
      if (r < 0.72) {
        aldoNpc.mode = 'approach';
        aldoNpc.approachMsg = buildAldoApproachMessage();
        return;
      }
    } else {
      aldoNpc.behaviorCooldown = 5 + Math.random() * 6;
    }
  }

  aldoNpc.wanderTimer -= dt;
  if (aldoNpc.wanderTimer <= 0) {
    aldoNpc.wanderTimer = 1.4 + Math.random() * 2.6;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1]
    ];
    const pick = dirs[Math.floor(Math.random() * dirs.length)];
    aldoNpc.vx = pick[0];
    aldoNpc.vy = pick[1];
  }

  const len = Math.hypot(aldoNpc.vx, aldoNpc.vy) || 1;
  const dx = (aldoNpc.vx / len) * aldoNpc.speed * dt;
  const dy = (aldoNpc.vy / len) * aldoNpc.speed * dt;

  aldoNpc.moving = Math.abs(dx) + Math.abs(dy) > 0.001;
  if (aldoNpc.moving) {
    if (Math.abs(aldoNpc.vx) > Math.abs(aldoNpc.vy)) {
      aldoNpc.direction = aldoNpc.vx > 0 ? 'right' : 'left';
    } else if (aldoNpc.vy !== 0) {
      aldoNpc.direction = aldoNpc.vy > 0 ? 'down' : 'up';
    }
    aldoNpc.walkCycle += dt * aldoNpc.walkSpeed;
  } else {
    aldoNpc.walkCycle = 0;
  }

  const moved = tryAldoMove(dx, dy);
  if (!moved && aldoNpc.moving) {
    aldoNpc.wanderTimer = 0;
  }
}

function nearestInteractable(maxDist = 68) {
  const px = player.x + player.size / 2;
  const py = player.y + player.size / 2;
  let best = null;
  let bestD = Infinity;

  function consider(ox, oy, ref) {
    const d = Math.hypot(px - ox, py - oy);
    if (d < bestD) {
      bestD = d;
      best = ref;
    }
  }

  for (const obj of objects) {
    if (obj.type === 'wall') continue;
    consider(obj.x + obj.w / 2, obj.y + obj.h / 2, obj);
  }

  if (currentMap === 'office') {
    consider(
      aldoNpc.x + aldoNpc.size / 2,
      aldoNpc.y + aldoNpc.size / 2,
      {
        type: 'tutorNpc',
        x: aldoNpc.x,
        y: aldoNpc.y,
        w: aldoNpc.size,
        h: aldoNpc.size,
        text: 'Aldo — formateur (E : chat, veille Data & IA)'
      }
    );
    consider(
      sandroNpc.x + sandroNpc.size / 2,
      sandroNpc.y + sandroNpc.size / 2,
      {
        type: 'tutorNpcServer',
        x: sandroNpc.x,
        y: sandroNpc.y,
        w: sandroNpc.size,
        h: sandroNpc.size,
        text: 'Sandro — salle serveurs FYNE (E)'
      }
    );
    consider(
      manuNpc.x + manuNpc.size / 2,
      manuNpc.y + manuNpc.size / 2,
      {
        type: 'tutorNpcManu',
        x: manuNpc.x,
        y: manuNpc.y,
        w: manuNpc.size,
        h: manuNpc.size,
        text: 'Manu — IA Act & RGPD (E)'
      }
    );
    consider(
      aliceNpc.x + aliceNpc.size / 2,
      aliceNpc.y + aliceNpc.size / 2,
      {
        type: 'tutorNpcAlice',
        x: aliceNpc.x,
        y: aliceNpc.y,
        w: aliceNpc.size,
        h: aliceNpc.size,
        text: 'Alice — Service Formation (E)'
      }
    );
  }

  if (currentMap === 'office' && best && best.type === 'tutorNpcAlice') {
    let alt = null;
    let altD = Infinity;
    for (const obj of objects) {
      if (obj.type !== 'formationChair' && obj.type !== 'formationTable') continue;
    const ox = obj.x + obj.w / 2;
    const oy = obj.y + obj.h / 2;
    const d = Math.hypot(px - ox, py - oy);
      if (d <= maxDist && d < altD) {
        altD = d;
        alt = obj;
      }
    }
    if (alt) {
      best = alt;
      bestD = altD;
    }
  }

  if (currentMap === 'office' && best && best.type === 'tutorNpcManu') {
    let alt = null;
    let altD = Infinity;
    for (const obj of objects) {
      if (obj.type !== 'complianceChair' && obj.type !== 'complianceTable') continue;
      const ox = obj.x + obj.w / 2;
      const oy = obj.y + obj.h / 2;
      const d = Math.hypot(px - ox, py - oy);
      if (d <= maxDist && d < altD) {
        altD = d;
        alt = obj;
      }
    }
    if (alt) {
      best = alt;
      bestD = altD;
    }
  }

  return bestD <= maxDist ? best : null;
}

function zoneAtPlayer() {
  const px = player.x + player.size / 2;
  const py = player.y + player.size / 2;
  const inside = getCurrentZones().filter(
    (z) => px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h
  );
  if (inside.length === 0) return undefined;
  inside.sort((a, b) => a.w * a.h - b.w * b.h);
  return inside[0];
}

function update(dt) {
  let ax = 0;
  let ay = 0;

  if (
    !seatedOn &&
    !isNpcChatOpen() &&
    !isServerControlOpen() &&
    !isWelcomeKioskOpen() &&
    !isAdminPinModalOpen() &&
    !isFormationServiceModalOpen() &&
    !isWorkshopModalOpen()
  ) {
    if (isDown('ArrowLeft', 'KeyA', 'KeyQ')) ax -= 1;
    if (isDown('ArrowRight', 'KeyD')) ax += 1;
    if (isDown('ArrowUp', 'KeyW', 'KeyZ')) ay -= 1;
    if (isDown('ArrowDown', 'KeyS')) ay += 1;
  }

  player.moving = ax !== 0 || ay !== 0;

  if (player.moving) {
    if (Math.abs(ax) > Math.abs(ay)) {
      player.direction = ax > 0 ? 'right' : 'left';
    } else {
      player.direction = ay > 0 ? 'down' : 'up';
    }
  }

  const len = Math.hypot(ax, ay) || 1;
  const vx = (ax / len) * player.speed * dt;
  const vy = (ay / len) * player.speed * dt;

  tryMove(vx, 0);
  tryMove(0, vy);

  if (player.moving) {
    player.walkCycle += dt * player.walkSpeed;
    player.walkFrame = Math.floor(player.walkCycle) % 2;
  } else {
    player.walkCycle = 0;
    player.walkFrame = 0;
  }

  const z = zoneAtPlayer();
  const zoneName = z ? z.name : '';
  const zoneKey = z ? z.key : '';
  if (zoneName && zoneName !== currentZone) {
    currentZone = zoneName;
    const profile = loadWelcomeProfile();
    const firstVisit = zoneKey ? registerZoneVisit(zoneKey) : true;
    const line = buildZoneEntryMessage(zoneKey, zoneName, profile, firstVisit);
    if (line) setMessage(line);
  }

  updateDoorAnimations(dt);
  updateAldoNpc(dt);
  updateSandroNpc(dt);
  updateManuNpc(dt);
  updateAliceNpc(dt);
  updateNpcThoughts(dt);
}

/** Initialise openProgress / openTarget pour les portes (après clone JSON). */
function normalizeAllDoors() {
  for (const obj of objects) {
    if (obj.type !== 'door') continue;
    if (obj.openProgress === undefined) obj.openProgress = obj.open ? 1 : 0;
    if (obj.openTarget === undefined) obj.openTarget = obj.open ? 1 : 0;
  }
}

const DOOR_SLIDE_SPEED = 4.5;

function updateDoorAnimations(dt) {
  for (const obj of objects) {
    if (obj.type !== 'door') continue;
    if (obj.openProgress === undefined) obj.openProgress = obj.open ? 1 : 0;
    if (obj.openTarget === undefined) obj.openTarget = obj.open ? 1 : 0;

    if (obj.locked) {
      obj.openTarget = 0;
      obj.openProgress = 0;
      obj.open = false;
      obj.solid = true;
      continue;
    }

    const diff = obj.openTarget - obj.openProgress;
    if (Math.abs(diff) < 0.002) {
      obj.openProgress = obj.openTarget;
    } else {
      obj.openProgress += Math.sign(diff) * Math.min(Math.abs(diff), DOOR_SLIDE_SPEED * dt);
    }
    obj.open = obj.openProgress > 0.5;
    obj.solid = obj.openProgress < 0.82;

    if (obj._pendingMapTransition && obj.openProgress >= 0.9) {
      const p = obj._pendingMapTransition;
      obj._pendingMapTransition = null;
      changeMap(p.mapId, p.tx, p.ty);
    }
  }
}

/** Porte coulissante vue de dessus — cadre, rails, panneau qui glisse (axe Y si h > w, sinon X). */
function drawSlidingDoor(obj) {
  const progress = Math.max(0, Math.min(1, obj.openProgress ?? 0));
  const slide = progress * 0.96;
  const frameX = obj.x;
  const frameY = obj.y;
  const frameW = obj.w;
  const frameH = obj.h;
  const pw = Math.max(1, obj.w - 4);
  const ph = Math.max(1, obj.h - 4);
  const vertical = obj.h > obj.w;

  ctx.save();

  ctx.fillStyle = '#2a2c32';
  ctx.fillRect(frameX, frameY, frameW, frameH);
  ctx.strokeStyle = '#5a5c64';
  ctx.lineWidth = 1;
  ctx.strokeRect(frameX + 0.5, frameY + 0.5, frameW - 1, frameH - 1);

  const rail = '#4a5058';
  if (vertical) {
    ctx.fillStyle = rail;
    ctx.fillRect(frameX + 1, frameY + 2, 2, frameH - 4);
    ctx.fillRect(frameX + frameW - 3, frameY + 2, 2, frameH - 4);
  } else {
    ctx.fillStyle = rail;
    ctx.fillRect(frameX + 2, frameY + 1, frameW - 4, 2);
    ctx.fillRect(frameX + 2, frameY + frameH - 3, frameW - 4, 2);
  }

  ctx.beginPath();
  ctx.rect(frameX + 1, frameY + 1, frameW - 2, frameH - 2);
  ctx.clip();

  let panelX = obj.x + 2;
  let panelY = obj.y + 2;
  if (vertical) {
    panelY = obj.y + 2 - slide * (ph - 1);
  } else {
    panelX = obj.x + 2 - slide * (pw - 1);
  }

  ctx.fillStyle = '#3d3f46';
  ctx.fillRect(panelX, panelY, pw, ph);
  ctx.fillStyle = '#4a4c54';
  ctx.fillRect(panelX + 1, panelY + 1, pw - 2, ph - 2);
  ctx.strokeStyle = '#2a2c32';
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX, panelY, pw, ph);

  const hx = vertical ? panelX + pw - 5 : panelX + pw - 6;
  const hy = vertical ? panelY + ph / 2 : panelY + ph / 2;
  ctx.fillStyle = '#e8c040';
  ctx.beginPath();
  ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  if (obj.locked) {
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('L', frameX + 4, frameY + 14);
  } else if (progress < 0.08) {
    ctx.fillStyle = '#44ff44';
    ctx.font = 'bold 10px Arial';
    ctx.fillText('U', frameX + 4, frameY + 14);
  }
}

/** Mises en situation — règlement IA (UE) : risques, rôles, documentation (pédagogie, pas conseil juridique). */
const COMPLIANCE_SCENARIOS_AI_ACT = [
  'Mise en situation IA Act : vous déployez un outil de tri automatique des demandes clients. Quels niveaux de risque envisagez-vous (minimal, limité, haut) et quelles garanties de supervision humaine ?',
  'Mise en situation IA Act : un chatbot interne répond aux RH. Quelles exigences de transparence vis-à-vis des salariés et quels contrôles avant mise en production ?',
  'Mise en situation IA Act : un modèle d’aide à la décision assiste les managers. Comment documentez-vous l’usage et limitez-vous les biais (données, validation) ?',
  'Mise en situation IA Act : fournisseur externe héberge le modèle. Comment répartissez-vous les obligations entre fournisseur et déployeur dans votre cadre interne ?',
  'Mise en situation IA Act : système présenté comme « haut risque » pour la sécurité. Quelles étapes de conformité et de suivi continue envisagez-vous à grand trait ?',
  'Mise en situation IA Act : usage d’un modèle génératif pour des brouillons de courriers. Quelles mentions et vérifications imposez-vous avant envoi ?'
];

/** Mises en situation — RGPD : traitements, droits, conservation (pédagogie). */
const COMPLIANCE_SCENARIOS_RGPD = [
  'Mise en situation RGPD : un titulaire de droits demande l’accès à l’ensemble de ses données ; certains fichiers concernent aussi d’autres personnes. Comment structurez-vous la réponse ?',
  'Mise en situation RGPD : vous devez définir la durée de conservation pour des données de prospection B2B. Quels critères et révision régulière proposez-vous ?',
  'Mise en situation RGPD : transfert vers un sous-traitant hors UE. Quelles clauses types ou garanties examinez-vous en amont ?',
  'Mise en situation RGPD : une finalité « analytics » veut réutiliser des données collectées pour le support. Quels principes et documents mettez-vous en jeu ?',
  'Mise en situation RGPD : demande d’effacement alors qu’une obligation légale de conservation existe encore. Comment tranchez et documentez-vous ?',
  'Mise en situation RGPD : violation de données suspectée sur un extrait exporté. Quelles premières actions internes et traçabilité ?',
  'Mise en situation RGPD : enregistrement d’un nouveau traitement dans le registre — base légale, mesures et responsable désigné : que vérifiez-vous ?'
];

function pickComplianceScenario(station) {
  const pool = station === 'aiAct' ? COMPLIANCE_SCENARIOS_AI_ACT : COMPLIANCE_SCENARIOS_RGPD;
  return pool[Math.floor(Math.random() * pool.length)];
}

function interactAdminWorkstation(target) {
  if (target.type === 'adminChair') {
    seatedOn = target;
    player.speed = 0;
    player.x = target.x + target.w / 2 - player.size / 2;
    player.y = target.y - player.size + 6;
    setMessage(
      'Poste administration : O pour la console (prompts PNJ Sandro, Manu, Aldo, vue SQL / Python / cyber). E pour vous relever.'
    );
    return true;
  }
  if (target.type === 'adminTable') {
    setMessage('PC administration — asseyez-vous face à l’écran, puis O.');
    return true;
  }
  return false;
}

function interactWithObject(target) {
  if (seatedOn && (isWorkshopModalOpen() || isFormationServiceModalOpen())) {
    setMessage('Fermez la fenêtre (Échap) avant de vous relever.');
    return;
  }

  if (seatedOn) {
    // Store chair reference before clearing seatedOn
    const chair = seatedOn;
    seatedOn = null;
    player.speed = basePlayerSpeed;
    
    // Déplacer le joueur à une position libre autour de la chaise
    const candidates = [
      { x: chair.x - player.size - 10, y: chair.y },
      { x: chair.x + chair.w + 10, y: chair.y },
      { x: chair.x, y: chair.y - player.size - 10 },
      { x: chair.x, y: chair.y + chair.h + 10 }
    ];

    for (const spot of candidates) {
      if (!isBlockedAt(spot.x, spot.y)) {
        player.x = spot.x;
        player.y = spot.y;
        break;
      }
    }

    setMessage('Tu te relèves.');
    return;
  }

  if (!target) {
    setMessage("Il n'y a rien à observer ici.");
    return;
  }

  if (target.type === 'chair' || target.type === 'formationChair' || target.type === 'complianceChair') {
    seatedOn = target;
    player.speed = 0;
    player.x = target.x + target.w / 2 - player.size / 2;
    player.y = target.y - player.size + 6;
    if (target.type === 'formationChair') {
      setMessage('Tu t’assois au poste Service Formation. O : plan personnalisé. E : te relever.');
    } else if (target.type === 'complianceChair') {
      const label = target.station === 'rgpd' ? 'RGPD' : 'IA Act (UE)';
      setMessage(
        `Tu t’assois au poste ${label}. O : mise en situation. E : te relever — ou Manu (E) pour le chat.`
      );
    } else {
    setMessage('Tu t\'assois sur la chaise. Appuie sur E pour te relever.');
    }
    return;
  }

  if (target.type === 'tutorNpc') {
    openAldoNpcChat();
    return;
  }

  if (target.type === 'tutorNpcServer') {
    openSandroNpcChat();
    return;
  }

  if (target.type === 'tutorNpcManu') {
    openManuNpcChat();
    return;
  }

  if (target.type === 'tutorNpcAlice') {
    openAliceNpcChat();
    return;
  }

  if (interactAdminWorkstation(target)) return;

  if (target.type === 'formationTable') {
    openFormationServiceModal();
    return;
  }

  if (target.type === 'serverConsole') {
    openServerControlPanel();
    return;
  }

  if (target.type === 'door') {
    if (target.mapTo) {
      if (target._pendingMapTransition) {
        setMessage('La porte est en train de coulisser…');
        return;
      }
      target.openTarget = 1;
      target._pendingMapTransition = {
        mapId: target.mapTo,
        tx: target.targetX,
        ty: target.targetY
      };
      setMessage('Tu ouvres la porte coulissante…');
      return;
    }
    
    if (target.locked) {
      if (target.adminDoor) {
        pendingAdminDoor = target;
        adminPinBuffer = '';
        openAdminPinModal();
        return;
      }
      const entered = window.prompt('Porte sécurisée : entre le code d\'accès');
      if (entered === null) return;

      if (entered.trim() === SERVER_ROOM_CODE) {
        target.locked = false;
        target.openTarget = 1;
        setMessage('Code correct. La porte coulisse…');
      } else {
        setMessage('Code incorrect.');
      }
      return;
    }

    if (target.openTarget > 0.5) {
      const playerBox = getPlayerHitbox();
      if (intersects(playerBox, target)) {
        setMessage('Recule un peu pour fermer la porte.');
        return;
      }
      target.openTarget = 0;
      setMessage('Porte fermée.');
    } else {
      target.openTarget = 1;
      setMessage('Porte ouverte.');
    }
    return;
  }

  if (target.type === 'desk') {
    target.powered = !target.powered;
    setMessage(target.powered ? 'Poste allumé et utilisable.' : 'Poste éteint.');
    return;
  }

  if (target.type === 'rack') {
    if (target.siteLabel === 'Escape') {
      openFyneEscapeModal();
      return;
    }
    if (target.siteLabel === 'Recrutement') {
      setMessage(
        'Segment Recrutement FYNE — baie en supervision (rouge). Connexion site à brancher côté infra.'
      );
      return;
    }
    if (target.siteLabel === 'Formation') {
      setMessage(
        'Segment Formation FYNE — baie en supervision (rouge). Connexion site à brancher côté infra.'
      );
      return;
    }
    target.maintenance = !target.maintenance;
    setMessage(target.maintenance ? 'Rack en mode maintenance.' : 'Rack revenu en mode normal.');
    return;
  }

  if (target.type === 'ac') {
    target.on = !target.on;
    setMessage(target.on ? 'Climatisation activée.' : 'Climatisation désactivée.');
    return;
  }

  if (target.type === 'counter') {
    setMessage('Tu prépares un café au comptoir.');
    return;
  }

  if (target.type === 'stove') {
    setMessage('La cuisinière est chaude, le service est en cours.');
    return;
  }

  if (target.type === 'cafeTable' && !target.salleInfoDecor) {
    setMessage('Tu utilises la table pour une pause.');
    return;
  }

  if (target.type === 'vending') {
    if ((target.stock ?? 0) > 0) {
      target.stock -= 1;
      setMessage(`Tu prends une boisson. Stock restant: ${target.stock}`);
    } else {
      setMessage('Le distributeur est vide.');
    }
    return;
  }

  if (target.salleInfoDecor) {
    setMessage(target.text || 'Un coin du Département Data & IA.');
    return;
  }

  if (target.type === 'complianceTable') {
    const line = pickComplianceScenario(target.station);
    const notes = loadSessionHints().rgpdNotes || [];
    const extra =
      notes.length > 0
        ? ` — Registre (session) : ${notes.slice(-4).join(' · ')}`
        : '';
    setMessage(`${line}${extra} Asseyez-vous sur la chaise (E) pour le poste, ou approfondissez avec Manu (E).`);
    return;
  }

  if (interactSalleInfo(target)) return;

  setMessage(target.text || "Il n'y a rien à observer ici.");
}

// SQL Learning System
let currentSQLChallenge = 0;
let sqlLearningStarted = false;
let sqlAttempts = 0;
let sqlAnswerRevealed = false;
/** Réponse validée : en attente du clic « Défi suivant » (pas de passage automatique). */
let sqlAwaitingNextChallenge = false;

// Exemple de données pour les résultats SQL
const sqlDatabase = {
  menu_plats: [
    { id: 1, nom: 'Salade César', prix: 5.50, categorie: 'Salade', disponible: true },
    { id: 2, nom: 'Pâtes Carbonara', prix: 8.00, categorie: 'Plat', disponible: true },
    { id: 3, nom: 'Pizza Margherita', prix: 7.50, categorie: 'Plat', disponible: false },
    { id: 4, nom: 'Poulet Grillé', prix: 9.50, categorie: 'Plat', disponible: true },
    { id: 5, nom: 'Tiramisu', prix: 4.50, categorie: 'Dessert', disponible: true },
    { id: 6, nom: 'Salade Niçoise', prix: 6.50, categorie: 'Salade', disponible: true },
    { id: 7, nom: 'Steak Frites', prix: 10.00, categorie: 'Plat', disponible: true },
    { id: 8, nom: 'Fruit Frais', prix: 3.00, catégorie: 'Dessert', disponible: true },
    { id: 9, nom: 'Eau Minérale', prix: 1.50, categorie: 'Boisson', disponible: true },
    { id: 10, nom: 'Jus Orange', prix: 2.50, categorie: 'Boisson', disponible: true }
  ]
};

const sqlCourses = [
  {
    id: 1,
    title: 'Bienvenue — atelier SQL',
    isIntro: true,
    content: `BIENVENUE

Cet atelier vous guide pour interroger une base « menu » dans un contexte professionnel (logiciel de caisse, portail de commande, extranet interne).

Vous allez utiliser :
• SELECT — lire des lignes et des colonnes
• WHERE — restreindre le résultat
• COUNT(*) — compter des lignes
• ORDER BY — trier les résultats

Cliquez sur « Commencer » pour le premier scénario (restauration d’entreprise, carte disponible uniquement en base).`,
    nextText: 'Commencer le défi 1'
  },
  {
    id: 2,
    level: 1,
    title: 'Défi 1 : Les Plats du Menu',
    story:
      'Pause déjeuner : la carte imprimée n’est pas disponible, mais la table menu_plats contient l’offre complète. Vous devez d’abord afficher l’ensemble des lignes avant d’appliquer des filtres.',
    instruction: 'Listez tous les enregistrements de la carte (tous les plats, toutes les colonnes utiles).',
    conceptsTeaser:
      '• SELECT — choisir les colonnes à afficher\n• * — raccourci pour « toutes les colonnes »\n• FROM — indiquer dans quelle table on lit les données',
    table: 'TABLE: menu_plats',
    schema: 'Colonnes: id, nom, prix, categorie, disponible',
    example: 'Exemple de lignes :\n  1 | Salade | 5.50 | Salade | true\n  2 | Pates | 8.00 | Plat | true',
    expectedQuery: 'SELECT * FROM menu_plats',
    hint: 'Indice : utilisez SELECT * pour tout récupérer.',
    explanation: 'SELECT * = « Récupère tout »\n* = « toutes les colonnes »'
  },
  {
    id: 3,
    level: 2,
    title: 'Défi 2 : Les Plats Disponibles',
    story:
      'Plusieurs plats ne sont plus servis. La colonne disponible indique si l’article est encore proposé (true) ou non (false). Vous ne souhaitez voir que ce qui reste commandable.',
    instruction: 'Affichez uniquement les plats encore disponibles (disponible = vrai).',
    conceptsTeaser:
      '• WHERE — filtrer les lignes selon une condition\n• = — comparer une colonne à une valeur (ici true / false)',
    table: 'TABLE: menu_plats',
    schema: 'Colonnes: id, nom, prix, categorie, disponible',
    example: 'Exemple :\n  1 | Salade | 5.50 | Salade | true\n  3 | Pizza | 7.00 | Plat | false (épuisé)',
    expectedQuery: 'SELECT * FROM menu_plats WHERE disponible = true',
    hint: 'Indice : utilisez WHERE pour filtrer.',
    explanation: 'WHERE = « sous condition »\nOn ne garde que les lignes où la condition est vraie.'
  },
  {
    id: 4,
    level: 3,
    title: 'Défi 3 : Plats par Catégorie',
    story:
      'Vous ne voulez que les articles catalogués comme « Plat » (hors salades et boissons). La colonne categorie distingue les types de mets.',
    instruction: 'Affichez les plats dont la catégorie est exactement « Plat ».',
    conceptsTeaser:
      '• WHERE avec texte — les chaînes se mettent entre quotes simples en SQL : \'Plat\'\n• Attention aux guillemets doubles vs simples selon le moteur (ici on utilise \').',
    table: 'TABLE: menu_plats',
    schema: 'Colonnes: id, nom, prix, categorie, disponible',
    example: 'Catégories possibles : Salade, Plat, Dessert, Boisson',
    expectedQuery: 'SELECT * FROM menu_plats WHERE categorie = \'Plat\'',
    hint: 'Indice : pour du texte, utilisez des guillemets simples : \'texte\'.',
    explanation: 'WHERE categorie = \'Plat\' = « garde les lignes où categorie vaut le texte Plat »'
  },
  {
    id: 5,
    level: 4,
    title: 'Défi 4 : Compter les Plats',
    story:
      'Le responsable a besoin d’un total : combien de plats sont encore au menu (disponibles) ? Pas la liste détaillée — uniquement le nombre.',
    instruction: 'Comptez combien de lignes ont disponible = vrai (utilisez une agrégation).',
    conceptsTeaser:
      '• COUNT(*) — compte le nombre de lignes qui passent le filtre\n• À combiner avec WHERE pour ne compter que les disponibles',
    table: 'TABLE: menu_plats',
    schema: 'Colonnes: id, nom, prix, categorie, disponible',
    example: 'Résultat attendu : un seul nombre (ex. 8 selon les données du jour).',
    expectedQuery: 'SELECT COUNT(*) FROM menu_plats WHERE disponible = true',
    hint: 'Indice : COUNT(*) compte le nombre de lignes.',
    explanation: 'COUNT(*) = « combien de lignes »\nC’est une agrégation : un résumé au lieu du détail ligne par ligne.'
  },
  {
    id: 6,
    level: 5,
    title: 'Défi 5 : Plats Moins Chers',
    story:
      'Budget limité : vous ne voulez afficher que les articles strictement à moins de 7 €.',
    instruction: 'Listez les plats dont le prix est inférieur à 7 (colonne prix).',
    conceptsTeaser:
      '• Comparateurs : <, >, =, <=, >=, <>\n• WHERE prix < 7 garde les lignes dont le prix est plus petit que 7',
    table: 'TABLE: menu_plats',
    schema: 'Colonnes: id, nom, prix, categorie, disponible',
    example: 'Exemple : Salade (5.50) oui, Pizza (8.00) non',
    expectedQuery: 'SELECT * FROM menu_plats WHERE prix < 7',
    hint: 'Indice : utilisez < pour « inférieur à ».',
    explanation: '< = « inférieur à »\n> = « supérieur à »\n= = « égal à »\n<> = « différent de »'
  },
  {
    id: 7,
    level: 6,
    title: 'Défi 6 : Trier les Plats',
    story:
      'Vous affichez tout le catalogue, trié du prix le plus bas au plus cher pour comparer les montants.',
    instruction: 'Retournez tous les plats triés par prix croissant (du moins cher au plus cher).',
    conceptsTeaser:
      '• ORDER BY colonne — ordonne les lignes du résultat\n• ASC = ordre croissant (souvent optionnel mais explicite ici)\n• DESC = ordre décroissant',
    table: 'TABLE: menu_plats',
    schema: 'Colonnes: id, nom, prix, categorie, disponible',
    example: 'Ordre attendu : Salade (5.50), puis plats plus chers, etc.',
    expectedQuery: 'SELECT * FROM menu_plats ORDER BY prix ASC',
    hint: 'Indice : ORDER BY trie les résultats ; ASC = du plus petit au plus grand.',
    explanation: 'ORDER BY prix ASC = « trie par prix en ordre croissant »\nDESC = ordre décroissant'
  },
  {
    id: 8,
    isConclusion: true,
    title: 'Parcours SQL terminé',
    content: `Vous avez couvert les bases suivantes :

• SELECT * — lire toutes les colonnes
• WHERE — filtrer les lignes
• COUNT() — compter
• ORDER BY — trier
• Comparateurs : =, <, >, <=, >=, <>

Étapes possibles ensuite : JOIN, GROUP BY, sous-requêtes, etc.`,
    nextText: 'Recommencer depuis le début'
  }
];

// ----- Parcours Python (atelier Département Data & IA) -----
let currentPythonChallenge = 0;
let pythonLearningStarted = false;
let pythonAttempts = 0;
let pythonAnswerRevealed = false;

const pythonCourses = [
  {
    id: 1,
    isIntro: true,
    content: `BIENVENUE À L'ATELIER PYTHON

Vous enchaînerez des exercices courts sur les bases :
• afficher du texte avec print()
• variables et réutilisation
• conditions if / else
• boucles for et range()
• listes et fonction len()
• définir une fonction avec def

Lancez le premier exercice lorsque vous êtes prêt.`,
    nextText: 'Commencer la leçon 1'
  },
  {
    id: 2,
    level: 1,
    title: 'Application 1 — Affichage',
    story:
      'Premier usage courant de Python en contexte pro : afficher un message dans la sortie console (équivalent « Hello world »).',
    conceptsTeaser:
      '• print(...) — affiche une valeur dans la sortie\n• Les chaînes de caractères entre \'...\' ou "..."',
    instruction: 'Écrivez un programme qui affiche exactement le texte : Bonjour',
    doc: 'La fonction print() envoie une valeur à la console. Une chaîne de caractères se note entre guillemets \'...\' ou "...".',
    example: 'print("Bonjour")',
    explanation: 'Chaque instruction sur une ligne suffit ici. print est une fonction : nom, parenthèses, puis l’argument.',
    hint: 'Indice : utilisez print avec une chaîne entre guillemets ; le texte affiché doit être exactement Bonjour.',
    reveal: 'print("Bonjour")',
    validate(code) {
      const s = code.trim();
      if (!s) return { isCorrect: false, message: 'Écris au moins une ligne de code.' };
      if (/print\s*\(\s*['"]Bonjour['"]\s*\)/.test(s)) return { isCorrect: true, message: '' };
      if (/print\s*\(/.test(s)) {
        return { isCorrect: false, message: 'Le message doit être exactement le mot Bonjour (majuscule B).' };
      }
      return { isCorrect: false, message: 'Utilise print(...) avec Bonjour entre guillemets.' };
    }
  },
  {
    id: 3,
    level: 2,
    title: 'Application 2 — Variables',
    story:
      'Une variable nommée stocke une valeur pour la réutiliser dans la suite du programme.',
    conceptsTeaser:
      '• nom = valeur — affectation\n• print(nom) — lit le contenu de la variable',
    instruction:
      'Créez une variable nommée reponse qui vaut 42, puis affichez cette variable avec print (sur une ou deux lignes).',
    doc: 'On affecte avec = : nom = valeur. Ensuite print(reponse) affiche le contenu de la variable.',
    example: 'reponse = 42\nprint(reponse)',
    explanation: 'Les variables stockent des valeurs réutilisables ; le nom ne doit pas contenir d’espaces.',
    hint: 'Indice : déclarez la variable avec = sur une ligne, puis affichez son contenu avec print et le même nom.',
    reveal: 'reponse = 42\nprint(reponse)',
    validate(code) {
      const s = code.replace(/\r\n/g, '\n').trim();
      if (!s) return { isCorrect: false, message: 'Écris le code demandé.' };
      if (!/reponse\s*=\s*42\b/.test(s)) {
        return { isCorrect: false, message: 'Il faut une variable nommée reponse qui vaut 42.' };
      }
      if (!/print\s*\(\s*reponse\s*\)/.test(s)) {
        return { isCorrect: false, message: 'Ajoute print(reponse) pour afficher la variable.' };
      }
      return { isCorrect: true, message: '' };
    }
  },
  {
    id: 4,
    level: 3,
    title: 'Application 3 — Condition',
    story:
      'Selon une valeur (ex. un score), vous n’exécutez une branche de code que si une condition est vraie : le rôle de if.',
    conceptsTeaser:
      '• if condition:\n• == pour comparer (égalité en Python)\n• Indentation obligatoire sous if',
    instruction:
      'La variable score vaut 100. Si score est égal à 100, affichez le texte exact : Parfait (utilisez if et ==).',
    doc: 'if condition: puis une ligne indentée (4 espaces ou 1 tabulation). == compare deux valeurs.',
    example: 'score = 100\nif score == 100:\n    print("Parfait")',
    explanation: 'Le bloc sous if doit être indenté ; sans indentation Python renvoie une erreur de syntaxe.',
    hint: 'Indice : == compare deux valeurs. Après if, placez les deux points et indenter la ligne qui affiche le message.',
    reveal: 'score = 100\nif score == 100:\n    print("Parfait")',
    validate(code) {
      const s = code.replace(/\r\n/g, '\n');
      if (!/score\s*=\s*100\b/.test(s)) {
        return { isCorrect: false, message: 'Commence par définir score = 100.' };
      }
      if (!/if\s+score\s*==\s*100\s*:/.test(s)) {
        return { isCorrect: false, message: 'Utilise : if score == 100:' };
      }
      if (!/print\s*\(\s*['"]Parfait['"]\s*\)/.test(s)) {
        return { isCorrect: false, message: 'Dans le bloc if, affiche exactement Parfait avec print.' };
      }
      return { isCorrect: true, message: '' };
    }
  },
  {
    id: 5,
    level: 4,
    title: 'Application 4 — Boucle for',
    story:
      'Pour répéter une action sans dupliquer le code : boucle for avec range() sur une suite d’entiers.',
    conceptsTeaser:
      '• for i in range(n) — i prend 0, 1, … jusqu’à n-1\n• Le corps de la boucle est indenté sous for',
    instruction: 'Écrivez une boucle qui utilise range(3) et affiche chaque valeur de i avec print(i) (bloc indenté).',
    doc: 'for i in range(3): répète le bloc pour i = 0, 1, 2. range(3) exclut 3.',
    example: 'for i in range(3):\n    print(i)',
    explanation: 'La boucle for parcourt un itérable ; range(n) génère les entiers de 0 à n-1.',
    hint: 'Indice : for ... in range(3) donne i = 0, 1, 2. Le print doit être dans le bloc indenté sous for.',
    reveal: 'for i in range(3):\n    print(i)',
    validate(code) {
      const s = code.replace(/\r\n/g, '\n');
      if (!/for\s+i\s+in\s+range\s*\(\s*3\s*\)\s*:/.test(s)) {
        return { isCorrect: false, message: 'Utilise exactement : for i in range(3):' };
      }
      if (!/print\s*\(\s*i\s*\)/.test(s)) {
        return { isCorrect: false, message: 'À l’intérieur de la boucle, appelle print(i).' };
      }
      return { isCorrect: true, message: '' };
    }
  },
  {
    id: 6,
    level: 5,
    title: 'Application 5 — Listes',
    story:
      'Une liste regroupe plusieurs valeurs dans un ordre ; len() renvoie le nombre d’éléments.',
    conceptsTeaser:
      '• [a, b, c] — liste ordonnée\n• len(sequence) — nombre d’éléments',
    instruction: 'Créez une liste notes contenant 12, 14, 16 puis affichez le nombre d’éléments avec len(notes).',
    doc: 'Les listes utilisent des crochets [ ]. len(liste) renvoie le nombre d’éléments.',
    example: 'notes = [12, 14, 16]\nprint(len(notes))',
    explanation: 'len est très utilisé pour connaître la taille d’une séquence.',
    hint: 'Indice : les listes utilisent des crochets et des virgules. len(...) renvoie le nombre d’éléments.',
    reveal: 'notes = [12, 14, 16]\nprint(len(notes))',
    validate(code) {
      if (!/notes\s*=\s*\[\s*12\s*,\s*14\s*,\s*16\s*\]/.test(code.replace(/\s/g, ''))) {
        return { isCorrect: false, message: 'Définis notes = [12, 14, 16] (virgules entre les nombres).' };
      }
      if (!/print\s*\(\s*len\s*\(\s*notes\s*\)\s*\)/.test(code)) {
        return { isCorrect: false, message: 'Affiche len(notes) avec print(len(notes)).' };
      }
      return { isCorrect: true, message: '' };
    }
  },
  {
    id: 7,
    level: 6,
    title: 'Application 6 — Fonction def',
    story:
      'Encapsuler un calcul réutilisable : une fonction (def) prend des paramètres et peut renvoyer un résultat avec return.',
    conceptsTeaser:
      '• def nom(param): — définition\n• return — valeur renvoyée\n• nom(...) — appel de fonction',
    instruction:
      'Définissez une fonction carre qui prend un paramètre x et renvoie x * 2 avec return. Puis affichez le résultat de carre(5) (donc 10).',
    doc: 'def nom(param): commence la fonction ; return renvoie une valeur. Appeler carre(5) exécute la fonction.',
    example: 'def carre(x):\n    return x * 2\n\nprint(carre(5))',
    explanation: 'def permet de regrouper du code réutilisable ; l’appel carre(5) passe 5 comme x.',
    hint: 'Indice : def pour définir la fonction, return pour renvoyer une valeur, puis print(...) autour de l’appel pour afficher.',
    reveal: 'def carre(x):\n    return x * 2\n\nprint(carre(5))',
    validate(code) {
      const s = code.replace(/\r\n/g, '\n');
      if (!/def\s+carre\s*\(\s*x\s*\)\s*:/.test(s)) {
        return { isCorrect: false, message: 'Définis def carre(x):' };
      }
      if (!/return\s+x\s*\*\s*2/.test(s)) {
        return { isCorrect: false, message: 'La fonction doit retourner x * 2 avec return.' };
      }
      if (!/print\s*\(\s*carre\s*\(\s*5\s*\)\s*\)/.test(s)) {
        return { isCorrect: false, message: 'Termine par print(carre(5)) pour afficher 10.' };
      }
      return { isCorrect: true, message: '' };
    }
  },
  {
    id: 8,
    isConclusion: true,
    title: 'Parcours Python terminé',
    content: `Vous avez enchaîné des applications concrètes en Python.

Notions abordées :
• print et chaînes de caractères
• variables et affectation
• if / comparaisons
• for et range()
• listes et len()
• def et return

Pour aller plus loin : modules, exceptions, fichiers, classes, etc.`,
    nextText: 'Recommencer le parcours'
  }
];

// ----- Parcours cybersécurité (poste central Data & IA) -----
let currentCyberChallenge = 0;
let cyberLearningStarted = false;
let cyberAttempts = 0;
let cyberAnswerRevealed = false;

const cyberCourses = [
  {
    id: 1,
    isIntro: true,
    content: `BIENVENUE AU MODULE CYBERSÉCURITÉ

Trois thèmes de sensibilisation :

1) Applications web — injections (SQL / HTML) et bonnes pratiques
2) Confidentialité et données — vision simplifiée type RGPD (minimisation, finalité)
3) Hygiène du poste — USB, pièces jointes, mises à jour

Pour chaque question, choisissez la réponse la plus pertinente (A, B ou C).`,
    nextText: 'Commencer le module 1'
  },
  {
    id: 2,
    level: 1,
    track: 'injection',
    title: 'Injections web — 1/3',
    story:
      'Scénario type : une application assemble du SQL en concaténant la saisie utilisateur sans requêtes paramétrées. Une entrée malveillante peut modifier le sens de la requête.',
    instruction:
      'Une application construit une requête SQL en collant directement la saisie utilisateur dans la chaîne, sans paramètres ni validation adaptée. Quelle affirmation est correcte ?',
    doc: 'Ce scénario est typique d’une faille par injection SQL : l’attaquant peut tenter de modifier le sens de la requête.',
    choices: [
      { id: 'A', text: "C’est sans danger tant que la page est en HTTPS." },
      { id: 'B', text: "C’est risqué : la saisie peut altérer la requête (injection SQL)." },
      { id: 'C', text: 'Seul le navigateur est concerné, pas la base de données.' }
    ],
    correct: 'B',
    hint: 'Indice : HTTPS chiffre le canal ; il ne remplace pas une conception sûre des requêtes côté serveur.',
    explainOk:
      'Exact : concaténer la saisie dans du SQL est une source classique d’injection. Il faut des requêtes paramétrées, validation et moindre privilège.',
    reveal: 'B — La saisie ne doit pas être intégrée telle quelle dans du SQL.'
  },
  {
    id: 3,
    level: 2,
    track: 'injection',
    title: 'Injections web — 2/3',
    story:
      'Côté navigateur : injecter du HTML non filtré dans la page offre une surface à des balises ou scripts hostiles.',
    instruction:
      'Vous affichez un commentaire utilisateur dans une page web en l’injectant tel quel dans le HTML (équivalent innerHTML). Quel est le principal risque ?',
    doc: 'Le navigateur interprète HTML et JavaScript : du contenu non fiable peut déclencher du code.',
    choices: [
      { id: 'A', text: 'Aucun risque si le pseudo fait moins de 20 caractères.' },
      { id: 'B', text: 'Risque uniquement de mise en page (CSS).' },
      {
        id: 'C',
        text: 'Risque de XSS : scripts ou balises malveillantes pouvant s’exécuter ou tromper l’utilisateur.'
      }
    ],
    correct: 'C',
    hint: 'Indice : que fait le navigateur du HTML fourni sans échappement ?',
    explainOk:
      'Oui : sans échappement / politique stricte, on expose les visiteurs au cross-site scripting (XSS). Il faut encoder le contenu ou des API sûres.',
    reveal: 'C — Contenu utilisateur → toujours traiter comme non fiable dans le HTML.'
  },
  {
    id: 4,
    level: 3,
    track: 'injection',
    title: 'Injections web — 3/3',
    story:
      'Parmi les réponses apparemment simples, une seule décrit une bonne pratique durable côté développement.',
    instruction: 'Parmi ces approches, laquelle contribue le plus à réduire les injections SQL côté application ?',
    doc: 'Plusieurs couches se combinent : paramètres liés, validation, comptes DB limités, etc.',
    choices: [
      {
        id: 'A',
        text: 'Requêtes paramétrées / préparées + validation des entrées côté serveur.'
      },
      { id: 'B', text: 'Désinstaller toutes les bases de données.' },
      { id: 'C', text: 'Masquer les erreurs SQL à l’écran sans changer le code.' }
    ],
    correct: 'A',
    hint: 'Indice : quelle pratique sépare clairement structure SQL et données ?',
    explainOk:
      'Bonne réponse : les paramètres liés évitent de mélanger données et structure de requête ; la validation limite les abus.',
    reveal: 'A — Paramètres liés + validation (et moindre privilège en bonus).'
  },
  {
    id: 5,
    level: 4,
    track: 'rgpd',
    title: 'Données & confidentialité — 1/3',
    story:
      'Avant de stocker des données : chaque champ doit être nécessaire et proportionné au traitement.',
    instruction: 'Principe de minimisation (vision RGPD simplifiée) : que collecter ?',
    doc: 'On ne collecte que ce qui est nécessaire, adéquat et limité à la finalité.',
    choices: [
      { id: 'A', text: 'Le plus possible « au cas où » pour ne rien rater.' },
      { id: 'B', text: 'Uniquement les données utiles et proportionnées à la finalité déclarée.' },
      { id: 'C', text: 'Les données des collègues sans les prévenir si c’est pour le bien de l’équipe.' }
    ],
    correct: 'B',
    hint: 'Indice : besoin métier et transparence — moins mais mieux.',
    explainOk: 'Exact : minimiser les données réduit les risques et renforce la confiance.',
    reveal: 'B — Nécessaire et proportionné à la finalité.'
  },
  {
    id: 6,
    level: 5,
    track: 'rgpd',
    title: 'Données & confidentialité — 2/3',
    story:
      'Toutes les données ne se valent pas : certaines, une fois divulguées, ont un impact fort sur la vie des personnes.',
    instruction:
      'Lequel de ces exemples illustre le mieux une donnée souvent particulièrement sensible ou à protéger avec vigilance ?',
    doc: 'Certaines catégories (santé, opinions, biométrie, etc.) sont encadrées ; d’autres données peuvent aussi être critiques selon le contexte.',
    choices: [
      { id: 'A', text: 'Le thème clair / sombre de l’application.' },
      {
        id: 'B',
        text: 'Des données de santé ou bancaires selon contexte — toujours avec base légale, sécurité et transparence.'
      },
      { id: 'C', text: 'Le prénom sur un badge visible dans les couloirs.' }
    ],
    correct: 'B',
    hint: 'Indice : comparez la gravité d’une fuite selon le type d’information.',
    explainOk: 'Oui : santé / finance / opinions méritent un traitement renforcé et encadré.',
    reveal: 'B — Données sensibles ou à fort impact nécessitent cadre et sécurité.'
  },
  {
    id: 7,
    level: 6,
    track: 'rgpd',
    title: 'Données & confidentialité — 3/3',
    story:
      'Réutiliser une base « pour autre chose » sans cadre clair, c’est un classique des tensions légitimité / confiance.',
    instruction:
      'Réutiliser des données clients pour un nouvel usage marketing sans information ni base légale adéquate :',
    doc: 'Chaque traitement doit avoir une finalité claire et un fondement (contrat, obligation, consentement, etc.).',
    choices: [
      { id: 'A', text: "Acceptable si l’équipe marketing en a besoin." },
      {
        id: 'B',
        text: 'Problématique : il faut information, finalité et base légale avant de réutiliser.'
      },
      { id: 'C', text: 'Autorisé le week-end quand les juristes ne sont pas là.' }
    ],
    correct: 'B',
    hint: 'Indice : la bonne intention ne remplace pas le cadre légal.',
    explainOk: 'Correct : la transparence et la licéité priment sur l’usage opportun.',
    reveal: 'B — Nouvelle finalité → information et base légale.'
  },
  {
    id: 8,
    level: 7,
    track: 'hygiene',
    title: 'Hygiène du poste — 1/3',
    story:
      'Scénario terrain : une clé anonyme — curiosité naturelle, mais le risque malware ou fuite est réel sur un poste pro.',
    instruction: 'Vous trouvez une clé USB dans le parking de l’entreprise. Conduite recommandée :',
    doc: 'Les supports amovibles sont un vecteur classique (malware, exfiltration).',
    choices: [
      { id: 'A', text: 'La brancher sur ton PC pour identifier le propriétaire.' },
      { id: 'B', text: 'Ne pas la brancher ; la remettre au service IT / sécurité.' },
      { id: 'C', text: 'La formater sur ta machine avant de la rendre.' }
    ],
    correct: 'B',
    hint: 'Indice : l’origine du support est inconnue.',
    explainOk: 'Bien vu : éviter l’auto-investigation sur un poste de production.',
    reveal: 'B — IT / sécurité sait gérer la chaîne de confiance.'
  },
  {
    id: 9,
    level: 8,
    track: 'hygiene',
    title: 'Hygiène du poste — 2/3',
    story:
      'Phishing et pièces jointes : l’urgence et le fichier exécutable sont des signaux à prendre au sérieux.',
    instruction: 'E-mail d’un expéditeur inconnu avec une pièce jointe facture.exe. Que faites-vous ?',
    doc: 'Les extensions exécutables et l’urgence factice sont des signaux d’alerte fréquents.',
    choices: [
      { id: 'A', text: "Tu ouvres pour vérifier le montant de la facture." },
      { id: 'B', text: "Tu n’ouvres pas ; tu signales / supprimes et tu vérifies par un canal officiel." },
      { id: 'C', text: 'Tu transfères à toute l’équipe pour avoir un avis.' }
    ],
    correct: 'B',
    hint: 'Indice : canal officiel (site ou numéro connu), pas le lien du courriel.',
    explainOk: 'Parfait : ne jamais exécuter de fichier suspect sur le poste pro.',
    reveal: 'B — Signalement et vérification hors du mail.'
  },
  {
    id: 10,
    level: 9,
    track: 'hygiene',
    title: 'Hygiène du poste — 3/3',
    story:
      'Les failles sont souvent connues et documentées ; les correctifs ferment des portes que les attaquants testent en premier.',
    instruction: 'Mises à jour de sécurité du système et des logiciels :',
    doc: 'Les correctifs ferment des failles déjà documentées ; les attaquants les exploitent vite.',
    choices: [
      { id: 'A', text: 'Les reporter indéfiniment pour ne pas interrompre le travail.' },
      { id: 'B', text: 'Les appliquer régulièrement selon la politique de l’entreprise.' },
      { id: 'C', text: 'N’installer que les mises à jour « cosmétiques ».' }
    ],
    correct: 'B',
    hint: 'Indice : vulnérabilité documentée et correctif disponible = risque réel si non appliqué.',
    explainOk: 'Oui : la maintenance est un pilier de la défense.',
    reveal: 'B — Patchs de sécurité appliqués dans les délais.'
  },
  {
    id: 11,
    isConclusion: true,
    title: 'Parcours cybersécurité terminé',
    content: `Trois axes couverts :

• Injections web (SQL / XSS) et défenses de base
• Données personnelles : minimisation, sensibilité, finalité
• Hygiène : USB, pièces jointes, mises à jour

Complétez toujours avec la politique interne et les formations officielles de votre organisation.`,
    nextText: 'Recommencer le parcours'
  }
];

let lastTime = 0;

function drawPixel(px, py, scale, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(px), Math.round(py), scale, scale);
}

/** Même avatar pixel que le joueur ; `outfit` = couleurs (PNJ vs perso) */
/** Bulles de pensée au-dessus des PNJ (rotation + état métier). */
const NPC_THOUGHT_MIN_SEC = 3.2;
const NPC_THOUGHT_MAX_SEC = 6.2;
const NPC_THOUGHT_BUBBLE_W = 136;
const NPC_THOUGHT_FONT_PX = 9;

function wrapNpcThoughtText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['…'];
}

function canvasRoundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function getAldoThoughtLines() {
  const prof = loadWelcomeProfile();
  const prenom = (prof.firstName || prof.displayName || '').trim();
  if (aldoNpc.mode === 'sit' && aldoNpc.seatedChair) {
    const t = aldoNpc.seatedChair.type;
    if (t === 'sqlChair') {
      return ['Préparer le prochain défi SQL…', 'Ajuster les requêtes types…', 'Vérifier les cas dans la base…'];
    }
    if (t === 'pythonChair') {
      return ['Tester le script Python…', 'Affiner la consigne…', 'Noter les erreurs fréquentes…'];
    }
    if (t === 'cyberChair') {
      return ['Module cyber : un scénario à durcir…', 'Revoir les questions…'];
    }
    return ['Préparer les exercices…'];
  }
  if (aldoNpc.mode === 'approach') {
    return ['Aller proposer un coup de main…', 'Voir si le joueur est bloqué…'];
  }
  if (aldoNpc.moving) {
    return ['Faire un tour des postes…', 'Rester disponible pour les apprenants…', 'Parcourir la salle Data & IA…'];
  }
  return [
    'Adapter les parcours au profil borne…',
    prenom ? `Penser à ${prenom} — objectif ?` : 'Qui est passé sur la borne ?',
    'SQL, Python, cyber : cohérence des parcours…',
    'Coordonner avec Sandro et Manu…'
  ];
}

function getSandroThoughtLines() {
  if (sandroNpc.moving) {
    return ['Ronde aux baies…', 'Surveillance des charges…', 'Température et ventilation…'];
  }
  return [
    'Console de supervision — tout est vert ?',
    'Environnements prêts pour les défis…',
    'Logs et alertes à surveiller…',
    'Aldo pourra lancer les ateliers…'
  ];
}

function getManuThoughtLines() {
  if (manuNpc.moving) {
    return ['Aller voir les postes conformité…', 'Cas réglementaires en tête…'];
  }
  return [
    'RGPD : traitements, droits des personnes…',
    'IA Act : risques des systèmes…',
    'Registre et documentation…',
    'Mises en situation à jour…'
  ];
}

function getAliceThoughtLines() {
  if (aliceNpc.moving) {
    return ['Voir si un collègue a besoin d’un plan…', 'Relire une demande de formation…'];
  }
  return [
    'Plans sur mesure — borne + entretien…',
    'Adapter le parcours au poste déclaré…',
    'Coordination avec Aldo côté Data & IA…',
    'Parcours : objectifs, durée, contraintes…'
  ];
}

function getNpcThoughtPool(npc) {
  if (npc === aldoNpc) return getAldoThoughtLines();
  if (npc === sandroNpc) return getSandroThoughtLines();
  if (npc === manuNpc) return getManuThoughtLines();
  if (npc === aliceNpc) return getAliceThoughtLines();
  return [];
}

function updateNpcThoughts(dt) {
  if (currentMap !== 'office') return;
  const npcs = [aldoNpc, sandroNpc, manuNpc, aliceNpc];
  for (const npc of npcs) {
    npc.thoughtTimer -= dt;
    if (npc.thoughtTimer > 0) continue;
    const pool = getNpcThoughtPool(npc);
    const n = Math.max(1, pool.length);
    npc.thoughtTimer = NPC_THOUGHT_MIN_SEC + Math.random() * (NPC_THOUGHT_MAX_SEC - NPC_THOUGHT_MIN_SEC);
    npc.thoughtIndex = (npc.thoughtIndex + 1) % n;
  }
}

function drawThoughtBubbleForNpc(npc) {
  const pool = getNpcThoughtPool(npc);
  if (!pool.length) return;
  const line = pool[npc.thoughtIndex % pool.length];
  const cx = npc.x + npc.size / 2;
  const headY = npc.y - 2;

  ctx.save();
  ctx.font = `italic ${NPC_THOUGHT_FONT_PX}px Arial`;
  const innerW = NPC_THOUGHT_BUBBLE_W - 20;
  const lines = wrapNpcThoughtText(ctx, line, innerW);
  const padX = 10;
  const padY = 7;
  const lineH = NPC_THOUGHT_FONT_PX + 3;
  const bw = NPC_THOUGHT_BUBBLE_W;
  const bh = padY * 2 + lines.length * lineH;
  const tailH = 14;
  let bx = cx - bw / 2;
  const bubbleBottom = headY - 8;
  const by = bubbleBottom - bh - tailH;

  bx = clamp(bx, room.x + 6, room.x + room.w - bw - 6);
  const textCx = bx + bw / 2;

  const stroke = 'rgba(55, 60, 85, 0.55)';
  const fill = 'rgba(252, 252, 255, 0.96)';
  const rad = 10;

  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(bx, by, bw, bh, rad);
  } else {
    canvasRoundRectPath(ctx, bx, by, bw, bh, rad);
  }
  ctx.fill();
  ctx.stroke();

  const c1x = bx + bw * 0.38;
  const c2x = bx + bw * 0.48;
  const c3x = cx;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c1x, by + bh + 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c2x, by + bh + 9, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c3x, headY + 1, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#2a3048';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((ln, i) => {
    ctx.fillText(ln, textCx, by + padY + i * lineH);
  });
  ctx.restore();
}

function drawNpcThoughtBubbles() {
  if (currentMap !== 'office') return;
  if (
    isNpcChatOpen() ||
    isWelcomeKioskOpen() ||
    isServerControlOpen() ||
    isWorkshopModalOpen()
  ) {
    return;
  }
  drawThoughtBubbleForNpc(aldoNpc);
  drawThoughtBubbleForNpc(sandroNpc);
  drawThoughtBubbleForNpc(manuNpc);
  drawThoughtBubbleForNpc(aliceNpc);
}

function drawHumanoidAvatar(entity, outfit) {
  const s = 3;
  const x = Math.round(entity.x - 2);
  const y = Math.round(entity.y - 2);
  const stride = entity.moving ? (Math.floor(entity.walkCycle * 1.4) % 3) - 1 : 0;
  const leftLeg = 7 + Math.max(0, stride);
  const rightLeg = 7 + Math.max(0, -stride);

  function p(px, py, c) {
    drawPixel(x + px * s, y + py * s, s, c);
  }

  ctx.fillStyle = 'rgba(16,18,30,0.34)';
  const sw = 11 + Math.abs(stride);
  ctx.fillRect(x + (7 - sw / 2) * s, y + 12 * s, sw * s, 1.5 * s);

  const skin = outfit.skin;
  const hair = outfit.hair;
  const tshirt = outfit.tshirt;
  const tshirtShade = outfit.tshirtShade;
  const jeans = outfit.jeans;
  const jeansShade = outfit.jeansShade;
  const shoe = outfit.shoe;

  if (entity.direction === 'up') {
    p(2, 1, hair); p(3, 1, hair); p(4, 1, hair); p(5, 1, hair);
    p(2, 2, hair); p(3, 2, hair); p(4, 2, hair); p(5, 2, hair);
    p(2, 4, tshirtShade); p(3, 4, tshirtShade); p(4, 4, tshirtShade); p(5, 4, tshirtShade);
    p(2, 5, tshirt); p(3, 5, tshirt); p(4, 5, tshirt); p(5, 5, tshirt);
  } else if (entity.direction === 'left') {
    p(3, 1, hair); p(4, 1, hair); p(5, 1, hair);
    p(2, 2, skin); p(3, 2, skin); p(4, 2, skin);
    p(2, 3, '#1b2238'); p(3, 3, skin);
    p(2, 4, tshirt); p(3, 4, tshirt); p(4, 4, tshirtShade);
    p(2, 5, tshirt); p(3, 5, tshirtShade); p(4, 5, tshirtShade);
    p(1, 5 + (stride > 0 ? 1 : 0), skin);
    p(4, 5 + (stride < 0 ? 1 : 0), skin);
  } else if (entity.direction === 'right') {
    p(2, 1, hair); p(3, 1, hair); p(4, 1, hair);
    p(3, 2, skin); p(4, 2, skin); p(5, 2, skin);
    p(5, 3, '#1b2238'); p(4, 3, skin);
    p(3, 4, tshirtShade); p(4, 4, tshirt); p(5, 4, tshirt);
    p(3, 5, tshirtShade); p(4, 5, tshirtShade); p(5, 5, tshirt);
    p(3, 5 + (stride > 0 ? 1 : 0), skin);
    p(6, 5 + (stride < 0 ? 1 : 0), skin);
  } else {
    p(2, 1, hair); p(3, 1, hair); p(4, 1, hair); p(5, 1, hair);
    p(2, 2, skin); p(3, 2, skin); p(4, 2, skin); p(5, 2, skin);
    p(2, 3, skin); p(3, 3, '#1b2238'); p(4, 3, '#1b2238'); p(5, 3, skin);
    p(2, 4, tshirt); p(3, 4, tshirt); p(4, 4, tshirt); p(5, 4, tshirt);
    p(2, 5, jeans); p(3, 5, jeansShade); p(4, 5, jeansShade); p(5, 5, jeans);
  }

  p(2, leftLeg, shoe); p(3, leftLeg, shoe);
  p(4, rightLeg, shoe); p(5, rightLeg, shoe);
}

function drawAvatar() {
  drawHumanoidAvatar(player, getPlayerOutfit());
}

/** Libellé « Salle administrateur » au-dessus du mobilier, un peu sous le milieu pour éviter la baie. */
function drawAdminRoomZoneLabel() {
  const z = getCurrentZones().find(zz => zz.key === 'admin_bureau');
  if (!z || !z.name) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = z.x + z.w / 2;
  const cy = Math.min(
    z.y + z.h - 14,
    z.y + z.h / 2 + Math.min(32, Math.floor(z.h * 0.16))
  );
  ctx.font = 'bold 13px system-ui, Segoe UI, sans-serif';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeText(z.name, cx, cy);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(z.name, cx, cy);
  ctx.restore();
}

// Draw function - renders the entire game
function draw() {
  const mapData = getCurrentMapData();
  const cw = canvas.width;
  const ch = canvas.height;
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = mapData.bgColor || '#2a2d3a';
  ctx.fillRect(0, 0, cw, ch);

  if (currentMap === 'office') {
    const sc = Math.min(cw / LOGICAL_W, ch / LOGICAL_H);
    const ox = (cw - LOGICAL_W * sc) / 2;
    const oy = (ch - LOGICAL_H * sc) / 2;
    ctx.setTransform(sc, 0, 0, sc, ox, oy);
    ctx.fillStyle = mapData.bgColor || '#2a2d3a';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
  }
  
  // Draw border
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  ctx.strokeRect(room.x, room.y, room.w, room.h);
  
  // Draw map title
  ctx.fillStyle = '#4a9eff';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(mapData.name, room.x + 10, room.y + 25);
  
  // Draw zones (grandes zones d’abord, puis les plus petites par-dessus — ex. salle admin dans l’espace commun)
  const zones = getCurrentZones();
  const zonesByAreaDesc = [...zones].sort((a, b) => b.w * b.h - a.w * a.h);
  zonesByAreaDesc.forEach(zone => {
    ctx.fillStyle = zone.color;
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
  });

  // Noms des salles — centrés dans chaque pièce (petites salles en dernier pour la lisibilité)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const zonesLabelOrder = [...zones].sort((a, b) => a.w * a.h - b.w * b.h);
  zonesLabelOrder.forEach(zone => {
    if (!zone.name || zone.hideLabel) return;
    const cx = zone.x + zone.w / 2;
    let cy = zone.y + zone.h / 2;
    if (zone.key === 'service_formation') {
      cy = Math.min(zone.y + zone.h - 12, cy + Math.min(26, Math.floor(zone.h * 0.16)));
    }
    ctx.font = 'bold 13px system-ui, Segoe UI, sans-serif';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeText(zone.name, cx, cy);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillText(zone.name, cx, cy);
  });
  ctx.restore();
  
  // Draw zone boundaries
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  zonesByAreaDesc.forEach(zone => ctx.strokeRect(zone.x, zone.y, zone.w, zone.h));
  
  // Draw objects
  drawObjects();

  if (currentMap === 'office') {
    drawHumanoidAvatar(aldoNpc, OUTFIT_ALDO);
    ctx.fillStyle = '#f0f4fc';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(aldoNpc.seatedChair ? 'Aldo — au poste' : 'Aldo', aldoNpc.x + aldoNpc.size / 2, aldoNpc.y - 4);
    drawHumanoidAvatar(sandroNpc, OUTFIT_SANDRO);
    ctx.fillStyle = '#c8e8f0';
    ctx.fillText('Sandro', sandroNpc.x + sandroNpc.size / 2, sandroNpc.y - 4);
    drawHumanoidAvatar(manuNpc, OUTFIT_MANU);
    ctx.fillStyle = '#d8e8dc';
    ctx.fillText('Manu', manuNpc.x + manuNpc.size / 2, manuNpc.y - 4);
    drawHumanoidAvatar(aliceNpc, OUTFIT_ALICE);
    ctx.fillStyle = '#e8dcf0';
    ctx.fillText('Alice', aliceNpc.x + aliceNpc.size / 2, aliceNpc.y - 4);
    ctx.textAlign = 'left';
  }

  // Draw player (au-dessus des PNJ si chevauchement)
  drawAvatar();

  if (currentMap === 'office') {
    drawAdminRoomZoneLabel();
  }

  if (currentMap === 'office') {
    drawNpcThoughtBubbles();
  }
  
  // Draw interaction radius gizmo (for debugging)
  if (false) {
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(player.x + player.size / 2, player.y + player.size / 2, 68, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawServerConsole(obj) {
  const { x, y, w, h } = obj;
  const cx = x + w / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 2, w * 0.45, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2e38';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#4a5568';
      ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  const tw = (w - 14) / 3 - 2;
      for (let i = 0; i < 3; i++) {
    const sx = x + 4 + i * (tw + 3);
    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(sx, y + 4, tw, Math.min(22, h * 0.4));
    ctx.fillStyle = '#1a4a58';
    ctx.fillRect(sx + 1, y + 5, tw - 2, 5);
  }
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(cx - 5, y + h - 5, 10, 5);
  ctx.restore();
}

function drawFileCabinetArchives(obj) {
  const { x, y, w, h } = obj;
  ctx.save();
  ctx.fillStyle = '#3a3a42';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#5a5a62';
      ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(x + 2, y + 4, w - 4, h - 6);
  ctx.fillStyle = '#5a9aaa';
  ctx.font = 'bold 7px Arial';
  ctx.fillText('RGPD', x + 3, y + 13);
  ctx.restore();
}

/**
 * Bureau administrateur — hub de paramétrage (vue de dessus, style direction).
 */
function drawWelcomeKiosk(obj) {
  const { x, y, w, h } = obj;
  const cx = x + w / 2;
  const blink = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() * 0.01));
  ctx.save();

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, y + h + 3, w * 0.48, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  const rug = ctx.createRadialGradient(cx, y + h * 0.55, 4, cx, y + h * 0.55, w * 0.55);
  rug.addColorStop(0, 'rgba(45, 52, 68, 0.35)');
  rug.addColorStop(1, 'rgba(45, 52, 68, 0)');
  ctx.fillStyle = rug;
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 0.55, w * 0.52, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  const chairW = Math.min(44, w - 24);
  const chairX = cx - chairW / 2;
  const chairY = y + 4;
  ctx.fillStyle = '#2a2e38';
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(chairX, chairY, chairW, 14, 4);
  } else {
    canvasRoundRectPath(ctx, chairX, chairY, chairW, 14, 4);
  }
  ctx.fill();
  ctx.strokeStyle = '#1a1e28';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#3a4558';
  ctx.fillRect(chairX + 6, chairY + 3, chairW - 12, 8);
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(chairX + chairW / 2 - 3, chairY - 3, 6, 5);

  const top = y + 20;
  const deskH = h - 26;
  const deskX = x + 8;
  const deskW = w - 16;
  const wood = ctx.createLinearGradient(deskX, top, deskX + deskW, top + deskH);
  wood.addColorStop(0, '#4a3428');
  wood.addColorStop(0.45, '#3d2a22');
  wood.addColorStop(1, '#2e2018');
  ctx.fillStyle = wood;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(deskX, top, deskW, deskH, 3);
  } else {
    canvasRoundRectPath(ctx, deskX, top, deskW, deskH, 3);
  }
  ctx.fill();
  ctx.strokeStyle = '#1a1410';
  ctx.strokeRect(deskX + 0.5, top + 0.5, deskW - 1, deskH - 1);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(deskX + 2, top + 2, deskW - 4, 3);

  ctx.fillStyle = '#352820';
  ctx.fillRect(x + 4, top + 12, 26, deskH - 18);
  ctx.strokeStyle = '#2a2018';
  ctx.strokeRect(x + 4.5, top + 12.5, 25, deskH - 19);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + 6, top + 14, 4, deskH - 24);

  const mw = 22;
  const mh = 14;
  const m1x = deskX + 14;
  const m2x = deskX + deskW - 14 - mw;
  const my = top + 8;
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(m1x, my, mw, mh);
  ctx.fillRect(m2x, my, mw, mh);
  ctx.fillStyle = `rgba(80, 140, 220, ${0.25 + 0.45 * blink})`;
  ctx.fillRect(m1x + 2, my + 2, mw - 4, mh - 4);
  ctx.fillRect(m2x + 2, my + 2, mw - 4, mh - 4);
  ctx.strokeStyle = '#2a3444';
  ctx.lineWidth = 1;
  ctx.strokeRect(m1x + 0.5, my + 0.5, mw - 1, mh - 1);
  ctx.strokeRect(m2x + 0.5, my + 0.5, mw - 1, mh - 1);

  ctx.fillStyle = '#2a2420';
  ctx.fillRect(deskX + deskW / 2 - 20, top + deskH - 14, 40, 8);
  ctx.fillStyle = '#1a1814';
  ctx.fillRect(deskX + deskW / 2 - 18, top + deskH - 12, 36, 2);

  ctx.fillStyle = '#e8d4a8';
  ctx.strokeStyle = '#8a7040';
  ctx.lineWidth = 1;
  ctx.fillRect(deskX + deskW - 36, top + deskH - 22, 30, 8);
  ctx.strokeRect(deskX + deskW - 35.5, top + deskH - 21.5, 29, 7);
  ctx.fillStyle = '#5a4a38';
  ctx.font = 'bold 6px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ADMIN', deskX + deskW - 21, top + deskH - 16);

  ctx.fillStyle = '#dce6f0';
  ctx.font = 'bold 7px system-ui, Segoe UI, sans-serif';
  ctx.fillText('Paramétrage', cx, top + deskH - 12);
  ctx.fillStyle = 'rgba(200,210,230,0.88)';
  ctx.font = '5px system-ui, Segoe UI, sans-serif';
  ctx.fillText('accès · PNJ · portes · salles · tests', cx, top + deskH - 4);

  ctx.textAlign = 'left';
  ctx.restore();
}

// Draw all interactive objects
function drawObjects() {
  objects.forEach(obj => {
    if (obj.type === 'desk') {
      drawPcDesk(obj, 'home');
    } else if (obj.type === 'chair') {
      drawOfficeChair(obj, CHAIR_PALETTE_NEUTRAL);
    } else if (obj.type === 'plant') {
      // Pot
      ctx.fillStyle = '#8a6a4a';
      ctx.fillRect(obj.x + 4, obj.y + obj.h - 8, obj.w - 8, 8);
      ctx.strokeStyle = '#6a4a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(obj.x + 4, obj.y + obj.h - 8, obj.w - 8, 8);
      
      // Plant leaves
      ctx.fillStyle = '#4a8a4a';
      ctx.beginPath();
      ctx.ellipse(obj.x + obj.w / 2, obj.y + obj.h / 2, obj.w / 3, obj.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2a5a2a';
      ctx.lineWidth = 1;
      ctx.stroke();
      
    } else if (obj.type === 'door') {
      drawSlidingDoor(obj);
    } else if (obj.type === 'wall') {
      ctx.fillStyle = '#3a3e48';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#252830';
      ctx.lineWidth = 1;
      ctx.strokeRect(obj.x + 0.5, obj.y + 0.5, obj.w - 1, obj.h - 1);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
      ctx.fillRect(obj.x + 2, obj.y + 2, obj.w - 4, Math.min(4, obj.h - 4));
    } else if (obj.type === 'rack') {
      const isEscape = obj.siteLabel === 'Escape';
      const fyneAlert = obj.siteLabel && !isEscape;

      // FYNE : Recrutement & Formation en alerte (rouge) ; Escape opérationnel (vert)
      ctx.fillStyle = isEscape ? '#1a1a1a' : '#1a0c0c';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = isEscape ? '#666' : '#8a3535';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      
      const innerTop = 4;
      const availH = obj.h - 8;
      /** Un seul niveau (une unité, une pastille) — baie très épurée */
      const rows = 1;
      const unitH = Math.max(16, availH);
      const step = unitH;

      ctx.fillStyle = isEscape ? '#2a2a2a' : '#3a1818';
      for (let i = 0; i < rows; i++) {
        const uy = obj.y + innerTop + i * step;
        ctx.fillRect(obj.x + 2, uy, obj.w - 4, unitH);
        ctx.strokeStyle = isEscape ? '#555' : '#6a3030';
        ctx.lineWidth = 1;
        ctx.strokeRect(obj.x + 2, uy, obj.w - 4, unitH);
      }

      if (fyneAlert) {
        ctx.fillStyle = 'rgba(180, 40, 40, 0.14)';
        ctx.fillRect(obj.x + 2, obj.y + 2, obj.w - 4, obj.h - 4);
      }

      const ledX = obj.x + obj.w / 2;
      const ledY = obj.y + innerTop + unitH / 2;
      const ledR = 2.5;
      ctx.beginPath();
      ctx.arc(ledX, ledY, ledR, 0, Math.PI * 2);
      if (obj.maintenance) {
        ctx.fillStyle = '#ff4444';
        ctx.fill();
      } else if (isEscape) {
        /** Vert centré — pulsation (clignotement doux) */
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.007);
        const a = 0.3 + 0.7 * pulse;
        ctx.fillStyle = `rgba(68, 255, 68, ${a})`;
        ctx.fill();
      } else {
        ctx.fillStyle = '#ff3333';
        ctx.fill();
      }

      if (obj.siteLabel) {
        ctx.save();
        ctx.font = '600 10px system-ui, Segoe UI, sans-serif';
        ctx.fillStyle = isEscape ? '#c8d0dc' : '#e8a8a8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const ly = obj.y + obj.h + 3 + (obj.labelOffsetY || 0);
        ctx.fillText(obj.siteLabel, obj.x + obj.w / 2, ly);
        ctx.restore();
      }

    } else if (obj.type === 'serverConsole') {
      drawServerConsole(obj);
    } else if (obj.type === 'fileCabinet') {
      drawFileCabinetArchives(obj);
    } else if (obj.type === 'complianceTable') {
      drawPcDesk(obj, obj.station === 'rgpd' ? 'rgpd' : 'aiAct');
    } else if (obj.type === 'complianceChair') {
      drawOfficeChair(obj, obj.station === 'rgpd' ? CHAIR_PALETTE_SQL : CHAIR_PALETTE_CYBER);
    } else if (obj.type === 'adminTable') {
      drawPcDesk(obj, 'admin');
    } else if (obj.type === 'adminChair') {
      drawOfficeChair(obj, CHAIR_PALETTE_ADMIN);
    } else if (obj.type === 'welcomeKiosk') {
      drawWelcomeKiosk(obj);
    } else if (obj.type === 'formationTable') {
      drawPcDesk(obj, 'formation');
    } else if (obj.type === 'formationChair') {
      drawOfficeChair(obj, CHAIR_PALETTE_SQL);
    } else if (obj.type === 'ac') {
      // AC unit
      ctx.fillStyle = '#4a6a8a';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#2a4a6a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      
      // Vents
      ctx.fillStyle = '#3a5a7a';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(obj.x + 2, obj.y + 4 + i * 16, obj.w - 4, 6);
      }
      
      // Status indicator
      ctx.fillStyle = obj.on ? '#44ff44' : '#666';
      ctx.beginPath();
      ctx.arc(obj.x + obj.w - 4, obj.y + obj.h - 4, 2, 0, Math.PI * 2);
      ctx.fill();
      
    } else if (obj.type === 'counter') {
      // Counter top
      ctx.fillStyle = '#8a6a4a';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#5a3a1a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      
      // Counter details
      ctx.fillStyle = '#9a7a5a';
      ctx.fillRect(obj.x + 2, obj.y + obj.h - 4, obj.w - 4, 2);
      
      // Coffee machine indication
      ctx.fillStyle = '#333';
      ctx.fillRect(obj.x + 20, obj.y + 4, 25, 28);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(obj.x + 20, obj.y + 4, 25, obj.h - 32);
      
    } else if (obj.type === 'cafeTable') {
      // Table top
      ctx.fillStyle = '#6a5a4a';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      
      // Table legs
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(obj.x + 4, obj.y + obj.h - 2, 4, 8);
      ctx.fillRect(obj.x + obj.w - 8, obj.y + obj.h - 2, 4, 8);
      
      // Items on table
      ctx.fillStyle = '#fff';
      ctx.fillRect(obj.x + 8, obj.y + 8, 8, 12);
      ctx.fillRect(obj.x + 30, obj.y + 12, 8, 8);
      
    } else if (isSalleInfoWorkstation(obj)) {
      drawSalleInfoWorkstation(obj);
    } else if (obj.type === 'stove') {
      ctx.fillStyle = '#60656d';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#3f434a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      ctx.fillStyle = '#262a30';
      ctx.beginPath(); ctx.arc(obj.x + 14, obj.y + 16, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(obj.x + obj.w - 14, obj.y + 16, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(obj.x + 14, obj.y + obj.h - 14, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(obj.x + obj.w - 14, obj.y + obj.h - 14, 6, 0, Math.PI * 2); ctx.fill();
      
    } else if (obj.type === 'vending') {
      // Machine body
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#1a2a4a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      
      // Display screen
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(obj.x + 2, obj.y + 2, obj.w - 4, 16);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(obj.x + 2, obj.y + 2, obj.w - 4, obj.h - 4);
      
      // Stock indicator bar
      const stockPercent = (obj.stock || 0) / 6;
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(obj.x + 3, obj.y + obj.h - 12, (obj.w - 6) * stockPercent, 4);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(obj.x + 3, obj.y + obj.h - 12, obj.w - 6, 4);
      
      // Button
      ctx.fillStyle = '#666';
      ctx.fillRect(obj.x + obj.w / 2 - 4, obj.y + obj.h - 6, 8, 4);
    } else if (obj.type === 'sofa') {
      // Sofa
      ctx.fillStyle = '#8a4a4a';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#5a2a2a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      // Cushions
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#aa6a6a';
        ctx.fillRect(obj.x + 4 + i * 35, obj.y + 4, 30, obj.h - 8);
      }
    } else if (obj.type === 'tv') {
      drawTelevision(obj);
    } else if (obj.type === 'bed') {
      // Bed
      ctx.fillStyle = '#8a6a8a';
      ctx.fillRect(obj.x, obj.y, obj.w, obj.h);
      ctx.strokeStyle = '#5a3a5a';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.x, obj.y, obj.w, obj.h);
      // Pillow
      ctx.fillStyle = '#aaaaaa';
      ctx.fillRect(obj.x + 10, obj.y + 5, 30, 20);
    } else if (obj.type === 'table') {
      drawWoodenDiningTable(obj);
    }
  });
}

// Start the game loop
function gameLoop(currentTime) {
  const deltaTime = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  
  update(deltaTime);
  draw();
  
  requestAnimationFrame(gameLoop);
}

// Initialiser la map bureau au démarrage
initializeMap('office');
requestAnimationFrame(gameLoop);

// SQL Challenge Functions

function openSQLChallenge() {
  if (!seatedOn || seatedOn.type !== 'sqlChair') {
    setMessage('Asseyez-vous sur la chaise du poste SQL (E), puis ouvrez l’atelier.');
    return;
  }

  sqlLearningStarted = true;
  currentSQLChallenge = 0;
  displaySQLCourse();
}

/** Vide feedback + tableau de résultats entre deux défis (un seul défi visible à la fois). */
function resetSQLChallengePanels() {
  const feedbackEl = document.getElementById('sqlFeedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
    feedbackEl.className = 'sql-feedback';
  }
  const resultsEl = document.getElementById('sqlResults');
  if (resultsEl) {
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
  }
  const input = document.getElementById('sqlInput');
  if (input) {
    input.style.borderColor = '';
    input.style.boxShadow = '';
    input.readOnly = false;
  }
  sqlAwaitingNextChallenge = false;
  const nextBtn = document.getElementById('sqlNextBtn');
  if (nextBtn) nextBtn.style.display = 'none';
  const submitBtn = document.getElementById('sqlSubmitBtn');
  if (submitBtn) submitBtn.disabled = false;
}

function buildSQLChallengeQuestionText(course) {
  const lines = [];
  if (course.story) {
    lines.push(course.story);
    lines.push('');
  }
  lines.push(`— ${course.title} —`);
  lines.push('');
  lines.push(`Mission : ${course.instruction}`);
  if (course.conceptsTeaser) {
    lines.push('');
    lines.push('Ce module couvre :');
    lines.push(course.conceptsTeaser);
  }
  return lines.join('\n');
}

function buildTrackedChallengeQuestionText(course) {
  const lines = [];
  if (course.story) {
    lines.push(course.story);
    lines.push('');
  }
  lines.push(`— ${course.title} —`);
  lines.push('');
  lines.push(`Mission : ${course.instruction}`);
  if (course.conceptsTeaser) {
    lines.push('');
    lines.push('Notions mises en avant :');
    lines.push(course.conceptsTeaser);
  }
  return lines.join('\n');
}

/** Indices courts selon le message d’erreur Skulpt / Python */
function hintPythonStderr(stderr) {
  if (!stderr) return '';
  const s = String(stderr);
  const tips = [];
  if (/IndentationError/i.test(s)) {
    tips.push(
      'Indentation : sous if / for / def, le bloc suivant doit être décalé (4 espaces ou 1 tabulation).'
    );
  }
  if (/SyntaxError/i.test(s)) {
    tips.push('Syntaxe : vérifie les : après if / for / def, les parenthèses et les guillemets fermés.');
  }
  if (/NameError/i.test(s)) {
    tips.push('NameError : nom inconnu — faute de frappe, variable pas encore définie, ou mauvaise casse.');
  }
  if (/TypeError/i.test(s)) {
    tips.push('TypeError : opération incompatible avec le type de la valeur (ex. mélange texte / nombre).');
  }
  return tips.length ? `\n\n${tips.join('\n')}` : '';
}

let aldoWorkshopHintLast = 0;

/** Message court quand un atelier s’ouvre : Aldo veille sur la session (anti-spam entre écrans). */
function aldoNotifyWorkshopOpened(kind) {
  const now = Date.now();
  if (now - aldoWorkshopHintLast < 7000) return;
  aldoWorkshopHintLast = now;
  const prof = loadWelcomeProfile();
  const p = (prof.firstName || '').trim();
  const sqlMsg = p
    ? `Aldo : ${p}, le parcours est aligné sur votre profil — lisez le scénario, validez, puis « Défi suivant » pour avancer.`
    : 'Aldo : parcours SQL — scénario, validation, puis « Défi suivant » quand vous êtes prêt.';
  const pyMsg = p
    ? `Aldo : ${p}, je reste disponible — si la console affiche une erreur, ouvrez le chat (E) avec le message.`
    : 'Aldo : erreur Python ? Copiez le message de la console et ouvrez le chat (E).';
  const cyMsg = p
    ? `Aldo : ${p}, lisez le contexte au-dessus de chaque question — le module est en QCM.`
    : 'Aldo : chaque question a un contexte — lisez-le avant de répondre.';
  const map = { sql: sqlMsg, python: pyMsg, cyber: cyMsg };
  setMessage(map[kind] || sqlMsg);
}

function displaySQLCourse() {
  if (currentSQLChallenge >= sqlCourses.length) {
    currentSQLChallenge = 0;
    displaySQLCourse();
    return;
  }

  const course = sqlCourses[currentSQLChallenge];
  const modal = document.getElementById('sqlModal');
  const title = document.getElementById('sqlTitle');
  
  title.textContent = 'Atelier SQL';
  updateSessionHintBars();
  
  // Réinitialiser les compteurs pour le nouveau défi
  sqlAttempts = 0;
  sqlAnswerRevealed = false;
  resetSQLChallengePanels();
  
  // Show/hide modes
  document.getElementById('sqlIntroMode').style.display = 'none';
  document.getElementById('sqlChallengeMode').style.display = 'none';
  document.getElementById('sqlContent').style.display = 'none';

  if (course.isIntro || course.isConclusion) {
    // Introduction or Conclusion Mode
    document.getElementById('sqlIntroMode').style.display = 'flex';
    document.getElementById('sqlIntroMode').style.flexDirection = 'column';
    document.getElementById('sqlIntroText').textContent = course.content;
    document.getElementById('sqlIntroBtn').textContent = course.nextText;
    
    if (course.isConclusion) {
      document.getElementById('sqlIntroBtn').textContent = 'Recommencer';
    }
  } else {
    // Challenge Mode
    document.getElementById('sqlChallengeMode').style.display = 'flex';
    document.getElementById('sqlChallengeMode').style.flexDirection = 'column';
    
    const question = document.getElementById('sqlQuestion');
    const tableEl = document.getElementById('sqlTable');
    const schema = document.getElementById('sqlSchema');
    const example = document.getElementById('sqlExample');
    const explanation = document.getElementById('sqlExplanation');
    const input = document.getElementById('sqlInput');
    const hintEl = document.getElementById('sqlHint');
    
    question.textContent = buildSQLChallengeQuestionText(course);
    tableEl.textContent = course.table;
    schema.textContent = `Colonnes disponibles :\n${course.schema}`;
    example.textContent = course.example;
    explanation.textContent = course.explanation;
    hintEl.textContent = `${course.hint}`;
    hintEl.style.display = 'none';
    
    input.value = '';
    input.focus();
  }

  modal.style.display = 'flex';
  aldoNotifyWorkshopOpened('sql');
}

function submitSQLAnswer() {
  const course = sqlCourses[currentSQLChallenge];
  if (course.isIntro || course.isConclusion) return;
  if (sqlAwaitingNextChallenge) return;
  
  const input = document.getElementById('sqlInput');
  const userInput = input.value.trim();
  const feedbackEl = document.getElementById('sqlFeedback');
  
  sqlAttempts++;
  
  // Validate using intelligent system
  const validation = validateSQLQuery(userInput, course.expectedQuery);
  
  if (validation.isCorrect) {
    // Succès
    feedbackEl.className = 'sql-feedback success';
    feedbackEl.textContent = `Réponse correcte.\n\nDéfi ${course.level} — ${course.title}\n\nLa requête répond à la mission. Résultat ci-dessous.`;
    feedbackEl.style.display = 'block';
    
    // Display results
    const results = executeSQLQuery(userInput);
    displaySQLResults(results);
    
    // Update map message
    setMessage(`Défi SQL ${course.level} terminé avec succès. Utilisez « Défi suivant » pour continuer.`);
    
    // Play success effect
    input.style.borderColor = '#66ff66';
    input.style.boxShadow = '0 0 15px rgba(102, 255, 102, 0.5)';
    input.readOnly = true;
    sqlAwaitingNextChallenge = true;
    const submitBtn = document.getElementById('sqlSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;
    const nextBtn = document.getElementById('sqlNextBtn');
    if (nextBtn) nextBtn.style.display = 'inline-block';
    
  } else if (sqlAttempts >= 3 && !sqlAnswerRevealed) {
    // 3 essais échoués - Révéler la réponse
    sqlAnswerRevealed = true;
    feedbackEl.className = 'sql-feedback';
    feedbackEl.textContent = `Réponse de référence :\n\n${course.expectedQuery}\n\nExplication :\n${course.explanation}\n\nVous pouvez recopier cette requête puis valider pour passer au défi suivant.`;
    feedbackEl.style.display = 'block';
    
    // Display results for the correct answer
    const results = executeSQLQuery(course.expectedQuery);
    displaySQLResults(results);
    
    setMessage('La réponse de référence est affichée. Copiez-la puis validez pour continuer.');
    
    input.style.borderColor = '#ffaa00';
    input.style.boxShadow = '0 0 10px rgba(255, 170, 0, 0.5)';
    
  } else {
    // Réponse incorrecte
    const attemptsLeft = 3 - sqlAttempts;
    const attemptsText = attemptsLeft === 1 ? 'dernier essai' : 'essais restants';
    
    feedbackEl.className = 'sql-feedback';
    feedbackEl.textContent = `À ajuster.\n\n${validation.message}\n\nConseil : utilisez le bouton « Indice » si besoin.\n${attemptsLeft} ${attemptsText} avant affichage de la réponse de référence.`;
    feedbackEl.style.display = 'block';
    
    // Hide results on error
    document.getElementById('sqlResults').style.display = 'none';
    
    // Update map message
    setMessage(`Essai ${sqlAttempts}/3 — voir le message ci-dessus.`);
    
    // Visual feedback
    input.style.borderColor = '#ff6666';
    input.style.boxShadow = '0 0 10px rgba(255, 100, 100, 0.5)';
    
    setTimeout(() => {
      input.style.borderColor = '#4a9eff';
      input.style.boxShadow = '';
    }, 800);
  }
}

// Exécuter une requête SQL et retourner les résultats
function executeSQLQuery(query, expectedQuery) {
  const data = sqlDatabase.menu_plats;
  
  try {
    // Déterminer le type de requête
    const upperQuery = query.toUpperCase();
    
    if (upperQuery.includes('COUNT(*)')) {
      // COUNT
      if (upperQuery.includes('WHERE DISPONIBLE = TRUE')) {
        const count = data.filter(p => p.disponible === true).length;
        return {
          columns: ['COUNT(*)'],
          rows: [[count]],
          type: 'count'
        };
      }
      return { columns: ['COUNT(*)'], rows: [[data.length]], type: 'count' };
    }
    
    if (upperQuery.includes('ORDER BY PRIX ASC')) {
      // ORDER BY ASC
      const sorted = [...data].sort((a, b) => a.prix - b.prix);
      if (upperQuery.includes('SELECT *')) {
        return {
          columns: ['id', 'nom', 'prix', 'categorie', 'disponible'],
          rows: sorted.map(p => [p.id, p.nom, p.prix, p.categorie, p.disponible ? 'oui' : 'non']),
          type: 'table'
        };
      }
    }
    
    if (upperQuery.includes('WHERE')) {
      // WHERE clause
      let filtered = data;
      
      if (upperQuery.includes('DISPONIBLE = TRUE')) {
        filtered = filtered.filter(p => p.disponible === true);
      }
      
      if (upperQuery.includes('CATEGORIE = \'PLAT\'')) {
        filtered = filtered.filter(p => p.categorie === 'Plat');
      }
      
      if (upperQuery.includes('PRIX < 7')) {
        filtered = filtered.filter(p => p.prix < 7);
      }
      
      return {
        columns: ['id', 'nom', 'prix', 'categorie', 'disponible'],
        rows: filtered.map(p => [p.id, p.nom, p.prix, p.categorie, p.disponible ? 'oui' : 'non']),
        type: 'table'
      };
    }
    
    if (upperQuery.includes('SELECT *')) {
      // SELECT * (no WHERE)
      return {
        columns: ['id', 'nom', 'prix', 'categorie', 'disponible'],
        rows: data.map(p => [p.id, p.nom, p.prix, p.categorie, p.disponible ? 'oui' : 'non']),
        type: 'table'
      };
    }
    
  } catch (e) {
    return { error: 'Erreur lors de l\'exécution' };
  }
  
  return { rows: [] };
}

// Afficher les résultats dans un tableau
function displaySQLResults(results) {
  const resultsEl = document.getElementById('sqlResults');
  
  if (!results || results.error) {
    resultsEl.style.display = 'none';
    return;
  }
  
  if (!results.rows || results.rows.length === 0) {
    resultsEl.innerHTML = '<div style="color: #aabbff; padding: 10px;">Aucun résultat</div>';
    resultsEl.style.display = 'block';
    return;
  }
  
  let html = '<table><thead><tr>';
  results.columns.forEach(col => {
    html += `<th>${col}</th>`;
  });
  html += '</tr></thead><tbody>';
  
  results.rows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => {
      html += `<td>${cell}</td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  html += `<div class="sql-results-count">${results.rows.length} ligne(s) retournée(s)</div>`;
  
  resultsEl.innerHTML = html;
  resultsEl.style.display = 'block';
}

function normalizeSQLForCompare(s) {
  return String(s || '')
    .trim()
    .replace(/;+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

// Validation SQL (comparaison normalisée + messages d’aide détaillés)
function validateSQLQuery(userInput, expectedQuery) {
  const raw = String(userInput || '').trim();
  const user = normalizeSQLForCompare(raw);
  const expected = normalizeSQLForCompare(expectedQuery);
  
  if (!user.length) {
    return {
      isCorrect: false,
      message:
        'Requête vide.\n\nCommencez par SELECT … FROM menu_plats (puis WHERE ou ORDER BY selon la mission).',
      feedback: { isEmpty: true }
    };
  }

  if (user === expected) {
    return { isCorrect: true, message: null, feedback: null };
  }

  const hasWord = (re) => re.test(user);
  const feedback = {
    hasSELECT: hasWord(/\bSELECT\b/),
    hasFROM: hasWord(/\bFROM\b/),
    hasWHERE: hasWord(/\bWHERE\b/),
    hasORDERBY: hasWord(/\bORDER\s+BY\b/),
    hasCOUNT: /\bCOUNT\s*\(\s*\*\s*\)/.test(user),
    hasTable: user.includes('MENU_PLATS'),
    isEmpty: false
  };
  
  const expectedHas = {
    hasSELECT: expected.includes('SELECT'),
    hasFROM: expected.includes('FROM'),
    hasWHERE: expected.includes('WHERE'),
    hasORDERBY: /\bORDER\s+BY\b/.test(expected),
    hasCOUNT: /\bCOUNT\s*\(\s*\*\s*\)/.test(expected)
  };

  const messages = [];

  if (raw.includes('==')) {
    messages.push('En SQL, utilisez un seul = pour comparer (pas == comme en Python). Exemple : WHERE prix < 7');
  }
  if (/WHERE[^']*"[^"]*"/.test(raw) && expected.includes("'")) {
    messages.push('Pour les chaînes en SQL, préférez les guillemets simples : \'Plat\' plutôt que des guillemets doubles.');
  }
  if (user.includes('MENU_PLAT') && !user.includes('MENU_PLATS')) {
    messages.push('Nom de table : menu_plats (avec un « s » final).');
  }
  if (user.includes('ORDER') && !feedback.hasORDERBY) {
    messages.push('Forme attendue : ORDER BY … (ex. ORDER BY prix ASC), pas ORDER seul.');
  }
  if (expected.includes('CATEGORIE') && user.includes('CATEGORIE') && !user.includes("'PLAT'") && !user.includes('"PLAT"')) {
    messages.push('La valeur « Plat » doit être une chaîne : WHERE categorie = \'Plat\'');
  }
  if (expectedHas.hasWHERE && !feedback.hasWHERE) {
    messages.push('Cette mission exige un filtre WHERE (condition sur une colonne).');
  }
  if (expectedHas.hasWHERE && feedback.hasWHERE && expected.includes('DISPONIBLE') && !user.includes('DISPONIBLE')) {
    messages.push('Filtrez sur la colonne disponible (ex. disponible = true).');
  }
  if (expectedHas.hasCOUNT && !feedback.hasCOUNT) {
    messages.push('Utilisez COUNT(*) pour agréger, pas seulement une liste de lignes.');
  }
  if (expectedHas.hasORDERBY && !feedback.hasORDERBY) {
    messages.push('Ajoutez ORDER BY pour trier (ex. ORDER BY prix ASC).');
  }
  if (!feedback.hasSELECT && expectedHas.hasSELECT) {
    messages.push('Ajoutez SELECT pour indiquer les colonnes à afficher.');
  }
  if (!feedback.hasFROM && expectedHas.hasFROM) {
    messages.push('Ajoutez FROM menu_plats pour désigner la table.');
  }
  if (!feedback.hasTable && expected.includes('MENU_PLATS')) {
    messages.push('La table menu_plats doit apparaître après FROM.');
  }

  if (messages.length === 0) {
    messages.push('La requête ne correspond pas encore à ce qui est attendu pour cette mission.');
    messages.push('Vérifiez : espaces, guillemets simples autour du texte, ORDER BY complet, COUNT(*) si un total est demandé.');
    messages.push(`Référence : ${expectedQuery}`);
  }
  
  return {
    isCorrect: false,
    message: messages.join('\n'),
    feedback
  };
}

function showSQLHint() {
  const hintEl = document.getElementById('sqlHint');
  hintEl.style.display = hintEl.style.display === 'none' ? 'block' : 'none';
  setMessage('Indice affiché sous la consigne.');
}

function nextSQLChallenge() {
  currentSQLChallenge++;
  displaySQLCourse();
}

function closeSQLChallenge() {
  document.getElementById('sqlModal').style.display = 'none';
  resetSQLChallengePanels();
  setMessage('Atelier SQL fermé. Touche O pour rouvrir.');
}

/** Exécute du Python dans le navigateur (Skulpt) et capture print → stdout */
function runPythonSandbox(code) {
  return new Promise(resolve => {
    if (typeof Sk === 'undefined') {
      resolve({
        ok: false,
        stdout: '',
        stderr:
          'Moteur Python (Skulpt) non chargé — vérifie ta connexion et recharge la page.'
      });
      return;
    }

    let stdout = '';
    function outf(text) {
      stdout += text;
    }

    function builtinRead(name) {
      const fn = typeof name === 'string' ? name : Sk.ffi.remapToJs(name);
      const files = Sk.builtinFiles && (Sk.builtinFiles.files || Sk.builtinFiles['files']);
      if (!files || files[fn] === undefined) {
        throw new Error(`File not found: ${fn}`);
      }
      return files[fn];
    }

    Sk.configure({
      output: outf,
      read: builtinRead,
      __future__: Sk.python3 !== undefined ? Sk.python3 : {},
      retainingRuntime: false
    });

    const body = code.trim() === '' ? 'pass' : code;

    Sk.misceval
      .asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, body, true))
      .then(() => {
        resolve({ ok: true, stdout, stderr: '' });
      })
      .catch(err => {
        const msg = err && typeof err.toString === 'function' ? err.toString() : String(err);
        resolve({ ok: false, stdout, stderr: msg });
      });
  });
}

function openPythonAtelier() {
  if (!seatedOn || seatedOn.type !== 'pythonChair') {
    setMessage('Asseyez-vous sur la chaise du poste Python (E), puis ouvrez l’atelier.');
    return;
  }
  pythonLearningStarted = true;
  currentPythonChallenge = 0;
  displayPythonCourse();
}

function displayPythonCourse() {
  if (currentPythonChallenge >= pythonCourses.length) {
    currentPythonChallenge = 0;
    displayPythonCourse();
    return;
  }

  const course = pythonCourses[currentPythonChallenge];
  const modal = document.getElementById('pythonModal');
  const title = document.getElementById('pythonModalTitle');

  if (course.isIntro) {
    title.textContent = 'Atelier Python — accueil';
  } else if (course.isConclusion) {
    title.textContent = course.title || 'Atelier Python';
  } else {
    title.textContent = course.title || 'Atelier Python';
  }
  updateSessionHintBars();

  pythonAttempts = 0;
  pythonAnswerRevealed = false;

  document.getElementById('pythonIntroMode').style.display = 'none';
  document.getElementById('pythonChallengeMode').style.display = 'none';

  const feedbackEl = document.getElementById('pythonFeedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
    feedbackEl.className = 'sql-feedback';
  }

  const sandboxOut = document.getElementById('pythonSandboxOutput');
  if (sandboxOut) {
    sandboxOut.textContent = '';
  }

  if (course.isIntro || course.isConclusion) {
    document.getElementById('pythonIntroMode').style.display = 'flex';
    document.getElementById('pythonIntroMode').style.flexDirection = 'column';
    document.getElementById('pythonIntroText').textContent = course.content;
    const introBtn = document.getElementById('pythonIntroBtn');
    introBtn.textContent = course.nextText || 'Continuer';
    if (course.isConclusion) {
      introBtn.textContent = 'Recommencer';
    }
  } else {
    document.getElementById('pythonChallengeMode').style.display = 'flex';
    document.getElementById('pythonChallengeMode').style.flexDirection = 'column';

    document.getElementById('pythonQuestion').textContent = buildTrackedChallengeQuestionText(course);
    document.getElementById('pythonDoc').textContent = course.doc || '';
    document.getElementById('pythonExplanation').textContent = course.explanation ? course.explanation : '';

    const hintEl = document.getElementById('pythonHint');
    hintEl.textContent = course.hint || '';
    hintEl.style.display = 'none';

    const input = document.getElementById('pythonCodeInput');
    input.value = '';
    input.style.borderColor = '';
    input.style.boxShadow = '';
    input.focus();
  }

  modal.style.display = 'flex';
  aldoNotifyWorkshopOpened('python');
}

async function submitPythonAnswer() {
  const course = pythonCourses[currentPythonChallenge];
  if (course.isIntro || course.isConclusion) return;

  const input = document.getElementById('pythonCodeInput');
  const userCode = input.value;
  const feedbackEl = document.getElementById('pythonFeedback');
  const outEl = document.getElementById('pythonSandboxOutput');

  if (!userCode.trim()) {
    if (outEl) outEl.textContent = '';
    feedbackEl.className = 'sql-feedback';
    feedbackEl.textContent = 'Écris au moins une ligne de code.';
    feedbackEl.style.display = 'block';
    return;
  }

  pythonAttempts++;
  if (outEl) outEl.textContent = 'Exécution…';

  const run = await runPythonSandbox(userCode);

  if (!run.ok) {
    if (outEl) {
      const parts = [];
      if (run.stdout) parts.push(run.stdout);
      if (run.stderr) parts.push(run.stderr);
      outEl.textContent = parts.join('\n').trim() || run.stderr || 'Erreur inconnue.';
    }
    feedbackEl.className = 'sql-feedback';
    let msg = 'Erreur d’exécution — corrigez le code et réessayez.';
    if (run.stderr) msg += `\n\n${run.stderr}`;
    msg += hintPythonStderr(run.stderr);
    if (pythonAttempts >= 3 && !pythonAnswerRevealed) {
      pythonAnswerRevealed = true;
      const sol = course.reveal || '';
      msg += sol ? `\n\nSolution possible :\n${sol}` : '';
      setMessage('Solution de référence affichée après plusieurs essais.');
    }
    feedbackEl.textContent = msg;
    feedbackEl.style.display = 'block';
    return;
  }

  if (outEl) {
    outEl.textContent =
      run.stdout === ''
        ? '(aucune sortie — utilise print pour afficher du texte)'
        : run.stdout;
  }

  const validation = course.validate(userCode);
  if (validation.isCorrect) {
    feedbackEl.className = 'sql-feedback success';
    feedbackEl.textContent = `Exercice réussi.\n\n${course.title}\n\nSolution correcte (voir la sortie ci-dessus).`;
    feedbackEl.style.display = 'block';
    setMessage(`Python : défi ${course.level} réussi.`);

    input.style.borderColor = '#66ff66';
    input.style.boxShadow = '0 0 15px rgba(102, 255, 102, 0.5)';

    setTimeout(() => {
      input.style.borderColor = '#4a9eff';
      input.style.boxShadow = '';
      nextPythonChallenge();
    }, 2200);
  } else if (pythonAttempts >= 3 && !pythonAnswerRevealed) {
    pythonAnswerRevealed = true;
    feedbackEl.className = 'sql-feedback';
    const sol = course.reveal || '';
    feedbackEl.textContent = `${validation.message || 'Ce n’est pas encore ça.'}\n\nSolution possible :\n${sol}\n\nRecopiez ou adaptez puis validez pour continuer.`;
    feedbackEl.style.display = 'block';
    setMessage('Solution de référence affichée — vous pouvez la recopier pour valider.');
  } else {
    feedbackEl.className = 'sql-feedback';
    let fb =
      validation.message || 'Ce n’est pas encore ça. Compare la sortie ci-dessus avec la consigne.';
    if (course.doc) {
      const first = String(course.doc).split('\n').map(l => l.trim()).find(Boolean);
      if (first) fb += `\n\nRappel : ${first}`;
    }
    feedbackEl.textContent = fb;
    feedbackEl.style.display = 'block';
  }
}

function nextPythonChallenge() {
  currentPythonChallenge++;
  displayPythonCourse();
}

function showPythonHint() {
  const hintEl = document.getElementById('pythonHint');
  if (!hintEl) return;
  hintEl.style.display = hintEl.style.display === 'none' ? 'block' : 'none';
  setMessage('Indice affiché sous la consigne.');
}

function closePythonAtelier() {
  document.getElementById('pythonModal').style.display = 'none';
  const feedbackEl = document.getElementById('pythonFeedback');
  if (feedbackEl) feedbackEl.style.display = 'none';
  setMessage('Atelier Python fermé. Touche O pour rouvrir depuis le poste.');
}

function setCyberChoiceButtons(course) {
  ['A', 'B', 'C'].forEach(id => {
    const btn = document.getElementById(`cyberOpt${id}`);
    if (!btn) return;
    const ch = course.choices && course.choices.find(c => c.id === id);
    if (ch) {
      btn.style.display = 'block';
      btn.textContent = `${id} — ${ch.text}`;
    } else {
      btn.style.display = 'none';
    }
  });
}

function openCyberAtelier() {
  if (!seatedOn || seatedOn.type !== 'cyberChair') {
    setMessage('Asseyez-vous sur la chaise du poste cybersécurité (E), puis ouvrez le module.');
    return;
  }
  cyberLearningStarted = true;
  currentCyberChallenge = 0;
  displayCyberCourse();
}

function displayCyberCourse() {
  if (currentCyberChallenge >= cyberCourses.length) {
    currentCyberChallenge = 0;
    displayCyberCourse();
    return;
  }

  const course = cyberCourses[currentCyberChallenge];
  const title = document.getElementById('cyberModalTitle');

  if (course.isIntro) {
    title.textContent = 'Cybersécurité — accueil';
  } else if (course.isConclusion) {
    title.textContent = course.title || 'Cybersécurité';
  } else {
    title.textContent = course.title || 'Cybersécurité';
  }
  updateSessionHintBars();

  cyberAttempts = 0;
  cyberAnswerRevealed = false;

  document.getElementById('cyberIntroMode').style.display = 'none';
  document.getElementById('cyberChallengeMode').style.display = 'none';

  const feedbackEl = document.getElementById('cyberFeedback');
  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.textContent = '';
    feedbackEl.className = 'sql-feedback';
  }

  if (course.isIntro || course.isConclusion) {
    document.getElementById('cyberIntroMode').style.display = 'flex';
    document.getElementById('cyberIntroMode').style.flexDirection = 'column';
    document.getElementById('cyberIntroText').textContent = course.content;
    const introBtn = document.getElementById('cyberIntroBtn');
    introBtn.textContent = course.nextText || 'Continuer';
    if (course.isConclusion) {
      introBtn.textContent = 'Recommencer';
    }
  } else {
    document.getElementById('cyberChallengeMode').style.display = 'flex';
    document.getElementById('cyberChallengeMode').style.flexDirection = 'column';

    document.getElementById('cyberQuestion').textContent = buildTrackedChallengeQuestionText(course);
    document.getElementById('cyberDoc').textContent = course.doc || '';

    setCyberChoiceButtons(course);

    const hintEl = document.getElementById('cyberHint');
    hintEl.textContent = course.hint || '';
    hintEl.style.display = 'none';
  }

  document.getElementById('cyberModal').style.display = 'flex';
  aldoNotifyWorkshopOpened('cyber');
}

function submitCyberChoice(letter) {
  const course = cyberCourses[currentCyberChallenge];
  if (course.isIntro || course.isConclusion) return;

  const feedbackEl = document.getElementById('cyberFeedback');
  const L = String(letter).toUpperCase();
  const okChoice = course.choices && course.choices.some(c => c.id === L);
  if (!okChoice) return;

  if (L === course.correct) {
    feedbackEl.className = 'sql-feedback success';
    feedbackEl.textContent = course.explainOk || 'Bonne réponse.';
    feedbackEl.style.display = 'block';
    setMessage(`Cybersécurité : question ${course.level} réussie.`);
    setTimeout(() => {
      nextCyberChallenge();
    }, 2000);
    return;
  }

  cyberAttempts++;
  feedbackEl.className = 'sql-feedback';
  if (cyberAttempts >= 3 && !cyberAnswerRevealed) {
    cyberAnswerRevealed = true;
    feedbackEl.textContent = `Ce n’est pas la meilleure réponse.\n\n${course.reveal || ''}`;
    setMessage('La bonne réponse est affichée — sélectionnez-la pour continuer.');
  } else {
    feedbackEl.textContent =
      'Ce n’est pas la meilleure réponse. Réessayez ou consultez l’indice.';
  }
  feedbackEl.style.display = 'block';
}

function nextCyberChallenge() {
  currentCyberChallenge++;
  displayCyberCourse();
}

function showCyberHint() {
  const hintEl = document.getElementById('cyberHint');
  if (!hintEl) return;
  hintEl.style.display = hintEl.style.display === 'none' ? 'block' : 'none';
  setMessage('Indice affiché sous les réponses.');
}

function closeCyberAtelier() {
  document.getElementById('cyberModal').style.display = 'none';
  const feedbackEl = document.getElementById('cyberFeedback');
  if (feedbackEl) feedbackEl.style.display = 'none';
  setMessage('Module cybersécurité fermé. Touche O pour rouvrir depuis le poste.');
}

let npcChatInputBound = false;

/** Aligné sur le défaut serveur (8788) — surclassé par PORT dans .env côté client via l’URL ouverte */
const NODE_API_PORT = 8788;
/** Secours si le port principal est pris */
const NODE_API_PORT_ALT = 8789;
/** Dernier essai (ancien défaut ou autre instance) */
const NODE_API_PORT_LEGACY = 8787;

/**
 * Bases d’URL du serveur qui expose /api/* et charge .env (GEMINI_API_KEY).
 */
function getNodeApiServerBaseCandidates() {
  const { protocol, port } = window.location;
  const ports = [NODE_API_PORT, NODE_API_PORT_ALT, NODE_API_PORT_LEGACY];
  if (protocol !== 'http:' && protocol !== 'https:') {
    return [`http://127.0.0.1:${NODE_API_PORT}`, `http://127.0.0.1:${NODE_API_PORT_ALT}`];
  }
  const p = port === '' ? '' : String(port);
  const onOurPort = ports.map(String).includes(p);
  const bases = [];
  if (onOurPort) {
    bases.push(window.location.origin);
  }
  for (const pt of ports) {
    bases.push(`http://127.0.0.1:${pt}`);
    bases.push(`http://localhost:${pt}`);
  }
  if (!onOurPort) {
    bases.push(window.location.origin);
  }
  return [...new Set(bases)];
}

function getGeminiChatEndpointCandidates() {
  return getNodeApiServerBaseCandidates().map(b => `${b}/api/gemini-chat`);
}

function appendNpcMessage(role, text) {
  const log = document.getElementById('npcChatLog');
  if (!log) return;
  const div = document.createElement('div');
  div.className = role === 'user' ? 'npc-msg npc-msg-user' : 'npc-msg npc-msg-bot';
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function sendNpcChatMessage() {
  const input = document.getElementById('npcChatInput');
  const text = (input && input.value ? input.value : '').trim();
  if (!text) return;
  input.value = '';
  const history =
    chatPersona === 'sandro'
      ? npcSandroChatHistory
      : chatPersona === 'manu'
        ? npcManuChatHistory
        : chatPersona === 'alice'
          ? npcAliceChatHistory
          : npcAldoChatHistory;
  appendNpcMessage('user', text);
  history.push({ role: 'user', text });

  const status = document.getElementById('npcChatStatus');
  if (status) status.textContent = 'Réflexion…';

  try {
    const urls = getGeminiChatEndpointCandidates();
    let r = null;
    let raw = '';
    let sawHtml = false;
    let saw404 = false;
    const sessionContext = buildSessionContextPayload();
    const body = JSON.stringify({ messages: history, persona: chatPersona, sessionContext });
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        const t = await resp.text();
        if (shouldRetryApiFetch(resp, t)) {
          if (responseBodyLooksHtml(t)) sawHtml = true;
          if (resp.status === 404) saw404 = true;
          continue;
        }
        r = resp;
        raw = t;
        break;
      } catch {
        continue;
      }
    }
    if (!r) {
      throw new Error(
        sawHtml
          ? 'Réponse HTML à la place de l’API (ex. Live Server). Lance « npm start » à la racine et ouvre l’URL du terminal (souvent http://localhost:8788) — GEMINI_API_KEY dans .env.'
          : saw404
            ? '404 sur l’API : mauvais port ou autre serveur. Relance « npm start », ouvre l’URL affichée (port 8788 par défaut). GET /api/health → "app":"unity-game-web".'
            : 'Serveur injoignable. Lance « npm start » à la racine puis ouvre l’URL affichée (GEMINI_API_KEY dans .env).'
      );
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        'Réponse invalide (pas du JSON). Démarre le serveur avec « npm start » et vérifie GEMINI_API_KEY dans .env.'
      );
    }
    if (!r.ok) {
      throw new Error(data.detail || data.error || 'Erreur serveur');
    }
    const reply = data.text || '';
    const { cleanText, actions } = extractGameActionsFromText(reply);
    appendNpcMessage('assistant', cleanText);
    history.push({ role: 'assistant', text: cleanText });
    if (actions.length) {
      applyNpcGameActions(actions);
      updateSessionHintBars();
      setMessage(`Actions de session appliquées (${actions.length}) : défis, conseils PC ou notes RGPD.`);
    }
  } catch (err) {
    appendNpcMessage(
      'assistant',
      `⚠️ ${err.message || err}\n\nPour le chat IA : lance le jeu avec « npm start » à la racine du projet, et mets ta clé dans .env sous GEMINI_API_KEY= (sans guillemets).`
    );
  } finally {
    if (status) status.textContent = '';
  }
}

const SERVER_ROOM_STATE_KEY = 'unity_game_server_room_state_v1';
const WELCOME_PROFILE_KEY = 'unity_game_welcome_profile_v1';
const SESSION_HINTS_KEY = 'unity_game_session_pc_hints_v1';
const ZONE_VISITS_SESSION_KEY = 'unity_game_zone_visits_v1';

const WELCOME_LEARN_IDS = ['jeu', 'cours', 'defis', 'video', 'pratique', 'doc'];

function getZoneVisitCounts() {
  try {
    const raw = sessionStorage.getItem(ZONE_VISITS_SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/** Incrémente les passages dans la zone ; retourne true si première visite cette session. */
function registerZoneVisit(zoneKey) {
  const c = getZoneVisitCounts();
  const n = (c[zoneKey] || 0) + 1;
  c[zoneKey] = n;
  try {
    sessionStorage.setItem(ZONE_VISITS_SESSION_KEY, JSON.stringify(c));
  } catch (_) {}
  return n === 1;
}

function buildZoneEntryMessage(zoneKey, zoneName, profile, firstVisitThisSession) {
  const prenom = (profile.firstName || profile.displayName || '').trim();
  if (!prenom) {
    return zoneName ? `Zone : ${zoneName}` : '';
  }
  switch (zoneKey) {
    case 'admin_bureau':
      return firstVisitThisSession
        ? `${prenom}, salle administrateur — asseyez-vous au poste, O pour la console (prompts PNJ, vue ateliers).`
        : `Salle administrateur — ${prenom}.`;
    case 'open':
      return firstVisitThisSession
        ? `Bonjour ${prenom} — bienvenue dans l’espace commun.`
        : `${prenom}, tu es de retour dans l’espace commun.`;
    case 'salle_info':
      return firstVisitThisSession
        ? `Aldo t’accueille au Département Data & IA, ${prenom} — ateliers SQL, Python, cybersécurité.`
        : `Département Data & IA — salut ${prenom}.`;
    case 'server':
      return firstVisitThisSession
        ? `Sandro, salle des serveurs FYNE : bonjour ${prenom}. Sites Recrutement, Escape, Formation — supervision, défis.`
        : `Salle des serveurs FYNE — à toi, ${prenom}.`;
    case 'archives':
      return firstVisitThisSession
        ? `Manu vous accueille en zone Réglementations — postes IA Act et RGPD, ${prenom}.`
        : `Réglementations (IA Act & RGPD) — bonjour ${prenom}.`;
    case 'service_formation':
      return firstVisitThisSession
        ? `${prenom}, bienvenue au Service Formation — Alice t’oriente sur le parcours ; poste comme au Data & IA, plan sur mesure (E).`
        : `Service Formation — à toi, ${prenom}.`;
    case 'couloir_cafe':
      return firstVisitThisSession
        ? `Couloir entre Service Formation et le coin café — ${prenom}.`
        : `Couloir — ${prenom}.`;
    case 'cafe_detente':
      return firstVisitThisSession
        ? `${prenom}, coin café et détente — pause, boisson, échanges.`
        : `Coin café — salut ${prenom}.`;
    default:
      return zoneName ? `Zone : ${zoneName}` : '';
  }
}

function isWelcomeKioskOpen() {
  const el = document.getElementById('welcomeKioskModal');
  return el && el.style.display === 'flex';
}

function isAdminPinModalOpen() {
  const el = document.getElementById('adminPinModal');
  return el && el.style.display === 'flex';
}

function adminPinUpdateDisplay() {
  const el = document.getElementById('adminPinDisplay');
  if (!el) return;
  let t = '';
  for (let i = 0; i < 4; i++) {
    t += i < adminPinBuffer.length ? '● ' : '○ ';
  }
  el.textContent = t.trim();
}

function openAdminPinModal() {
  adminPinBuffer = '';
  adminPinUpdateDisplay();
  const modal = document.getElementById('adminPinModal');
  if (modal) modal.style.display = 'flex';
  setMessage('PIN à 4 chiffres — Échap pour annuler.');
}

function closeAdminPinModal() {
  const modal = document.getElementById('adminPinModal');
  if (modal) modal.style.display = 'none';
  pendingAdminDoor = null;
  adminPinBuffer = '';
  setMessage('Explore la pièce…');
}

function adminPinDigit(d) {
  if (adminPinBuffer.length >= 4) return;
  adminPinBuffer += String(d);
  adminPinUpdateDisplay();
  if (adminPinBuffer.length === 4) {
    submitAdminPin();
  }
}

function adminPinBackspace() {
  adminPinBuffer = adminPinBuffer.slice(0, -1);
  adminPinUpdateDisplay();
}

function submitAdminPin() {
  const door = pendingAdminDoor;
  if (!door || !door.locked) {
    closeAdminPinModal();
    return;
  }
  if (adminPinBuffer.length < 4) {
    setMessage('Le PIN comporte 4 chiffres.');
    return;
  }
  if (adminPinBuffer === SERVER_ROOM_CODE) {
    door.locked = false;
    door.openTarget = 1;
    pendingAdminDoor = null;
    adminPinBuffer = '';
    const modal = document.getElementById('adminPinModal');
    if (modal) modal.style.display = 'none';
    setMessage('PIN correct — la porte coulisse.');
  } else {
    setMessage('PIN incorrect.');
    adminPinBuffer = '';
    adminPinUpdateDisplay();
  }
}

function isFormationServiceModalOpen() {
  const el = document.getElementById('formationServiceModal');
  return el && el.style.display === 'flex';
}

function getTrainingPlanEndpointCandidates() {
  return getNodeApiServerBaseCandidates().map(b => `${b}/api/training-plan`);
}

function responseBodyLooksHtml(text) {
  const head = String(text).trimStart();
  return head.startsWith('<!DOCTYPE') || head.toLowerCase().startsWith('<html');
}

/** Réessayer une autre URL (autre port / autre origine) : HTML, 404, ou texte Express « Cannot POST ». */
function shouldRetryApiFetch(resp, text) {
  if (responseBodyLooksHtml(text)) return true;
  if (resp.status === 404) return true;
  const t = String(text).trim();
  if (/^cannot\s+post\s+\//i.test(t)) return true;
  return false;
}

function openFormationServiceModal() {
  const modal = document.getElementById('formationServiceModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const st = document.getElementById('formationPlanStatus');
  if (st) st.textContent = '';
  const btn = document.getElementById('formationGenerateBtn');
  if (btn) btn.disabled = false;
  setMessage('Service Formation — répondez aux questions puis « Générer le plan ». Échap pour fermer.');
}

function closeFormationServiceModal() {
  const modal = document.getElementById('formationServiceModal');
  if (modal) modal.style.display = 'none';
  setMessage('Explore la pièce…');
}

async function submitFormationPlanRequest() {
  const objective = document.getElementById('formationObjective');
  const audience = document.getElementById('formationAudience');
  const duration = document.getElementById('formationDuration');
  const topics = document.getElementById('formationTopics');
  const constraints = document.getElementById('formationConstraints');
  const status = document.getElementById('formationPlanStatus');
  const wrap = document.getElementById('formationPlanResultWrap');
  const pre = document.getElementById('formationPlanResult');
  const btn = document.getElementById('formationGenerateBtn');
  const obj = (objective && objective.value ? objective.value : '').trim();
  if (!obj) {
    if (status) status.textContent = 'Renseignez au moins l’objectif / besoin (question 1).';
    return;
  }
  if (status) status.textContent = 'Génération en cours…';
  if (btn) btn.disabled = true;
  if (wrap) wrap.style.display = 'none';
  if (pre) pre.textContent = '';

  const answers = {
    objective: obj,
    audience: audience ? audience.value.trim() : '',
    duration: duration ? duration.value.trim() : '',
    topics: topics ? topics.value.trim() : '',
    constraints: constraints ? constraints.value.trim() : ''
  };
  const sessionContext = buildSessionContextPayload();

  try {
    const urls = getTrainingPlanEndpointCandidates();
    let r = null;
    let raw = '';
    let sawHtml = false;
    let saw404 = false;
    const body = JSON.stringify({ answers, sessionContext });
    for (const url of urls) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body
        });
        const t = await resp.text();
        if (shouldRetryApiFetch(resp, t)) {
          if (responseBodyLooksHtml(t)) sawHtml = true;
          if (resp.status === 404) saw404 = true;
          continue;
        }
        r = resp;
        raw = t;
        break;
      } catch {
        continue;
      }
    }
    if (!r) {
      throw new Error(
        sawHtml
          ? 'Réponse HTML à la place de l’API (ex. page ouverte sans « npm start »). Lance « npm start » à la racine et ouvre l’URL du terminal (souvent :8788) — GEMINI_API_KEY dans .env à la racine.'
          : saw404
            ? '404 sur /api/training-plan : ouvre l’URL indiquée par « npm start » (port 8788 par défaut). GET /api/health → "app":"unity-game-web".'
            : 'Serveur injoignable. Lance « npm start » puis l’URL du terminal (clé GEMINI_API_KEY dans .env).'
      );
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Réponse invalide — vérifie que le serveur tourne et que GEMINI_API_KEY est dans .env.');
    }
    if (!r.ok) {
      throw new Error(data.error || data.detail || 'Erreur serveur');
    }
    const text = data.text || '';
    if (pre) pre.textContent = text;
    if (wrap) wrap.style.display = 'block';
    if (status) status.textContent = 'Plan généré — faites défiler le résultat ci-dessous.';
  } catch (err) {
    if (status) status.textContent = `⚠️ ${err.message || err}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function adminConsoleShowSection(key) {
  document.querySelectorAll('.admin-panel').forEach(p => {
    p.classList.toggle('is-active', p.id === `adminSection-${key}`);
  });
  document.querySelectorAll('.admin-nav-btn').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.adminSection === key);
  });
  if (key === 'pnj') {
    refreshAdminPnjPanel();
  }
}

function loadWelcomeProfile() {
  try {
    const raw = localStorage.getItem(WELCOME_PROFILE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      const firstName = String(o.firstName || o.displayName || '');
      let learningStyle = [];
      if (Array.isArray(o.learningStyle)) learningStyle = o.learningStyle;
      else if (typeof o.learningStyle === 'string' && o.learningStyle) learningStyle = [o.learningStyle];
      return {
        firstName,
        displayName: firstName,
        learningStyle,
        jobTitle: String(o.jobTitle || ''),
        sector: String(o.sector || ''),
        level: o.level === 'intermediaire' || o.level === 'avance' ? o.level : 'debutant',
        interests: Array.isArray(o.interests) ? o.interests : [],
        goal: String(o.goal || '')
      };
    }
  } catch (_) {}
  return {
    firstName: '',
    displayName: '',
    learningStyle: [],
    jobTitle: '',
    sector: '',
    level: 'debutant',
    interests: [],
    goal: ''
  };
}

function saveWelcomeProfile(p) {
  try {
    localStorage.setItem(WELCOME_PROFILE_KEY, JSON.stringify(p));
  } catch (_) {}
}

function getPlayerFirstName() {
  const p = loadWelcomeProfile();
  return (p.firstName || p.displayName || '').trim();
}

/** Préfixe « Bonjour Prénom — » pour chats PNJ si le profil contient un prénom. */
function npcSalutationPrefix() {
  const n = getPlayerFirstName();
  return n ? `Bonjour ${n} — ` : '';
}

function getOpenWorkshopKind() {
  const sql = document.getElementById('sqlModal');
  const py = document.getElementById('pythonModal');
  const cy = document.getElementById('cyberModal');
  if (sql && sql.style.display === 'flex') return 'sql';
  if (py && py.style.display === 'flex') return 'python';
  if (cy && cy.style.display === 'flex') return 'cyber';
  return null;
}

function getPlayerSeatedStation() {
  if (!seatedOn) return null;
  if (seatedOn.type === 'sqlChair') return 'sql';
  if (seatedOn.type === 'pythonChair') return 'python';
  if (seatedOn.type === 'cyberChair') return 'cyber';
  if (seatedOn.type === 'adminChair') return 'admin';
  return null;
}

/** Instantané du jeu pour l’IA : zone, atelier ouvert, défi en cours, indices session. */
function getGameplaySnapshot() {
  const z = zoneAtPlayer();
  const hints = loadSessionHints();
  const st = loadServerRoomState();
  const snap = {
    mapKey: currentMap || 'office',
    zoneKey: z ? z.key : '',
    zoneName: z ? z.name : '',
    seatedStation: getPlayerSeatedStation(),
    workshopOpen: getOpenWorkshopKind(),
    hintsSession: {
      sql: !!hints.sql,
      python: !!hints.python,
      cyber: !!hints.cyber
    },
    rgpdNotesCount: (hints.rgpdNotes || []).length,
    serverPcSimulationEnabled: !!st.pcSalleInfoEnabled,
    customChallengesCount: (st.customChallenges || []).length
  };

  if (typeof sqlCourses !== 'undefined' && typeof currentSQLChallenge === 'number') {
    const c = sqlCourses[currentSQLChallenge];
    if (c) {
      snap.sql = {
        title: c.title || '',
        level: c.level,
        isIntro: !!c.isIntro,
        isConclusion: !!c.isConclusion,
        attempts: sqlAttempts,
        awaitingNext: !!sqlAwaitingNextChallenge
      };
    }
  }
  if (typeof pythonCourses !== 'undefined' && typeof currentPythonChallenge === 'number') {
    const c = pythonCourses[currentPythonChallenge];
    if (c) {
      snap.python = {
        title: c.title || '',
        isIntro: !!c.isIntro,
        isConclusion: !!c.isConclusion,
        attempts: pythonAttempts
      };
    }
  }
  if (typeof cyberCourses !== 'undefined' && typeof currentCyberChallenge === 'number') {
    const c = cyberCourses[currentCyberChallenge];
    if (c) {
      snap.cyber = {
        title: c.title || '',
        isIntro: !!c.isIntro,
        attempts: cyberAttempts
      };
    }
  }
  return snap;
}

/** Objet envoyé à l’API pour personnaliser les PNJ (profil borne + état de jeu temps réel). */
function buildSessionContextPayload() {
  const p = loadWelcomeProfile();
  return {
    firstName: p.firstName || p.displayName || '',
    learningStyle: p.learningStyle || [],
    jobTitle: p.jobTitle || '',
    sector: p.sector || '',
    level: p.level,
    interests: p.interests || [],
    goal: p.goal || '',
    gameState: getGameplaySnapshot()
  };
}

/** Remplit les boutons « message rapide » du chat PNJ selon la personne et l’état du jeu. */
function refreshNpcChatQuickChips(persona) {
  const wrap = document.getElementById('npcChatQuickChips');
  if (!wrap) return;
  wrap.innerHTML = '';
  const gs = getGameplaySnapshot();
  const mk = (label, text) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'npc-chat-chip';
    b.textContent = label;
    b.addEventListener('click', () => npcChatSendQuickPrompt(text));
    wrap.appendChild(b);
  };

  if (persona === 'aldo') {
    if (gs.workshopOpen === 'sql' || gs.seatedStation === 'sql') {
      mk('Indice SQL (sans la réponse)', 'Je suis sur le défi SQL actuel. Donne-moi un indice pédagogique sans me donner la requête complète.');
    }
    if (gs.workshopOpen === 'python' || gs.seatedStation === 'python') {
      mk('Aide Python', 'Je suis sur l’atelier Python. Aide-moi à comprendre l’erreur ou la consigne sans me donner la solution complète.');
    }
    if (gs.workshopOpen === 'cyber' || gs.seatedStation === 'cyber') {
      mk('Lecture cyber', 'Je suis sur le module cybersécurité. Rappelle-moi comment lire le contexte avant de répondre.');
    }
    mk('Rappel phishing / mots de passe', 'Rappel court : phishing et mots de passe — bonnes pratiques dans un contexte pro.');
    mk('Où j’en suis ?', 'Résume ce que tu vois de ma session (zone, atelier) et ce que tu peux faire pour m’aider.');
  } else if (persona === 'sandro') {
    mk('Rôle de la console', 'En une minute : à quoi sert la console de supervision dans ce jeu ?');
    mk('Postes « en ligne »', 'Explique le toggle « postes Data & IA » et ce que ça simule.');
    mk('Lien avec Aldo', 'Comment tes environnements se connectent aux ateliers d’Aldo ?');
  } else if (persona === 'manu') {
    mk('RGPD : minimisation', 'Explique le principe de minimisation des données en une phrase puis un exemple.');
    mk('IA Act vs RGPD', 'En quoi l’IA Act complète le RGPD pour un même service ?');
    mk('Registre (fictif)', 'Donne une ligne type pour un registre de traitements (fictif, jeu).');
  } else if (persona === 'alice') {
    mk('Parcours sur mesure', 'Comment relier mon profil (borne) à un parcours cohérent SQL / Python / cyber / conformité ?');
    mk('Lien avec le Data & IA', 'En quoi le Service Formation complète les ateliers d’Aldo sans les remplacer ?');
    mk('Plan (borne E)', 'À quoi sert le plan généré depuis le poste E dans cette zone ?');
  }
}

function npcChatSendQuickPrompt(text) {
  const input = document.getElementById('npcChatInput');
  if (input) {
    input.value = text;
    input.focus();
  }
  sendNpcChatMessage();
}

function loadSessionHints() {
  try {
    const raw = localStorage.getItem(SESSION_HINTS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      return {
        sql: String(o.sql || ''),
        python: String(o.python || ''),
        cyber: String(o.cyber || ''),
        rgpdNotes: Array.isArray(o.rgpdNotes) ? o.rgpdNotes : []
      };
    }
  } catch (_) {}
  return { sql: '', python: '', cyber: '', rgpdNotes: [] };
}

function saveSessionHints(h) {
  try {
    localStorage.setItem(SESSION_HINTS_KEY, JSON.stringify(h));
  } catch (_) {}
}

/** Parse le JSON du bloc game_actions ; tolère virgules finales et blocs ```json. */
function tryParseGameActionsJson(raw) {
  const t = String(raw).trim();
  const attempts = [t, t.replace(/,\s*([\]}])/g, '$1')];
  for (const s of attempts) {
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j.actions)) return j.actions;
    } catch (_) {}
  }
  const sub = t.match(/\{[\s\S]*"actions"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (sub) {
    try {
      const j = JSON.parse(sub[0].replace(/,\s*([\]}])/g, '$1'));
      if (Array.isArray(j.actions)) return j.actions;
    } catch (_) {}
  }
  return [];
}

function extractGameActionsFromText(text) {
  const src = String(text);
  const reGa = /```game_actions\s*([\s\S]*?)```/i;
  const reJson = /```\s*json\s*([\s\S]*?)```/i;

  let m = src.match(reGa);
  if (m) {
    const actions = tryParseGameActionsJson(m[1]);
    const cleanText = src.replace(reGa, '').trim();
    return { cleanText, actions };
  }
  m = src.match(reJson);
  if (m && /"actions"\s*:/.test(m[1])) {
    const actions = tryParseGameActionsJson(m[1]);
    const cleanText = src.replace(reJson, '').trim();
    return { cleanText, actions };
  }
  return { cleanText: src.trim(), actions: [] };
}

function applyNpcGameActions(actions) {
  if (!actions || !actions.length) return;
  const st = loadServerRoomState();
  st.customChallenges = st.customChallenges || [];
  const hints = loadSessionHints();
  let changed = false;
  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    const t = a.type;
    if (t === 'add_challenge' && a.title && String(a.title).trim()) {
      st.customChallenges.push(String(a.title).trim().slice(0, 200));
      changed = true;
    } else if (t === 'set_pc_hint' && a.station && a.hint) {
      const stn = String(a.station).toLowerCase();
      const h = String(a.hint).trim().slice(0, 500);
      if (stn === 'sql') hints.sql = h;
      else if (stn === 'python') hints.python = h;
      else if (stn === 'cyber') hints.cyber = h;
      saveSessionHints(hints);
    } else if (t === 'rgpd_register_note' && a.text) {
      hints.rgpdNotes = hints.rgpdNotes || [];
      hints.rgpdNotes.push(String(a.text).trim().slice(0, 400));
      if (hints.rgpdNotes.length > 40) hints.rgpdNotes = hints.rgpdNotes.slice(-40);
      saveSessionHints(hints);
    }
  }
  if (changed) saveServerRoomState(st);
  try {
    refreshServerControlPanel();
  } catch (_) {}
  try {
    updateSessionHintBars();
  } catch (_) {}
}

function updateSessionHintBars() {
  const h = loadSessionHints();
  ['sql', 'python', 'cyber'].forEach(key => {
    const el = document.getElementById(`${key}SessionHint`);
    if (!el) return;
    const txt = h[key];
    if (txt) {
      el.textContent = `Conseil (interlocuteur) : ${txt}`;
      el.style.display = 'block';
    } else {
      el.textContent = '';
      el.style.display = 'none';
    }
  });
}

function openWelcomeKioskModal(opts) {
  opts = opts || {};
  const section = opts.section || 'profil';
  const modal = document.getElementById('welcomeKioskModal');
  if (!modal) return;
  const p = loadWelcomeProfile();
  const firstEl = document.getElementById('welcomeFirstName');
  const goalEl = document.getElementById('welcomeGoal');
  const levelEl = document.getElementById('welcomeLevel');
  const jobEl = document.getElementById('welcomeJobTitle');
  const sectorEl = document.getElementById('welcomeSector');
  if (firstEl) firstEl.value = p.firstName || p.displayName || '';
  if (goalEl) goalEl.value = p.goal;
  if (levelEl) levelEl.value = p.level;
  if (jobEl) jobEl.value = p.jobTitle || '';
  if (sectorEl) sectorEl.value = p.sector || '';
  WELCOME_LEARN_IDS.forEach(id => {
    const cb = document.getElementById(`welcomeLearn_${id}`);
    if (cb) cb.checked = !!(p.learningStyle && p.learningStyle.includes(id));
  });
  const interests = ['sql', 'python', 'cyber', 'serveurs', 'rgpd'];
  interests.forEach(id => {
    const cb = document.getElementById(`welcomeInterest_${id}`);
    if (cb) cb.checked = p.interests && p.interests.includes(id);
  });
  modal.style.display = 'flex';
  adminConsoleShowSection(section);
  setMessage(
    section === 'pnj'
      ? 'Console d’administration — prompts PNJ & vue session (Échap pour fermer).'
      : 'Console d’administration — paramètres (Échap pour fermer).'
  );
}

function renderAdminGameplaySnapshotHtml(gs) {
  if (!gs) return '<p class="admin-muted">Aucune donnée.</p>';
  const esc = typeof escapeHtmlServer === 'function' ? escapeHtmlServer : s => String(s);
  const parts = [];
  parts.push(
    `<div class="admin-snapshot-card"><strong>Zone</strong><br>${esc(gs.zoneName || gs.zoneKey || '—')}</div>`
  );
  parts.push(
    `<div class="admin-snapshot-card"><strong>Atelier ouvert à l’écran</strong><br>${esc(gs.workshopOpen || '—')}</div>`
  );
  parts.push(
    `<div class="admin-snapshot-card"><strong>Assis (chaise)</strong><br>${esc(gs.seatedStation || '—')}</div>`
  );
  if (gs.sql && gs.sql.title) {
    let line = esc(gs.sql.title);
    if (gs.sql.attempts != null) line += ` — ${gs.sql.attempts} tent.`;
    parts.push(`<div class="admin-snapshot-card"><strong>SQL (défi)</strong><br>${line}</div>`);
  }
  if (gs.python && gs.python.title) {
    parts.push(
      `<div class="admin-snapshot-card"><strong>Python</strong><br>${esc(gs.python.title)}</div>`
    );
  }
  if (gs.cyber && gs.cyber.title) {
    parts.push(
      `<div class="admin-snapshot-card"><strong>Cyber</strong><br>${esc(gs.cyber.title)}</div>`
    );
  }
  const h = gs.hintsSession || {};
  parts.push(
    `<div class="admin-snapshot-card"><strong>Indices session (local)</strong><br>SQL ${h.sql ? '✓' : '—'} · Py ${h.python ? '✓' : '—'} · Cyber ${h.cyber ? '✓' : '—'}</div>`
  );
  parts.push(
    `<div class="admin-snapshot-card"><strong>Postes Data & IA simulés</strong><br>${gs.serverPcSimulationEnabled ? 'en ligne' : 'hors ligne'}</div>`
  );
  parts.push(
    `<div class="admin-snapshot-card"><strong>Défis perso (console serveurs)</strong><br>${gs.customChallengesCount ?? 0}</div>`
  );
  parts.push(
    `<div class="admin-snapshot-card"><strong>Notes registre RGPD (session)</strong><br>${gs.rgpdNotesCount ?? 0}</div>`
  );
  return `<div class="admin-snapshot-grid-inner">${parts.join('')}</div>`;
}

async function refreshAdminPnjPanel() {
  const snapEl = document.getElementById('adminGameplaySnapshot');
  if (snapEl) snapEl.innerHTML = renderAdminGameplaySnapshotHtml(getGameplaySnapshot());
  const statusEl = document.getElementById('personaInstructionsStatus');
  const ids = [
    'personaPromptAldo',
    'personaPromptSandro',
    'personaPromptManu',
    'personaPromptAlice',
    'personaPromptTraining'
  ];
  const keys = ['aldo', 'sandro', 'manu', 'alice', 'training'];
  try {
    const r = await fetch('/api/persona-instructions');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const ov = data.overrides || {};
    const defaults = data.defaults || {};
    keys.forEach((k, i) => {
      const el = document.getElementById(ids[i]);
      if (!el) return;
      el.value = typeof ov[k] === 'string' ? ov[k] : '';
      el.placeholder = 'Vide = défaut serveur';
      el.dataset.defaultPreview = (defaults[k] || '').slice(0, 120);
    });
    if (statusEl) statusEl.textContent = 'Connecté au serveur — les prompts remplacent les défauts si non vides.';
  } catch (err) {
    if (statusEl) {
      statusEl.textContent =
        'Serveur local indisponible (lancez node server.js) — édition impossible tant que l’API ne répond pas.';
    }
  }
}

async function savePersonaInstructions() {
  const ids = [
    'personaPromptAldo',
    'personaPromptSandro',
    'personaPromptManu',
    'personaPromptAlice',
    'personaPromptTraining'
  ];
  const keys = ['aldo', 'sandro', 'manu', 'alice', 'training'];
  const overrides = {};
  keys.forEach((k, i) => {
    const el = document.getElementById(ids[i]);
    if (el) overrides[k] = el.value;
  });
  const statusEl = document.getElementById('personaInstructionsStatus');
  try {
    const r = await fetch('/api/persona-instructions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides })
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || r.status);
    }
    if (statusEl) statusEl.textContent = 'Prompts enregistrés sur le serveur (fichier data/persona-overrides.json).';
  } catch (err) {
    if (statusEl) statusEl.textContent = `Erreur : ${err.message || err}`;
  }
}

function closeWelcomeKioskModal() {
  const modal = document.getElementById('welcomeKioskModal');
  if (modal) modal.style.display = 'none';
  setMessage('Explore la pièce…');
}

function saveWelcomeFormAndClose() {
  const firstEl = document.getElementById('welcomeFirstName');
  const goalEl = document.getElementById('welcomeGoal');
  const levelEl = document.getElementById('welcomeLevel');
  const jobEl = document.getElementById('welcomeJobTitle');
  const sectorEl = document.getElementById('welcomeSector');
  const learningStyle = [];
  WELCOME_LEARN_IDS.forEach(id => {
    const cb = document.getElementById(`welcomeLearn_${id}`);
    if (cb && cb.checked) learningStyle.push(id);
  });
  const interests = [];
  ['sql', 'python', 'cyber', 'serveurs', 'rgpd'].forEach(id => {
    const cb = document.getElementById(`welcomeInterest_${id}`);
    if (cb && cb.checked) interests.push(id);
  });
  const fn = firstEl ? firstEl.value.trim().slice(0, 60) : '';
  saveWelcomeProfile({
    firstName: fn,
    displayName: fn,
    learningStyle,
    jobTitle: jobEl ? jobEl.value.trim().slice(0, 120) : '',
    sector: sectorEl ? sectorEl.value.trim().slice(0, 120) : '',
    level: levelEl ? levelEl.value : 'debutant',
    interests,
    goal: goalEl ? goalEl.value.trim().slice(0, 500) : ''
  });
  closeWelcomeKioskModal();
  setMessage('Profil enregistré — PNJ et accueil des zones mis à jour.');
}

function loadServerRoomState() {
  try {
    const raw = localStorage.getItem(SERVER_ROOM_STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { pcSalleInfoEnabled: true, customChallenges: [] };
}

function saveServerRoomState(st) {
  try {
    localStorage.setItem(SERVER_ROOM_STATE_KEY, JSON.stringify(st));
  } catch (_) {}
}

function escapeHtmlServer(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function refreshServerControlPanel() {
  const st = loadServerRoomState();
  const cb = document.getElementById('serverPcSalleInfoToggle');
  if (cb) cb.checked = !!st.pcSalleInfoEnabled;
  const el = document.getElementById('serverSqlChallengesCount');
  if (el && typeof sqlCourses !== 'undefined') el.textContent = String(sqlCourses.length);
  const list = document.getElementById('serverCustomChallengesList');
  if (list) {
    const arr = st.customChallenges || [];
    list.innerHTML = arr.length
      ? arr.map(t => `<li>${escapeHtmlServer(String(t))}</li>`).join('')
      : '<li class="server-empty">Aucun défi ajouté.</li>';
  }
}

function toggleServerPcSalleInfo() {
  const st = loadServerRoomState();
  const cb = document.getElementById('serverPcSalleInfoToggle');
  st.pcSalleInfoEnabled = cb ? cb.checked : true;
  saveServerRoomState(st);
  setMessage(
    st.pcSalleInfoEnabled ? 'Postes Data & IA : activés (simulation).' : 'Postes Data & IA : désactivés (simulation).'
  );
}

function addServerCustomChallenge() {
  const inp = document.getElementById('serverAddChallengeTitle');
  const t = (inp && inp.value ? inp.value : '').trim();
  if (!t) return;
  const st = loadServerRoomState();
  st.customChallenges = st.customChallenges || [];
  st.customChallenges.push(t);
  saveServerRoomState(st);
  if (inp) inp.value = '';
  refreshServerControlPanel();
  setMessage(`Défi enregistré (liste locale) : ${t}`);
}

function openServerControlPanel() {
  const el = document.getElementById('serverControlModal');
  if (!el) return;
  refreshServerControlPanel();
  el.style.display = 'flex';
  setMessage('Console FYNE — Échap pour fermer.');
}

function closeServerControlPanel() {
  const el = document.getElementById('serverControlModal');
  if (el) el.style.display = 'none';
  setMessage('Explore la pièce…');
}

function openAldoNpcChat() {
  chatPersona = 'aldo';
  const title = document.getElementById('npcChatTitle');
  if (title) title.textContent = 'Aldo — formateur (Département Data & IA)';
  const hint = document.getElementById('npcChatHint');
  if (hint)
    hint.textContent =
      'Aldo : veille sur le Département Data & IA, personnalise les parcours (profil borne). Formation : Alice. Infra : Sandro. Juridique : Manu.';
  const modal = document.getElementById('npcChatModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const log = document.getElementById('npcChatLog');
  if (log) {
    log.innerHTML = '';
    if (npcAldoChatHistory.length === 0) {
      appendNpcMessage(
        'assistant',
        `${npcSalutationPrefix()}c’est Aldo. Je coordonne le Département Data & IA : je fais tourner les parcours SQL, Python et cyber, je teste et ajuste les exercices sur les postes, et je vous accompagne si vous bloquez. Baies / console : Sandro ; RGPD : Manu.`
      );
    } else {
      npcAldoChatHistory.forEach(m => appendNpcMessage(m.role, m.text));
    }
  }
  const input = document.getElementById('npcChatInput');
  if (input && !npcChatInputBound) {
    npcChatInputBound = true;
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendNpcChatMessage();
      }
    });
  }
  input && input.focus();
  refreshNpcChatQuickChips('aldo');
  setMessage('Chat avec Aldo — Échap pour fermer.');
}

function openSandroNpcChat() {
  chatPersona = 'sandro';
  const title = document.getElementById('npcChatTitle');
  if (title) title.textContent = 'Sandro — FYNE & supervision';
  const hint = document.getElementById('npcChatHint');
  if (hint)
    hint.textContent =
      'Sandro : salle FYNE (sites Recrutement, Escape, Formation), défis, supervision. Pas de cours code (Aldo) ni de doctrine RGPD (Manu).';
  const modal = document.getElementById('npcChatModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const log = document.getElementById('npcChatLog');
  if (log) {
    log.innerHTML = '';
    if (npcSandroChatHistory.length === 0) {
      appendNpcMessage(
        'assistant',
        `${npcSalutationPrefix()}Sandro, salle serveurs FYNE : trois baies (Recrutement, Escape, Formation) pour les sites que je pilote — environnements, défis, supervision. Pas de cours SQL ici — Aldo. Juridique / registre — Manu. Console au pupitre : E.`
      );
    } else {
      npcSandroChatHistory.forEach(m => appendNpcMessage(m.role, m.text));
    }
  }
  const input = document.getElementById('npcChatInput');
  if (input && !npcChatInputBound) {
    npcChatInputBound = true;
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendNpcChatMessage();
      }
    });
  }
  input && input.focus();
  refreshNpcChatQuickChips('sandro');
  setMessage('Chat avec Sandro — Échap pour fermer.');
}

function openManuNpcChat() {
  chatPersona = 'manu';
  const title = document.getElementById('npcChatTitle');
  if (title) title.textContent = 'Manu — IA Act (UE) & RGPD';
  const hint = document.getElementById('npcChatHint');
  if (hint)
    hint.textContent =
      'Manu : règlement européen sur l’IA et RGPD, mises en situation réglementaires. Pas de code (Aldo) ni d’infra (Sandro).';
  const modal = document.getElementById('npcChatModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const log = document.getElementById('npcChatLog');
  if (log) {
    log.innerHTML = '';
    if (npcManuChatHistory.length === 0) {
      appendNpcMessage(
        'assistant',
        `${npcSalutationPrefix()}Manu, chargé de la conformité dans cet espace : je couvre le règlement européen sur l’intelligence artificielle (IA Act) et le RGPD — principes, traitements, droits des personnes, risques des systèmes d’IA, documentation. Les postes en haut de la zone proposent des mises en situation types. Pour le code ou les serveurs : Aldo et Sandro.`
      );
    } else {
      npcManuChatHistory.forEach(m => appendNpcMessage(m.role, m.text));
    }
  }
  const input = document.getElementById('npcChatInput');
  if (input && !npcChatInputBound) {
    npcChatInputBound = true;
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendNpcChatMessage();
      }
    });
  }
  input && input.focus();
  refreshNpcChatQuickChips('manu');
  setMessage('Chat avec Manu — Échap pour fermer.');
}

function openAliceNpcChat() {
  chatPersona = 'alice';
  const title = document.getElementById('npcChatTitle');
  if (title) title.textContent = 'Alice — Service Formation';
  const hint = document.getElementById('npcChatHint');
  if (hint)
    hint.textContent =
      'Alice : parcours, orientation et plans sur mesure (zone Service Formation). Ateliers techniques : Aldo. Infra : Sandro. Juridique : Manu.';
  const modal = document.getElementById('npcChatModal');
  if (!modal) return;
  modal.style.display = 'flex';
  const log = document.getElementById('npcChatLog');
  if (log) {
    log.innerHTML = '';
    if (npcAliceChatHistory.length === 0) {
      appendNpcMessage(
        'assistant',
        `${npcSalutationPrefix()}Alice, au Service Formation : j’aide à structurer ton parcours (profil borne, objectifs, rythme) et à le relier aux ateliers du Département Data & IA sans les remplacer. Le plan détaillé se génère au poste (E). Pour le code ou les exercices pas à pas : Aldo ; serveurs : Sandro ; RGPD / IA Act : Manu.`
      );
    } else {
      npcAliceChatHistory.forEach(m => appendNpcMessage(m.role, m.text));
    }
  }
  const input = document.getElementById('npcChatInput');
  if (input && !npcChatInputBound) {
    npcChatInputBound = true;
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        sendNpcChatMessage();
      }
    });
  }
  input && input.focus();
  refreshNpcChatQuickChips('alice');
  setMessage('Chat avec Alice — Échap pour fermer.');
}

function closeNpcChat() {
  const modal = document.getElementById('npcChatModal');
  if (modal) modal.style.display = 'none';
  setMessage('Explore la pièce…');
}

// Raccourcis clavier modales SQL / Python / Cyber / Chat PNJ
document.addEventListener('keydown', e => {
  const fyneEscapeModal = document.getElementById('fyneEscapeModal');
  if (fyneEscapeModal && fyneEscapeModal.style.display === 'flex') {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeFyneEscapeModal();
    }
    return;
  }

  const formationServiceModal = document.getElementById('formationServiceModal');
  if (formationServiceModal && formationServiceModal.style.display === 'flex') {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeFormationServiceModal();
    }
    return;
  }

  const adminPinModal = document.getElementById('adminPinModal');
  if (adminPinModal && adminPinModal.style.display === 'flex') {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeAdminPinModal();
    }
    return;
  }

  const welcomeKioskModal = document.getElementById('welcomeKioskModal');
  if (welcomeKioskModal && welcomeKioskModal.style.display === 'flex') {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeWelcomeKioskModal();
    }
    return;
  }

  const serverControlModal = document.getElementById('serverControlModal');
  if (serverControlModal && serverControlModal.style.display === 'flex') {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeServerControlPanel();
    }
    return;
  }

  const sqlModal = document.getElementById('sqlModal');
  const pythonModal = document.getElementById('pythonModal');
  const cyberModal = document.getElementById('cyberModal');
  const npcChatModal = document.getElementById('npcChatModal');

  if (npcChatModal && npcChatModal.style.display === 'flex') {
    if (e.code === 'Escape') {
      e.preventDefault();
      closeNpcChat();
    }
    return;
  }

  if (cyberModal && cyberModal.style.display === 'flex') {
    if (e.code === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      const introBtn = document.getElementById('cyberIntroBtn');
      if (introBtn && introBtn.offsetParent !== null) {
        nextCyberChallenge();
      }
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      closeCyberAtelier();
    }
    return;
  }

  if (pythonModal && pythonModal.style.display === 'flex') {
    if (e.code === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      const introBtn = document.getElementById('pythonIntroBtn');
      if (introBtn && introBtn.offsetParent !== null) {
        nextPythonChallenge();
      } else {
        submitPythonAnswer();
      }
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      closePythonAtelier();
    }
    return;
  }

  if (!sqlModal || sqlModal.style.display !== 'flex') return;

  if (e.code === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    const introBtn = document.getElementById('sqlIntroBtn');
    if (introBtn && introBtn.offsetParent !== null) {
      nextSQLChallenge();
    } else if (!sqlAwaitingNextChallenge) {
      submitSQLAnswer();
    }
  }
  
  if (e.code === 'Escape') {
    e.preventDefault();
    closeSQLChallenge();
  }
});

/** Paysage sur mobile : tentative de verrouillage après interaction (Chrome/Android ; Safari ignore souvent). */
(function tryLockLandscapeAfterInteraction() {
  function tryLock() {
    const o = screen.orientation;
    if (o && typeof o.lock === 'function') {
      o.lock('landscape-primary').catch(() => {});
    }
  }
  document.addEventListener('touchstart', tryLock, { once: true, passive: true });
  document.addEventListener('click', tryLock, { once: true, passive: true });
})();
