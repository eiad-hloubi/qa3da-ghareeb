// قعدة غريب — سيرفر اللعبة (Express + WebSocket)
// إعداد م. إياد حلوبي
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const WORDS = require('./words');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'qa3da';
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 30;
const COLORS = ['#E0463B','#2E7DD1','#F2B632','#2E9C8F','#8E5BD6','#F07C2E','#D6457F','#4CAF50','#00A3C4','#A5672E','#5C6BC0','#C0CA33','#EC6A8C','#26A69A','#7E57C2','#FF8A65','#43A047','#1E88E5','#FDD835','#6D4C41'];

// ---------- إحصائيات (أرقام بس) ----------
const STATS_FILE = path.join(__dirname, 'stats.json');
let stats = { rooms: 0, games: 0, players: 0, rounds: 0, strangerWins: 0, citizenWins: 0, stopped: 0, categories: {}, since: new Date().toISOString() };
try { stats = Object.assign(stats, JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'))); } catch (e) {}
let statsDirty = false;
setInterval(() => { if (statsDirty) { statsDirty = false; fs.writeFile(STATS_FILE, JSON.stringify(stats), () => {}); } }, 15000);
const bump = (k, n = 1) => { stats[k] = (stats[k] || 0) + n; statsDirty = true; };

// ---------- HTTP ----------
const app = express();
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders: (res, p) => { if (/\.(html|js|css|json)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); }
}));
app.get('/health', (req, res) => res.send('ok'));
app.get('/stats', (req, res) => {
  const top = Object.entries(stats.categories || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  res.json({ ...stats, topCategories: top, activeRooms: rooms.size, onlinePlayers: [...rooms.values()].reduce((s, r) => s + [...r.players.values()].filter(p => p.ws).length, 0) });
});
app.get('/admin/rooms', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'key' });
  res.json([...rooms.values()].map(r => ({ code: r.code, phase: r.phase, players: r.players.size, online: [...r.players.values()].filter(p => p.ws).length, games: r.gamesPlayed, minutes: Math.round((Date.now() - r.created) / 60000) })));
});
app.post('/admin/close/:code', (req, res) => {
  if (req.query.key !== ADMIN_KEY) return res.status(403).json({ error: 'key' });
  const r = rooms.get((req.params.code || '').toUpperCase());
  if (!r) return res.status(404).json({ error: 'nf' });
  closeRoom(r, 'انسكّرت القعدة'); res.json({ ok: true });
});
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });

// ---------- أدوات ----------
const rooms = new Map();
const uid = () => crypto.randomBytes(6).toString('hex');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c; do { c = Array.from({ length: 5 }, () => L[Math.floor(Math.random() * L.length)]).join(''); } while (rooms.has(c));
  return c;
}
const clean = (s, n = 24) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
// الصور بتنحفظ بالذاكرة بس طول ما القعدة شغّالة لتنبعت للاعبين، وما بتنكتب على أي ملف
const okPhoto = s => typeof s === 'string' && s.startsWith('data:image/') && s.length < 450000 ? s : null;
function send(p, msg) { if (p && p.ws && p.ws.readyState === 1) { try { p.ws.send(JSON.stringify(msg)); } catch (e) {} } }
const maxStrangers = n => Math.max(1, Math.floor(n / 3));

// ---------- الغرفة ----------
function makeRoom(name, kind) {
  const r = {
    code: newCode(), name: clean(name, 30) || 'قعدتنا', kind: clean(kind, 20) || 'شلة', groupPhoto: null,
    ownerId: null, created: Date.now(), players: new Map(), order: [], phase: 'lobby',
    settings: { strangers: 0, reveal: true, mates: false, timer: 0 },
    game: null, tally: {}, gamesPlayed: 0, timerHandle: null, ready: new Set(), countAt: 0, countHandle: null
  };
  rooms.set(r.code, r); bump('rooms');
  return r;
}
const playersArr = r => r.order.map(id => r.players.get(id)).filter(Boolean);

