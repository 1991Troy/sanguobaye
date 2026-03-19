const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// HTTP 静态文件服务
const server = http.createServer((req, res) => {
  // assets 路径单独处理
  let filePath;
  const decodedUrl = decodeURIComponent(req.url);
  if (decodedUrl.startsWith('/assets/')) {
    filePath = path.join(__dirname, decodedUrl);
  } else {
    filePath = path.join(__dirname, 'public', decodedUrl === '/' ? 'index.html' : decodedUrl);
  }
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ========== 游戏数据 ==========
const GENERALS = [
  { name: '关羽', attack: 95, defense: 80, strategy: 70, icon: '🗡️' },
  { name: '张飞', attack: 90, defense: 75, strategy: 40, icon: '⚔️' },
  { name: '赵云', attack: 92, defense: 85, strategy: 65, icon: '🛡️' },
  { name: '诸葛亮', attack: 50, defense: 60, strategy: 100, icon: '📜' },
  { name: '吕布', attack: 100, defense: 70, strategy: 30, icon: '🔱' },
  { name: '曹操', attack: 72, defense: 75, strategy: 91, icon: '👑' },
  { name: '周瑜', attack: 68, defense: 65, strategy: 96, icon: '🔥' },
  { name: '孙策', attack: 88, defense: 78, strategy: 60, icon: '⛵' },
  { name: '马超', attack: 93, defense: 72, strategy: 45, icon: '🐴' },
  { name: '黄忠', attack: 87, defense: 68, strategy: 55, icon: '🏹' },
  { name: '典韦', attack: 94, defense: 82, strategy: 25, icon: '🪓' },
  { name: '司马懿', attack: 55, defense: 70, strategy: 98, icon: '🦊' },
];

// ========== 抽卡系统 ==========
// 金卡武将 (10%概率) - 高属性，可战死
const GOLD_GENERALS = [
  { name: '吕布', attack: 100, defense: 70, strategy: 30, icon: '🔱', rarity: 'gold', image: '/assets/吕布.jpg' },
  { name: '关羽', attack: 95, defense: 80, strategy: 70, icon: '🗡️', rarity: 'gold', image: '/assets/关羽.jpg' },
  { name: '马超', attack: 93, defense: 72, strategy: 45, icon: '🐴', rarity: 'gold', image: '/assets/马超.jpg' },
  { name: '张飞', attack: 90, defense: 75, strategy: 40, icon: '⚔️', rarity: 'gold', image: '/assets/张飞.jpg' },
];
// 紫卡武将 (30%概率) - 中等属性，可战死
const PURPLE_GENERALS = [
  { name: '赵云', attack: 82, defense: 75, strategy: 65, icon: '🛡️', rarity: 'purple' },
  { name: '曹操', attack: 72, defense: 75, strategy: 91, icon: '👑', rarity: 'purple' },
  { name: '周瑜', attack: 68, defense: 65, strategy: 96, icon: '🔥', rarity: 'purple' },
  { name: '典韦', attack: 84, defense: 82, strategy: 25, icon: '🪓', rarity: 'purple' },
  { name: '司马懿', attack: 55, defense: 70, strategy: 98, icon: '🦊', rarity: 'purple' },
];
// 蓝卡武将 (30%概率) - 低属性，可战死
const BLUE_GENERALS = [
  { name: '黄忠', attack: 67, defense: 58, strategy: 55, icon: '🏹', rarity: 'blue' },
  { name: '孙策', attack: 68, defense: 58, strategy: 50, icon: '⛵', rarity: 'blue' },
  { name: '诸葛亮', attack: 40, defense: 50, strategy: 80, icon: '📜', rarity: 'blue' },
  { name: '张辽', attack: 65, defense: 60, strategy: 50, icon: '🐎', rarity: 'blue' },
];
// 技能卡 (30%概率) - 一次性使用
const SKILL_CARDS = [
  { id: 'skill_charge', name: '长驱直入', desc: '从任意城池出发攻打长安', icon: '🏇', rarity: 'skill' },
  { id: 'skill_runan', name: '汝南王', desc: '在汝南立马增兵2000', icon: '👑', rarity: 'skill' },
  { id: 'skill_transfer', name: '调兵遣将', desc: '将任意城池的兵调往其它城池', icon: '📦', rarity: 'skill' },
  { id: 'skill_fortify', name: '固若金汤', desc: '使一座城池守军防御力+30%', icon: '🏰', rarity: 'skill' },
  { id: 'skill_fire', name: '火攻', desc: '烧毁敌方城池30%兵力', icon: '🔥', rarity: 'skill' },
  { id: 'skill_defect', name: '离间计', desc: '偷取敌方一名武将', icon: '🗣️', rarity: 'skill' },
  { id: 'skill_empty', name: '空城计', desc: '本回合你的城池不会被攻击', icon: '🏚️', rarity: 'skill' },
  { id: 'skill_borrow', name: '草船借箭', desc: '从敌方城池偷取2000兵力', icon: '🏹', rarity: 'skill' },
  { id: 'skill_chain', name: '连环计', desc: '锁定敌方一座城池1回合不能出兵', icon: '🔗', rarity: 'skill' },
  { id: 'skill_beauty', name: '美人计', desc: '敌方一座城池兵力减半', icon: '💃', rarity: 'skill' },
  { id: 'skill_counter', name: '反间计', desc: '取消敌方当前所有技能效果', icon: '🪞', rarity: 'skill' },
  { id: 'skill_wind', name: '借东风', desc: '本回合攻击力翻倍', icon: '🌬️', rarity: 'skill' },
  { id: 'skill_revive', name: '七星灯', desc: '复活一名已战死的武将', icon: '🪔', rarity: 'skill' },
  { id: 'skill_ambush', name: '声东击西', desc: '本回合可无视路线攻击任意城池', icon: '🎭', rarity: 'skill' },
  { id: 'skill_supply', name: '粮草先行', desc: '本回合金币收入翻倍', icon: '🌾', rarity: 'skill' },
  { id: 'skill_trap', name: '十面埋伏', desc: '在己方城池设伏，敌方攻击时损失50%兵力', icon: '⚡', rarity: 'skill' },
];

function drawCards(count) {
  const cards = [];
  let hasSkill = false; // 每次五连最多1张技能卡

  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.05) {
      // 金卡武将 5%
      const g = GOLD_GENERALS[Math.floor(Math.random() * GOLD_GENERALS.length)];
      cards.push({ type: 'general', ...JSON.parse(JSON.stringify(g)), hp: 100, cityId: -1 });
    } else if (roll < 0.20) {
      // 紫卡武将 15%
      const g = PURPLE_GENERALS[Math.floor(Math.random() * PURPLE_GENERALS.length)];
      cards.push({ type: 'general', ...JSON.parse(JSON.stringify(g)), hp: 100, cityId: -1 });
    } else if (roll < 0.35) {
      // 蓝卡武将 15%
      const g = BLUE_GENERALS[Math.floor(Math.random() * BLUE_GENERALS.length)];
      cards.push({ type: 'general', ...JSON.parse(JSON.stringify(g)), hp: 100, cityId: -1 });
    } else if (roll < 0.45 && !hasSkill) {
      // 技能卡 10%（但每次五连最多1张）
      const s = SKILL_CARDS[Math.floor(Math.random() * SKILL_CARDS.length)];
      cards.push({ type: 'skill', ...JSON.parse(JSON.stringify(s)) });
      hasSkill = true;
    } else if (roll < 0.70) {
      // 金币卡 25%（100-1000金币）
      const gold = (Math.floor(Math.random() * 10) + 1) * 100;
      cards.push({ type: 'gold', amount: gold, icon: '💰', name: `${gold}金币`, rarity: 'gold_coin' });
    } else {
      // 将士卡 30%（100-1000兵力）
      const troops = (Math.floor(Math.random() * 10) + 1) * 100;
      cards.push({ type: 'troops', amount: troops, icon: '⚔️', name: `${troops}将士`, rarity: 'troops' });
    }
  }
  return cards;
}

