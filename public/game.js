// ========== 连接与状态 ==========
let ws, playerId, gameState = null;
let selectedCity = null;
let hoveredCity = null;
let playerName = '';
let currentRoomId = null;

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };
  ws.onclose = () => {
    addLog('⚠️ 与服务器断开连接');
  };
  return new Promise(resolve => { ws.onopen = resolve; });
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
      <div class="room-info">
        <span>👥 ${r.playerCount}/${r.maxPlayers}</span>
        <span>${r.players.join(', ')}</span>
      </div>
      <button class="btn btn-attack" style="padding:4px 12px;font-size:13px">加入</button>
    </div>
  `).join('');
}

function leaveRoom() {
  if (ws) ws.close();
  playerId = null;
  gameState = null;
  currentRoomId = null;
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('lobby-screen').style.display = 'block';
  document.getElementById('waiting-info').style.display = 'block';
  document.getElementById('playing-actions').style.display = 'none';
  connectWS();
}

// 兼容旧的 joinGame
function joinGame() { goToLobby(); }

function handleMessage(msg) {
  switch (msg.type) {
    case 'roomList':
      renderRoomList(msg.rooms);
      break;
    case 'joined':
      playerId = msg.playerId;
      currentRoomId = msg.roomId;
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('lobby-screen').style.display = 'none';
      document.getElementById('game-screen').style.display = 'block';
      document.getElementById('roomCode').textContent = msg.roomId;
      initCanvas();
      addLog('✅ 已加入房间 ' + msg.roomId);
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
    case 'state':
      gameState = msg.data;
      updateUI();
      drawMap();
      break;
    case 'battleLog':
      msg.log.forEach(l => addLog(l));
      break;
    case 'gameOver':
      addLog(`🎉 ${msg.winner} 一统天下！游戏结束！`);
      stopCountdown();
      break;
    case 'gameOverScore':
      showScoreResult(msg.scores, msg.winner);
      stopCountdown();
      break;
    case 'error':
      addLog(`❌ ${msg.msg}`);
      break;
    case 'info':
      addLog(`ℹ️ ${msg.msg}`);
      break;
    case 'saveList':
      renderSaveList(msg.saves);
      break;
    case 'loaded':
      playerId = msg.playerId;
      addLog('📂 存档加载成功，房间: ' + msg.roomId);
      break;
    case 'needRejoin':
      showRejoinScreen(msg.playerNames, msg.msg);
      break;
    case 'rejoinStatus':
      updateRejoinStatus(msg.joined, msg.needed, msg.remaining);
      break;
    case 'drawResult':
      showDrawResult(msg.cards, msg.log);
      break;
  }
}

function startGame() { ws.send(JSON.stringify({ type: 'start' })); }
function endTurn() { ws.send(JSON.stringify({ type: 'endTurn' })); }

function doAttack() {
  const from = parseInt(document.getElementById('selFrom').value);
  const to = parseInt(document.getElementById('selTo').value);
  const troops = parseInt(document.getElementById('troopCount').value);
  const general = document.getElementById('selGeneral').value;
  ws.send(JSON.stringify({ type: 'attack', from, to, troops, general }));
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

  // 启动倒计时显示
  startCountdown(s.turnDeadline, s.gameDeadline);
  
  const me = s.players[s.you];
  if (me) document.getElementById('goldInfo').textContent = `💰 ${me.gold}`;

  // 玩家列表
  const pl = document.getElementById('players-list');
  pl.innerHTML = Object.entries(s.players).map(([id, p]) =>
    `<span class="player-tag" style="background:${p.color}33;border:1px solid ${p.color}">
      <span class="player-dot" style="background:${p.color}"></span>
      ${p.name} (${p.cityCount}城)${id === s.you ? ' 👈' : ''}
    </span>`
  ).join('');

  // 更新下拉框
  if (me) {
    const selFrom = document.getElementById('selFrom');
    const prevFrom = selFrom.value;
    selFrom.innerHTML = me.cities.map(cid =>
      `<option value="${cid}">${s.cities[cid].name} (${s.cities[cid].troops}兵)</option>`
    ).join('');
    if (prevFrom && me.cities.includes(parseInt(prevFrom))) selFrom.value = prevFrom;

    // 目标城池：所有非己方城池
    const selTo = document.getElementById('selTo');
    const prevTo = selTo.value;
    selTo.innerHTML = s.cities
      .filter(c => c.owner !== s.you)
      .map(c => `<option value="${c.id}">${c.name} (${c.troops}兵) ${c.owner === 'neutral' ? '中立' : ''}</option>`)
      .join('');
    if (prevTo) selTo.value = prevTo;

    // 武将
    const selG = document.getElementById('selGeneral');
    selG.innerHTML = '<option value="">不派武将</option>' +
      me.generals.map(g => {
        const rarityTag = g.rarity === 'gold' ? '🥇' : g.rarity === 'purple' ? '🟣' : g.rarity === 'blue' ? '🔵' : '';
        return `<option value="${g.name}">${rarityTag}${g.icon} ${g.name} (攻${g.attack} 防${g.defense})</option>`;
      }).join('');

    // 抽卡按钮状态
    const btnDraw = document.getElementById('btnDraw');
    if (btnDraw) {
      if (isMyTurn && !me.hasDrawn) {
        btnDraw.disabled = false;
        btnDraw.textContent = '🎴 五连抽卡';
      } else if (isMyTurn && me.hasDrawn) {
        btnDraw.disabled = true;
        btnDraw.textContent = '🎴 本回合已抽';
      } else {
        btnDraw.disabled = true;
        btnDraw.textContent = '🎴 五连抽卡';
      }
    }

    // 技能卡列表
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
  const log = document.getElementById('battle-log');
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

// ========== Canvas 地图绘制 ==========
let canvas, ctx;
let mapW, mapH;

function initCanvas() {
  canvas = document.getElementById('gameMap');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); drawMap(); });
  canvas.addEventListener('mousemove', onMapMouseMove);
  canvas.addEventListener('click', onMapClick);
  // 移动端触摸支持
  canvas.addEventListener('touchstart', onMapTouch, { passive: false });
  canvas.addEventListener('touchmove', onMapTouchMove, { passive: false });
}

function resizeCanvas() {
  const container = document.getElementById('map-container');
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mapW = w;
  mapH = h;
}

function cityPos(city) {
  return { x: city.x / 100 * mapW, y: city.y / 100 * mapH };
}

function drawMap() {
  if (!gameState || !ctx) return;
  const s = gameState;
  ctx.clearRect(0, 0, mapW, mapH);

  drawBackground();

  // 绘制路线 - 带渐变的连线
  s.routes.forEach(([a, b]) => {
    const pa = cityPos(s.cities[a]);
    const pb = cityPos(s.cities[b]);
    const ownerA = s.cities[a].owner;
    const ownerB = s.cities[b].owner;
    const colorA = s.players[ownerA]?.color || '#333';
    const colorB = s.players[ownerB]?.color || '#333';
    const sameOwner = ownerA === ownerB && ownerA !== 'neutral';

    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    if (sameOwner) {
      const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      grad.addColorStop(0, colorA + '55');
      grad.addColorStop(1, colorB + '55');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();

    // 虚线效果 for neutral routes
    if (!sameOwner) {
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  // 绘制城池
  const time = Date.now() * 0.001;
  s.cities.forEach((city, i) => {
    const pos = cityPos(city);
    const owner = city.owner;
    const player = s.players[owner];
    const color = player ? player.color : '#555';
    const isMyCity = owner === s.you;
    const isHovered = hoveredCity === i;
    const baseR = isMyCity ? 17 : 13;
    const radius = isHovered ? baseR + 3 : baseR;

    // 外层脉冲光晕（己方城池）
    if (isMyCity) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 2 + i);
      const glowR = radius + 12 + pulse * 4;
      const glow = ctx.createRadialGradient(pos.x, pos.y, radius, pos.x, pos.y, glowR);
      glow.addColorStop(0, color + '30');
      glow.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
    }

    // 防御buff光环
    if (city.defBuff && city.defBuff > 0) {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#2ecc71' + '88';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 城池主体 - 渐变填充
    const grad = ctx.createRadialGradient(pos.x - 3, pos.y - 3, 2, pos.x, pos.y, radius);
    if (owner === 'neutral') {
      grad.addColorStop(0, '#666');
      grad.addColorStop(1, '#333');
    } else {
      grad.addColorStop(0, color + 'ee');
      grad.addColorStop(1, color + '88');
    }
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 边框
    ctx.strokeStyle = isHovered ? '#fff' : (owner === 'neutral' ? '#555' : color);
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    ctx.stroke();

    // 内部高光
    const hl = ctx.createRadialGradient(pos.x - radius * 0.3, pos.y - radius * 0.3, 1, pos.x, pos.y, radius);
    hl.addColorStop(0, 'rgba(255,255,255,0.2)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = hl;
    ctx.fill();

    // 城名 - 带阴影
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#fff';
    const isMobile = mapW < 500;
    const nameFontSize = isMobile ? (isMyCity ? 10 : 9) : (isMyCity ? 12 : 11);
    ctx.font = `${isMyCity ? 'bold ' : ''}${nameFontSize}px "Noto Serif SC", "Microsoft YaHei"`;
    ctx.textAlign = 'center';
    ctx.fillText(city.name, pos.x, pos.y - radius - 7);
    ctx.restore();

    // 兵力
    ctx.fillStyle = owner === 'neutral' ? '#888' : '#ccc';
    const troopFontSize = isMobile ? 8 : 10;
    ctx.font = `${troopFontSize}px "Noto Serif SC", "Microsoft YaHei"`;
    ctx.textAlign = 'center';
    ctx.fillText(city.troops + '兵', pos.x, pos.y + 4);

    // 武将指示点（己方城池有武将驻守时）
    if (isMyCity) {
      const me = s.players[s.you];
      const generals = me?.generals?.filter(g => g.cityId === i) || [];
      if (generals.length > 0) {
        generals.forEach((g, gi) => {
          const dotX = pos.x + radius + 4 + gi * 8;
          const dotY = pos.y - 4;
          const dotColor = g.rarity === 'gold' ? '#ffd700' : g.rarity === 'purple' ? '#a855f7' : g.rarity === 'blue' ? '#3b82f6' : '#aaa';
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
          ctx.fillStyle = dotColor;
          ctx.fill();
        });
      }
    }
  });

  // 动画帧 - 使用标记避免重复调度
  if (!drawMap._rafScheduled) {
    drawMap._rafScheduled = true;
    requestAnimationFrame(() => {
      drawMap._rafScheduled = false;
      if (gameState) drawMap();
    });
  }
}

function drawBackground() {
  // === 地形区域 ===
  // 蜀地山区 (西南)
  drawMountainRegion(mapW * 0.10, mapH * 0.50, 90, 0.04, '🏔️');
  drawMountainRegion(mapW * 0.22, mapH * 0.62, 70, 0.03, '');
  drawMountainRegion(mapW * 0.14, mapH * 0.42, 60, 0.03, '');

  // 西凉荒漠 (左上)
  drawDesertRegion(mapW * 0.08, mapH * 0.15, 80);
  drawDesertRegion(mapW * 0.18, mapH * 0.22, 60);

  // 中原平原微光
  const plainGrad = ctx.createRadialGradient(mapW * 0.50, mapH * 0.38, 20, mapW * 0.50, mapH * 0.38, 160);
  plainGrad.addColorStop(0, 'rgba(255,215,0,0.025)');
  plainGrad.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = plainGrad;
  ctx.beginPath();
  ctx.arc(mapW * 0.50, mapH * 0.38, 160, 0, Math.PI * 2);
  ctx.fill();

  // 江东水乡
  const waterGrad = ctx.createRadialGradient(mapW * 0.72, mapH * 0.56, 10, mapW * 0.72, mapH * 0.56, 100);
  waterGrad.addColorStop(0, 'rgba(52,152,219,0.04)');
  waterGrad.addColorStop(1, 'rgba(52,152,219,0)');
  ctx.fillStyle = waterGrad;
  ctx.beginPath();
  ctx.arc(mapW * 0.72, mapH * 0.56, 100, 0, Math.PI * 2);
  ctx.fill();

  // === 长江 ===
  ctx.save();
  ctx.strokeStyle = 'rgba(52,152,219,0.18)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  // 长江从蜀地向东流经荆州、江夏、到建业、会稽
  ctx.moveTo(mapW * 0.12, mapH * 0.62);
  ctx.quadraticCurveTo(mapW * 0.25, mapH * 0.58, mapW * 0.38, mapH * 0.62);
  ctx.quadraticCurveTo(mapW * 0.48, mapH * 0.58, mapW * 0.55, mapH * 0.56);
  ctx.quadraticCurveTo(mapW * 0.65, mapH * 0.53, mapW * 0.75, mapH * 0.55);
  ctx.quadraticCurveTo(mapW * 0.82, mapH * 0.58, mapW * 0.90, mapH * 0.60);
  ctx.stroke();
  // 长江支流
  ctx.strokeStyle = 'rgba(52,152,219,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mapW * 0.42, mapH * 0.60);
  ctx.quadraticCurveTo(mapW * 0.44, mapH * 0.55, mapW * 0.46, mapH * 0.50);
  ctx.stroke();
  ctx.restore();

  // === 黄河 ===
  ctx.save();
  ctx.strokeStyle = 'rgba(241,196,15,0.14)';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  // 黄河从西凉向东，经关中北部，折向东北
  ctx.moveTo(mapW * 0.08, mapH * 0.22);
  ctx.quadraticCurveTo(mapW * 0.20, mapH * 0.30, mapW * 0.30, mapH * 0.28);
  ctx.quadraticCurveTo(mapW * 0.40, mapH * 0.26, mapW * 0.48, mapH * 0.30);
  ctx.quadraticCurveTo(mapW * 0.55, mapH * 0.25, mapW * 0.62, mapH * 0.22);
  ctx.quadraticCurveTo(mapW * 0.70, mapH * 0.16, mapW * 0.78, mapH * 0.14);
  ctx.stroke();
  ctx.restore();

  // === 区域标签 ===
  ctx.save();
  ctx.font = `${mapW < 500 ? 10 : 13}px "Noto Serif SC", "Microsoft YaHei"`;
  ctx.textAlign = 'center';

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

  regions.forEach(r => {
    ctx.fillStyle = r.color;
    ctx.fillText(r.name, mapW * r.x, mapH * r.y);
  });
  ctx.restore();
}

function drawMountainRegion(cx, cy, size, alpha, emoji) {
  // 山脉区域 - 三角形群
  ctx.save();
  ctx.globalAlpha = 1;
  const count = Math.floor(size / 20);
  for (let i = 0; i < count; i++) {
    const ox = cx + (Math.sin(i * 2.3) * size * 0.6);
    const oy = cy + (Math.cos(i * 1.7) * size * 0.4);
    const h = 10 + Math.random() * 14;
    const w = 8 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox - w / 2, oy + h);
    ctx.lineTo(ox + w / 2, oy + h);
    ctx.closePath();
    ctx.fillStyle = `rgba(100,120,100,${alpha})`;
    ctx.fill();
    // 雪顶
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox - w / 4, oy + h * 0.3);
    ctx.lineTo(ox + w / 4, oy + h * 0.3);
    ctx.closePath();
    ctx.fillStyle = `rgba(200,210,220,${alpha * 0.8})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawDesertRegion(cx, cy, size) {
  // 荒漠区域 - 沙丘点
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const ox = cx + Math.sin(i * 1.8) * size * 0.7;
    const oy = cy + Math.cos(i * 2.1) * size * 0.5;
    const grad = ctx.createRadialGradient(ox, oy, 2, ox, oy, 15 + Math.random() * 10);
    grad.addColorStop(0, 'rgba(210,180,100,0.04)');
    grad.addColorStop(1, 'rgba(210,180,100,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ox, oy, 20, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function onMapMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tooltip = document.getElementById('city-tooltip');

  hoveredCity = null;
  if (gameState) {
    for (let i = 0; i < gameState.cities.length; i++) {
      const pos = cityPos(gameState.cities[i]);
      const dist = Math.hypot(mx - pos.x, my - pos.y);
      if (dist < 20) {
        hoveredCity = i;
        const city = gameState.cities[i];
        const owner = city.owner === 'neutral' ? '中立' : (gameState.players[city.owner]?.name || '?');
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX - canvas.getBoundingClientRect().left + 15) + 'px';
        tooltip.style.top = (e.clientY - canvas.getBoundingClientRect().top - 10) + 'px';
        tooltip.innerHTML = `<strong>${city.name}</strong><br>兵力: ${city.troops}<br>所属: ${owner}${city.defBuff ? '<br>🏰 防御+' + Math.round(city.defBuff*100) + '%' : ''}`;
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

  if (city.owner === gameState.you) {
    document.getElementById('selFrom').value = hoveredCity;
  } else {
    document.getElementById('selTo').value = hoveredCity;
  }
}

// ========== 移动端触摸支持 ==========
let touchedCity = null;

function getTouchedCity(touch) {
  if (!gameState) return null;
  const rect = canvas.getBoundingClientRect();
  const mx = touch.clientX - rect.left;
  const my = touch.clientY - rect.top;
  // 移动端用更大的触摸半径
  for (let i = 0; i < gameState.cities.length; i++) {
    const pos = cityPos(gameState.cities[i]);
    const dist = Math.hypot(mx - pos.x, my - pos.y);
    if (dist < 30) return i;
  }
  return null;
}

function onMapTouch(e) {
  e.preventDefault();
  const touch = e.touches[0];
  touchedCity = getTouchedCity(touch);
  if (touchedCity !== null && gameState) {
    hoveredCity = touchedCity;
    const city = gameState.cities[touchedCity];
    const me = gameState.players[gameState.you];
    if (!me) return;

    // 显示城池信息 toast
    const owner = city.owner === 'neutral' ? '中立' : (gameState.players[city.owner]?.name || '?');
    showMobileToast(`${city.name} | ${city.troops}兵 | ${owner}`);

    if (city.owner === gameState.you) {
      document.getElementById('selFrom').value = touchedCity;
    } else {
      document.getElementById('selTo').value = touchedCity;
    }
    drawMap();
  }
}

function onMapTouchMove(e) {
  e.preventDefault();
}

// 移动端简易 toast 提示
function showMobileToast(text) {
  let toast = document.getElementById('mobile-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mobile-toast';
    toast.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);background:rgba(12,12,26,0.95);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:999;border:1px solid #e9456044;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

// ========== 倒计时系统 ==========
let countdownInterval = null;
let serverTimeDiff = 0; // 客户端与服务端时间差（简化处理，假设同步）

function startCountdown(turnDeadline, gameDeadline) {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const now = Date.now();
    // 回合倒计时
    const turnEl = document.getElementById('turnCountdown');
    if (turnEl && turnDeadline) {
      const turnLeft = Math.max(0, Math.ceil((turnDeadline - now) / 1000));
      turnEl.textContent = `⏱️ ${turnLeft}s`;
      turnEl.style.color = turnLeft <= 10 ? '#e74c3c' : '#f39c12';
    }
    // 全局倒计时
    const gameEl = document.getElementById('gameCountdown');
    if (gameEl && gameDeadline) {
      const gameLeft = Math.max(0, Math.ceil((gameDeadline - now) / 1000));
      const min = Math.floor(gameLeft / 60);
      const sec = gameLeft % 60;
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
    addLog(`${i === 0 ? '👑' : '  '} ${s.name}: ${s.score}分 (城池${s.cityCount}座=${s.cityScore}分, 兵力${s.troops}=${s.troopScore}分)`);
  });

  // 显示得分弹窗
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
        ${scores.map((s, i) => `
          <tr style="color:${s.color}">
            <td>${i + 1}</td>
            <td>${s.name}</td>
            <td>${s.cityCount}城 → ${s.cityScore}</td>
            <td>${s.troops}兵 → ${s.troopScore}</td>
            <td style="font-weight:bold">${s.score}</td>
          </tr>
        `).join('')}
      </table>
    `;
    modal.style.display = 'flex';
  }
}

function closeScoreModal() {
  document.getElementById('score-modal').style.display = 'none';
}

// ========== 抽卡系统 ==========
function doDraw() {
  ws.send(JSON.stringify({ type: 'draw' }));
}

function showDrawResult(cards, log) {
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
        <div class="card-stats-tag">攻${card.attack} 防${card.defense}</div>
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
        <div class="card-icon-big">💰</div>
        <div class="card-rarity-tag gold-coin">金币</div>
        <div class="card-name-tag">${card.amount}</div>
        <div class="card-stats-tag">金币入库</div>
      </div>`;
    } else {
      return `<div class="draw-card troops-card" style="animation-delay:${delay}s">
        <div class="card-icon-big">⚔️</div>
        <div class="card-rarity-tag troops">将士</div>
        <div class="card-name-tag">${card.amount}</div>
        <div class="card-stats-tag">兵力补充</div>
      </div>`;
    }
  }).join('');

  modal.style.display = 'flex';
  log.forEach(l => addLog('🎴 ' + l));
}