function addPlayer(r, { name, gender, photo }) {
  const used = new Set(playersArr(r).map(p => p.color));
  const color = COLORS.find(c => !used.has(c)) || pick(COLORS);
  const inGame = r.game && !['lobby', 'end'].includes(r.phase);
  const p = { id: uid(), token: uid() + uid(), name: clean(name) || 'لاعب', gender: gender === 'f' ? 'f' : 'm', photo: okPhoto(photo), color, ws: null, lastSeen: Date.now(), spectator: !!inGame };
  r.players.set(p.id, p); r.order.push(p.id);
  if (!r.ownerId) r.ownerId = p.id;
  if (!r.tally[p.id]) r.tally[p.id] = { points: 0, wins: 0, stranger: 0, caught: 0 };
  bump('players');
  return p;
}

function closeRoom(r, m) {
  clearTimeout(r.timerHandle); clearTimeout(r.countHandle);
  for (const p of r.players.values()) { send(p, { t: 'closed', m }); try { p.ws && p.ws.close(); } catch (e) {} }
  rooms.delete(r.code);
}

// ---------- شاشة «جاهز» والعدّ ----------
function openReady(r) {
  if (playersArr(r).length < MIN_PLAYERS) return 'بدنا ' + MIN_PLAYERS + ' لاعبين عالأقل';
  r.game = null; r.phase = 'ready'; r.ready = new Set(); r.countAt = 0;
  playersArr(r).forEach(p => p.spectator = false);
}
function maybeCountdown(r, force) {
  if (r.phase !== 'ready') return;
  const online = playersArr(r).filter(p => p.ws);
  if (!force && !(online.length && online.every(p => r.ready.has(p.id)))) return;
  r.phase = 'countdown'; r.countAt = Date.now() + 3600;
  clearTimeout(r.countHandle);
  r.countHandle = setTimeout(() => { if (r.phase === 'countdown') { const e = startGame(r); if (e) r.phase = 'lobby'; broadcast(r); } }, 3600);
}

// ---------- اللعبة ----------
function startGame(r) {
  const ps = playersArr(r);
  if (ps.length < MIN_PLAYERS) return 'بدنا ' + MIN_PLAYERS + ' لاعبين عالأقل';
  ps.forEach(p => p.spectator = false);
  const ids = shuffle(ps.map(p => p.id));
  const max = maxStrangers(ids.length);
  const n = r.settings.strangers ? Math.min(r.settings.strangers, max) : max;
  const strangers = ids.slice(0, n), citizens = ids.slice(n);
  r.game = {
    strangers: new Set(strangers), president: pick(citizens), alive: new Set(ids), players: ids.slice(), startCount: ids.length, strangerCount: n,
    round: 0, category: null, word: null, usedWords: new Set(), turn: null, votes: {}, candidates: null, revote: false,
    deadline: 0, last: null, history: [], eliminated: [], winner: null, correct: {}, survive: {}, words: [], snap: null, stopped: false, results: null
  };
  r.phase = 'pick'; r.gamesPlayed++; bump('games');
}

function aliveCounts(r) { const g = r.game; let s = 0, c = 0; for (const id of g.alive) { if (g.strangers.has(id)) s++; else c++; } return { s, c }; }
function checkWin(r) { const { s, c } = aliveCounts(r); if (s === 0) return 'citizens'; if (s >= c) return 'strangers'; return null; }
function ensurePresident(r) {
  const g = r.game; if (!g) return;
  if (g.alive.has(g.president) && r.players.has(g.president)) return;
  const cands = [...g.alive].filter(id => !g.strangers.has(id));
  g.president = cands.length ? pick(cands) : null;
}

function snapshot(g) {
  return { alive: [...g.alive], eliminated: g.eliminated.slice(), history: g.history.length, correct: { ...g.correct }, survive: { ...g.survive }, president: g.president };
}
function restore(g, s) {
  g.alive = new Set(s.alive); g.eliminated = s.eliminated.slice(); g.history.length = s.history; g.correct = { ...s.correct }; g.survive = { ...s.survive }; g.president = s.president;
  g.winner = null; g.last = null; g.votes = {}; g.candidates = null; g.revote = false; g.deadline = 0; g.turn = { order: [], idx: -1 };
}