// 地图城池定义 (x, y 为百分比坐标，参考真实三国地理)
// 左上角西凉，右下角交州/会稽方向
const CITIES = [
  { id: 0,  name: '洛阳', x: 48, y: 38, troops: 8000 },   // 中原核心
  { id: 1,  name: '许昌', x: 52, y: 44, troops: 6000 },   // 中原偏东南
  { id: 2,  name: '长安', x: 32, y: 32, troops: 7000 },   // 关中
  { id: 3,  name: '成都', x: 18, y: 58, troops: 7500 },   // 蜀地
  { id: 4,  name: '江陵', x: 42, y: 60, troops: 5000 },   // 荆州核心
  { id: 5,  name: '建业', x: 72, y: 56, troops: 6500 },   // 江东
  { id: 6,  name: '襄阳', x: 44, y: 50, troops: 5500 },   // 荆北
  { id: 7,  name: '汝南', x: 56, y: 48, troops: 4500 },   // 豫州
  { id: 8,  name: '邺城', x: 52, y: 22, troops: 6000 },   // 河北核心
  { id: 9,  name: '北平', x: 68, y: 12, troops: 5000 },   // 幽州
  { id: 10, name: '南皮', x: 62, y: 20, troops: 4000 },   // 冀州东
  { id: 11, name: '濮阳', x: 54, y: 32, troops: 4500 },   // 兖州
  { id: 12, name: '陈留', x: 50, y: 36, troops: 4000 },   // 中原
  { id: 13, name: '宛城', x: 44, y: 46, troops: 5000 },   // 南阳
  { id: 14, name: '江夏', x: 50, y: 56, troops: 4500 },   // 荆东
  { id: 15, name: '庐江', x: 64, y: 52, troops: 4000 },   // 扬州西
  { id: 16, name: '会稽', x: 78, y: 62, troops: 3500 },   // 江东南
  { id: 17, name: '零陵', x: 38, y: 72, troops: 3000 },   // 荆南
  { id: 18, name: '桂阳', x: 46, y: 74, troops: 3000 },   // 荆南东
  { id: 19, name: '汉中', x: 26, y: 46, troops: 5500 },   // 汉中盆地
  { id: 20, name: '西凉', x: 12, y: 18, troops: 5000 },   // 左上角
  { id: 21, name: '天水', x: 22, y: 26, troops: 4500 },   // 凉州东
  { id: 22, name: '上庸', x: 34, y: 48, troops: 3500 },   // 汉中东
  { id: 23, name: '寿春', x: 62, y: 46, troops: 4000 },   // 淮南
];

// 城池间连接（可互相攻击的路线）
const ROUTES = [
  // 西凉-关中线
  [20,21],[21,2],[2,0],
  // 关中-汉中-蜀地
  [2,19],[19,3],[19,22],[22,6],
  // 中原核心
  [0,12],[0,11],[12,1],[12,13],[11,8],[11,12],
  // 河北线
  [8,10],[8,9],[10,9],
  // 中原-荆州
  [1,7],[1,13],[13,6],[6,4],[6,14],
  // 荆州内部
  [4,14],[4,17],[17,18],[14,18],
  // 淮南-江东
  [7,23],[7,15],[23,15],[15,5],[5,16],
  // 荆州-江东
  [14,15],
  // 成都-荆南
  [3,17],
  // 兖州-河北
  [11,10],
  // 天水-长安
  [21,19],
];

