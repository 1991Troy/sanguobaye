// ========== 连接与状态 ==========
let ws, playerId, gameState = null;
let selectedCity = null;
let hoveredCity = null;
let playerName = '';
let currentRoomId = null;

// ========== 背景音乐 ==========
const bgm = new Audio('/assets/music.mp3');
bgm.loop = true;
bgm.volume = 0.35;
let bgmPlaying = false;

function toggleBGM() {
  const btn = document.getElementById('bgm-btn');
  if (bgmPlaying) {
    bgm.pause();
    bgmPlaying = false;
    btn.textContent = '🔇';
  } else {
    bgm.play().catch(() => {});
    bgmPlaying = true;
    btn.textContent = '🔊';
  }
}

// 首次用户交互时自动播放
function tryAutoPlayBGM() {
  if (bgmPlaying) return;
  bgm.play().then(() => {
    bgmPlaying = true;
    const btn = document.getElementById('bgm-btn');
    if (btn) btn.textContent = '🔊';
  }).catch(() => {});
  document.removeEventListener('click', tryAutoPlayBGM);
}
document.addEventListener('click', tryAutoPlayBGM);

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };
  ws.onclose = () => { addLog('⚠️ 与服务器断开连接'); };
  return new Promise(resolve => { ws.onopen = resolve; });
}

// 点击屏幕 → 显示登录表单
function showLoginForm() {
  const screen = document.getElementById('login-screen');
  if (screen.classList.contains('show-form')) return;
  screen.classList.add('show-form');
}

function goToLobby() {
  playerName = document.getElementById('playerName').value.trim() || '无名氏';
  document.getElementById('lobby-player-name').textContent = `👤 ${playerName}`;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('lobby-screen').style.display = 'block';
  connectWS();
}

async function createNewRoom() {
  if (!ws || ws.readyState !== 1) await connectWS();
  ws.send(JSON.stringify({ type: 'createRoom', name: playerName, maxPlayers: 4 }));
}

async function quickJoin() {
  if (!ws || ws.readyState !== 1) await connectWS();
  ws.send(JSON.stringify({ type: 'join', name: playerName }));
}

async function joinByCode() {
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return;
  if (!ws || ws.readyState !== 1) await connectWS();
  ws.send(JSON.stringify({ type: 'joinRoom', roomId: code, name: playerName }));
}

async function joinRoomById(roomId) {
  if (!ws || ws.readyState !== 1) await connectWS();
  ws.send(JSON.stringify({ type: 'joinRoom', roomId, name: playerName }));
}

function refreshRooms() {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'getRooms' }));
}

function renderRoomList(rooms) {
  const el = document.getElementById('room-list');
  if (!rooms || rooms.length === 0) {
    el.innerHTML = '<p style="color:#888;text-align:center">暂无等待中的房间，创建一个吧</p>';
    return;
  }
  el.innerHTML = rooms.map(r => `
    <div class="room-card" onclick="joinRoomById('${r.id}')">
      <div class="room-code">${r.id}</div>
      <div class="room-info"><span>👥 ${r.playerCount}/${r.maxPlayers}</span><span>${r.players.join(', ')}</span></div>
      <button class="btn btn-attack" style="padding:4px 12px;font-size:13px">加入</button>
    </div>
  `).join('');
}

function leaveRoom() {
  if (ws) ws.close();
  playerId = null; gameState = null; currentRoomId = null;
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('lobby-screen').style.display = 'block';
  document.getElementById('waiting-info').style.display = 'block';
  document.getElementById('playing-actions').style.display = 'none';
  connectWS();
}

function joinGame() { goToLobby(); }

function handleMessage(msg) {
  switch (msg.type) {
    case 'roomList': renderRoomList(msg.rooms); break;
    case 'joined':
      playerId = msg.playerId; currentRoomId = msg.roomId;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('lobby-screen').style.display = 'none';
      document.getElementById('game-screen').style.display = 'flex';
      document.getElementById('roomCode').textContent = msg.roomId;
      initCanvas(); addLog('✅ 已加入房间 ' + msg.roomId);
      break;
    case 'playerJoined':
      document.getElementById('playerCount').textContent = msg.count;
      addLog(`👤 ${msg.name} 加入了游戏 (${msg.count}/4)`);
      break;
    case 'playerLeft':
      if (msg.count != null) document.getElementById('playerCount').textContent = msg.count;
      addLog(`👤 ${msg.name} 离开了游戏 (${msg.count}/4)`);
      break;
    case 'gameStarted':
      document.getElementById('waiting-info').style.display = 'none';
      document.getElementById('playing-actions').style.display = 'block';
      addLog('🏯 天下大乱，群雄逐鹿！');
      break;
    case 'state': gameState = msg.data; updateUI(); drawMap(); break;
    case 'battleLog': msg.log.forEach(l => addLog(l)); break;
    case 'gameOver': addLog(`🎉 ${msg.winner} 一统天下！游戏结束！`); stopCountdown(); break;
    case 'gameOverScore': showScoreResult(msg.scores, msg.winner); stopCountdown(); break;
    case 'error': addLog(`❌ ${msg.msg}`); break;
    case 'info': addLog(`ℹ️ ${msg.msg}`); break;
    case 'saveList': renderSaveList(msg.saves); break;
    case 'loaded': playerId = msg.playerId; addLog('📂 存档加载成功，房间: ' + msg.roomId); break;
    case 'needRejoin': showRejoinScreen(msg.playerNames, msg.msg); break;
    case 'rejoinStatus': updateRejoinStatus(msg.joined, msg.needed, msg.remaining); break;
    case 'drawResult': showDrawResult(msg.cards, msg.log); break;
    case 'chat': renderChatMessage(msg); break;
  }
}

function startGame() { ws.send(JSON.stringify({ type: 'start' })); }
function endTurn() { ws.send(JSON.stringify({ type: 'endTurn' })); }

function doAttack() {
  const from = parseInt(document.getElementById('selFrom').value);
  const to = parseInt(document.getElementById('selTo').value);
  const troopVal = document.getElementById('troopCount').value;
  const general = document.getElementById('selGeneral').value;
  if (troopVal === 'allout') {
    ws.send(JSON.stringify({ type: 'attack', from, to, troops: 0, general, allOut: true }));
  } else {
    ws.send(JSON.stringify({ type: 'attack', from, to, troops: parseInt(troopVal), general }));
  }
}