function setWord(r, category, word) {
  const g = r.game;
  g.snap = snapshot(g);
  g.round++; g.category = clean(category, 20) || 'كلمة'; g.word = clean(word, 30);
  g.usedWords.add(g.word); g.words.push({ round: g.round, category: g.category, word: g.word });
  g.turn = { order: [], idx: -1 }; g.votes = {}; g.candidates = null; g.revote = false; g.last = null;
  r.phase = 'ask'; bump('rounds');
  stats.categories[g.category] = (stats.categories[g.category] || 0) + 1; statsDirty = true;
}

const askers = r => { const g = r.game; return r.order.filter(id => g.alive.has(id) && id !== g.president); };
function setStarter(r, id) {
  const g = r.game; const list = askers(r); const i = list.indexOf(id); if (i < 0) return;
  g.turn = { order: list.slice(i).concat(list.slice(0, i)), idx: 0 };
}
function candidatesFor(r) {
  const g = r.game;
  if (g.candidates) return g.candidates.filter(id => g.alive.has(id));
  return r.order.filter(id => g.alive.has(id) && id !== g.president);
}
function openVote(r, candidates) {
  const g = r.game; r.phase = 'vote'; g.votes = {}; g.candidates = candidates || null; g.revote = !!candidates;
  clearTimeout(r.timerHandle); g.deadline = 0;
  if (r.settings.timer) {
    g.deadline = Date.now() + r.settings.timer * 1000;
    r.timerHandle = setTimeout(() => { if (r.phase === 'vote') { tally(r); broadcast(r); } }, r.settings.timer * 1000 + 300);
  }
}
function maybeCloseVote(r) { const g = r.game; if ([...g.alive].every(id => g.votes[id])) tally(r); }