// ========== 游戏房间管理 ==========
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = {};
    this.state = 'waiting';
    this.cities = JSON.parse(JSON.stringify(CITIES));
    this.currentTurn = null;
    this.turnOrder = [];
    this.turnIndex = 0;
    this.round = 1;
    this.maxPlayers = 4;
    this.colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];
    this.colorIndex = 0;
    // 计时器
    this.turnTimer = null;       // 回合倒计时
    this.turnDeadline = null;    // 回合截止时间戳
    this.gameTimer = null;       // 全局30分钟计时
    this.gameDeadline = null;    // 游戏截止时间戳
    this.TURN_TIME = 60 * 1000;  // 每回合60秒
    this.GAME_TIME = 30 * 60 * 1000; // 全局30分钟
  }

  addPlayer(ws, name) {
    if (Object.keys(this.players).length >= this.maxPlayers) return null;
    if (this.state !== 'waiting') return null;
    const id = 'p' + Date.now() + Math.random().toString(36).substr(2, 4);
    const color = this.colors[this.colorIndex++ % this.colors.length];
    this.players[id] = { ws, name, color, cities: [], generals: [], gold: 5000, skillCards: [], hasDrawn: false };
    return id;
  }

  removePlayer(playerId) {
    delete this.players[playerId];
    if (Object.keys(this.players).length === 0) {
      this.clearTimers();
      return true;
    }
    return false;
  }

  startGame() {
    if (Object.keys(this.players).length < 2) return false;
    this.state = 'playing';
    const playerIds = Object.keys(this.players);
    this.turnOrder = playerIds;

    // 分配初始城池（武将必须通过抽卡获得）
    const startCities = [3, 9, 5, 20]; // 成都、北平、建业、西凉
    playerIds.forEach((pid, i) => {
      const cityId = startCities[i];
      this.cities[cityId].owner = pid;
      this.cities[cityId].troops = 10000;
      this.players[pid].cities = [cityId];
      this.players[pid].generals = []; // 武将只能通过抽卡获得
    });

    // 中立城池设置
    this.cities.forEach(c => {
      if (!c.owner) { c.owner = 'neutral'; }
    });

    this.currentTurn = this.turnOrder[0];
    this.startTurnTimer();
    this.startGameTimer();
    return true;
  }

  nextTurn() {
    this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
    // 跳过已淘汰的玩家
    let attempts = 0;
    while (this.players[this.turnOrder[this.turnIndex]]?.cities.length === 0 && attempts < this.turnOrder.length) {
      this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
      attempts++;
    }
    if (this.turnIndex === 0) this.round++;
    this.currentTurn = this.turnOrder[this.turnIndex];

    // 回合开始：收入
    const p = this.players[this.currentTurn];
    if (p) {
      p.gold += p.cities.length * 1000;
      p.hasDrawn = false; // 新回合可以抽卡
      // 清除上回合的临时技能效果
      delete p._chargeActive;
      delete p._windActive;
      delete p._ambushActive;
      delete p._emptyCity;
      // 清除连环计锁定
      this.cities.forEach(c => { delete c.locked; });
      // 城池自然恢复兵力
      p.cities.forEach(cid => {
        this.cities[cid].troops = Math.min(this.cities[cid].troops + 500, 30000);
      });
    }
    this.startTurnTimer();
    return this.currentTurn;
  }

  startTurnTimer() {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnDeadline = Date.now() + this.TURN_TIME;
    this.turnTimer = setTimeout(() => {
      // 超时自动结束回合
      if (this.state === 'playing') {
        broadcastRoom(this, { type: 'info', msg: `⏰ ${this.players[this.currentTurn]?.name || '?'} 回合超时，自动跳过` });
        this.nextTurn();
        sendStateRoom(this);
      }
    }, this.TURN_TIME);
  }

  startGameTimer() {
    this.gameDeadline = Date.now() + this.GAME_TIME;
    this.gameTimer = setTimeout(() => {
      if (this.state === 'playing') {
        this.endGameByTime();
      }
    }, this.GAME_TIME);
  }

  endGameByTime() {
    this.state = 'ended';
    if (this.turnTimer) clearTimeout(this.turnTimer);
    if (this.gameTimer) clearTimeout(this.gameTimer);

    // 计算得分：城池数占70%，兵力占30%
    const scores = this.calculateScores();
    scores.sort((a, b) => b.score - a.score);

    broadcastRoom(this, {
      type: 'gameOverScore',
      msg: '⏰ 30分钟时间到！按总得分结算',
      scores,
      winner: scores[0]?.name || '无',
    });
  }

  calculateScores() {
    const totalCities = 24;
    // 找出最大兵力用于归一化
    let maxTroops = 0;
    for (const [pid, p] of Object.entries(this.players)) {
      let troops = 0;
      p.cities.forEach(cid => { troops += this.cities[cid].troops; });
      if (troops > maxTroops) maxTroops = troops;
    }
    if (maxTroops === 0) maxTroops = 1;

    const scores = [];
    for (const [pid, p] of Object.entries(this.players)) {
      const cityCount = p.cities.length;
      let troops = 0;
      p.cities.forEach(cid => { troops += this.cities[cid].troops; });

      const cityScore = (cityCount / totalCities) * 70;
      const troopScore = (troops / maxTroops) * 30;
      const total = Math.round((cityScore + troopScore) * 100) / 100;

      scores.push({
        playerId: pid,
        name: p.name,
        color: p.color,
        cityCount,
        troops,
        cityScore: Math.round(cityScore * 100) / 100,
        troopScore: Math.round(troopScore * 100) / 100,
        score: total,
      });
    }
    return scores;
  }

  clearTimers() {
    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }
    if (this.gameTimer) { clearTimeout(this.gameTimer); this.gameTimer = null; }
  }

  // 征兵
  recruit(playerId, cityId, count) {
    const p = this.players[playerId];
    if (!p || playerId !== this.currentTurn) return { ok: false, msg: '不是你的回合' };
    if (!p.cities.includes(cityId)) return { ok: false, msg: '不是你的城池' };
    const cost = count * 2;
    if (p.gold < cost) return { ok: false, msg: '金币不足' };
    p.gold -= cost;
    this.cities[cityId].troops += count;
    return { ok: true, msg: `征兵 ${count}，花费 ${cost} 金` };
  }

  // 攻击
  attack(playerId, fromCity, toCity, troops, generalName) {
    const p = this.players[playerId];
    if (!p || playerId !== this.currentTurn) return { ok: false, msg: '不是你的回合' };
    if (!p.cities.includes(fromCity)) return { ok: false, msg: '不是你的城池' };

    // 检查是否有"长驱直入"技能卡效果（允许任意城池攻打长安）
    const chargeToChangan = toCity === 2 && p._chargeActive;
    // 声东击西：无视路线攻击任意城池
    const ambushActive = p._ambushActive;
    if (!chargeToChangan && !ambushActive) {
      if (!ROUTES.some(r => (r[0]===fromCity&&r[1]===toCity)||(r[1]===fromCity&&r[0]===toCity)))
        return { ok: false, msg: '两城之间没有路线' };
    }

    // 连环计：被锁定的城池不能出兵
    if (this.cities[fromCity].locked) {
      return { ok: false, msg: `${this.cities[fromCity].name} 被连环计锁定，无法出兵！` };
    }

    const src = this.cities[fromCity];
    const dst = this.cities[toCity];

    // 空城计：目标城池免疫攻击
    const defOwnerPre = this.players[dst.owner];
    if (defOwnerPre && defOwnerPre._emptyCity) {
      return { ok: false, msg: `${dst.name} 使用了空城计，本回合免疫攻击！` };
    }

    if (src.troops < troops + 500) return { ok: false, msg: '出征后城池至少保留500兵力' };
    src.troops -= troops;

    // 武将加成
    let atkBonus = 1, defBonus = 1;
    const atkGeneral = p.generals.find(g => g.name === generalName && g.cityId === fromCity);
    if (atkGeneral) atkBonus = 1 + atkGeneral.attack / 200;

    const defOwner = this.players[dst.owner];
    if (defOwner) {
      const defGeneral = defOwner.generals.find(g => g.cityId === toCity);
      if (defGeneral) defBonus = 1 + defGeneral.defense / 200;
    }

    // 城池防御buff（固若金汤）
    if (dst.defBuff && dst.defBuff > 0) {
      defBonus *= (1 + dst.defBuff);
    }

    // 战斗计算
    let atkPower = Math.floor(troops * atkBonus * (0.8 + Math.random() * 0.4));
    let defPower = Math.floor(dst.troops * defBonus * (0.8 + Math.random() * 0.4));

    // 借东风：攻击力翻倍
    if (p._windActive) {
      atkPower *= 2;
      log.push(`🌬️ 借东风！攻击力翻倍！`);
    }

    // 十面埋伏：攻方损失50%兵力
    if (dst.trapped) {
      const trapLoss = Math.floor(atkPower * 0.5);
      atkPower -= trapLoss;
      log.push(`⚡ 中了十面埋伏！攻方损失大量兵力！`);
      delete dst.trapped;
    }

    const log = [];
    log.push(`⚔️ ${src.name} → ${dst.name}：${troops}兵出征`);
    if (chargeToChangan) log.push(`🏇 长驱直入！无视路线直取长安！`);
    if (ambushActive) log.push(`🎭 声东击西！无视路线奇袭！`);
    if (dst.defBuff) log.push(`🏰 ${dst.name} 固若金汤，防御+${Math.round(dst.defBuff*100)}%`);

    if (atkPower > defPower) {
      // 攻方胜
      const remaining = Math.floor((atkPower - defPower) / atkBonus * 0.7);
      const oldOwner = dst.owner;
      log.push(`✅ 攻方胜利！剩余 ${remaining} 兵驻守`);

      // 防守武将可能战死
      if (defOwner) {
        defOwner.generals.forEach(g => {
          if (g.cityId === toCity && g.rarity) {
            // 金卡15%战死，紫卡25%战死，蓝卡40%战死
            const deathChance = g.rarity === 'gold' ? 0.15 : g.rarity === 'purple' ? 0.25 : 0.40;
            if (Math.random() < deathChance) {
              log.push(`☠️ ${g.icon} ${g.name}（${g.rarity === 'gold' ? '金' : g.rarity === 'purple' ? '紫' : '蓝'}卡）战死沙场！`);
              g.cityId = -999; // 标记死亡
            } else {
              g.cityId = -1; // 流浪
            }
          } else if (g.cityId === toCity) {
            g.cityId = -1;
          }
        });
        // 清除已死亡的武将
        defOwner.generals = defOwner.generals.filter(g => g.cityId !== -999);
      }

      // 转移城池所有权
      if (oldOwner !== 'neutral' && this.players[oldOwner]) {
        this.players[oldOwner].cities = this.players[oldOwner].cities.filter(c => c !== toCity);
      }
      dst.owner = playerId;
      dst.troops = Math.max(remaining, 100);
      dst.defBuff = 0; // 城池易手，防御buff消失
      p.cities.push(toCity);
      if (atkGeneral) atkGeneral.cityId = toCity;

      this.checkElimination();
    } else {
      // 防方胜
      const remaining = Math.floor((defPower - atkPower) / defBonus * 0.7);
      dst.troops = Math.max(remaining, 100);
      log.push(`❌ 攻方战败！${dst.name} 剩余 ${dst.troops} 兵`);

      // 攻方武将可能战死
      if (atkGeneral && atkGeneral.rarity) {
        const deathChance = atkGeneral.rarity === 'gold' ? 0.15 : atkGeneral.rarity === 'purple' ? 0.25 : 0.40;
        if (Math.random() < deathChance) {
          log.push(`☠️ ${atkGeneral.icon} ${atkGeneral.name}（${atkGeneral.rarity === 'gold' ? '金' : atkGeneral.rarity === 'purple' ? '紫' : '蓝'}卡）战死沙场！`);
          p.generals = p.generals.filter(g => g !== atkGeneral);
        }
      }
    }

    // 清除长驱直入/声东击西状态
    if (p._chargeActive) delete p._chargeActive;
    if (p._ambushActive) delete p._ambushActive;

    return { ok: true, log };
  }

  checkElimination() {
    const alive = this.turnOrder.filter(pid => this.players[pid]?.cities.length > 0);
    if (alive.length === 1) {
      this.state = 'ended';
      this.clearTimers();
      return alive[0];
    }
    return null;
  }

  getState(forPlayer) {
    return {
      roomId: this.id,
      state: this.state,
      round: this.round,
      currentTurn: this.currentTurn,
      turnDeadline: this.turnDeadline,
      gameDeadline: this.gameDeadline,
      players: Object.fromEntries(
        Object.entries(this.players).map(([id, p]) => [id, {
          name: p.name, color: p.color,
          cityCount: p.cities.length,
          gold: id === forPlayer ? p.gold : undefined,
          generals: id === forPlayer ? p.generals : p.generals.map(g => ({ name: g.name, icon: g.icon, rarity: g.rarity })),
          cities: p.cities,
          skillCards: id === forPlayer ? p.skillCards : undefined,
          hasDrawn: id === forPlayer ? p.hasDrawn : undefined,
        }])
      ),
      cities: this.cities,
      routes: ROUTES,
      you: forPlayer,
    };
  }
}