function doRecruit() {
  const cityId = parseInt(document.getElementById('selFrom').value);
  ws.send(JSON.stringify({ type: 'recruit', cityId, count: 1000 }));
}

// ========== UI 更新 ==========
function updateUI() {
  if (!gameState) return;
  const s = gameState;

  document.getElementById('roundInfo').textContent = `第 ${s.round} 回合`;
  const currentP = s.players[s.currentTurn];
  const isMyTurn = s.currentTurn === s.you;
  document.getElementById('turnInfo').textContent = isMyTurn ? '🔥 你的回合' : `等待 ${currentP?.name || ''}`;
  startCountdown(s.turnDeadline, s.gameDeadline);

  const me = s.players[s.you];
  if (me) document.getElementById('goldInfo').textContent = `💰 ${me.gold}`;

  const pl = document.getElementById('players-list');
  pl.innerHTML = Object.entries(s.players).map(([id, p]) =>
    `<span class="player-tag" style="background:${p.color}33;border:1px solid ${p.color}">
      <span class="player-dot" style="background:${p.color}"></span>
      ${p.name} (${p.cityCount}城)${id === s.you ? ' 👈' : ''}
    </span>`
  ).join('');

  if (me) {
    const selFrom = document.getElementById('selFrom');
    const prevFrom = selFrom.value;
    selFrom.innerHTML = me.cities.map(cid =>
      `<option value="${cid}">${s.cities[cid].name} (${s.cities[cid].troops}兵)</option>`
    ).join('');
    if (prevFrom && me.cities.includes(parseInt(prevFrom))) selFrom.value = prevFrom;

    const selTo = document.getElementById('selTo');
    const prevTo = selTo.value;
    selTo.innerHTML = s.cities
      .filter(c => c.owner !== s.you)
      .map(c => `<option value="${c.id}">${c.name} (${c.troops}兵) ${c.owner === 'neutral' ? '中立' : ''}</option>`)
      .join('');
    if (prevTo) selTo.value = prevTo;

    const selG = document.getElementById('selGeneral');
    selG.innerHTML = '<option value="">不派武将</option>' +
      me.generals.map(g => {
        const rarityTag = g.rarity === 'gold' ? '🥇' : g.rarity === 'purple' ? '🟣' : g.rarity === 'blue' ? '🔵' : '';
        const cityName = g.cityId >= 0 ? `@${s.cities[g.cityId]?.name || '?'}` : '待命';
        return `<option value="${g.name}">${rarityTag}${g.icon} ${g.name} (攻${g.attack} 防${g.defense}) ${cityName}</option>`;
      }).join('');

    const btnDraw = document.getElementById('btnDraw');
    if (btnDraw) {
      if (isMyTurn && !me.hasDrawn) { btnDraw.disabled = false; btnDraw.textContent = '🎴 五连抽卡'; }
      else if (isMyTurn && me.hasDrawn) { btnDraw.disabled = true; btnDraw.textContent = '🎴 本回合已抽'; }
      else { btnDraw.disabled = true; btnDraw.textContent = '🎴 五连抽卡'; }
    }

    const skillSection = document.getElementById('skillCardSection');
    const skillList = document.getElementById('skillCardList');
    if (me.skillCards && me.skillCards.length > 0) {
      skillSection.style.display = 'block';
      skillList.innerHTML = me.skillCards.map(s =>
        `<div class="skill-card-item" onclick="useSkillCard('${s.id}')">
          <span class="skill-card-icon">${s.icon}</span>
          <span class="skill-card-name">${s.name}</span>
          <span class="skill-card-desc">${s.desc}</span>
        </div>`
      ).join('');
    } else {
      skillSection.style.display = 'none';
    }
  }
}

function addLog(text) {
  const layer = document.getElementById('danmaku-layer');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'danmaku';
  el.textContent = text;
  const top = 8 + Math.random() * 70;
  el.style.top = top + '%';
  el.style.right = '-100%';
  el.style.left = '100%';
  const duration = 6 + Math.random() * 3;
  el.style.animationDuration = duration + 's';
  if (text.includes('✅') || text.includes('胜利')) el.style.color = '#2ecc71';
  else if (text.includes('❌') || text.includes('战败') || text.includes('战死')) el.style.color = '#e74c3c';
  else if (text.includes('🎴') || text.includes('金卡')) el.style.color = '#ffd700';
  else if (text.includes('⚔️') || text.includes('出征')) el.style.color = '#f39c12';
  else if (text.includes('🏳️') || text.includes('俘获')) el.style.color = '#a855f7';
  else if (text.includes('ℹ️')) el.style.color = '#8888cc';
  layer.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => { if (el.parentNode) el.remove(); }, (duration + 1) * 1000);
}

// ========== Canvas 地图绘制 ==========
let canvas, ctx;
let mapW, mapH;
let camX = 0, camY = 0, camZoom = 1;
const CAM_MIN_ZOOM = 0.5, CAM_MAX_ZOOM = 3;

function initCanvas() {
  canvas = document.getElementById('gameMap');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); drawMap(); });
  canvas.addEventListener('mousemove', onMapMouseMove);
  canvas.addEventListener('click', onMapClick);
  canvas.addEventListener('wheel', onMapWheel, { passive: false });
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  if (window.innerWidth <= 768) {
    camZoom = 1.4;
    camX = -(mapW * camZoom - mapW) / 2;
    camY = -(mapH * camZoom - mapH) / 2;
  }
}

function resizeCanvas() {
  const container = document.getElementById('map-container');
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mapW = w; mapH = h;
}

function cityPos(city) {
  return { x: city.x / 100 * mapW * camZoom + camX, y: city.y / 100 * mapH * camZoom + camY };
}

function screenToMap(sx, sy) {
  return { mx: (sx - camX) / (mapW * camZoom) * 100, my: (sy - camY) / (mapH * camZoom) * 100 };
}