function closeDrawModal() {
  document.getElementById('draw-modal').style.display = 'none';
}

// ========== 技能卡使用 ==========
function useSkillCard(skillId) {
  if (!gameState || gameState.currentTurn !== gameState.you) {
    addLog('❌ 不是你的回合');
    return;
  }
  const me = gameState.players[gameState.you];
  const skill = me.skillCards.find(s => s.id === skillId);
  if (!skill) return;

  switch (skillId) {
    case 'skill_charge':
    case 'skill_runan':
      // 直接使用，无需额外参数
      ws.send(JSON.stringify({ type: 'useSkill', skillId }));
      break;
    case 'skill_transfer':
      showTransferModal();
      break;
    case 'skill_fortify':
      showFortifyModal();
      break;
  }
}

function showTransferModal() {
  const me = gameState.players[gameState.you];
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = '📦 调兵遣将';
  body.innerHTML = `
    <div class="section">
      <label>从哪座城池调兵:</label>
      <select id="transferFrom" aria-label="调兵来源" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${gameState.cities[cid].name} (${gameState.cities[cid].troops}兵)</option>`).join('')}
      </select>
    </div>
    <div class="section" style="margin-top:10px">
      <label>调往哪座城池:</label>
      <select id="transferTo" aria-label="调兵目标" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${gameState.cities[cid].name} (${gameState.cities[cid].troops}兵)</option>`).join('')}
      </select>
    </div>
    <div class="section" style="margin-top:10px">
      <label>调兵数量:</label>
      <input type="number" id="transferTroops" value="2000" min="500" step="500" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px" aria-label="调兵数量">
    </div>
    <button class="btn btn-attack" onclick="confirmTransfer()" style="width:100%;margin-top:12px" aria-label="确认调兵">确认调兵</button>
  `;
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
  const modal = document.getElementById('skill-modal');
  const body = document.getElementById('skill-modal-body');
  document.getElementById('skill-modal-title').textContent = '🏰 固若金汤';
  body.innerHTML = `
    <div class="section">
      <label>选择要加固的城池:</label>
      <select id="fortifyCity" aria-label="加固城池" style="width:100%;padding:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px;margin-top:4px">
        ${me.cities.map(cid => `<option value="${cid}">${gameState.cities[cid].name} (${gameState.cities[cid].troops}兵)</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-recruit" onclick="confirmFortify()" style="width:100%;margin-top:12px" aria-label="确认加固">确认加固 (防御+30%)</button>
  `;
  modal.style.display = 'flex';
}

function confirmFortify() {
  const cityId = parseInt(document.getElementById('fortifyCity').value);
  ws.send(JSON.stringify({ type: 'useSkill', skillId: 'skill_fortify', cityId }));
  closeSkillModal();
}

function closeSkillModal() {
  document.getElementById('skill-modal').style.display = 'none';
}

// ========== 存档功能 ==========
function saveGame() { ws.send(JSON.stringify({ type: 'save' })); }
function listSaves() { ws.send(JSON.stringify({ type: 'listSaves' })); }
function loadSave(filename) {
  if (confirm('加载存档后，所有玩家需要用存档中的名字重新加入，确定？')) {
    ws.send(JSON.stringify({ type: 'loadSave', filename }));
    closeSaveModal();
  }
}
function deleteSave(filename) {
  if (confirm('确定删除此存档？')) {
    ws.send(JSON.stringify({ type: 'deleteSave', filename }));
  }
}

function openSaveModal() {
  document.getElementById('save-modal').style.display = 'flex';
  listSaves();
}
function closeSaveModal() {
  document.getElementById('save-modal').style.display = 'none';
}

function renderSaveList(saves) {
  const list = document.getElementById('save-list');
  if (!saves || saves.length === 0) {
    list.innerHTML = '<div style="color:#888;text-align:center;padding:20px">暂无存档</div>';
    return;
  }
  list.innerHTML = saves.map(s => `
    <div class="save-item">
      <div class="save-info">
        <span class="save-time">${new Date(s.savedAt).toLocaleString()}</span>
        <span class="save-detail">第${s.round}回合 · ${s.playerCount}名玩家 · ${s.playerNames.join('、')}</span>
      </div>
      <div class="save-actions">
        <button class="btn btn-load" onclick="loadSave('${s.filename}')" aria-label="加载存档">📂 加载</button>
        <button class="btn btn-del" onclick="deleteSave('${s.filename}')" aria-label="删除存档">🗑️</button>
      </div>
    </div>
  `).join('');
}

// ========== 联机重连 ==========
function showRejoinScreen(playerNames, msg) {
  // 显示重连界面，让玩家选择自己的名字重新加入
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
      <select id="rejoinSelect" aria-label="选择身份" style="width:100%;padding:8px;margin-top:6px;background:#1a1a2e;border:1px solid #444;color:#fff;border-radius:4px">
        ${playerNames.map(n => `<option value="${n}">${n}</option>`).join('')}
      </select>
    </div>
    <button class="btn btn-start" onclick="doRejoin()" aria-label="重新加入" style="width:100%">🔗 重新加入游戏</button>
    <div id="rejoin-status" style="margin-top:12px;font-size:0.85em;color:#888"></div>
  `;
}

function doRejoin() {
  const name = document.getElementById('rejoinSelect').value;
  ws.send(JSON.stringify({ type: 'rejoin', name }));
}

function updateRejoinStatus(joined, needed, remaining) {
  // 更新重连界面上每个名字的状态
  const namesDiv = document.getElementById('rejoin-names');
  if (namesDiv) {
    namesDiv.innerHTML = needed.map(n => {
      const isJoined = joined.includes(n);
      return `<span class="rejoin-name ${isJoined ? 'joined' : 'pending'}">${isJoined ? '✅' : '⏳'} ${n}</span>`;
    }).join(' ');
  }
  const statusDiv = document.getElementById('rejoin-status');
  if (statusDiv) {
    if (remaining.length > 0) {
      statusDiv.textContent = `等待: ${remaining.join('、')}`;
    } else {
      statusDiv.textContent = '所有玩家已到齐！';
    }
  }
  // 更新下拉框，移除已加入的名字
  const select = document.getElementById('rejoinSelect');
  if (select) {
    const currentVal = select.value;
    const available = needed.filter(n => !joined.includes(n));
    select.innerHTML = available.map(n => `<option value="${n}">${n}</option>`).join('');
    if (available.includes(currentVal)) select.value = currentVal;
  }
}