// ========== 存档系统（联机版） ==========
const SAVE_DIR = path.join(__dirname, 'saves');
if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR);

function saveGame(room) {
  // 用玩家名字作为稳定身份标识，而非运行时的 playerId
  const playersByName = {};
  const turnOrderNames = [];
  const currentTurnName = room.players[room.currentTurn]?.name || null;

  for (const [pid, p] of Object.entries(room.players)) {
    playersByName[p.name] = {
      color: p.color, cities: p.cities, generals: p.generals, gold: p.gold,
      skillCards: p.skillCards || [], hasDrawn: p.hasDrawn || false,
    };
    // 记录城池归属用名字
  }
  room.turnOrder.forEach(pid => {
    const p = room.players[pid];
    if (p) turnOrderNames.push(p.name);
  });

  // 城池 owner 映射为名字
  const citiesSave = room.cities.map(c => {
    const ownerName = c.owner === 'neutral' ? 'neutral' : (room.players[c.owner]?.name || 'neutral');
    return { ...c, ownerName };
  });

  const data = {
    state: room.state,
    cities: citiesSave,
    turnOrderNames,
    currentTurnName,
    turnIndex: room.turnIndex,
    round: room.round,
    players: playersByName,
    savedAt: new Date().toISOString(),
  };
  const filename = `save_${Date.now()}.json`;
  fs.writeFileSync(path.join(SAVE_DIR, filename), JSON.stringify(data, null, 2));
  return filename;
}