function drawMap() {
  if (!gameState || !ctx) return;
  const s = gameState;
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, mapW, mapH);

  ctx.save();
  ctx.translate(camX, camY);
  ctx.scale(camZoom, camZoom);

  drawBackground();

  // 绘制路线
  s.routes.forEach(([a, b]) => {
    const ca = s.cities[a], cb = s.cities[b];
    const pax = ca.x / 100 * mapW, pay = ca.y / 100 * mapH;
    const pbx = cb.x / 100 * mapW, pby = cb.y / 100 * mapH;
    const ownerA = ca.owner, ownerB = cb.owner;
    const colorA = s.players[ownerA]?.color || '#333';
    const sameOwner = ownerA === ownerB && ownerA !== 'neutral';
    ctx.beginPath(); ctx.moveTo(pax, pay); ctx.lineTo(pbx, pby);
    if (sameOwner) {
      const grad = ctx.createLinearGradient(pax, pay, pbx, pby);
      grad.addColorStop(0, colorA + '55'); grad.addColorStop(1, colorA + '55');
      ctx.strokeStyle = grad; ctx.lineWidth = 2 / camZoom;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1 / camZoom;
    }
    ctx.stroke();
    if (!sameOwner) { ctx.setLineDash([4, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.stroke(); ctx.setLineDash([]); }
  });

  // 绘制城池
  const time = Date.now() * 0.001;
  s.cities.forEach((city, i) => {
    const px = city.x / 100 * mapW;
    const py = city.y / 100 * mapH;
    const owner = city.owner;
    const player = s.players[owner];
    const color = player ? player.color : '#555';
    const isMyCity = owner === s.you;
    const isHovered = hoveredCity === i;
    const baseR = isMyCity ? 17 : 13;
    const radius = (isHovered ? baseR + 3 : baseR) / camZoom;

    if (isMyCity) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 2 + i);
      const glowR = radius + (12 + pulse * 4) / camZoom;
      const glow = ctx.createRadialGradient(px, py, radius, px, py, glowR);
      glow.addColorStop(0, color + '30'); glow.addColorStop(1, color + '00');
      ctx.beginPath(); ctx.arc(px, py, glowR, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
    }

    if (city.defBuff && city.defBuff > 0) {
      ctx.beginPath(); ctx.arc(px, py, radius + 6 / camZoom, 0, Math.PI * 2);
      ctx.strokeStyle = '#2ecc7188'; ctx.lineWidth = 2 / camZoom; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }

    const grad = ctx.createRadialGradient(px - 3 / camZoom, py - 3 / camZoom, 2 / camZoom, px, py, radius);
    if (owner === 'neutral') { grad.addColorStop(0, '#666'); grad.addColorStop(1, '#333'); }
    else { grad.addColorStop(0, color + 'ee'); grad.addColorStop(1, color + '88'); }
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = isHovered ? '#fff' : (owner === 'neutral' ? '#555' : color);
    ctx.lineWidth = (isHovered ? 2.5 : 1.5) / camZoom; ctx.stroke();

    const hl = ctx.createRadialGradient(px - radius * 0.3, py - radius * 0.3, 1 / camZoom, px, py, radius);
    hl.addColorStop(0, 'rgba(255,255,255,0.2)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fillStyle = hl; ctx.fill();

    // 城名
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4; ctx.fillStyle = '#fff';
    const fontSize = (isMyCity ? 12 : 11) / camZoom;
    ctx.font = `${isMyCity ? 'bold ' : ''}${fontSize}px "Noto Serif SC", "Microsoft YaHei"`;
    ctx.textAlign = 'center';
    ctx.fillText(city.name, px, py - radius - 7 / camZoom);
    ctx.restore();

    // 兵力
    ctx.fillStyle = owner === 'neutral' ? '#888' : '#ccc';
    ctx.font = `${10 / camZoom}px "Noto Serif SC", "Microsoft YaHei"`;
    ctx.textAlign = 'center';
    ctx.fillText(city.troops + '兵', px, py + 4 / camZoom);

    // 武将名字显示在城池下方（所有玩家的驻守武将都显示）
    const cityGens = s.cityGenerals && s.cityGenerals[i];
    if (cityGens && cityGens.length > 0) {
      const genFontSize = 9 / camZoom;
      ctx.font = `${genFontSize}px "Noto Serif SC", "Microsoft YaHei"`;
      ctx.textAlign = 'center';
      cityGens.forEach((g, gi) => {
        const genColor = g.rarity === 'gold' ? '#ffd700' : g.rarity === 'purple' ? '#a855f7' : g.rarity === 'blue' ? '#3b82f6' : '#aaa';
        ctx.fillStyle = genColor;
        ctx.fillText(`${g.icon}${g.name}`, px, py + (14 + gi * 11) / camZoom);
      });
    }
  });

  ctx.restore();

  if (!drawMap._rafScheduled) {
    drawMap._rafScheduled = true;
    requestAnimationFrame(() => { drawMap._rafScheduled = false; if (gameState) drawMap(); });
  }
}

function drawBackground() {
  drawMountainRegion(mapW * 0.10, mapH * 0.50, 90, 0.04, '🏔️');
  drawMountainRegion(mapW * 0.22, mapH * 0.62, 70, 0.03, '');
  drawMountainRegion(mapW * 0.14, mapH * 0.42, 60, 0.03, '');
  drawDesertRegion(mapW * 0.08, mapH * 0.15, 80);
  drawDesertRegion(mapW * 0.18, mapH * 0.22, 60);

  const plainGrad = ctx.createRadialGradient(mapW * 0.50, mapH * 0.38, 20, mapW * 0.50, mapH * 0.38, 160);
  plainGrad.addColorStop(0, 'rgba(255,215,0,0.025)'); plainGrad.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = plainGrad; ctx.beginPath(); ctx.arc(mapW * 0.50, mapH * 0.38, 160, 0, Math.PI * 2); ctx.fill();

  const waterGrad = ctx.createRadialGradient(mapW * 0.72, mapH * 0.56, 10, mapW * 0.72, mapH * 0.56, 100);
  waterGrad.addColorStop(0, 'rgba(52,152,219,0.04)'); waterGrad.addColorStop(1, 'rgba(52,152,219,0)');
  ctx.fillStyle = waterGrad; ctx.beginPath(); ctx.arc(mapW * 0.72, mapH * 0.56, 100, 0, Math.PI * 2); ctx.fill();

  // 长江
  ctx.save(); ctx.strokeStyle = 'rgba(52,152,219,0.18)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(mapW * 0.12, mapH * 0.62);
  ctx.quadraticCurveTo(mapW * 0.25, mapH * 0.58, mapW * 0.38, mapH * 0.62);
  ctx.quadraticCurveTo(mapW * 0.48, mapH * 0.58, mapW * 0.55, mapH * 0.56);
  ctx.quadraticCurveTo(mapW * 0.65, mapH * 0.53, mapW * 0.75, mapH * 0.55);
  ctx.quadraticCurveTo(mapW * 0.82, mapH * 0.58, mapW * 0.90, mapH * 0.60);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(52,152,219,0.08)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(mapW * 0.42, mapH * 0.60);
  ctx.quadraticCurveTo(mapW * 0.44, mapH * 0.55, mapW * 0.46, mapH * 0.50); ctx.stroke(); ctx.restore();

  // 黄河
  ctx.save(); ctx.strokeStyle = 'rgba(241,196,15,0.14)'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(mapW * 0.08, mapH * 0.22);
  ctx.quadraticCurveTo(mapW * 0.20, mapH * 0.30, mapW * 0.30, mapH * 0.28);
  ctx.quadraticCurveTo(mapW * 0.40, mapH * 0.26, mapW * 0.48, mapH * 0.30);
  ctx.quadraticCurveTo(mapW * 0.55, mapH * 0.25, mapW * 0.62, mapH * 0.22);
  ctx.quadraticCurveTo(mapW * 0.70, mapH * 0.16, mapW * 0.78, mapH * 0.14);
  ctx.stroke(); ctx.restore();

  // 区域标签
  ctx.save(); ctx.font = `${mapW < 500 ? 10 : 13}px "Noto Serif SC", "Microsoft YaHei"`; ctx.textAlign = 'center';
  const regions = [
    { name: '凉 州', x: 0.10, y: 0.10, color: 'rgba(241,196,15,0.12)' },
    { name: '司 隶', x: 0.42, y: 0.32, color: 'rgba(233,69,96,0.10)' },
    { name: '冀 州', x: 0.58, y: 0.16, color: 'rgba(52,152,219,0.10)' },
    { name: '幽 州', x: 0.72, y: 0.08, color: 'rgba(155,89,182,0.10)' },
    { name: '豫 州', x: 0.56, y: 0.42, color: 'rgba(230,126,34,0.10)' },
    { name: '荆 州', x: 0.42, y: 0.66, color: 'rgba(46,204,113,0.10)' },
    { name: '扬 州', x: 0.70, y: 0.50, color: 'rgba(52,152,219,0.10)' },
    { name: '益 州', x: 0.16, y: 0.55, color: 'rgba(46,204,113,0.10)' },
    { name: '兖 州', x: 0.54, y: 0.28, color: 'rgba(243,156,18,0.10)' },
  ];
  regions.forEach(r => { ctx.fillStyle = r.color; ctx.fillText(r.name, mapW * r.x, mapH * r.y); });
  ctx.restore();
}

function drawMountainRegion(cx, cy, size, alpha) {
  ctx.save(); ctx.globalAlpha = 1;
  const count = Math.floor(size / 20);
  for (let i = 0; i < count; i++) {
    const ox = cx + (Math.sin(i * 2.3) * size * 0.6);
    const oy = cy + (Math.cos(i * 1.7) * size * 0.4);
    const h = 10 + Math.random() * 14; const w = 8 + Math.random() * 10;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - w / 2, oy + h); ctx.lineTo(ox + w / 2, oy + h); ctx.closePath();
    ctx.fillStyle = `rgba(100,120,100,${alpha})`; ctx.fill();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - w / 4, oy + h * 0.3); ctx.lineTo(ox + w / 4, oy + h * 0.3); ctx.closePath();
    ctx.fillStyle = `rgba(200,210,220,${alpha * 0.8})`; ctx.fill();
  }
  ctx.restore();
}