function tally(r) {
  const g = r.game; clearTimeout(r.timerHandle); g.deadline = 0;
  const cands = candidatesFor(r); const counts = {}; cands.forEach(id => counts[id] = 0);
  for (const [v, t] of Object.entries(g.votes)) if (g.alive.has(v) && counts[t] !== undefined) counts[t]++;
  for (const [v, t] of Object.entries(g.votes)) if (!g.strangers.has(v) && g.strangers.has(t)) g.correct[v] = (g.correct[v] || 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter(id => counts[id] === max && max > 0);
  const voted = Object.keys(g.votes).length;
  if (top.length > 1 && !g.revote) { g.last = { type: 'tie', ids: top, counts, voted }; openVote(r, top); return; }
  if (top.length === 1) {
    const id = top[0]; g.alive.delete(id);
    const wasS = g.strangers.has(id);
    g.eliminated.push({ id, round: g.round, stranger: wasS });
    g.last = { type: 'out', id, stranger: wasS, counts, voted };
    g.history.push({ round: g.round, category: g.category, word: g.word, out: id, stranger: wasS });
  } else {
    g.last = { type: 'none', counts, voted, ids: top };
    g.history.push({ round: g.round, category: g.category, word: g.word, out: null });
  }
  for (const s of g.strangers) if (g.alive.has(s)) g.survive[s] = (g.survive[s] || 0) + 1;
  r.phase = 'result';
  ensurePresident(r);
  const w = checkWin(r); if (w) { g.winner = w; g.last.gameOver = w; }
}

function removeFromGame(r, id) {
  const g = r.game; if (!g || !g.alive.has(id)) return;
  g.alive.delete(id); delete g.votes[id];
  g.eliminated.push({ id, round: g.round, stranger: g.strangers.has(id), left: true });
  if (g.snap) g.snap.alive = g.snap.alive.filter(x => x !== id);
  if (g.turn && g.turn.order.length) {
    const i = g.turn.order.indexOf(id);
    if (i >= 0) { g.turn.order.splice(i, 1); if (g.turn.idx > i) g.turn.idx--; if (g.turn.idx >= g.turn.order.length) g.turn.idx = g.turn.order.length - 1; }
  }
  ensurePresident(r);
  if (r.phase !== 'end' && !g.winner) {
    const w = checkWin(r);
    if (w) { g.winner = w; g.last = { type: 'left', id, gameOver: w, stranger: g.strangers.has(id) }; r.phase = 'result'; clearTimeout(r.timerHandle); }
    else if (r.phase === 'vote') maybeCloseVote(r);
  }
}

// النقاط: الفريق الرابح +3، «منّا وفينا» +1 لكل صوت صاب غريب، الغريب +1 لكل سؤال ضل فيه
function finishGame(r, stopped) {
  const g = r.game; g.stopped = !!stopped;
  if (stopped) { g.winner = g.winner || null; bump('stopped'); }
  else if (g.winner === 'strangers') bump('strangerWins'); else if (g.winner === 'citizens') bump('citizenWins');
  const res = g.players.filter(id => r.players.has(id)).map(id => {
    const isS = g.strangers.has(id);
    const won = g.winner ? ((g.winner === 'strangers') === isS) : null;
    const pts = (won ? 3 : 0) + (isS ? (g.survive[id] || 0) : (g.correct[id] || 0));
    return { id, stranger: isS, won, points: pts, correct: g.correct[id] || 0, survive: g.survive[id] || 0, out: g.eliminated.find(e => e.id === id) || null };
  }).sort((a, b) => b.points - a.points);
  let rank = 0, prev = null;
  res.forEach((x, i) => { if (x.points !== prev) { rank = i + 1; prev = x.points; } x.rank = rank; });
  g.results = res;
  for (const x of res) {
    const t = r.tally[x.id]; if (!t) continue;
    t.points += x.points; if (x.won) t.wins++; if (x.stranger) t.stranger++; if (x.stranger && x.out && !x.out.left) t.caught++;
  }
  clearTimeout(r.timerHandle);
  r.phase = 'end';
}

// ---------- العرض لكل لاعب ----------
function viewFor(r, pid) {
  const me = r.players.get(pid); const g = r.game; const ended = r.phase === 'end';
  const players = playersArr(r).map(p => {
    const out = g ? g.eliminated.find(e => e.id === p.id) : null;
    return {
      id: p.id, name: p.name, gender: p.gender, color: p.color, hasPhoto: !!p.photo, online: !!p.ws, spectator: p.spectator,
      alive: g ? g.alive.has(p.id) : true, president: g ? g.president === p.id : false,
      out: out ? { round: out.round, left: !!out.left, stranger: (r.settings.reveal || ended) ? out.stranger : null } : null,
      ready: r.ready.has(p.id), tally: r.tally[p.id] || null
    };
  });
  const v = {
    t: 'state', me: pid, owner: r.ownerId, phase: r.phase, countIn: r.countAt ? Math.max(0, r.countAt - Date.now()) : 0,
    room: { code: r.code, name: r.name, kind: r.kind, settings: r.settings, games: r.gamesPlayed, min: MIN_PLAYERS },
    players
  };
  if (g) {
    const isS = g.strangers.has(pid); const inGame = me && !me.spectator && g.players.includes(pid);
    const { s } = aliveCounts(r);
    v.game = {
      round: g.round, president: g.president, startCount: g.startCount, strangerCount: g.strangerCount,
      aliveCount: g.alive.size, strangersLeft: (r.settings.reveal || ended) ? s : null,
      role: !inGame ? 'spectator' : isS ? 'stranger' : 'citizen',
      mates: isS && r.settings.mates ? [...g.strangers].filter(id => id !== pid) : [],
      category: g.category,
      word: (!isS && inGame && g.alive.has(pid)) || ended ? g.word : null,
      turn: g.turn, candidates: r.phase === 'vote' ? candidatesFor(r) : null, revote: g.revote,
      votedCount: Object.keys(g.votes).length, voterCount: g.alive.size, myVote: g.votes[pid] || null,
      deadline: g.deadline ? g.deadline - Date.now() : 0,
      last: g.last ? { ...g.last, stranger: (r.settings.reveal || g.last.gameOver) ? g.last.stranger : null } : null,
      winner: g.winner, canRedo: !!g.snap && ['ask', 'vote', 'result'].includes(r.phase),
      categories: Object.keys(WORDS)
    };
    if (ended) v.game.end = { strangers: [...g.strangers], words: g.words, history: g.history, results: g.results, stopped: g.stopped, revealMode: r.revealMode || 'all' };
  }
  return v;
}
function broadcast(r) { for (const p of r.players.values()) send(p, viewFor(r, p.id)); }
function sendPhotosTo(r, p) {
  const photos = {}; for (const q of r.players.values()) if (q.photo) photos[q.id] = q.photo;
  send(p, { t: 'photos', photos, group: r.groupPhoto });
}
function broadcastPhoto(r, id, photo) { for (const p of r.players.values()) send(p, { t: 'photo', id, photo }); }

// ---------- الرسائل ----------
wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => ws.isAlive = true);
  let room = null, me = null;
  const err = m => { try { ws.send(JSON.stringify({ t: 'err', m })); } catch (e) {} };
  const bind = (r, p) => {
    if (p.ws && p.ws !== ws) { try { p.ws.send(JSON.stringify({ t: 'kicked', m: 'فتحت القعدة من مكان تاني' })); p.ws.close(); } catch (e) {} }
    room = r; me = p; p.ws = ws; p.lastSeen = Date.now();
    try { ws.send(JSON.stringify({ t: 'joined', code: r.code, id: p.id, token: p.token })); } catch (e) {}
    sendPhotosTo(r, p); broadcast(r);
  };
  const isOwner = () => room && me && room.ownerId === me.id;
  const isPres = () => room && me && room.game && room.game.president === me.id;
  const canLead = () => isOwner() || isPres();
  const canPick = () => isPres() || (isOwner() && room.game && !(room.players.get(room.game.president) || {}).ws);

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    switch (m.t) {
      case 'create': { const nr = makeRoom(m.roomName, m.kind); nr.groupPhoto = okPhoto(m.group); const p = addPlayer(nr, m); nr.ownerId = p.id; bind(nr, p); return; }
      case 'resume': {
        const rr = rooms.get(String(m.code || '').toUpperCase());
        if (!rr) return err('القعدة خلصت أو الكود غلط');
        const p = [...rr.players.values()].find(x => x.token === m.token);
        if (!p) return err('ما لقينا مكانك بالقعدة، فوت من جديد');
        bind(rr, p); return;
      }
      case 'join': {
        const rr = rooms.get(String(m.code || '').toUpperCase());
        if (!rr) return err('ما في قعدة بهالكود');
        if (rr.players.size >= MAX_PLAYERS) return err('القعدة فوّلت');
        const p = addPlayer(rr, m); bind(rr, p); if (p.photo) broadcastPhoto(rr, p.id, p.photo); return;
      }
    }
    const r = room; if (!r || !me) return;
    me.lastSeen = Date.now();
    const g = r.game;
    switch (m.t) {
      case 'profile': {
        if (m.name !== undefined) me.name = clean(m.name) || me.name;
        if (m.gender) me.gender = m.gender === 'f' ? 'f' : 'm';
        if (m.photo !== undefined) { me.photo = okPhoto(m.photo); broadcastPhoto(r, me.id, me.photo); }
        break;
      }
      case 'room': {
        if (!isOwner()) return;
        if (m.name !== undefined) r.name = clean(m.name, 30) || r.name;
        if (m.kind !== undefined) r.kind = clean(m.kind, 20) || r.kind;
        if (m.group !== undefined) { r.groupPhoto = okPhoto(m.group); for (const p of r.players.values()) send(p, { t: 'group', photo: r.groupPhoto }); }
        break;
      }
      case 'settings': {
        if (!isOwner() || !['lobby', 'end'].includes(r.phase)) return;
        const s = r.settings;
        if (m.strangers !== undefined) s.strangers = Math.max(0, Math.min(10, parseInt(m.strangers) || 0));
        if (m.reveal !== undefined) s.reveal = !!m.reveal;
        if (m.mates !== undefined) s.mates = !!m.mates;
        if (m.timer !== undefined) s.timer = [0, 30, 60].includes(+m.timer) ? +m.timer : 0;
        break;
      }
      case 'start': { if (!isOwner() || !['lobby', 'end'].includes(r.phase)) return; const e = openReady(r); if (e) return err(e); break; }
      case 'ready': { if (r.phase !== 'ready') return; if (m.v === false) r.ready.delete(me.id); else r.ready.add(me.id); maybeCountdown(r, false); break; }
      case 'go': { if (!isOwner()) return; maybeCountdown(r, true); break; }
      case 'shuffleWord': {
        if (!canPick() || r.phase !== 'pick') return;
        const cat = WORDS[m.category] ? m.category : pick(Object.keys(WORDS));
        const pool = WORDS[cat].filter(w => !g.usedWords.has(w) && w !== m.not);
        send(me, { t: 'suggest', category: cat, word: pick(pool.length ? pool : WORDS[cat]) });
        return;
      }
      case 'setWord': {
        if (!canPick() || r.phase !== 'pick' || g.winner) return;
        if (!clean(m.word, 30)) return err('اكتب الكلمة');
        setWord(r, m.category, m.word); break;
      }
      case 'newQuestion': { if (!canLead() || r.phase !== 'result' || g.winner) return; r.phase = 'pick'; g.last = null; break; }
      case 'starter': { if (!canLead() || r.phase !== 'ask') return; setStarter(r, m.id); break; }
      case 'nextTurn': {
        if (!canLead() || r.phase !== 'ask' || !g.turn || !g.turn.order.length) return;
        g.turn.idx = Math.min(g.turn.order.length, g.turn.idx + 1); break;
      }
      case 'prevTurn': { if (!canLead() || r.phase !== 'ask' || !g.turn || g.turn.idx <= 0) return; g.turn.idx--; break; }
      case 'toVote': { if (!canLead() || r.phase !== 'ask') return; openVote(r, null); break; }
      case 'vote': {
        if (r.phase !== 'vote' || !g.alive.has(me.id)) return;
        if (!candidatesFor(r).includes(m.id) || m.id === me.id) return;
        g.votes[me.id] = m.id; maybeCloseVote(r); break;
      }
      case 'closeVote': { if (!canLead() || r.phase !== 'vote') return; tally(r); break; }
      // أدوات الريس
      case 'pass': { // تمرير: الكلمة بتنشال كأنها ما انطرحت
        if (!canLead() || !g || !g.snap || !['ask', 'vote'].includes(r.phase)) return;
        clearTimeout(r.timerHandle); restore(g, g.snap); g.words.pop(); g.round--; g.snap = null; g.category = null; g.word = null; r.phase = 'pick'; break;
      }
      case 'redo': { // إعادة: نفس الكلمة من أول الدور والنتيجة بتنلغى
        if (!canLead() || !g || !g.snap || !['ask', 'vote', 'result'].includes(r.phase)) return;
        clearTimeout(r.timerHandle); restore(g, g.snap); r.phase = 'ask'; break;
      }
      case 'stopNow': { if (!isOwner() || !g || r.phase === 'end') return; finishGame(r, !g.winner); r.revealMode = 'all'; break; }
      case 'reveal': { // الكشف الكبير بأحد الخيارات التلاتة
        if (!canLead() || !g || !g.winner || r.phase === 'end') return;
        r.revealMode = ['all', 'top3', 'one'].includes(m.mode) ? m.mode : 'all';
        finishGame(r, false); break;
      }
      case 'newPresident': {
        if (!isOwner() || !g || g.winner) return;
        const cands = [...g.alive].filter(id => !g.strangers.has(id) && id !== g.president);
        if (cands.length) g.president = pick(cands); break;
      }
      case 'kick': {
        if (!isOwner() || m.id === me.id) return;
        const p = r.players.get(m.id); if (!p) return;
        send(p, { t: 'kicked', m: 'الريس طلّعك من القعدة' }); try { p.ws && p.ws.close(); } catch (e) {}
        if (g) removeFromGame(r, p.id);
        r.players.delete(p.id); r.order = r.order.filter(x => x !== p.id); r.ready.delete(p.id);
        maybeCountdown(r, false); break;
      }
      case 'rename': { if (!isOwner()) return; const p = r.players.get(m.id); if (p) p.name = clean(m.name) || p.name; break; }
      case 'transfer': { if (!isOwner() || !r.players.has(m.id)) return; r.ownerId = m.id; break; }
      case 'claimOwner': {
        const o = r.players.get(r.ownerId);
        if (o && o.ws && Date.now() - o.lastSeen < 45000) return err('الريس لسا موجود');
        r.ownerId = me.id; break;
      }
      case 'samePeople': { // قعدة جديدة بنفس الناس
        if (!isOwner()) return; clearTimeout(r.timerHandle); clearTimeout(r.countHandle);
        r.game = null; r.phase = 'lobby'; r.ready = new Set(); playersArr(r).forEach(p => p.spectator = false); break;
      }
      case 'newPeople': { // قعدة جديدة بناس جدد: كود جديد والباقي بيطلعوا
        if (!isOwner()) return;
        for (const p of r.players.values()) if (p.id !== me.id) { send(p, { t: 'closed', m: 'الريس فتح قعدة جديدة بناس جدد' }); try { p.ws && p.ws.close(); } catch (e) {} }
        clearTimeout(r.timerHandle); clearTimeout(r.countHandle);
        rooms.delete(r.code);
        const nr = makeRoom(r.name, r.kind); nr.groupPhoto = null; nr.settings = { ...r.settings };
        const p = addPlayer(nr, me); p.photo = me.photo; p.token = me.token; nr.ownerId = p.id;
        me.ws = null; r.players.clear(); r.order = []; // القعدة القديمة ما عاد تبعت شي
        room = null; me = null; bind(nr, p); return;
      }
      case 'done': { if (!isOwner()) return; closeRoom(r, 'الريس سكّر القعدة. يسلموا عالقعدة الحلوة'); return; }
      case 'leave': {
        if (g) removeFromGame(r, me.id);
        r.players.delete(me.id); r.order = r.order.filter(x => x !== me.id); r.ready.delete(me.id);
        if (r.ownerId === me.id) r.ownerId = r.order.find(id => r.players.get(id).ws) || r.order[0] || null;
        me.ws = null; room = null; me = null;
        if (!r.players.size) { closeRoom(r, ''); return; }
        maybeCountdown(r, false); break;
      }
      case 'ping': return;
      default: return;
    }
    broadcast(r);
  });

  ws.on('close', () => {
    if (me && me.ws === ws) { me.ws = null; me.lastSeen = Date.now(); if (room) { maybeCountdown(room, false); broadcast(room); } }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; try { ws.ping(); } catch (e) {} });
  const now = Date.now();
  for (const r of rooms.values()) {
    const ps = [...r.players.values()];
    if (!ps.some(p => p.ws) && ps.every(p => now - p.lastSeen > 30 * 60000)) { closeRoom(r, ''); continue; }
    const o = r.players.get(r.ownerId);
    if (!o || (!o.ws && now - o.lastSeen > 60000)) {
      const nxt = r.order.map(id => r.players.get(id)).find(p => p && p.ws);
      if (nxt && nxt.id !== r.ownerId) { r.ownerId = nxt.id; broadcast(r); }
    }
  }
}, 20000);

server.listen(PORT, () => console.log('قعدة غريب شغّالة على ' + PORT));