function listSaves() {
  if (!fs.existsSync(SAVE_DIR)) return [];
  return fs.readdirSync(SAVE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const raw = fs.readFileSync(path.join(SAVE_DIR, f), 'utf-8');
        const d = JSON.parse(raw);
        const names = Object.keys(d.players);
        return { filename: f, savedAt: d.savedAt, round: d.round, playerNames: names, playerCount: names.length, state: d.state };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

// 加载存档 → 创建一个等待重连的房间
function loadGame(filename) {
  const raw = fs.readFileSync(path.join(SAVE_DIR, filename), 'utf-8');
  const data = JSON.parse(raw);

  const room = new GameRoom('room_' + Date.now());
  room.state = 'waiting_rejoin'; // 特殊状态：等待所有玩家重连
  room.round = data.round;
  room.turnIndex = data.turnIndex;

  // 保存存档数据，等玩家全部到齐后再恢复
  room._saveData = data;
  room._neededPlayers = Object.keys(data.players); // 需要重连的玩家名字列表
  room._joinedNames = []; // 已重连的玩家名字

  return room;
}

// 玩家尝试重连到存档房间
function rejoinRoom(room, ws, name) {
  const data = room._saveData;
  const savedPlayer = data.players[name];
  if (!savedPlayer) return { ok: false, msg: `存档中没有名为"${name}"的玩家，需要: ${room._neededPlayers.join('、')}` };
  if (room._joinedNames.includes(name)) return { ok: false, msg: `"${name}" 已经重连了，请用其他名字` };

  // 分配新 playerId
  const pid = 'p' + Date.now() + Math.random().toString(36).substring(2, 6);
  room.players[pid] = {
    ws, name, color: savedPlayer.color,
    cities: [], generals: savedPlayer.generals, gold: savedPlayer.gold,
    skillCards: savedPlayer.skillCards || [], hasDrawn: savedPlayer.hasDrawn || false,
  };
  room._joinedNames.push(name);
  room._nameToId = room._nameToId || {};
  room._nameToId[name] = pid;

  // 检查是否所有人都到齐了
  if (room._joinedNames.length === room._neededPlayers.length) {
    finishRejoin(room);
  }

  return { ok: true, playerId: pid, allJoined: room.state === 'playing' };
}

// 所有人到齐，恢复游戏状态
function finishRejoin(room) {
  const data = room._saveData;
  const nameToId = room._nameToId;

  // 恢复城池
  room.cities = data.cities.map(c => {
    const copy = { ...c };
    if (c.ownerName === 'neutral') {
      copy.owner = 'neutral';
    } else {
      copy.owner = nameToId[c.ownerName] || 'neutral';
    }
    delete copy.ownerName;
    return copy;
  });

  // 恢复每个玩家的城池列表
  for (const [name, pid] of Object.entries(nameToId)) {
    const savedCities = data.players[name].cities;
    // 城池id不变，但owner引用变了，需要用城池的ownerName来重建
    room.players[pid].cities = [];
  }
  room.cities.forEach(c => {
    if (c.owner !== 'neutral' && room.players[c.owner]) {
      room.players[c.owner].cities.push(c.id);
    }
  });

  // 恢复回合顺序
  room.turnOrder = data.turnOrderNames.map(n => nameToId[n]).filter(Boolean);
  room.currentTurn = nameToId[data.currentTurnName] || room.turnOrder[0];
  room.turnIndex = data.turnIndex;
  room.round = data.round;
  room.state = 'playing';

  // 清理临时数据
  delete room._saveData;
  delete room._neededPlayers;
  delete room._joinedNames;
  delete room._nameToId;
}

function deleteSave(filename) {
  const filepath = path.join(SAVE_DIR, filename);
  if (fs.existsSync(filepath)) { fs.unlinkSync(filepath); return true; }
  return false;
}

// ========== WebSocket 服务 ==========
const rooms = {};
let defaultRoom = null;

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function createRoom(maxPlayers) {
  let code = generateRoomCode();
  while (rooms[code]) code = generateRoomCode();
  rooms[code] = new GameRoom(code);
  if (maxPlayers) rooms[code].maxPlayers = Math.min(Math.max(maxPlayers, 2), 4);
  return rooms[code];
}

function getRoomList() {
  return Object.values(rooms)
    .filter(r => r.state === 'waiting')
    .map(r => ({
      id: r.id,
      playerCount: Object.keys(r.players).length,
      maxPlayers: r.maxPlayers,
      players: Object.values(r.players).map(p => p.name),
    }));
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  Object.values(room.players).forEach(p => {
    if (p.ws && p.ws.readyState === 1) p.ws.send(data);
  });
}
// 别名，供 GameRoom 内部 timer 回调使用
const broadcastRoom = broadcast;

function sendState(room) {
  Object.entries(room.players).forEach(([pid, p]) => {
    if (p.ws && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify({ type: 'state', data: room.getState(pid) }));
    }
  });
}
const sendStateRoom = sendState;

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let playerId = null;
  let room = null;

  // 发送房间列表
  ws.send(JSON.stringify({ type: 'roomList', rooms: getRoomList() }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'getRooms': {
        ws.send(JSON.stringify({ type: 'roomList', rooms: getRoomList() }));
        break;
      }
      case 'createRoom': {
        const newRoom = createRoom(msg.maxPlayers);
        room = newRoom;
        playerId = room.addPlayer(ws, msg.name || '无名氏');
        ws.send(JSON.stringify({ type: 'joined', playerId, roomId: room.id }));
        broadcast(room, { type: 'playerJoined', name: msg.name, count: Object.keys(room.players).length });
        sendState(room);
        // 通知所有未在房间的连接刷新列表
        broadcastRoomList();
        break;
      }
      case 'joinRoom': {
        const targetRoom = rooms[msg.roomId];
        if (!targetRoom) {
          ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' }));
          return;
        }
        room = targetRoom;
        playerId = room.addPlayer(ws, msg.name || '无名氏');
        if (!playerId) {
          ws.send(JSON.stringify({ type: 'error', msg: '房间已满或游戏已开始' }));
          room = null;
          return;
        }
        ws.send(JSON.stringify({ type: 'joined', playerId, roomId: room.id }));
        broadcast(room, { type: 'playerJoined', name: msg.name, count: Object.keys(room.players).length });
        sendState(room);
        broadcastRoomList();
        break;
      }
      case 'join': {
        // 兼容旧逻辑：快速加入（加入第一个等待中的房间或自动创建）
        let waitingRoom = Object.values(rooms).find(r => r.state === 'waiting' && Object.keys(r.players).length < r.maxPlayers);
        if (!waitingRoom) waitingRoom = createRoom();
        room = waitingRoom;
        playerId = room.addPlayer(ws, msg.name || '无名氏');
        if (!playerId) {
          ws.send(JSON.stringify({ type: 'error', msg: '房间已满或游戏已开始' }));
          room = null;
          return;
        }
        ws.send(JSON.stringify({ type: 'joined', playerId, roomId: room.id }));
        broadcast(room, { type: 'playerJoined', name: msg.name, count: Object.keys(room.players).length });
        sendState(room);
        broadcastRoomList();
        break;
      }
      case 'start': {
        if (!room) return;
        if (room.startGame()) {
          broadcast(room, { type: 'gameStarted' });
          sendState(room);
        } else {
          ws.send(JSON.stringify({ type: 'error', msg: '至少需要2名玩家' }));
        }
        break;
      }
      case 'attack': {
        if (!room || room.state !== 'playing') return;
        const result = room.attack(playerId, msg.from, msg.to, msg.troops, msg.general);
        if (result.ok) {
          broadcast(room, { type: 'battleLog', log: result.log });
          const winner = room.checkElimination();
          if (winner) {
            broadcast(room, { type: 'gameOver', winner: room.players[winner]?.name });
          }
          room.nextTurn();
          sendState(room);
        } else {
          ws.send(JSON.stringify({ type: 'error', msg: result.msg }));
        }
        break;
      }
      case 'recruit': {
        if (!room || room.state !== 'playing') return;
        const result = room.recruit(playerId, msg.cityId, msg.count);
        ws.send(JSON.stringify({ type: 'info', msg: result.msg }));
        if (result.ok) sendState(room);
        break;
      }
      case 'endTurn': {
        if (!room || room.state !== 'playing' || playerId !== room.currentTurn) return;
        room.nextTurn();
        sendState(room);
        break;
      }
      case 'draw': {
        // 回合开始五连抽
        if (!room || room.state !== 'playing') return;
        if (playerId !== room.currentTurn) { ws.send(JSON.stringify({ type: 'error', msg: '不是你的回合' })); return; }
        const dp = room.players[playerId];
        if (dp.hasDrawn) { ws.send(JSON.stringify({ type: 'error', msg: '本回合已经抽过卡了' })); return; }
        dp.hasDrawn = true;
        const cards = drawCards(5);
        // 处理抽到的卡
        const drawLog = [];
        cards.forEach(card => {
          if (card.type === 'general') {
            // 武将卡加入武将列表，默认驻扎在第一个城池
            card.cityId = dp.cities.length > 0 ? dp.cities[0] : -1;
            dp.generals.push(card);
            const rarityName = card.rarity === 'gold' ? '🥇金卡' : card.rarity === 'purple' ? '🟣紫卡' : '🔵蓝卡';
            drawLog.push(`${rarityName} ${card.icon} ${card.name} (攻${card.attack} 防${card.defense})`);
          } else if (card.type === 'skill') {
            // 技能卡加入技能卡列表
            dp.skillCards.push(card);
            drawLog.push(`📜技能 ${card.icon} ${card.name}: ${card.desc}`);
          } else if (card.type === 'gold') {
            // 金币卡直接加金币
            dp.gold += card.amount;
            drawLog.push(`💰 获得 ${card.amount} 金币`);
          } else if (card.type === 'troops') {
            // 将士卡：加到第一个城池
            if (dp.cities.length > 0) {
              room.cities[dp.cities[0]].troops += card.amount;
              drawLog.push(`⚔️ 获得 ${card.amount} 将士 → ${room.cities[dp.cities[0]].name}`);
            } else {
              drawLog.push(`⚔️ 获得 ${card.amount} 将士（无城池，已丢失）`);
            }
          }
        });
        ws.send(JSON.stringify({ type: 'drawResult', cards, log: drawLog }));
        broadcast(room, { type: 'info', msg: `🎴 ${dp.name} 进行了五连抽！` });
        sendState(room);
        break;
      }
      case 'useSkill': {
        // 使用技能卡
        if (!room || room.state !== 'playing') return;
        if (playerId !== room.currentTurn) { ws.send(JSON.stringify({ type: 'error', msg: '不是你的回合' })); return; }
        const sp = room.players[playerId];
        const skillIdx = sp.skillCards.findIndex(s => s.id === msg.skillId);
        if (skillIdx === -1) { ws.send(JSON.stringify({ type: 'error', msg: '没有这张技能卡' })); return; }
        const skill = sp.skillCards[skillIdx];
        let skillLog = [];
        let skillOk = false;

        switch (skill.id) {
          case 'skill_charge': {
            // 长驱直入：本回合可从任意城池攻打长安
            sp._chargeActive = true;
            skillLog.push(`🏇 ${sp.name} 使用【长驱直入】，本回合可从任意城池攻打长安！`);
            skillOk = true;
            break;
          }
          case 'skill_runan': {
            // 汝南王：汝南(id=7)增兵2000
            const runan = room.cities[7];
            if (runan.owner === playerId) {
              runan.troops += 2000;
              skillLog.push(`👑 ${sp.name} 使用【汝南王】，汝南增兵2000！现有 ${runan.troops} 兵`);
              skillOk = true;
            } else {
              ws.send(JSON.stringify({ type: 'error', msg: '汝南不是你的城池，无法使用此技能' }));
              return;
            }
            break;
          }
          case 'skill_transfer': {
            // 调兵遣将：从一个城池调兵到另一个
            const fromC = msg.fromCity;
            const toC = msg.toCity;
            const transferTroops = msg.troops;
            if (!sp.cities.includes(fromC) || !sp.cities.includes(toC)) {
              ws.send(JSON.stringify({ type: 'error', msg: '出发和目标都必须是你的城池' })); return;
            }
            if (fromC === toC) { ws.send(JSON.stringify({ type: 'error', msg: '不能调往同一城池' })); return; }
            const srcCity = room.cities[fromC];
            if (srcCity.troops < transferTroops + 500) {
              ws.send(JSON.stringify({ type: 'error', msg: '调兵后城池至少保留500兵力' })); return;
            }
            srcCity.troops -= transferTroops;
            room.cities[toC].troops += transferTroops;
            skillLog.push(`📦 ${sp.name} 使用【调兵遣将】，从${srcCity.name}调${transferTroops}兵至${room.cities[toC].name}`);
            skillOk = true;
            break;
          }
          case 'skill_fortify': {
            // 固若金汤：城池防御+30%
            const fortifyCity = msg.cityId;
            if (!sp.cities.includes(fortifyCity)) {
              ws.send(JSON.stringify({ type: 'error', msg: '不是你的城池' })); return;
            }
            room.cities[fortifyCity].defBuff = (room.cities[fortifyCity].defBuff || 0) + 0.3;
            skillLog.push(`🏰 ${sp.name} 使用【固若金汤】，${room.cities[fortifyCity].name} 防御+30%！`);
            skillOk = true;
            break;
          }
          case 'skill_fire': {
            // 火攻：烧毁敌方城池30%兵力
            const targetCity = msg.cityId;
            if (targetCity == null || sp.cities.includes(targetCity) || room.cities[targetCity].owner === 'neutral') {
              ws.send(JSON.stringify({ type: 'error', msg: '请选择一座敌方城池' })); return;
            }
            const burned = Math.floor(room.cities[targetCity].troops * 0.3);
            room.cities[targetCity].troops -= burned;
            skillLog.push(`🔥 ${sp.name} 使用【火攻】，${room.cities[targetCity].name} 烧毁 ${burned} 兵！`);
            skillOk = true;
            break;
          }
          case 'skill_defect': {
            // 离间计：偷取敌方一名武将
            const enemyPid = msg.targetPlayer;
            const enemyP = room.players[enemyPid];
            if (!enemyP || enemyPid === playerId) {
              ws.send(JSON.stringify({ type: 'error', msg: '请选择一名敌方玩家' })); return;
            }
            if (enemyP.generals.length === 0) {
              ws.send(JSON.stringify({ type: 'error', msg: '该玩家没有武将' })); return;
            }
            const stolenIdx = Math.floor(Math.random() * enemyP.generals.length);
            const stolen = enemyP.generals.splice(stolenIdx, 1)[0];
            stolen.cityId = sp.cities.length > 0 ? sp.cities[0] : -1;
            sp.generals.push(stolen);
            skillLog.push(`🗣️ ${sp.name} 使用【离间计】，从 ${enemyP.name} 处策反了 ${stolen.name}！`);
            skillOk = true;
            break;
          }
          case 'skill_empty': {
            // 空城计：本回合你的城池不会被攻击
            sp._emptyCity = true;
            skillLog.push(`🏚️ ${sp.name} 使用【空城计】，本回合城池免疫攻击！`);
            skillOk = true;
            break;
          }
          case 'skill_borrow': {
            // 草船借箭：从敌方城池偷取2000兵力
            const borrowCity = msg.cityId;
            if (borrowCity == null || sp.cities.includes(borrowCity) || room.cities[borrowCity].owner === 'neutral') {
              ws.send(JSON.stringify({ type: 'error', msg: '请选择一座敌方城池' })); return;
            }
            const borrowAmt = Math.min(2000, room.cities[borrowCity].troops - 100);
            if (borrowAmt <= 0) { ws.send(JSON.stringify({ type: 'error', msg: '敌方城池兵力不足' })); return; }
            room.cities[borrowCity].troops -= borrowAmt;
            if (sp.cities.length > 0) room.cities[sp.cities[0]].troops += borrowAmt;
            skillLog.push(`🏹 ${sp.name} 使用【草船借箭】，从 ${room.cities[borrowCity].name} 偷取 ${borrowAmt} 兵！`);
            skillOk = true;
            break;
          }
          case 'skill_chain': {
            // 连环计：锁定敌方一座城池1回合不能出兵
            const chainCity = msg.cityId;
            if (chainCity == null || sp.cities.includes(chainCity) || room.cities[chainCity].owner === 'neutral') {
              ws.send(JSON.stringify({ type: 'error', msg: '请选择一座敌方城池' })); return;
            }
            room.cities[chainCity].locked = true;
            skillLog.push(`🔗 ${sp.name} 使用【连环计】，${room.cities[chainCity].name} 被锁定1回合！`);
            skillOk = true;
            break;
          }
          case 'skill_beauty': {
            // 美人计：敌方一座城池兵力减半
            const beautyCity = msg.cityId;
            if (beautyCity == null || sp.cities.includes(beautyCity) || room.cities[beautyCity].owner === 'neutral') {
              ws.send(JSON.stringify({ type: 'error', msg: '请选择一座敌方城池' })); return;
            }
            const halfTroops = Math.floor(room.cities[beautyCity].troops / 2);
            room.cities[beautyCity].troops -= halfTroops;
            skillLog.push(`💃 ${sp.name} 使用【美人计】，${room.cities[beautyCity].name} 兵力减半（-${halfTroops}）！`);
            skillOk = true;
            break;
          }
          case 'skill_counter': {
            // 反间计：取消所有敌方buff
            for (const [pid2, p2] of Object.entries(room.players)) {
              if (pid2 !== playerId) {
                delete p2._chargeActive;
                delete p2._windActive;
                delete p2._ambushActive;
                delete p2._emptyCity;
              }
            }
            room.cities.forEach(c => {
              if (c.owner !== playerId && c.owner !== 'neutral') {
                c.defBuff = 0;
                delete c.trapped;
              }
            });
            skillLog.push(`🪞 ${sp.name} 使用【反间计】，清除所有敌方增益效果！`);
            skillOk = true;
            break;
          }
          case 'skill_wind': {
            // 借东风：本回合攻击力翻倍
            sp._windActive = true;
            skillLog.push(`🌬️ ${sp.name} 使用【借东风】，本回合攻击力翻倍！`);
            skillOk = true;
            break;
          }
          case 'skill_revive': {
            // 七星灯：复活一名已战死的武将（从死亡池中恢复）
            // 由于战死武将已被移除，我们随机给一个紫卡武将
            const revived = JSON.parse(JSON.stringify(PURPLE_GENERALS[Math.floor(Math.random() * PURPLE_GENERALS.length)]));
            revived.hp = 100;
            revived.cityId = sp.cities.length > 0 ? sp.cities[0] : -1;
            sp.generals.push(revived);
            skillLog.push(`🪔 ${sp.name} 使用【七星灯】，召回了 ${revived.name}！`);
            skillOk = true;
            break;
          }
          case 'skill_ambush': {
            // 声东击西：本回合可无视路线攻击任意城池
            sp._ambushActive = true;
            skillLog.push(`🎭 ${sp.name} 使用【声东击西】，本回合可攻击任意城池！`);
            skillOk = true;
            break;
          }
          case 'skill_supply': {
            // 粮草先行：本回合金币收入翻倍
            const bonus = sp.cities.length * 1000;
            sp.gold += bonus;
            skillLog.push(`🌾 ${sp.name} 使用【粮草先行】，额外获得 ${bonus} 金币！`);
            skillOk = true;
            break;
          }
          case 'skill_trap': {
            // 十面埋伏：在己方城池设伏
            const trapCity = msg.cityId;
            if (!sp.cities.includes(trapCity)) {
              ws.send(JSON.stringify({ type: 'error', msg: '不是你的城池' })); return;
            }
            room.cities[trapCity].trapped = true;
            skillLog.push(`⚡ ${sp.name} 使用【十面埋伏】，在 ${room.cities[trapCity].name} 设下埋伏！`);
            skillOk = true;
            break;
          }
        }

        if (skillOk) {
          sp.skillCards.splice(skillIdx, 1); // 消耗技能卡
          broadcast(room, { type: 'battleLog', log: skillLog });
          sendState(room);
        }
        break;
      }
      case 'save': {
        if (!room || room.state !== 'playing') {
          ws.send(JSON.stringify({ type: 'error', msg: '当前没有进行中的游戏' }));
          return;
        }
        const saveFilename = saveGame(room);
        broadcast(room, { type: 'info', msg: `💾 游戏已存档: ${saveFilename}` });
        ws.send(JSON.stringify({ type: 'saveList', saves: listSaves() }));
        break;
      }
      case 'listSaves': {
        ws.send(JSON.stringify({ type: 'saveList', saves: listSaves() }));
        break;
      }
      case 'loadSave': {
        try {
          const newRoom = loadGame(msg.filename);
          rooms[newRoom.id] = newRoom;
          defaultRoom = newRoom.id;
          if (room) {
            broadcast(room, { type: 'info', msg: '📂 房主加载了存档，请用存档中的名字重新加入' });
            broadcast(room, { type: 'needRejoin', playerNames: newRoom._neededPlayers });
            delete rooms[room.id];
          }
          room = newRoom;
          playerId = null;
          ws.send(JSON.stringify({
            type: 'needRejoin',
            playerNames: newRoom._neededPlayers,
            msg: `存档已加载，需要以下玩家重新加入: ${newRoom._neededPlayers.join('、')}`,
          }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', msg: '加载存档失败: ' + e.message }));
        }
        break;
      }
      case 'rejoin': {
        const rejoinName = msg.name || '';
        let targetRoom = null;
        for (const r of Object.values(rooms)) {
          if (r.state === 'waiting_rejoin' && r._neededPlayers.includes(rejoinName)) {
            targetRoom = r;
            break;
          }
        }
        if (!targetRoom) {
          ws.send(JSON.stringify({ type: 'error', msg: '没有找到需要你重连的存档房间' }));
          return;
        }
        const rejoinResult = rejoinRoom(targetRoom, ws, rejoinName);
        if (!rejoinResult.ok) {
          ws.send(JSON.stringify({ type: 'error', msg: rejoinResult.msg }));
          return;
        }
        room = targetRoom;
        playerId = rejoinResult.playerId;
        ws.send(JSON.stringify({ type: 'joined', playerId, roomId: room.id }));

        const remaining = room._neededPlayers
          ? room._neededPlayers.filter(n => !room._joinedNames.includes(n))
          : [];
        broadcast(room, {
          type: 'rejoinStatus',
          joined: room._joinedNames || [],
          needed: room._neededPlayers || [],
          remaining,
        });

        if (rejoinResult.allJoined) {
          broadcast(room, { type: 'info', msg: `📂 所有玩家已重连！第 ${room.round} 回合继续` });
          broadcast(room, { type: 'gameStarted' });
          sendState(room);
        } else {
          ws.send(JSON.stringify({ type: 'info', msg: `✅ 重连成功！等待其他玩家: ${remaining.join('、')}` }));
        }
        break;
      }
      case 'deleteSave': {
        if (deleteSave(msg.filename)) {
          ws.send(JSON.stringify({ type: 'info', msg: '🗑️ 存档已删除' }));
        }
        ws.send(JSON.stringify({ type: 'saveList', saves: listSaves() }));
        break;
      }
    }
  });

  ws.on('close', () => {
    if (room && playerId) {
      const playerName = room.players[playerId]?.name;
      const empty = room.removePlayer(playerId);
      if (empty) { delete rooms[room.id]; if (defaultRoom === room.id) defaultRoom = null; }
      else {
        broadcast(room, { type: 'playerLeft', name: playerName, count: Object.keys(room.players).length });
        sendState(room);
      }
      broadcastRoomList();
    }
  });
});

// 广播房间列表给所有未在游戏中的连接
function broadcastRoomList() {
  const list = getRoomList();
  const data = JSON.stringify({ type: 'roomList', rooms: list });
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🏯 三国霸业服务器已启动: http://0.0.0.0:${PORT}`);
});