function drawDesertRegion(cx, cy, size) {
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const ox = cx + Math.sin(i * 1.8) * size * 0.7;
    const oy = cy + Math.cos(i * 2.1) * size * 0.5;
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, 15 + Math.random() * 10);
    grad.addColorStop(0, 'rgba(210,180,100,0.04)'); grad.addColorStop(1, 'rgba(210,180,100,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(ox, oy, 20, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function onMapMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
  const tooltip = document.getElementById('city-tooltip');
  hoveredCity = null;
  if (gameState) {
    for (let i = 0; i < gameState.cities.length; i++) {
      const pos = cityPos(gameState.cities[i]);
      if (Math.hypot(mx - pos.x, my - pos.y) < 20 * camZoom) {
        hoveredCity = i;
        const city = gameState.cities[i];
        const owner = city.owner === 'neutral' ? '中立' : (gameState.players[city.owner]?.name || '?');
        const gens = gameState.cityGenerals && gameState.cityGenerals[i];
        const genInfo = gens && gens.length > 0 ? '<br>武将: ' + gens.map(g => `${g.icon}${g.name}`).join(', ') : '';
        tooltip.style.display = 'block';
        tooltip.style.left = (mx + 15) + 'px'; tooltip.style.top = (my - 10) + 'px';
        tooltip.innerHTML = `<strong>${city.name}</strong><br>兵力: ${city.troops}<br>所属: ${owner}${genInfo}${city.defBuff ? '<br>🏰 防御+' + Math.round(city.defBuff*100) + '%' : ''}`;
        break;
      }
    }
  }
  if (hoveredCity === null) tooltip.style.display = 'none';
  drawMap();
}

function onMapClick(e) {
  if (hoveredCity === null || !gameState) return;
  const city = gameState.cities[hoveredCity];
  const me = gameState.players[gameState.you];
  if (!me) return;
  if (city.owner === gameState.you) document.getElementById('selFrom').value = hoveredCity;
  else document.getElementById('selTo').value = hoveredCity;
}

function onMapWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
  const oldZoom = camZoom;
  camZoom = Math.max(CAM_MIN_ZOOM, Math.min(CAM_MAX_ZOOM, camZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
  camX = mx - (mx - camX) * (camZoom / oldZoom);
  camY = my - (my - camY) * (camZoom / oldZoom);
  clampCamera(); drawMap();
}

let _touches = [], _lastPinchDist = 0, _isPanning = false;
let _panStartX = 0, _panStartY = 0, _camStartX = 0, _camStartY = 0;
let _tapStart = 0, _tapX = 0, _tapY = 0, _moved = false;

function onTouchStart(e) {
  e.preventDefault(); _touches = Array.from(e.touches); _moved = false; _tapStart = Date.now();
  if (_touches.length === 1) {
    _isPanning = true; _panStartX = _touches[0].clientX; _panStartY = _touches[0].clientY;
    _tapX = _panStartX; _tapY = _panStartY; _camStartX = camX; _camStartY = camY;
  } else if (_touches.length === 2) {
    _isPanning = false;
    _lastPinchDist = Math.hypot(_touches[0].clientX - _touches[1].clientX, _touches[0].clientY - _touches[1].clientY);
  }
}

function onTouchMove(e) {
  e.preventDefault(); const touches = Array.from(e.touches);
  if (touches.length === 1 && _isPanning) {
    const dx = touches[0].clientX - _panStartX; const dy = touches[0].clientY - _panStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) _moved = true;
    camX = _camStartX + dx; camY = _camStartY + dy; clampCamera(); drawMap();
  } else if (touches.length === 2) {
    _moved = true;
    const dist = Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    if (_lastPinchDist > 0) {
      const oldZoom = camZoom;
      camZoom = Math.max(CAM_MIN_ZOOM, Math.min(CAM_MAX_ZOOM, camZoom * (dist / _lastPinchDist)));
      const rect = canvas.getBoundingClientRect();
      const cx = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
      const cy = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
      camX = cx - (cx - camX) * (camZoom / oldZoom); camY = cy - (cy - camY) * (camZoom / oldZoom);
      clampCamera();
    }
    _lastPinchDist = dist; drawMap();
  }
}

function onTouchEnd(e) {
  e.preventDefault();
  if (!_moved && Date.now() - _tapStart < 300) {
    const rect = canvas.getBoundingClientRect();
    handleTapAt(_tapX - rect.left, _tapY - rect.top);
  }
  _touches = Array.from(e.touches); _lastPinchDist = 0; _isPanning = false;
}

function handleTapAt(mx, my) {
  if (!gameState) return;
  let tapped = null;
  for (let i = 0; i < gameState.cities.length; i++) {
    const pos = cityPos(gameState.cities[i]);
    if (Math.hypot(mx - pos.x, my - pos.y) < 25 * camZoom) { tapped = i; break; }
  }
  if (tapped !== null) {
    hoveredCity = tapped;
    const city = gameState.cities[tapped];
    const owner = city.owner === 'neutral' ? '中立' : (gameState.players[city.owner]?.name || '?');
    showMobileToast(`${city.name} | ${city.troops}兵 | ${owner}`);
    const me = gameState.players[gameState.you];
    if (me) {
      if (city.owner === gameState.you) document.getElementById('selFrom').value = tapped;
      else document.getElementById('selTo').value = tapped;
    }
    drawMap();
  }
}

function clampCamera() {
  const totalW = mapW * camZoom; const totalH = mapH * camZoom; const margin = 50;
  camX = Math.max(-(totalW - margin), Math.min(mapW - margin, camX));
  camY = Math.max(-(totalH - margin), Math.min(mapH - margin, camY));
}

function resetCamera() { camZoom = 1; camX = 0; camY = 0; drawMap(); }

function zoomIn() {
  const oldZoom = camZoom; camZoom = Math.min(CAM_MAX_ZOOM, camZoom * 1.3);
  camX = mapW / 2 - (mapW / 2 - camX) * (camZoom / oldZoom);
  camY = mapH / 2 - (mapH / 2 - camY) * (camZoom / oldZoom);
  clampCamera(); drawMap();
}

function zoomOut() {
  const oldZoom = camZoom; camZoom = Math.max(CAM_MIN_ZOOM, camZoom / 1.3);
  camX = mapW / 2 - (mapW / 2 - camX) * (camZoom / oldZoom);
  camY = mapH / 2 - (mapH / 2 - camY) * (camZoom / oldZoom);
  clampCamera(); drawMap();
}

function showMobileToast(text) {
  let toast = document.getElementById('mobile-toast');
  if (!toast) {
    toast = document.createElement('div'); toast.id = 'mobile-toast';
    toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:rgba(12,12,26,0.95);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:999;border:1px solid #e9456044;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;';
    document.body.appendChild(toast);
  }
  toast.textContent = text; toast.style.opacity = '1';
  clearTimeout(toast._timer); toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// ========== 倒计时系统 ==========
let countdownInterval = null;

function startCountdown(turnDeadline, gameDeadline) {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const now = Date.now();
    const turnEl = document.getElementById('turnCountdown');
    if (turnEl && turnDeadline) {
      const turnLeft = Math.max(0, Math.ceil((turnDeadline - now) / 1000));
      turnEl.textContent = `⏱️ ${turnLeft}s`;
      turnEl.style.color = turnLeft <= 10 ? '#e74c3c' : '#f39c12';
    }
    const gameEl = document.getElementById('gameCountdown');
    if (gameEl && gameDeadline) {
      const gameLeft = Math.max(0, Math.ceil((gameDeadline - now) / 1000));
      const min = Math.floor(gameLeft / 60); const sec = gameLeft % 60;
      gameEl.textContent = `🕐 ${min}:${sec.toString().padStart(2, '0')}`;
      gameEl.style.color = gameLeft <= 60 ? '#e74c3c' : '#aaa';
    }
  }, 200);
}

function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  const turnEl = document.getElementById('turnCountdown');
  const gameEl = document.getElementById('gameCountdown');
  if (turnEl) turnEl.textContent = '';
  if (gameEl) gameEl.textContent = '结束';
}

function showScoreResult(scores, winner) {
  addLog(`⏰ 时间到！按得分结算`);
  addLog(`🏆 获胜者: ${winner}`);
  scores.forEach((s, i) => {
    addLog(`${i === 0 ? '👑' : '  '} ${s.name}: ${s.score}分`);
  });
  const modal = document.getElementById('score-modal');
  if (modal) {
    const body = document.getElementById('score-body');
    body.innerHTML = `
      <div style="text-align:center;margin-bottom:16px">
        <div style="font-size:2em">🏆</div>
        <div style="font-size:1.3em;color:#ffd700;margin:8px 0">${winner} 获胜！</div>
      </div>
      <table class="score-table">
        <tr><th>排名</th><th>玩家</th><th>城池分(70%)</th><th>兵力分(30%)</th><th>总分</th></tr>
        ${scores.map((s, i) => `<tr style="color:${s.color}"><td>${i + 1}</td><td>${s.name}</td><td>${s.cityCount}城 → ${s.cityScore}</td><td>${s.troops}兵 → ${s.troopScore}</td><td style="font-weight:bold">${s.score}</td></tr>`).join('')}
      </table>`;
    modal.style.display = 'flex';
  }
}

function closeScoreModal() { document.getElementById('score-modal').style.display = 'none'; }

// ========== 抽卡系统 ==========
function doDraw() { ws.send(JSON.stringify({ type: 'draw' })); }

function showDrawResult(cards, log) {
  // 收集金卡，依次全屏展示后再显示抽卡面板
  const goldCards = cards.filter(c => c.type === 'general' && c.rarity === 'gold' && c.image);

  function showGoldSequence(index) {
    if (index < goldCards.length) {
      showGoldSplash(goldCards[index], () => showGoldSequence(index + 1));
    } else {
      showDrawPanel(cards, log);
    }
  }

  if (goldCards.length > 0) {
    showGoldSequence(0);
  } else {
    showDrawPanel(cards, log);
  }
}

function showDrawPanel(cards, log) {
  const modal = document.getElementById('draw-modal');
  const container = document.getElementById('draw-cards');
  container.innerHTML = cards.map((card, i) => {
    const delay = i * 0.3;
    if (card.type === 'general') {
      const isGold = card.rarity === 'gold';
      const rarityClass = card.rarity;
      const rarityName = card.rarity === 'gold' ? '金卡' : card.rarity === 'purple' ? '紫卡' : '蓝卡';
      return `<div class="draw-card ${rarityClass} ${isGold ? 'gold-effect' : ''}" style="animation-delay:${delay}s">
        ${isGold && card.image ? `<img src="${card.image}" class="card-hero-img" alt="${card.name}">` : `<div class="card-icon-big">${card.icon}</div>`}
        <div class="card-rarity-tag ${rarityClass}">${rarityName}</div>
        <div class="card-name-tag">${card.name}</div>
        <div class="card-stats-tag">攻${card.attack} 防${card.defense} 谋${card.strategy}</div>
      </div>`;
    } else if (card.type === 'skill') {
      return `<div class="draw-card skill-card" style="animation-delay:${delay}s">
        <div class="card-icon-big">${card.icon}</div>
        <div class="card-rarity-tag skill">技能卡</div>
        <div class="card-name-tag">${card.name}</div>
        <div class="card-stats-tag">${card.desc}</div>
      </div>`;
    } else if (card.type === 'gold') {
      return `<div class="draw-card gold-coin-card" style="animation-delay:${delay}s">
        <div class="card-icon-big">💰</div><div class="card-rarity-tag gold-coin">金币</div>
        <div class="card-name-tag">${card.amount}</div><div class="card-stats-tag">金币入库</div>
      </div>`;
    } else {
      return `<div class="draw-card troops-card" style="animation-delay:${delay}s">
        <div class="card-icon-big">⚔️</div><div class="card-rarity-tag troops">将士</div>
        <div class="card-name-tag">${card.amount}</div><div class="card-stats-tag">兵力补充</div>
      </div>`;
    }
  }).join('');
  modal.style.display = 'flex';
  log.forEach(l => addLog('🎴 ' + l));
}

function closeDrawModal() { document.getElementById('draw-modal').style.display = 'none'; }

// ========== 金卡全屏展示 ==========
function showGoldSplash(card, callback) {
  let splash = document.getElementById('gold-splash');
  if (!splash) {
    splash = document.createElement('div');
    splash.id = 'gold-splash';
    document.body.appendChild(splash);
  }
  splash.innerHTML = `
    <div class="gold-splash-bg"></div>
    <div class="gold-splash-rays"></div>
    <div class="gold-splash-content">
      <img src="${card.image}" class="gold-splash-img" alt="${card.name}">
      <div class="gold-splash-info">
        <div class="gold-splash-rarity">★★★★★ 金卡武将</div>
        <div class="gold-splash-name">${card.name}</div>
        <div class="gold-splash-stats">攻 ${card.attack} · 防 ${card.defense} · 谋 ${card.strategy}</div>
      </div>
    </div>
    <div class="gold-splash-particles" id="gold-particles"></div>
  `;
  splash.style.display = 'flex';
  splash.classList.remove('gold-splash-exit');
  splash.classList.add('gold-splash-enter');

  // 生成粒子
  const particleContainer = document.getElementById('gold-particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'gold-particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 2 + 's';
    p.style.animationDuration = (2 + Math.random() * 3) + 's';
    particleContainer.appendChild(p);
  }

  // 弹幕特效
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      addLog(`🌟✨ 天降金卡！${card.icon} ${card.name} 降临战场！✨🌟`);
    }, i * 400);
  }

  // 点击或3.5秒后关闭（只触发一次）
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    splash.classList.remove('gold-splash-enter');
    splash.classList.add('gold-splash-exit');
    setTimeout(() => {
      splash.style.display = 'none';
      splash.innerHTML = '';
      if (callback) callback();
    }, 500);
  };
  splash.onclick = close;
  setTimeout(close, 3500);
}

// ========== 技能卡使用 ==========
function useSkillCard(skillId) {
  if (!gameState || gameState.currentTurn !== gameState.you) { addLog('❌ 不是你的回合'); return; }
  const me = gameState.players[gameState.you];
  const skill = me.skillCards.find(s => s.id === skillId);
  if (!skill) return;

  switch (skillId) {
    case 'skill_charge': showChargeModal(); break;
    case 'skill_runan': ws.send(JSON.stringify({ type: 'useSkill', skillId })); break;
    case 'skill_transfer': showTransferModal(); break;
    case 'skill_fortify': showFortifyModal(); break;
    case 'skill_fire': case 'skill_borrow': case 'skill_chain': case 'skill_beauty':
      showEnemyCityModal(skillId, skill.name); break;
    case 'skill_defect': showDefectModal(); break;
    case 'skill_trap': showTrapModal(); break;
    default: ws.send(JSON.stringify({ type: 'useSkill', skillId })); break;
  }
}

// 子午谷奇谋弹窗：选择出发城池、武将、兵力、目标城池
function showChargeModal() {
  const me = gameState.players[gameState.you];
  const s = gameState;
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = '🏇 子午谷奇谋';
  body.innerHTML = `
    <div class="section"><label>出发城池:</label>
      <select id="chargeFrom" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${s.cities[cid].name} (${s.cities[cid].troops}兵)</option>`).join('')}
      </select></div>
    <div class="section" style="margin-top:10px"><label>目标城池:</label>
      <select id="chargeTo" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${s.cities.filter(c => c.owner !== s.you).map(c => `<option value="${c.id}">${c.name} (${c.troops}兵)</option>`).join('')}
      </select></div>
    <div class="section" style="margin-top:10px"><label>武将:</label>
      <select id="chargeGeneral" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        <option value="">不派武将</option>
        ${me.generals.map(g => `<option value="${g.name}">${g.icon} ${g.name} (攻${g.attack} 防${g.defense})</option>`).join('')}
      </select></div>
    <div class="section" style="margin-top:10px"><label>出兵数量:</label>
      <input type="number" id="chargeTroops" value="3000" min="500" step="500" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px"></div>
    <p style="color:#f39c12;font-size:0.8em;margin-top:8px">⚡ 无视路线限制，战力+10%</p>
    <button class="btn btn-attack" onclick="confirmCharge()" style="width:100%;margin-top:12px">🏇 发动奇谋</button>`;
  modal.style.display = 'flex';
}

function confirmCharge() {
  const fromCity = parseInt(document.getElementById('chargeFrom').value);
  const toCity = parseInt(document.getElementById('chargeTo').value);
  const troops = parseInt(document.getElementById('chargeTroops').value);
  const general = document.getElementById('chargeGeneral').value;
  ws.send(JSON.stringify({ type: 'useSkill', skillId: 'skill_charge', fromCity, toCity, troops, general }));
  closeSkillModal();
}

function showTransferModal() {
  const me = gameState.players[gameState.you];
  const s = gameState;
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = '📦 调兵遣将';
  body.innerHTML = `
    <div class="section"><label>从哪座城池调兵:</label>
      <select id="transferFrom" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${s.cities[cid].name} (${s.cities[cid].troops}兵)</option>`).join('')}
      </select></div>
    <div class="section" style="margin-top:10px"><label>调往哪座城池:</label>
      <select id="transferTo" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${s.cities[cid].name} (${s.cities[cid].troops}兵)</option>`).join('')}
      </select></div>
    <div class="section" style="margin-top:10px"><label>调兵数量:</label>
      <input type="number" id="transferTroops" value="2000" min="500" step="500" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px"></div>
    <button class="btn btn-attack" onclick="confirmTransfer()" style="width:100%;margin-top:12px">确认调兵</button>`;
  modal.style.display = 'flex';
}

function confirmTransfer() {
  const fromCity = parseInt(document.getElementById('transferFrom').value);
  const toCity = parseInt(document.getElementById('transferTo').value);
  const troops = parseInt(document.getElementById('transferTroops').value);
  ws.send(JSON.stringify({ type: 'useSkill', skillId: 'skill_transfer', fromCity, toCity, troops }));
  closeSkillModal();
}

function showFortifyModal() {
  const me = gameState.players[gameState.you];
  const s = gameState;
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = '🏰 固若金汤';
  body.innerHTML = `
    <div class="section"><label>选择要加固的城池:</label>
      <select id="fortifyCity" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${s.cities[cid].name} (${s.cities[cid].troops}兵)</option>`).join('')}
      </select></div>
    <button class="btn btn-recruit" onclick="confirmFortify()" style="width:100%;margin-top:12px">确认加固 (防御+30%)</button>`;
  modal.style.display = 'flex';
}

function confirmFortify() {
  const cityId = parseInt(document.getElementById('fortifyCity').value);
  ws.send(JSON.stringify({ type: 'useSkill', skillId: 'skill_fortify', cityId }));
  closeSkillModal();
}

// 通用敌方城池选择弹窗（火攻、草船借箭、连环计、美人计）
function showEnemyCityModal(skillId, skillName) {
  const s = gameState;
  const enemyCities = s.cities.filter(c => c.owner !== s.you && c.owner !== 'neutral');
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = skillName;
  body.innerHTML = `
    <div class="section"><label>选择敌方城池:</label>
      <select id="enemyCitySelect" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${enemyCities.map(c => `<option value="${c.id}">${c.name} (${c.troops}兵) - ${s.players[c.owner]?.name || '?'}</option>`).join('')}
      </select></div>
    <button class="btn btn-attack" onclick="confirmEnemyCity('${skillId}')" style="width:100%;margin-top:12px">确认使用</button>`;
  modal.style.display = 'flex';
}

function confirmEnemyCity(skillId) {
  const cityId = parseInt(document.getElementById('enemyCitySelect').value);
  ws.send(JSON.stringify({ type: 'useSkill', skillId, cityId }));
  closeSkillModal();
}

// 离间计弹窗
function showDefectModal() {
  const s = gameState;
  const enemies = Object.entries(s.players).filter(([id]) => id !== s.you);
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = '🗣️ 离间计';
  body.innerHTML = `
    <div class="section"><label>选择敌方玩家:</label>
      <select id="defectTarget" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${enemies.map(([id, p]) => `<option value="${id}">${p.name} (${p.generals?.length || 0}名武将)</option>`).join('')}
      </select></div>
    <button class="btn btn-attack" onclick="confirmDefect()" style="width:100%;margin-top:12px">确认离间</button>`;
  modal.style.display = 'flex';
}

function confirmDefect() {
  const targetPlayer = document.getElementById('defectTarget').value;
  ws.send(JSON.stringify({ type: 'useSkill', skillId: 'skill_defect', targetPlayer }));
  closeSkillModal();
}

// 十面埋伏弹窗
function showTrapModal() {
  const me = gameState.players[gameState.you];
  const s = gameState;
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = '⚡ 十面埋伏';
  body.innerHTML = `
    <div class="section"><label>选择设伏城池:</label>
      <select id="trapCity" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${s.cities[cid].name} (${s.cities[cid].troops}兵)</option>`).join('')}
      </select></div>
    <button class="btn btn-attack" onclick="confirmTrap()" style="width:100%;margin-top:12px">确认设伏</button>`;
  modal.style.display = 'flex';
}

function confirmTrap() {
  const cityId = parseInt(document.getElementById('trapCity').value);
  ws.send(JSON.stringify({ type: 'useSkill', skillId: 'skill_trap', cityId }));
  closeSkillModal();
}

function closeSkillModal() { document.getElementById('skill-modal').style.display = 'none'; }

// ========== 存档功能 ==========
function saveGame() { ws.send(JSON.stringify({ type: 'save' })); }
function listSaves() { ws.send(JSON.stringify({ type: 'listSaves' })); }
function loadSave(filename) {
  if (confirm('加载存档后，所有玩家需要用存档中的名字重新加入，确定？')) {
    ws.send(JSON.stringify({ type: 'loadSave', filename })); closeSaveModal();
  }
}
function deleteSave(filename) {
  if (confirm('确定删除此存档？')) ws.send(JSON.stringify({ type: 'deleteSave', filename }));
}
function openSaveModal() { document.getElementById('save-modal').style.display = 'flex'; listSaves(); }
function closeSaveModal() { document.getElementById('save-modal').style.display = 'none'; }

function renderSaveList(saves) {
  const list = document.getElementById('save-list');
  if (!saves || saves.length === 0) { list.innerHTML = '<div style="color:#888;text-align:center;padding:20px">暂无存档</div>'; return; }
  list.innerHTML = saves.map(s => `
    <div class="save-item">
      <div class="save-info">
        <span class="save-time">${new Date(s.savedAt).toLocaleString()}</span>
        <span class="save-detail">第${s.round}回合 · ${s.playerCount}名玩家 · ${s.playerNames.join('、')}</span>
      </div>
      <div class="save-actions">
        <button class="btn btn-load" onclick="loadSave('${s.filename}')">📂 加载</button>
        <button class="btn btn-del" onclick="deleteSave('${s.filename}')">🗑️</button>
      </div>
    </div>`).join('');
}

// ========== 联机重连 ==========
function showRejoinScreen(playerNames, msg) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  document.getElementById('waiting-info').style.display = 'block';
  document.getElementById('playing-actions').style.display = 'none';
  const waitingInfo = document.getElementById('waiting-info');
  waitingInfo.innerHTML = `
    <p>📂 存档已加载</p>
    <p style="color:#e94560;margin:10px 0">需要以下玩家重新加入:</p>
    <div id="rejoin-names" style="margin:10px 0">
      ${playerNames.map(n => `<span class="rejoin-name pending">${n}</span>`).join(' ')}
    </div>
    <div style="margin:15px 0">
      <label style="color:#aaa;font-size:0.85em">选择你的身份:</label>
      <select id="rejoinSelect" style="width:100%;padding:8px;margin-top:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px">
        ${playerNames.map(n => `<option value="${n}">${n}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-start" onclick="doRejoin()" style="width:100%">🔗 重新加入游戏</button>
    <div id="rejoin-status" style="margin-top:12px;font-size:0.85em;color:#888"></div>`;
}

function doRejoin() {
  const name = document.getElementById('rejoinSelect').value;
  ws.send(JSON.stringify({ type: 'rejoin', name }));
}

function updateRejoinStatus(joined, needed, remaining) {
  const namesDiv = document.getElementById('rejoin-names');
  if (namesDiv) {
    namesDiv.innerHTML = needed.map(n => {
      const isJoined = joined.includes(n);
      return `<span class="rejoin-name ${isJoined ? 'joined' : 'pending'}">${isJoined ? '✅' : '⏳'} ${n}</span>`;
    }).join(' ');
  }
  const statusDiv = document.getElementById('rejoin-status');
  if (statusDiv) statusDiv.textContent = remaining.length > 0 ? `等待: ${remaining.join('、')}` : '所有玩家已到齐！';
  const select = document.getElementById('rejoinSelect');
  if (select) {
    const currentVal = select.value;
    const available = needed.filter(n => !joined.includes(n));
    select.innerHTML = available.map(n => `<option value="${n}">${n}</option>`).join('');
    if (available.includes(currentVal)) select.value = currentVal;
  }
}

// ========== 聊天系统 ==========
let chatVisible = false;

function toggleChat() {
  chatVisible = !chatVisible;
  document.getElementById('chat-box').style.display = chatVisible ? 'flex' : 'none';
  if (chatVisible) {
    const msgs = document.getElementById('chat-messages');
    msgs.scrollTop = msgs.scrollHeight;
    document.getElementById('chatInput').focus();
  }
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'chat', text }));
  input.value = '';
}

function renderChatMessage(msg) {
  const msgs = document.getElementById('chat-messages');
  if (!msgs) return;
  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `<span class="chat-name" style="color:${msg.color}">${msg.name}</span> ${msg.text}`;
  msgs.appendChild(el);
  while (msgs.children.length > 100) msgs.removeChild(msgs.firstChild);
  msgs.scrollTop = msgs.scrollHeight;
  if (!chatVisible) addLog(`💬 ${msg.name}: ${msg.text}`);
}

// ========== 帮助弹窗（从 README.md 加载） ==========
function openHelp() {
  const modal = document.getElementById('help-modal');
  modal.style.display = 'flex';
  const body = modal.querySelector('.help-body');
  body.innerHTML = '<p style="color:#888;text-align:center;padding:20px">加载中...</p>';
  fetch('/api/readme')
    .then(r => r.json())
    .then(data => {
      // 过滤掉"本地运行"和"技术栈"等非游戏内容
      const filtered = data.content.replace(/## 本地运行[\s\S]*$/m, '').trim();
      body.innerHTML = renderMarkdown(filtered);
    })
    .catch(() => {
      body.innerHTML = '<p style="color:#e74c3c;text-align:center;padding:20px">加载失败</p>';
    });
}

function closeHelp() { document.getElementById('help-modal').style.display = 'none'; }

// 简易 Markdown 渲染
function renderMarkdown(md) {
  let html = md
    .replace(/^### (.+)$/gm, '<div class="help-title" style="margin-top:12px">$1</div>')
    .replace(/^## (.+)$/gm, '<div class="help-title" style="font-size:1.1em;margin-top:16px;color:#e94560">$1</div>')
    .replace(/^# (.+)$/gm, '<div style="font-size:1.3em;color:#ffd700;margin-bottom:8px">$1</div>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\| .+$/gm, (line) => {
      if (line.match(/^\|\s*-+/)) return '';
      const cells = line.split('|').filter(c => c.trim());
      return '<tr>' + cells.map(c => `<td style="padding:3px 8px;border-bottom:1px solid #333">${c.trim()}</td>`).join('') + '</tr>';
    })
    .replace(/```[\s\S]*?```/g, (block) => {
      const code = block.replace(/```\w*\n?/g, '').replace(/```/g, '');
      return `<pre style="background:#0a0a18;padding:8px;border-radius:6px;font-size:0.8em;overflow-x:auto">${code}</pre>`;
    })
    .replace(/^- (.+)$/gm, '<p style="padding-left:12px">• $1</p>')
    .replace(/^\d+\. (.+)$/gm, (m, p1, offset, str) => `<p style="padding-left:12px">${m}</p>`)
    .replace(/\n\n/g, '<br>');

  // 包裹表格
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, (match) => {
    if (!match.startsWith('<table')) return `<table style="width:100%;border-collapse:collapse;font-size:0.82em;margin:8px 0">${match}</table>`;
    return match;
  });

  return `<div style="padding:12px;font-size:0.85em;line-height:1.6;color:#ccc">${html}</div>`;
}
