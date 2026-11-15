/* قعدة غريب — عيلة تحدّي ولعب — إعداد م. إياد حلوبي */
(() => {
const $ = s => document.querySelector(s);
const app = $('#app'), layer = $('#layer');
// رابط صفحة الإنستغرام لزر «شارك مع صحابك» (بيتغيّر لرابط صفحة قعدة لما تجهز)
const IG = 'https://instagram.com/eyad.hloubi';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls = { get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }, del(k){ try{ localStorage.removeItem(k); }catch(e){} } };
const I = (n, cls = 'i') => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;

const url = new URL(location.href);
const qCode = (url.searchParams.get('r') || '').toUpperCase();
const qName = (url.searchParams.get('n') || '').slice(0, 24);

const S = {
  view: 'home', mode: 'create', joinCode: qCode, profile: { name: qName, gender: '', photo: null },
  roomName: '', kind: 'شلة', group: null, st: null, photos: {}, suggest: null, custom: false,
  peeking: false, ws: null, wsReady: false, queue: [], lastPhase: null, endsAt: 0,
  endFor: -1, endStage: 0, rankStep: 0, endSkipped: -1, storyForm: 'file', storyTheme: 'light', storyUrl: null,
  installEvt: null, back: [], fwd: [], drawer: false, soundHint: false, howStep: 0
};
if (qCode) S.mode = 'join';

// ---------- الثيم ----------
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
const savedTheme = ls.get('gh:theme'); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
function toggleTheme(){ const n = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = n; ls.set('gh:theme', n); render(); }

// ---------- الصوت (بيتفعّل مع أول لمسة) ----------
let AC = null;
function ac(){ if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, d = .12, type = 'square', v = .05, when = 0){ const a = ac(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, a.currentTime + when); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + when + d); o.connect(g).connect(a.destination); o.start(a.currentTime + when); o.stop(a.currentTime + when + d + .02); }
const sfx = {
  tap(){ tone(520, .06, 'triangle', .05); },
  tick(){ tone(880, .09, 'square', .05); },
  go(){ tone(1320, .35, 'square', .06); },
  drum(n = 18){ for (let i = 0; i < n; i++) tone(90 + Math.random()*30, .08, 'triangle', .1, i * .09); },
  bad(){ tone(300, .25, 'sawtooth', .05); tone(200, .35, 'sawtooth', .05, .2); },
  good(){ [523,659,784,1046].forEach((f,i) => tone(f, .18, 'triangle', .06, i*.1)); },
  sting(){ [392,494,587,784].forEach((f,i) => tone(f, .5, 'square', .035, i*.02)); },
  whoosh(){ for (let i = 0; i < 6; i++) tone(300 + i*120, .07, 'triangle', .04, i*.03); }
};
const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch(e){} };
document.addEventListener('pointerdown', () => { ac(); if (!S.soundHint) { S.soundHint = true; toast('علّي صوت الموبايل، اللعبة إلها صوت'); } }, { once: true });

// ---------- الاتصال (مع رجوع تلقائي) ----------
function connect(){
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host);
  S.ws = ws;
  ws.onopen = () => { S.wsReady = true; const q = S.queue; S.queue = []; q.forEach(m => ws.send(JSON.stringify(m))); };
  ws.onmessage = e => onMsg(JSON.parse(e.data));
  ws.onclose = () => { S.wsReady = false; S.ws = null; const ss = ls.get('gh:session'); if (ss && S.st) setTimeout(() => send({ t: 'resume', code: ss.code, token: ss.token }), 1200); };
}
function send(m){ if (S.ws && S.wsReady) S.ws.send(JSON.stringify(m)); else { S.queue.push(m); if (!S.ws) connect(); } }
setInterval(() => { if (S.wsReady) send({ t: 'ping' }); }, 25000);
document.addEventListener('visibilitychange', () => { const ss = ls.get('gh:session'); if (!document.hidden && !S.wsReady && ss) send({ t: 'resume', code: ss.code, token: ss.token }); });

function onMsg(m){
  switch (m.t) {
    case 'joined': ls.set('gh:session', { code: m.code, token: m.token }); if (S.view !== 'home') S.view = 'room'; history.replaceState(null, '', '?r=' + m.code); break;
    case 'photos': S.photos = m.photos || {}; S.group = m.group || null; break;
    case 'photo': if (m.photo) S.photos[m.id] = m.photo; else delete S.photos[m.id]; S.storyUrl = null; break;
    case 'group': S.group = m.photo; S.storyUrl = null; break;
    case 'suggest': S.suggest = { category: m.category, word: m.word }; S.custom = false; break;
    case 'state': onState(m); break;
    case 'err': toast(m.m); if (/خلصت|ما لقينا|ما في قعدة|فوّلت/.test(m.m) && !S.st) { ls.del('gh:session'); S.view = 'home'; history.replaceState(null, '', location.pathname); } break;
    case 'kicked': case 'closed': ls.del('gh:session'); S.st = null; S.back = []; S.fwd = []; S.view = 'home'; if (m.m) sheet(`<h3>${esc(m.m)}</h3><p class="muted">فيك تفتح قعدة جديدة أو تفوت على وحدة تانية.</p>`); history.replaceState(null, '', location.pathname); break;
  }
  render();
}

function onState(st){
  const prev = S.st; S.st = st; const g = st.game;
  S.endsAt = g && g.deadline ? Date.now() + g.deadline : 0;
  if (st.phase !== S.lastPhase) {
    if (st.phase === 'countdown') runCount(st.countIn);
    if (st.phase === 'ready') S.howStep = 0;
    if (st.phase === 'pick') { S.suggest = null; S.custom = false; if (prev && ['countdown','ready','lobby','end'].includes(prev.phase)) { vib(80); sfx.sting(); } }
    if (st.phase === 'ask') { vib(40); sfx.tap(); }
    if (st.phase === 'vote') { vib([40,40,40]); sfx.whoosh(); }
    if (st.phase === 'result' && g && g.last && g.last.type === 'out') { const l = g.last; sfx.drum(10); setTimeout(() => l.stranger === true ? sfx.good() : l.stranger === false ? sfx.bad() : sfx.tap(), 1000); }
    if (st.phase === 'end' && S.endFor !== st.room.games) { S.endFor = st.room.games; S.endStage = 0; S.rankStep = 0; S.storyUrl = null; runEnd(); }
    if (st.phase === 'lobby') S.storyUrl = null;
    S.lastPhase = st.phase;
  }
}

// ---------- التنقل: رجوع وقدّام ----------
function go(v){ if (S.view !== v) { S.back.push(S.view); S.fwd = []; S.view = v; } closeDrawer(); render(); }
function goBack(){
  if (S.view === 'room') { S.fwd = ['room']; S.back = []; S.view = 'home'; }
  else if (S.back.length) { S.fwd.push(S.view); S.view = S.back.pop(); }
  closeDrawer(); render();
}
function goFwd(){ if (!S.fwd.length) return; const v = S.fwd.pop(); if (v === 'room' && !S.st) return; S.back.push(S.view); S.view = v; closeDrawer(); render(); }

// ---------- أدوات العرض ----------
function toast(t){ document.querySelectorAll('.toast').forEach(x => x.remove()); const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
const G = (p, m, f) => (p && p.gender === 'f') ? f : m;
const meP = () => S.st && S.st.players.find(p => p.id === S.st.me);
const P = id => S.st && S.st.players.find(p => p.id === id);
const isOwner = () => S.st && S.st.owner === S.st.me;
const isPres = () => S.st && S.st.game && S.st.game.president === S.st.me;
const canLead = () => isOwner() || isPres();
const canPick = () => isPres() || (isOwner() && S.st.game && !(P(S.st.game.president) || {}).online);
const qN = n => n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالين' : n + (n <= 10 ? ' أسئلة' : ' سؤال');
const pN = n => n === 0 ? 'ولا نقطة' : n === 1 ? 'نقطة' : n === 2 ? 'نقطتين' : n + (n <= 10 ? ' نقاط' : ' نقطة');

function face(color, odd){
  const eyes = odd
    ? `<rect x="11" y="22" width="16" height="10" rx="4" fill="#111"/><rect x="33" y="22" width="16" height="10" rx="4" fill="#111"/><rect x="26" y="24" width="8" height="3" fill="#111"/><circle cx="15" cy="25" r="1.6" fill="#fff"/>`
    : `<circle cx="21" cy="26" r="6" fill="#fff" stroke="#1C1A17" stroke-width="2.5"/><circle cx="39" cy="26" r="6" fill="#fff" stroke="#1C1A17" stroke-width="2.5"/><circle cx="22" cy="27" r="2.6" fill="#1C1A17"/><circle cx="40" cy="27" r="2.6" fill="#1C1A17"/>`;
  const mouth = odd ? `<path d="M23 42 q7 -3 14 0" stroke="#1C1A17" stroke-width="3" fill="none" stroke-linecap="round"/>` : `<path d="M20 39 q10 9 20 0" stroke="#1C1A17" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="27" fill="${color}" stroke="#1C1A17" stroke-width="3"/>${eyes}${mouth}</svg>`;
}
function av(p, extra = '', opts = {}){
  if (!p) return '';
  const ph = S.photos[p.id];
  const inner = ph ? `<img src="${ph}" alt="">` : face(p.color, opts.odd);
  const off = (p.out || p.alive === false) && opts.x !== false ? ' off' : '';
  return `<div class="av${off}" style="border-color:${p.color};${extra}"><div class="in">${inner}</div>${p.president && opts.crown !== false ? `<span class="badge">${I('crown')}</span>` : ''}${p.out && opts.x !== false ? '<span class="x">✕</span>' : ''}</div>`;
}
const meCls = p => p && S.st && p.id === S.st.me ? ' me' : '';

// شعار قعدة الرسمي (ملصق Lalezar مع القلطق)
const LOGO = `<svg x="25.3" y="21" width="149.4" height="58" viewBox="96 101 415 161"><g transform="translate(8 8)" fill="#1C1A17"><rect x="379.5" y="113" width="95.5" height="129" rx="24"/><rect x="359.5" y="169" width="28" height="77" rx="12"/><rect x="467.0" y="169" width="28" height="77" rx="12"/><rect x="361.5" y="228" width="131.5" height="22" rx="9"/></g><g fill="#C9962E" stroke="#1C1A17" stroke-width="5"><rect x="379.5" y="113" width="95.5" height="129" rx="24"/><rect x="359.5" y="169" width="28" height="77" rx="12"/><rect x="467.0" y="169" width="28" height="77" rx="12"/><rect x="361.5" y="228" width="131.5" height="22" rx="9"/></g><text x="460" y="220" direction="rtl" text-anchor="start" font-family="Lalezar" font-weight="400" font-size="160" fill="#1C1A17">قـــعدة</text><rect x="395.5" y="119.5" width="31.5" height="31.5" rx="9.4" fill="#B5483A" stroke="#1C1A17" stroke-width="3"/><circle cx="411.2" cy="135.3" r="2.4" fill="#000" opacity="0.28"/><rect x="429.0" y="119.5" width="31.5" height="31.5" rx="9.4" fill="#3E5C76" stroke="#1C1A17" stroke-width="3"/><circle cx="444.7" cy="135.3" r="2.4" fill="#000" opacity="0.28"/></svg>`;
// رسمة قعدة غريب: وجهين عاديين وبالنص الغريب بنظارته
const ART = `<g transform="translate(100 142) scale(0.72) translate(-100 -122)" stroke="#1C1A17" stroke-width="5"><circle cx="46" cy="134" r="24" fill="#F6F1E7"/><circle cx="38" cy="130" r="3.5" fill="#1C1A17" stroke="none"/><circle cx="54" cy="130" r="3.5" fill="#1C1A17" stroke="none"/><path d="M36 142q10 8 20 0" fill="none" stroke-linecap="round"/><circle cx="154" cy="134" r="24" fill="#F6F1E7"/><circle cx="146" cy="130" r="3.5" fill="#1C1A17" stroke="none"/><circle cx="162" cy="130" r="3.5" fill="#1C1A17" stroke="none"/><path d="M144 142q10 8 20 0" fill="none" stroke-linecap="round"/><circle cx="100" cy="122" r="36" fill="#C9962E"/><rect x="72" y="108" width="24" height="16" rx="6" fill="#1C1A17"/><rect x="104" y="108" width="24" height="16" rx="6" fill="#1C1A17"/><path d="M96 113h8"/><path d="M88 142q12-5 24 0" fill="none" stroke-linecap="round"/><circle cx="79" cy="112" r="2.4" fill="#F6F1E7" stroke="none"/></g>`;
const APPICON = `<svg class="appicon" viewBox="0 0 200 200" aria-label="أيقونة قعدة غريب"><rect width="200" height="200" rx="46" fill="#B5483A"/><rect x="21" y="19" width="168" height="72" rx="16" fill="#1C1A17"/><rect x="16" y="14" width="168" height="72" rx="16" fill="#F6F1E7" stroke="#1C1A17" stroke-width="4"/>${LOGO}${ART}</svg>`;

function render(){
  const a = document.activeElement; let keep = null;
  if (a && a.dataset && a.dataset.keep) keep = { k: a.dataset.keep, v: a.value, s: a.selectionStart, e: a.selectionEnd };
  let body;
  if (S.view === 'home') body = vHome();
  else if (S.view === 'profile') body = vProfile();
  else if (S.view === 'room' && S.st) body = vRoom();
  else body = `<div class="revealstage"><div class="faces"><div class="f">${face('#D9443A')}</div><div class="f odd">${face('#E9B23A', true)}</div></div><b class="dots">عم نوصل</b></div>`;
  app.innerHTML = frame() + body;
  if (keep) { const el = app.querySelector(`[data-keep="${keep.k}"]`); if (el) { el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch(e){} } }
  afterRender();
}

// ---------- الإطار الثابت فوق: الكرسي واسم العيلة والرجوع، والباقي بالسحّاب ----------
function frame(){
  const me = meP(); const inRoom = S.view === 'room' && S.st;
  const canBack = S.view !== 'home';
  return `<div class="frame ${S.drawer ? 'open' : ''}" id="frame">
    <div class="fbar">
      <div class="fam"><svg><use href="#ch-play"/></svg><b>تحدّي ولعب</b></div>
      ${inRoom && isOwner() ? `<button class="ib crown" data-a="tools" aria-label="أدوات الريس">${I('crown')}</button>` : ''}
      <button class="ib" data-a="back" aria-label="رجوع" ${canBack ? '' : 'disabled style="opacity:.35"'}>${I('back')}</button>
    </div>
    <div class="drawer" id="drawer">
      <button data-a="homeMenu"><i>${I('home')}</i>البيت</button>
      <button data-a="fwd" ${S.fwd.length ? '' : 'disabled'}><i>${I('fwd')}</i>قدّام</button>
      <button data-a="account"><i class="av">${me && S.photos[me.id] ? `<img src="${S.photos[me.id]}" alt="">` : I('user')}</i>حسابي</button>
      <button data-a="theme"><i>${I(isDark() ? 'sun' : 'moon')}</i>${isDark() ? 'فاتح' : 'داكن'}</button>
      <button data-a="help"><i>${I('help')}</i>التعليمات</button>
    </div>
    <button class="grip" id="grip" aria-expanded="${S.drawer}"><span></span><em style="font-style:normal">${S.drawer ? 'سكّر' : 'اسحب أو المس'}</em></button>
  </div>`;
}
function closeDrawer(){ S.drawer = false; const f = $('#frame'); if (f) f.classList.remove('open'); }

// ---------- الغلاف ----------
function vHome(){
  const cols = ['#2B8F84','#E9B23A','#D9443A','#5E46B0','#2E7DD1'];
  const oddAt = Math.floor(Date.now() / 4400) % 5;
  const ss = ls.get('gh:session');
  return `<div class="cover">
    ${APPICON}
    <h1>قعدة <span>غريب</span></h1>
    <div class="sub">الكل بيعرف الكلمة… إلا الغريب</div>
    <div class="by">إعداد م. إياد حلوبي</div>
    <div class="faces">${cols.map((c,i) => `<div class="f ${i===oddAt?'odd':''}">${face(c, i===oddAt)}</div>`).join('')}</div>
  </div>
  <div class="ticker"><span>${'الرئيس بيطرح الموضوع ✦ كل واحد بيجاوب ✦ الغريب بيدبّر حالو ✦ بعد كل سؤال منصوّت ✦ يا منكشفو يا بيربح ✦ '.repeat(4)}</span></div>
  <div class="facts"><span>${I('users')}4 لاعبين وأكتر</span><span>${I('phone')}كل واحد من موبايله</span><span>${I('clock')}10 لـ20 دقيقة</span></div>
  <div class="stack">
    ${ss ? `<button class="btn teal" data-a="resume">${I('fwd')} رجّعني عالقعدة (${esc(ss.code)})</button>` : ''}
    <button class="btn red" data-a="goCreate">افتح قعدة جديدة</button>
    <div class="card">
      <label class="lb">عندك كود؟</label>
      <div class="row"><input class="inp grow" id="code" data-keep="code" maxlength="5" placeholder="ABCDE" style="direction:ltr;text-align:center;letter-spacing:6px;text-transform:uppercase;font-weight:800" value="${esc(S.joinCode)}"><button class="btn sm" data-a="goJoin" style="padding:12px 18px">فوت</button></div>
    </div>
    <button class="btn ghost" data-a="install">${I('download')} نزّل التطبيق</button>
  </div>`;
}

// ---------- الاسم والصورة ----------
function vProfile(){
  const pr = S.profile; const c = S.mode === 'create';
  const fake = { id: '__me', color: '#D9443A' }; if (pr.photo) S.photos.__me = pr.photo; else delete S.photos.__me;
  const kinds = ['شلة','رفقة','عيلة','زملاء'];
  return `<div class="stack" style="margin-top:6px">
    <h1 style="font-size:30px">${c ? 'قعدة جديدة' : 'فوتة عالقعدة <span class="tag">' + esc(S.joinCode) + '</span>'}</h1>
    ${c ? `<div class="card stack">
      <div><label class="lb">اسم القعدة (بيطلع بصورة الستوري)</label><input class="inp" id="rname" data-keep="rname" maxlength="30" placeholder="مثلاً: شلة الخميس" value="${esc(S.roomName)}"></div>
      <div><label class="lb">نوع القعدة</label><div class="cats">${kinds.map(k => `<span class="chip ${S.kind===k?'on':''}" data-a="kind" data-v="${k}">${k}</span>`).join('')}<input class="inp" id="kindc" data-keep="kindc" maxlength="20" placeholder="غير شي؟ اكتبو" style="width:150px;padding:5px 10px;font-size:14px" value="${kinds.includes(S.kind)?'':esc(S.kind)}"></div></div>
      <div><label class="lb">صورة الشلة (اختياري)</label>
        ${S.group ? `<img class="gphoto" src="${S.group}" alt="صورة الشلة"><div class="row wrapf" style="margin-top:8px"><button class="btn ghost sm" data-a="groupEdit">${I('rotate')} عدّلها</button><button class="btn ghost sm" data-a="groupPick">${I('image')} غيّرها</button><button class="btn ghost sm" data-a="groupRm">شيلها</button></div>`
        : `<div class="row wrapf"><button class="btn ghost sm" data-a="groupSelfie">${I('camera')} سيلفي جماعي</button><button class="btn ghost sm" data-a="groupPick">${I('image')} من المعرض</button></div>`}
      </div>
    </div>` : ''}
    <div class="card stack">
      <div><label class="lb">اسمك</label><input class="inp" id="pname" data-keep="pname" maxlength="24" placeholder="شو بيندهولك؟" value="${esc(pr.name)}"></div>
      <div><label class="lb">انت…</label><div class="gender"><span class="chip ${pr.gender==='m'?'on':''}" data-a="gender" data-v="m">شب</span><span class="chip ${pr.gender==='f'?'on':''}" data-a="gender" data-v="f">صبية</span></div></div>
      <div><label class="lb">صورتك (اختياري)</label>
        <div class="photo-pick">${av(fake)}
          <div class="row wrapf"><button class="btn ghost sm" data-a="selfie">${I('camera')} سيلفي</button><button class="btn ghost sm" data-a="pickPhoto">${I('image')} من المعرض</button>${pr.photo ? `<button class="btn ghost sm" data-a="editPhoto">عدّلها</button><button class="btn ghost sm" data-a="rmPhoto">شيلها</button>` : ''}</div>
        </div>
      </div>
    </div>
    <button class="btn red" data-a="${c ? 'create' : 'join'}">${c ? 'افتح القعدة' : 'يلا فوت'}</button>
  </div>`;
}

// ---------- الغرفة ----------
function vRoom(){
  switch (S.st.phase) {
    case 'lobby': return vLobby();
    case 'ready': case 'countdown': return vReady();
    case 'pick': return vPick();
    case 'ask': return vAsk();
    case 'vote': return vVote();
    case 'result': return vResult();
    case 'end': return vEnd();
  }
  return '';
}

function vLobby(){
  const st = S.st, ps = st.players, own = isOwner(), s = st.room.settings;
  const link = location.origin + '/?r=' + st.room.code;
  const autoN = Math.max(1, Math.floor(ps.length / 3));
  const maxN = Math.max(1, Math.floor(Math.max(st.room.min, ps.length) / 3));
  const nStr = s.strangers ? Math.min(s.strangers, maxN) : autoN;
  return `<div class="stack">
    <div class="card center">
      <div class="muted" style="font-weight:600">${esc(st.room.kind)} · ${esc(st.room.name)}</div>
      <div class="code" style="margin-top:6px">${st.room.code}</div>
      <div class="qr" id="qr"></div>
      <div class="row" style="justify-content:center"><button class="btn ghost sm" data-a="copy" data-v="${esc(link)}">${I('copy')} انسخ الرابط</button><button class="btn ghost sm" data-a="shareLink" data-v="${esc(link)}">${I('share')} ابعتو</button></div>
    </div>
    ${S.group ? `<img class="gphoto" src="${S.group}" alt="صورة الشلة">` : own ? `<button class="btn ghost" data-a="groupSelfie">${I('camera')} صوّروا الشلة (بتطلع بالستوري)</button>` : ''}
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="font-size:20px">بالقعدة ${ps.length}</h3><span class="muted" style="font-size:13px">${ps.length < st.room.min ? 'بدنا ' + st.room.min + ' عالأقل' : 'جاهزين نبلّش'}</span></div>
      <div class="pgrid">${ps.map(p => `<div class="pl${meCls(p)} ${own && p.id !== st.me ? 'tap' : ''}" ${own && p.id !== st.me ? `data-a="pmenu" data-v="${p.id}"` : ''}>${av(p, p.online ? '' : 'opacity:.4')}<div class="nm">${esc(p.name)}</div><div class="sub">${p.id === st.owner ? 'الريس' : p.online ? '' : 'مو متصل'}${p.tally && p.tally.points ? ' · ' + pN(p.tally.points) : ''}</div></div>`).join('')}</div>
    </div>
    ${own ? `<div class="card">
      <h3 style="font-size:20px;margin-bottom:4px">إعدادات اللعبة</h3>
      <div class="set"><div><b>عدد الغرباء</b><small>لحد تلت القعدة (${maxN} كحد أقصى)</small></div>
        <div class="step"><button class="ib" data-a="str" data-v="-1">−</button><b>${s.strangers ? nStr : 'تلقائي (' + autoN + ')'}</b><button class="ib" data-a="str" data-v="1">+</button></div></div>
      <div class="set"><div><b>نكشف هوية اللي بيطلع؟</b><small>إذا طفيتها ما حدا بيعرف إذا كان غريب لآخر اللعبة</small></div><div class="sw ${s.reveal?'on':''}" data-a="set" data-k="reveal"></div></div>
      <div class="set"><div><b>الغرباء بيعرفوا بعض؟</b><small>بتفرق إذا في أكتر من غريب</small></div><div class="sw ${s.mates?'on':''}" data-a="set" data-k="mates"></div></div>
      <div class="set"><div><b>مؤقت التصويت</b></div><div class="cats">${[0,30,60].map(t => `<span class="chip ${s.timer===t?'on':''}" data-a="timer" data-v="${t}">${t ? t + ' ث' : 'مفتوح'}</span>`).join('')}</div></div>
    </div>` : `<div class="banner">${I('clock')}<span>استنّى الريس ${esc(P(st.owner)?.name || '')} يبلّش<span class="dots"></span></span></div>`}
  </div>
  ${own ? `<div class="foot"><div class="in"><button class="btn red" data-a="start" ${ps.length < st.room.min ? 'disabled' : ''}>يلا · فينا ${nStr} ${nStr > 1 ? 'غرباء' : 'غريب'}</button></div></div>` : ''}`;
}

// شاشة «جاهز» + موشن «كيف منلعب» بيعيد حالو
const HOW = [
  { cap: 'الكل بتطلعلو الكلمة… إلا الغريب', html: `<div class="phones"><div class="ph">كبة</div><div class="ph">كبة</div><div class="ph q">؟</div><div class="ph">كبة</div><div class="ph">كبة</div></div>` },
  { cap: 'الرئيس بيسأل كل واحد بدورو', html: `<div class="row"><div class="mini">${face('#E9B23A')}</div><div class="bubble">شو بتحطّ معها؟</div></div><div class="phones" style="margin-top:6px"><div class="mini">${face('#2B8F84')}</div><div class="mini">${face('#5E46B0', true)}</div><div class="mini">${face('#2E7DD1')}</div></div>` },
  { cap: 'الغريب بيجاوب متل الكل… وبيدبّر حالو', html: `<div class="row"><div class="mini">${face('#5E46B0', true)}</div><div class="bubble">لبن… أكيد لبن!</div></div>` },
  { cap: 'بعد كل سؤال منصوّت مين الغريب', html: `<div class="arrows"><span>↓</span><span>↓</span><span>↓</span></div><div class="mini" style="width:70px;height:70px">${face('#5E46B0', true)}</div>` },
  { cap: 'الأكتر أصوات بيطلع… يا منكشفو يا بيربح', html: `<div class="phones"><div class="mini">${face('#2B8F84')}</div><div class="mini bye">${face('#5E46B0', true)}</div><div class="mini">${face('#2E7DD1')}</div></div>` }
];
function vReady(){
  const st = S.st, me = meP(), ps = st.players; const r = ps.filter(p => p.ready).length;
  const on = ps.filter(p => p.online).length;
  return `<div class="stack">
    <h2 style="font-size:26px;text-align:center">كيف منلعب؟</h2>
    <div class="howto" id="howto"><div class="hdots">${HOW.map((_,i) => `<i class="${i===S.howStep?'on':''}"></i>`).join('')}</div>${HOW.map((h,i) => `<div class="scene ${i===S.howStep?'on':''}">${h.html}</div>`).join('')}<div class="cap" id="howcap">${HOW[S.howStep].cap}</div></div>
    <div class="card">
      <div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="font-size:20px">جاهزين؟</h3><span class="tag">${r} من ${on}</span></div>
      <div class="pgrid">${ps.map(p => `<div class="pl${meCls(p)}">${p.ready ? `<span class="ok">${I('check')}</span>` : ''}${av(p, p.online ? '' : 'opacity:.4', { crown: false })}<div class="nm">${esc(p.name)}</div><div class="sub">${p.ready ? G(p,'جاهز','جاهزة') : p.online ? G(p,'لسا مو جاهز','لسا مو جاهزة') : 'مو متصل'}</div></div>`).join('')}</div>
    </div>
    <p class="muted center" style="margin:0;font-size:14px">لما الكل يكبس «جاهز» منبلّش سوا بعد عدّ تنازلي</p>
  </div>
  <div class="foot"><div class="in">
    <button class="btn ${me && me.ready ? 'ghost' : 'teal'}" data-a="ready">${me && me.ready ? 'لحظة، مو جاهز' : I('check') + ' جاهز'}</button>
    ${isOwner() ? `<button class="btn ghost sm" style="width:100%" data-a="goNow"><span>بلّشوا هلّق بلا ما نستنّى</span></button>` : ''}
  </div></div>`;
}
function runCount(ms){
  const end = Date.now() + (ms || 3500); let last = -1;
  document.querySelectorAll('.count').forEach(x => x.remove());
  const d = document.createElement('div'); d.className = 'count'; document.body.appendChild(d);
  const t = setInterval(() => { const n = Math.max(0, Math.min(3, Math.ceil((end - Date.now()) / 1000)));
    if (n !== last) { last = n; d.innerHTML = `<b>${n || 'يلا!'}</b>`; n ? sfx.tick() : sfx.go(); vib(30); }
    if (Date.now() > end + 500) { clearInterval(t); d.remove(); } }, 100);
}

function roleCard(){
  const g = S.st.game; const me = meP();
  let cls = g.role, front = '';
  if (g.role === 'spectator') front = `<div class="t">عم تتفرّج</div><div>بتلعب بالجولة الجاية</div>`;
  else if (me && me.out) { cls = 'spectator'; front = `<div class="t">انت برّا اللعبة</div><div>${g.role === 'stranger' ? G(me,'كنت الغريب','كنتِ الغريبة') : G(me,'كنت منّا وفينا','كنتِ منّا وفينا')}، تفرّج بس</div>`; }
  else if (g.role === 'stranger') {
    const mates = (g.mates || []).map(id => P(id)?.name).filter(Boolean);
    front = `<div class="t">${G(me,'انت الغريب','انتِ الغريبة')}</div><div>${g.category ? 'الموضوع: <b>' + esc(g.category) + '</b> · الكلمة مخفية عنك' : 'ما حدا لازم يكشفك'}</div>${mates.length ? `<div style="font-size:13px;opacity:.85;margin-top:4px">معك بالسر: ${mates.map(esc).join('، ')}</div>` : ''}`;
  } else {
    if (isPres()) cls = 'president';
    front = `<div style="font-weight:800">${isPres() ? G(me,'انت الرئيس','انتِ الرئيسة') : 'منّا وفينا'}${g.category ? ' · ' + esc(g.category) : ''}</div>${g.word ? `<div class="w">${esc(g.word)}</div>` : `<div class="t">${isPres() ? 'نقّي الموضوع' : 'استنّى الكلمة'}</div>`}`;
  }
  return `<div class="role ${cls} ${S.peeking ? 'peek' : ''}" id="role"><div class="back"><div class="fp">${I('glasses')}</div><b>اضغط مطوّل لتشوف بطاقتك</b><span style="font-size:12px;opacity:.85">وخبّي الشاشة عن اللي حدّك</span></div><div class="front">${front}</div></div>`;
}
function gameHead(){
  const g = S.st.game; const pres = P(g.president);
  return `<div class="stat">
    <span class="chip static">السؤال ${g.round || 1}</span>
    <span class="chip static">${I('users')} باقي ${g.aliveCount} من ${g.startCount}</span>
    <span class="chip static">${I('glasses')} ${g.strangersLeft !== null ? 'باقي ' + g.strangersLeft + ' من ' + g.strangerCount : 'فينا ' + g.strangerCount}</span>
    ${pres ? `<span class="chip static">${I('crown')} ${esc(pres.name)}</span>` : ''}
  </div>${roleCard()}`;
}
function playersMini(opts = {}){
  const list = S.st.players.filter(p => !p.spectator);
  return `<div class="card" style="margin-top:14px"><div class="pgrid">${list.map(p => `<div class="pl${meCls(p)}${opts.cur === p.id ? ' cur' : ''}">${av(p)}<div class="nm">${esc(p.name)}</div><div class="sub">${p.president ? G(p,'الرئيس','الرئيسة') : p.out ? (p.out.stranger === true ? G(p,'كان غريب','كانت غريبة') : p.out.stranger === false ? G(p,'كان منّا','كانت منّا') : 'برّا') : ''}</div></div>`).join('')}</div></div>`;
}

function vPick(){
  const g = S.st.game, pres = P(g.president);
  let main;
  if (canPick()) {
    const sg = S.suggest;
    main = `<div class="card stack" style="margin-top:14px">
      <h3 style="font-size:22px">${isPres() ? 'شو موضوعنا هالمرة؟' : 'الرئيس مو متصل، فيك تنقّي عنو'}</h3>
      <div class="cats">${g.categories.map(c => `<span class="chip ${sg && sg.category===c && !S.custom ? 'on' : ''}" data-a="cat" data-v="${esc(c)}">${esc(c)}</span>`).join('')}<span class="chip" data-a="cat" data-v="">عشوائي</span><span class="chip ${S.custom?'on':''}" data-a="custom">من عندي</span></div>
      ${S.custom ? `<div class="stack"><input class="inp" id="cc" data-keep="cc" maxlength="20" placeholder="الموضوع (مثلاً: لون، منتج…)"><input class="inp" id="cw" data-keep="cw" maxlength="30" placeholder="الكلمة السرية"></div><button class="btn red" data-a="sendCustom">يلا، اطرح</button>`
      : sg ? `<div class="sugg"><div class="c">${esc(sg.category)}</div><div class="w">${esc(sg.word)}</div><div class="muted" style="font-size:13px">بس انت شايفها هلّق، خليها شي الكل بيعرفو</div></div>
        <div class="row"><button class="btn ghost" data-a="cat" data-v="${esc(sg.category)}" data-not="${esc(sg.word)}">${I('redo')} غيّرها</button><button class="btn red" data-a="sendSugg">يلا، اطرح</button></div>`
      : `<p class="muted" style="margin:0">نقّي موضوع وبتطلعلك كلمة، أو اكتب كلمة من عندك.</p>`}
    </div>`;
  } else main = `<div class="card center" style="margin-top:14px"><div style="display:flex;justify-content:center;margin-bottom:6px">${av(pres || {color:'#E9B23A'})}</div><h3 style="font-size:20px"><span class="dots">${esc(pres?.name || 'الرئيس')} عم ${G(pres,'ينقّي','تنقّي')} الموضوع</span></h3><p class="muted" style="margin:6px 0 0">أول ما تطلع الكلمة شوفها ببطاقتك</p></div>`;
  return `<div>${gameHead()}${main}${playersMini()}</div>`;
}

function vAsk(){
  const g = S.st.game, t = g.turn || { order: [], idx: -1 }, lead = canLead(), pres = P(g.president);
  let main;
  const ban = `<div class="banner" style="margin-top:14px"><span class="big">${esc(g.category)}</span><span class="grow"></span><span style="font-size:13px">الموضوع للكل · الكلمة بالبطاقة</span></div>`;
  if (!t.order.length) {
    if (lead) { const list = S.st.players.filter(p => p.alive && !p.spectator && !p.president);
      main = `<div class="card" style="margin-top:14px"><h3 style="font-size:20px;margin-bottom:10px">منبلّش من مين؟</h3><div class="pgrid">${list.map(p => `<div class="pl tap${meCls(p)}" data-a="starter" data-v="${p.id}">${av(p)}<div class="nm">${esc(p.name)}</div></div>`).join('')}</div></div>`;
    } else main = `<div class="card center" style="margin-top:14px"><h3 class="dots" style="font-size:20px">${esc(pres?.name || 'الرئيس')} عم ${G(pres,'يختار','تختار')} مين بيبلّش</h3></div>`;
  } else if (t.idx >= t.order.length) {
    main = `<div class="card center" style="margin-top:14px"><h2 style="font-size:28px">خلص الدور</h2><p class="muted">صار وقت التصويت. مين كان عم يلفّ ويدور؟</p>${lead ? `<div class="row"><button class="btn ghost" data-a="prevTurn">رجوع</button><button class="btn red" data-a="toVote">${I('vote')} عالتصويت</button></div>` : ''}</div>`;
  } else {
    const cur = P(t.order[t.idx]); const meCur = cur && cur.id === S.st.me;
    main = `<div class="card" style="margin-top:14px"><div class="turnbig">${av(cur)}<h2>${meCur ? G(cur,'دورك!','دورِك!') : 'دور ' + esc(cur?.name)}</h2><div class="muted">${esc(pres?.name || 'الرئيس')} ${G(pres,'بيسأل','بتسأل')} · ${t.idx + 1} من ${t.order.length}</div></div>
      ${lead ? `<div class="row" style="margin-top:10px"><button class="btn ghost sm" data-a="prevTurn" ${t.idx === 0 ? 'disabled' : ''}>رجوع</button><button class="btn teal grow" data-a="nextTurn">${t.idx === t.order.length - 1 ? 'خلص الدور' : 'اللي بعدو'}</button></div><button class="btn ghost" data-a="toVote" style="margin-top:10px">${I('vote')} صوّتوا هلّق</button>` : ''}
    </div>`;
  }
  return `<div>${gameHead()}${ban}${main}${playersMini({ cur: t.order[t.idx] })}</div>`;
}

function vVote(){
  const g = S.st.game, me = meP(), lead = canLead(), cands = g.candidates || [];
  const canVote = me && me.alive && !me.spectator && !me.out;
  const tie = g.last && g.last.type === 'tie';
  return `<div>${gameHead()}
    <div class="banner" style="margin-top:14px;background:${tie ? 'var(--pink)' : 'var(--mustard)'};color:${tie ? 'var(--ink)' : '#1C1A17'}"><span class="big">${tie ? 'تعادل!' : 'مين الغريب؟'}</span><span class="grow"></span><span>صوّت ${g.votedCount} من ${g.voterCount}</span></div>
    ${S.endsAt ? `<div class="bar" style="margin-top:10px"><i id="tbar" style="width:100%"></i></div>` : ''}
    <div class="card" style="margin-top:14px">
      <p style="margin:0 0 10px;font-weight:800">${!canVote ? 'انت عم تتفرّج هلّق' : tie ? 'صوّتوا مرة تانية بين المتعادلين' : g.myVote ? 'فيك تغيّر صوتك لحد ما يسكّر التصويت' : 'دق عالشخص اللي شاكك فيه'}</p>
      <div class="pgrid">${cands.map(id => { const p = P(id); if (!p) return ''; const mine = g.myVote === id, self = id === S.st.me;
        return `<div class="pl${meCls(p)} ${canVote && !self ? 'tap' : ''} ${mine ? 'sel' : ''}" ${canVote && !self ? `data-a="vote" data-v="${id}"` : ''}>${av(p)}<div class="nm">${esc(p.name)}</div><div class="sub">${self ? 'انت' : mine ? 'صوتك هون' : ''}</div></div>`; }).join('')}</div>
    </div>
    ${lead ? `<button class="btn red" style="margin-top:14px" data-a="closeVote">سكّر التصويت</button>` : ''}
  </div>`;
}

function vResult(){
  const g = S.st.game, l = g.last || {}, lead = canLead();
  let main;
  if (l.type === 'out' || l.type === 'left') {
    const p = P(l.id);
    const stamp = l.stranger === true ? `<span class="stamp s">${G(p,'كان غريب!','كانت غريبة!')}</span>` : l.stranger === false ? `<span class="stamp c">${G(p,'كان منّا وفينا','كانت منّا وفينا')}</span>` : `<span class="stamp c" style="color:var(--soft)">مين بيعرف؟</span>`;
    main = `<div class="card center" style="margin-top:14px"><div class="drop turnbig">${av(p, '', { x: false })}<h2>${l.type === 'left' ? esc(p?.name || 'لاعب') + ' طلع من القعدة' : 'طلع ' + esc(p?.name || '')}</h2></div>${stamp}${counts(l)}</div>`;
  } else main = `<div class="card center" style="margin-top:14px"><h2 style="font-size:28px">تعادل مرتين… ما حدا طلع</h2><p class="muted">الغريب ارتاح شوي، بس مو كتير</p>${counts(l)}</div>`;
  let actions;
  if (lead && g.winner) actions = `<div class="card"><h3 style="font-size:20px">خلصت اللعبة! كيف بدكن الكشف؟</h3>
      <button class="tool" data-a="reveal" data-v="all">${I('users')}<span>الكل دفعة وحدة<small>كل النتايج بتطلع سوا</small></span></button>
      <button class="tool" data-a="reveal" data-v="top3">${I('crown')}<span>التلاتة الأوائل<small>التالت، بعدين التاني، بعدين الأول</small></span></button>
      <button class="tool" data-a="reveal" data-v="one">${I('skip')}<span>الكل واحد واحد<small>من الأخير للأول</small></span></button></div>`;
  else if (lead) actions = `<button class="btn teal" data-a="newQ">سؤال جديد</button>`;
  else actions = `<div class="banner"><span class="dots">${g.winner ? 'خلصت اللعبة! استنّوا الكشف الكبير' : 'استنّوا الرئيس يطرح السؤال الجاي'}</span></div>`;
  return `<div>${gameHead()}${main}<div style="margin-top:14px">${actions}</div>${playersMini()}</div>`;
}
function counts(l){
  if (!l.counts) return '';
  const e = Object.entries(l.counts).filter(([,n]) => n > 0).sort((a,b) => b[1]-a[1]);
  if (!e.length) return '<p class="muted">ما حدا صوّت</p>';
  const max = e[0][1];
  return `<div style="margin-top:16px;text-align:right">${e.map(([id,n]) => `<div class="hbar"><span class="n${id === S.st.me ? ' me-hl' : ''}">${esc(P(id)?.name || '؟')}</span><span class="b"><i style="width:${n/max*100}%"></i></span><b>${n}</b></div>`).join('')}<div class="muted" style="font-size:12px;text-align:center;margin-top:6px">ما منبيّن مين صوّت لمين</div></div>`;
}

// ---------- النهاية: كشف الغرباء ثم حفلة الترتيب ----------
function groupsByRank(){ const res = S.st.game.end.results || []; const m = new Map(); res.forEach(x => { if (!m.has(x.rank)) m.set(x.rank, []); m.get(x.rank).push(x); }); return [...m.entries()].sort((a,b) => a[0]-b[0]); }
function rankSeq(){
  const mode = S.st.game.end.revealMode; const gr = groupsByRank();
  if (mode === 'top3') return gr.filter(([r]) => r <= 3).reverse();
  if (mode === 'one') return gr.slice().reverse();
  return [];
}
function runEnd(){
  const e = S.st.game.end; const n = e.stopped ? 0 : e.strangers.length;
  sfx.drum(20);
  const T = []; let t = 1700;
  for (let i = 0; i < n; i++) { T.push([t, () => { S.endStage = i + 1; sfx.sting(); vib(60); }]); t += 1300; }
  T.push([t, () => { S.endStage = 99; if (!e.stopped) { confetti(); sfx.good(); } }]); t += 2200;
  const seq = rankSeq();
  seq.forEach((_, i) => { T.push([t, () => { S.rankStep = i + 1; sfx.drum(8); setTimeout(() => sfx.sting(), 700); vib(50); if (i === seq.length - 1 && seq[i][0] === 1) setTimeout(confetti, 700); }]); t += 2600; });
  T.push([t, () => { S.rankStep = 99; }]);
  const gm = S.st.room.games;
  T.forEach(([ms, f]) => setTimeout(() => { if (S.endFor !== gm || !S.st || S.st.phase !== 'end' || S.endSkipped === gm) return; f(); render(); }, ms));
}
function confetti(){
  const c = document.createElement('div'); c.className = 'confetti';
  const cols = ['#D9443A','#E9B23A','#2B8F84','#5E46B0','#2E7DD1','#fff'];
  for (let i = 0; i < 70; i++) { const s = document.createElement('i'); s.style.left = Math.random()*100 + 'vw'; s.style.background = cols[i % cols.length]; s.style.animationDuration = (1.8 + Math.random()*1.8) + 's'; s.style.animationDelay = Math.random()*.6 + 's'; c.appendChild(s); }
  document.body.appendChild(c); setTimeout(() => c.remove(), 4500);
}

function myTitle(p){
  const e = S.st.game.end; if (!e || !p) return { t: '', s: '' };
  const x = (e.results || []).find(r => r.id === p.id);
  if (!x) return { t: 'المتفرّج', s: 'الجولة الجاية إلك', won: null };
  const isS = x.stranger, won = x.won;
  const nonS = (e.results || []).filter(r => !r.stranger); const maxC = Math.max(0, ...nonS.map(r => r.correct));
  if (e.stopped) return isS ? { t: G(p,'الغريب','الغريبة'), s: G(p,'ضل مخبّى لحد ما انسكّرت','ضلّت مخبّاية لحد ما انسكّرت'), won } : (x.correct === maxC && maxC > 0 ? { t: 'عين الصقر', s: 'شمّ ريحة الغريب ' + x.correct + ' مرة', won } : { t: 'منّا وفينا', s: 'انسكّرت قبل ما تخلص', won });
  if (isS && !x.out) return { t: G(p,'الغريب اللي ما انكشف','الغريبة اللي ما انكشفت'), s: G(p,'نفد بريشو','نفدت بريشها'), won };
  if (isS && won) return { t: G(p,'الغريب الفدائي','الغريبة الفدائية'), s: G(p,'طلع بس ربعو ربحوا','طلعت بس ربعها ربحوا'), won };
  if (isS) return { t: G(p,'انكشف بالسؤال ','انكشفت بالسؤال ') + (x.out?.round || ''), s: 'الغريب ما بيضل غريب', won };
  if (x.correct === maxC && maxC > 0) return { t: 'عين الصقر', s: 'شمّ ريحة الغريب ' + x.correct + ' مرة', won };
  if (x.out) return { t: 'راح فرق عملة', s: G(p,'طلع وهو منّا وفينا','طلعت وهي منّا وفينا'), won };
  return { t: 'منّا وفينا', s: won ? 'كشفناه سوا' : 'الغريب كان أشطر', won };
}
function headline(){ const g = S.st.game, e = g.end, n = e.strangers.length; if (e.stopped) return 'انسكّرت اللعبة'; return g.winner === 'strangers' ? (n > 1 ? 'الغرباء ربحوا!' : 'الغريب ربح!') : (n > 1 ? 'كشفناهن!' : 'كشفناه!'); }
function subline(){ const g = S.st.game, e = g.end; if (e.stopped) return 'كل واحد نتيجته لوين وصل'; return g.winner === 'strangers' ? 'صار عددهن قد عددنا' : 'ما ضل ولا غريب بالقعدة'; }
const winColor = () => { const g = S.st.game; return g.end.stopped ? 'var(--ink)' : g.winner === 'strangers' ? 'var(--red)' : 'var(--teal)'; };

function vEnd(){
  const g = S.st.game, e = g.end; const n = e.strangers.length, st0 = S.endStage;
  if (st0 < 99 && !e.stopped) {
    const cards = e.strangers.map((id, i) => { const p = P(id); return `<div class="flip ${st0 >= i + 1 ? 'go' : ''}"><div class="inner"><div class="fa">؟</div><div class="fb">${av(p, '', { x: false, odd: true, crown: false })}<b style="font-size:20px">${esc(p?.name || 'لاعب طلع')}</b><span style="font-size:13px">${p && !p.out ? 'ما انكشف' : 'انكشف'}</span></div></div></div>`; }).join('');
    return `<div class="revealstage"><h1 style="font-size:32px">${n > 1 ? 'مين كانوا الغرباء؟' : 'مين كان الغريب؟'}</h1><div class="row wrapf" style="justify-content:center;gap:14px">${cards}</div><button class="btn ghost sm" data-a="skipEnd">تخطّى</button></div>`;
  }
  const seq = rankSeq();
  if (S.rankStep < 99 && seq.length) {
    if (S.rankStep === 0) return `<div class="revealstage"><div class="win" style="color:${winColor()}">${headline()}</div><div class="muted">${subline()}</div><p class="dots" style="font-weight:800">وهلّق الترتيب</p><button class="btn ghost sm" data-a="skipEnd">تخطّى</button></div>`;
    const [rank, list] = seq[S.rankStep - 1];
    return `<div class="revealstage"><div class="rankcard" id="rc${S.rankStep}"><div class="pos">${rank}</div><div class="row wrapf">${list.map(x => av(P(x.id), '', { x: false, odd: x.stranger, crown: false })).join('')}</div><h2>${list.map(x => `<span class="${x.id === S.st.me ? 'me-hl' : ''}" style="border-radius:6px;padding:0 6px">${esc(P(x.id)?.name || '')}</span>`).join(' و ')}</h2><div class="tag">${pN(list[0].points)}</div><div class="muted">${list.map(x => esc(myTitle(P(x.id)).t)).join(' · ')}</div></div><button class="btn ghost sm" data-a="skipEnd">تخطّى</button></div>`;
  }
  const me = meP(); const mt = myTitle(me); const myR = (e.results || []).find(x => x.id === S.st.me);
  const words = e.words.map(w => { const h = e.history.find(x => x.round === w.round); const o = h && h.out ? P(h.out) : null; return `<tr><td>${w.round}</td><td>${esc(w.category)}</td><td><b>${esc(w.word)}</b></td><td>${o ? esc(o.name) + (h.stranger ? ' (غريب)' : '') : '—'}</td></tr>`; }).join('');
  const board = S.st.players.slice().sort((a,b) => (b.tally?.points||0) - (a.tally?.points||0));
  return `<div class="stack">
    <div class="center" style="margin-top:6px"><div class="win" style="font-size:34px;color:${winColor()}">${headline()}</div><div class="muted">${subline()}</div></div>
    <div class="card center" style="background:${mt.won ? 'var(--mustard)' : 'var(--card)'};color:${mt.won ? '#1C1A17' : 'inherit'}">
      ${av(me, 'width:84px;height:84px;margin:0 auto', { x: false, crown: false, odd: myR?.stranger })}
      <h2 style="font-size:28px;margin-top:8px">${esc(mt.t)}</h2><div style="font-weight:600">${esc(mt.s)}</div>
      ${myR ? `<div class="row" style="justify-content:center;margin-top:8px"><span class="tag">المركز ${myR.rank}</span><span class="tag" style="background:var(--card);color:var(--ink)">${pN(myR.points)}</span></div>` : ''}
    </div>
    <div class="card"><h3 style="font-size:20px;margin-bottom:4px">الترتيب</h3>${(e.results || []).map(x => { const p = P(x.id); return `<div class="rk${x.id === S.st.me ? ' me' : ''}"><span class="n">${x.rank}</span>${av(p, '', { x: false, crown: false, odd: x.stranger })}<div class="grow"><b>${esc(p?.name || 'لاعب طلع')}</b><div class="muted" style="font-size:12px">${esc(myTitle(p).t)} · ${x.stranger ? 'غريب' : 'منّا وفينا'}</div></div><span class="tag">${x.points}</span></div>`; }).join('')}
      <p class="muted" style="font-size:12px;margin:8px 0 0">الفريق الرابح +3 · «منّا وفينا» +1 لكل صوت صاب غريب · الغريب +1 لكل سؤال ضل فيه</p></div>
    <div class="card"><h3 style="font-size:20px;margin-bottom:6px">الكلمات</h3><table class="tb"><tr><th>#</th><th>الموضوع</th><th>الكلمة</th><th>طلع</th></tr>${words || '<tr><td colspan="4" class="muted">ما انطرح ولا سؤال</td></tr>'}</table></div>
    ${S.st.room.games > 1 ? `<div class="card"><h3 style="font-size:20px;margin-bottom:6px">سجل القعدة · ${S.st.room.games} جولات</h3><table class="tb"><tr><th>اللاعب</th><th>نقاط</th><th>ربح</th><th>صار غريب</th></tr>${board.map(p => `<tr class="${p.id === S.st.me ? 'me' : ''}"><td>${esc(p.name)}</td><td>${p.tally?.points||0}</td><td>${p.tally?.wins||0}</td><td>${p.tally?.stranger||0}</td></tr>`).join('')}</table></div>` : ''}
    <div class="card stack">
      <h3 style="font-size:20px">صورتك للستوري</h3>
      <div class="cats" style="justify-content:center">${[['file','ملف التحقيق'],['polaroid','بولارويد'],['wanted','مطلوب']].map(([k,l]) => `<span class="chip ${S.storyForm===k?'on':''}" data-a="sform" data-v="${k}">${l}</span>`).join('')}</div>
      <div class="cats" style="justify-content:center"><span class="chip ${S.storyTheme==='light'?'on':''}" data-a="stheme" data-v="light">${I('sun')} فاتح</span><span class="chip ${S.storyTheme==='dark'?'on':''}" data-a="stheme" data-v="dark">${I('moon')} داكن</span></div>
      <img class="story" id="story" alt="معاينة صورة الستوري" src="${S.storyUrl || ''}">
      <button class="btn red" data-a="dlStory">${I('share')} شارك الصورة</button>
      <button class="btn ghost" data-a="friends">شارك مع صحابك</button>
    </div>
    <div class="sigline"><span>@eyad.hloubi</span><span>#qa3da</span></div>
    ${isOwner() ? `<div class="foot"><div class="in"><button class="btn teal" data-a="homeMenu">${I('home')} قعدة جديدة</button></div></div>` : ''}
  </div>`;
}

// ---------- صورة الستوري: 3 أشكال × فاتح وداكن ----------
function loadImg(src){ return new Promise(res => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
function svgImg(svg){ return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" '))); }
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function cover(c, img, x, y, w, h){ const s = Math.max(w/img.width, h/img.height); c.drawImage(img, x + w/2 - img.width*s/2, y + h/2 - img.height*s/2, img.width*s, img.height*s); }
function fitText(c, t, max, size, weight = 800){ let s = size; do { c.font = `${weight} ${s}px Changa`; s -= 4; } while (c.measureText(t).width > max && s > 20); }
async function groupArt(c, x, y, w, h, dark){
  const g = await loadImg(S.group); const ink = dark ? '#F4EDE2' : '#1C1A17';
  c.save(); rr(c, x, y, w, h, 18); c.clip();
  if (g) cover(c, g, x, y, w, h);
  else { // بدون صورة شلة: اسم القعدة محلها
    c.fillStyle = dark ? '#2C2534' : '#EADFCB'; c.fillRect(x, y, w, h);
    c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '600 34px Changa'; c.fillText(S.st.room.kind, x + w/2, y + h/2 - 44);
    fitText(c, S.st.room.name, w - 60, 76); c.fillText(S.st.room.name, x + w/2, y + h/2 + 20);
  }
  c.restore();
}
async function personal(c, x, y, w, h){
  const me = meP(); const isS = (S.st.game.end.results || []).find(r => r.id === me.id)?.stranger;
  const im = S.photos[me.id] ? await loadImg(S.photos[me.id]) : await svgImg(face(me.color, isS));
  c.save(); rr(c, x, y, w, h, 12); c.clip(); c.fillStyle = '#fff'; c.fillRect(x, y, w, h); if (im) cover(c, im, x, y, w, h); c.restore();
}
function corners(c, ink){
  c.save(); c.fillStyle = ink; c.globalAlpha = .8; c.font = '600 34px Changa'; c.textBaseline = 'alphabetic';
  c.direction = 'ltr'; c.textAlign = 'left'; c.fillText('@eyad.hloubi', 70, 1850);
  c.textAlign = 'right'; c.fillText('#qa3da', 1010, 1850); c.restore();
}
async function drawStory(){
  const st = S.st; if (!st || st.phase !== 'end') return;
  try { await document.fonts.load('800 40px Changa'); await document.fonts.load('600 40px Changa'); } catch(e){}
  const W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const dark = S.storyTheme === 'dark'; const me = meP(), mt = myTitle(me), g = st.game, e = g.end;
  const x = (e.results || []).find(r => r.id === me.id) || {}; const isS = x.stranger;
  const result = e.stopped ? 'انسكّرت قبل ما تخلص' : (g.winner === 'strangers' ? 'الغريب ربح' : 'كشفنا الغريب') + ' · ' + qN(e.words.length);
  const rankTxt = x.rank ? 'المركز ' + x.rank + ' · ' + pN(x.points) : '';
  const roleTxt = isS ? G(me,'غريب','غريبة') : 'منّا وفينا';
  c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const form = S.storyForm;

  if (form === 'file') { // ملف التحقيق
    const bg = dark ? '#1A1714' : '#EFE3CC', folder = dark ? '#5B4632' : '#C9A26B', paper = dark ? '#2A2520' : '#FFFCF4', ink = dark ? '#F4EDE2' : '#1C1A17';
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = folder; rr(c, 560, 250, 440, 90, 24); c.fill(); rr(c, 70, 300, 940, 1380, 34); c.fill();
    c.fillStyle = paper; c.save(); c.translate(540, 990); c.rotate(-.012); rr(c, -440, -640, 880, 1300, 18); c.fill(); c.restore();
    c.fillStyle = dark ? '#F4EDE2' : '#1C1A17'; c.font = '800 44px Changa'; c.fillText('ملف سرّي', 780, 296);
    c.fillStyle = ink; c.font = '600 36px Changa'; c.fillText(st.room.kind + ' · ' + st.room.name, 540, 420);
    c.save(); c.translate(380, 730); c.rotate(-.04); c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 20; c.fillRect(-210, -230, 420, 480); c.shadowBlur = 0; await personal(c, -190, -210, 380, 380);
    c.fillStyle = '#1C1A17'; c.font = '600 30px Changa'; c.fillText('المشتبه رقم ' + (x.rank || 1), 0, 210); c.restore();
    c.strokeStyle = '#8A8F96'; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(300, 480); c.lineTo(300, 560); c.stroke();
    c.save(); c.translate(760, 770); c.rotate(.05); c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 20; c.fillRect(-190, -150, 380, 340); c.shadowBlur = 0; await groupArt(c, -170, -130, 340, 255, false); c.fillStyle = '#1C1A17'; c.font = '600 28px Changa'; c.fillText('مرفق: الشلة', 0, 160); c.restore();
    c.save(); c.translate(780, 1040); c.rotate(-.2); c.strokeStyle = isS ? '#D9443A' : '#2B8F84'; c.fillStyle = c.strokeStyle; c.lineWidth = 9; rr(c, -180, -62, 360, 124, 16); c.stroke(); c.font = '800 62px Changa'; c.fillText(roleTxt, 0, 6); c.restore();
    c.fillStyle = ink; fitText(c, me.name, 800, 120); c.fillText(me.name, 540, 1200);
    c.fillStyle = isS ? '#D9443A' : '#2B8F84'; fitText(c, mt.t, 820, 76); c.fillText(mt.t, 540, 1330);
    c.fillStyle = ink; c.font = '600 40px Changa'; c.fillText(mt.s, 540, 1415);
    c.save(); c.strokeStyle = ink; c.globalAlpha = .3; c.lineWidth = 3; c.setLineDash([12, 10]); c.beginPath(); c.moveTo(180, 1470); c.lineTo(900, 1470); c.stroke(); c.restore();
    c.fillStyle = ink; c.font = '800 44px Changa'; c.fillText(result, 540, 1535); c.font = '600 38px Changa'; c.fillText(rankTxt, 540, 1605);
    corners(c, ink);
  } else if (form === 'polaroid') { // بولارويد
    const bg = dark ? '#1B1820' : '#F3D9D0', ink = dark ? '#F4EDE2' : '#1C1A17';
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(100 + i * 110, 150 + (i % 2) * 40, 26, 0, 7); c.fill(); }
    c.fillStyle = ink; c.font = '600 38px Changa'; c.fillText(st.room.kind + ' · ' + st.room.name, 540, 290);
    c.save(); c.translate(650, 580); c.rotate(.09); c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = 30; c.fillStyle = '#FFFCF6'; c.fillRect(-300, -220, 600, 480); c.shadowBlur = 0; await groupArt(c, -270, -190, 540, 370, false); c.fillStyle = '#1C1A17'; c.font = '600 32px Changa'; c.fillText('الشلة', 0, 220); c.restore();
    c.save(); c.translate(460, 1030); c.rotate(-.05); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 40; c.fillStyle = '#FFFCF6'; c.fillRect(-300, -320, 600, 720); c.shadowBlur = 0; await personal(c, -270, -290, 540, 540);
    c.fillStyle = '#1C1A17'; fitText(c, me.name, 520, 84); c.fillText(me.name, 0, 330); c.restore();
    c.save(); c.translate(830, 1280); c.rotate(.12); c.fillStyle = isS ? '#121014' : '#2B8F84'; c.beginPath(); c.arc(0, 0, 118, 0, 7); c.fill(); c.fillStyle = '#fff'; fitText(c, roleTxt, 200, 46); c.fillText(roleTxt, 0, 4); c.restore();
    c.fillStyle = ink; fitText(c, mt.t, 860, 80); c.fillText(mt.t, 540, 1505);
    c.font = '600 38px Changa'; c.fillText(mt.s + (rankTxt ? ' · ' + rankTxt : ''), 540, 1585);
    c.fillStyle = isS ? '#D9443A' : '#2B8F84'; c.font = '800 42px Changa'; c.fillText(result, 540, 1655);
    corners(c, ink);
  } else { // مطلوب (غلاف)
    const bg = dark ? '#141218' : '#E9DCC3', poster = dark ? '#221D25' : '#F7EEDB', ink = dark ? '#F4EDE2' : '#2A1F14', acc = isS ? '#D9443A' : '#2B8F84';
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = poster; rr(c, 60, 230, 960, 1470, 10); c.fill(); c.strokeStyle = ink; c.lineWidth = 6; rr(c, 84, 254, 912, 1422, 6); c.stroke();
    c.fillStyle = ink; c.font = '800 150px Changa'; c.fillText(isS ? 'مطلوب' : 'شاهد', 540, 385);
    c.font = '600 40px Changa'; c.fillText(isS ? G(me,'بتهمة إنو غريب','بتهمة إنها غريبة') : 'بقضية الغريب', 540, 490);
    c.strokeStyle = ink; c.lineWidth = 8; c.strokeRect(250, 545, 580, 580); await personal(c, 262, 557, 556, 556);
    c.fillStyle = ink; fitText(c, me.name, 820, 120); c.fillText(me.name, 540, 1215);
    c.fillStyle = acc; fitText(c, mt.t, 820, 70); c.fillText(mt.t, 540, 1322);
    c.fillStyle = ink; c.font = '600 36px Changa'; c.fillText(mt.s, 540, 1385);
    c.save(); c.translate(540, 1505); c.rotate(-.02); await groupArt(c, -280, -80, 560, 160, dark); c.strokeStyle = ink; c.lineWidth = 5; rr(c, -280, -80, 560, 160, 18); c.stroke(); c.restore();
    c.fillStyle = acc; fitText(c, result + (rankTxt ? ' · ' + rankTxt : ''), 820, 38); c.fillText(result + (rankTxt ? ' · ' + rankTxt : ''), 540, 1635);
    corners(c, ink);
  }
  S.storyUrl = cv.toDataURL('image/png'); const im = $('#story'); if (im) im.src = S.storyUrl;
}

// ---------- محرر الصورة: قص وتكبير وسحب وتدوير وقلب ----------
function pickFile(capture){
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; if (capture) i.capture = capture;
    i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const rd = new FileReader(); rd.onload = () => res(rd.result); rd.readAsDataURL(f); };
    i.click();
  });
}
async function editImage(src, opts = {}){
  const img = await loadImg(src); if (!img) return null;
  return new Promise(resolve => {
    let aspect = opts.aspect || 1, rot = 0, flip = 1, zoom = 1, ox = 0, oy = 0;
    sheet(`<h3>${opts.title || 'عدّل الصورة'}</h3>
      <div class="cropbox ${opts.round ? 'round' : ''}" id="cbox"><canvas id="ccv"></canvas></div>
      <div style="margin-top:12px"><input type="range" id="zr" min="1" max="4" step="0.01" value="1" aria-label="تكبير"></div>
      <div class="row wrapf" style="justify-content:center;margin-top:8px">
        <button class="btn ghost sm" id="rotB">${I('rotate')} لفّ</button><button class="btn ghost sm" id="flipB">${I('flip')} اقلب</button>
        ${opts.orient ? `<button class="btn ghost sm" id="oriB">طول / عرض</button>` : ''}
      </div>
      <p class="muted center" style="font-size:13px;margin:6px 0 0">اسحب الصورة بإصبعك لكل الحواف، وكبّرها بالشريط أو بإصبعين</p>
      <button class="btn red" id="okB" style="margin-top:12px">تمام</button>`, true);
    layer._cancel = () => resolve(null);
    const box = $('#cbox'), cv = $('#ccv'), c = cv.getContext('2d');
    const size = () => { const w = Math.min(320, window.innerWidth - 64); box.style.width = w + 'px'; box.style.height = (w / aspect) + 'px'; cv.width = w * 2; cv.height = Math.round((w / aspect) * 2); };
    const dims = () => rot % 2 ? { iw: img.height, ih: img.width } : { iw: img.width, ih: img.height };
    const base = () => { const { iw, ih } = dims(); return Math.max(cv.width / iw, cv.height / ih); };
    const clamp = () => { const { iw, ih } = dims(); const s = base() * zoom; const mx = Math.max(0, (iw * s - cv.width) / 2), my = Math.max(0, (ih * s - cv.height) / 2); ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy)); };
    const draw = (ctx, W, H, k = 1) => { const s = base() * zoom * k; ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.translate(W/2 + ox*k, H/2 + oy*k); ctx.rotate(rot * Math.PI / 2); ctx.scale(flip, 1); ctx.drawImage(img, -img.width*s/2, -img.height*s/2, img.width*s, img.height*s); ctx.restore(); };
    const paint = () => { clamp(); draw(c, cv.width, cv.height); };
    size(); paint();
    const pts = new Map(); let pinch0 = 0, zoom0 = 1;
    box.addEventListener('pointerdown', ev => { box.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x-b.x, a.y-b.y) || 1; zoom0 = zoom; } });
    box.addEventListener('pointermove', ev => { if (!pts.has(ev.pointerId)) return; const p = pts.get(ev.pointerId); const dx = ev.clientX - p.x, dy = ev.clientY - p.y; pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; zoom = Math.max(1, Math.min(4, zoom0 * Math.hypot(a.x-b.x, a.y-b.y) / pinch0)); $('#zr').value = zoom; } else { ox += dx * 2; oy += dy * 2; } paint(); });
    const up = ev => pts.delete(ev.pointerId); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', ev => { ev.preventDefault(); zoom = Math.max(1, Math.min(4, zoom - ev.deltaY * .002)); $('#zr').value = zoom; paint(); }, { passive: false });
    $('#zr').oninput = ev => { zoom = +ev.target.value; paint(); };
    $('#rotB').onclick = () => { rot = (rot + 1) % 4; ox = oy = 0; paint(); };
    $('#flipB').onclick = () => { flip *= -1; paint(); };
    if (opts.orient) $('#oriB').onclick = () => { aspect = aspect > 1 ? 3/4 : 4/3; ox = oy = 0; size(); paint(); };
    $('#okB').onclick = () => { const outW = opts.out || 360; const outH = Math.round(outW / aspect); const o = document.createElement('canvas'); o.width = outW; o.height = outH; draw(o.getContext('2d'), outW, outH, outW / cv.width); layer._cancel = null; layer.innerHTML = ''; resolve(o.toDataURL('image/jpeg', .82)); };
  });
}
async function photoFlow(capture, src){ const d = src || await pickFile(capture); if (!d) return null; return editImage(d, { round: true, title: 'عدّل صورتك', out: 360 }); }
async function groupFlow(capture, src){ const d = src || await pickFile(capture); if (!d) return null; return editImage(d, { aspect: 4/3, orient: true, title: 'صورة الشلة', out: 900 }); }

// ---------- نوافذ ----------
function sheet(html, cancel){ layer._cancel = null; layer.innerHTML = `<div class="modal" data-a="close"><div class="sheet" onclick="event.stopPropagation()">${html}<button class="btn ghost" data-a="close" style="margin-top:${cancel ? 10 : 16}px">${cancel ? 'إلغاء' : 'سكّر'}</button></div></div>`; }
function closeSheet(){ if (layer._cancel) { const f = layer._cancel; layer._cancel = null; f(); } layer.innerHTML = ''; }
function helpSheet(){
  sheet(`<h3>كيف منلعب «قعدة غريب»؟</h3>
  <ol style="padding-inline-start:20px;margin:0">
    <li>الريس بيفتح القعدة، والكل بيفوت من موبايلو بالكود أو الـQR. بدنا 4 عالأقل.</li>
    <li>بشاشة «جاهز» كل واحد بيكبس جاهز، ومنبلّش سوا بعد عدّ تنازلي.</li>
    <li>الأدوار بتتوزّع بالسر: الأغلبية <b>منّا وفينا</b>، وواحد أو أكتر <b>غريب</b> (لحد تلت القعدة).</li>
    <li>واحد من «منّا وفينا» بيطلع <b>الرئيس</b>: بينقّي موضوع (لون، أكلة، منتج…) وكلمة الكل بيعرفها، أو بيكتبها من عندو.</li>
    <li>الموضوع بيطلع للكل، بس الكلمة ما بتطلع للغريب. شوف بطاقتك بالضغط المطوّل وخبّيها.</li>
    <li>الرئيس بيختار مين يبلّش، وبيسأل كل واحد بدورو بطريقة تكشف الغريب. والغريب لازم يدبّر جواب يمشي مع الكل.</li>
    <li>بعد الدور الكل بيصوّت. الأكتر أصوات بيطلع برّا وما عاد يشوف الكلمات. بالتعادل منعيد التصويت مرة بين المتعادلين، وإذا تعادلوا كمان ما حدا بيطلع.</li>
    <li>كل سؤال = موضوع وكلمة جديدة، والغريب بيضل نفسو.</li>
    <li><b>منّا وفينا بيربحوا</b> إذا طلّعوا كل الغرباء. <b>الغرباء بيربحوا</b> إذا صار عددهن قد عدد الباقيين.</li>
  </ol>
  <h3 style="font-size:18px;margin-top:14px">النقاط والترتيب</h3>
  <p style="margin:0">الفريق الرابح +3 لكل واحد · «منّا وفينا» +1 لكل صوت صاب غريب · الغريب +1 لكل سؤال ضل فيه. نفس النقاط = نفس المركز.</p>
  <h3 style="font-size:18px;margin-top:14px">الأزرار</h3>
  <p style="margin:0">فوق: الرجوع، والسحّاب (البيت، قدّام، حسابي، فاتح وداكن، التعليمات). الريس عندو زر التاج: سكّر هلّق، خلّصنا، قعدة جديدة، تمرير، إعادة، تغيير الرئيس، والناس (تعديل، تطليع، تسليم الريس).</p>
  <p class="muted" style="margin-top:12px">مرجع اللعبة: ألعاب الخداع الاجتماعي الجماعية (Social Deduction) متل «مين الجاسوس» و«الكلمة السرية».</p>
  <p style="font-weight:800;margin:0">إعداد م. إياد حلوبي</p>`);
}
function homeSheet(){
  const inRoom = !!S.st; const own = isOwner();
  sheet(`<h3>قعدة جديدة</h3>
    ${inRoom && own ? `<button class="tool" data-a="samePeople">${I('users')}<span>بنفس الناس<small>منرجع للانتظار ومنلعب من جديد</small></span></button>
    <button class="tool" data-a="newPeople">${I('user')}<span>بناس جدد<small>كود جديد، والباقي بيطلعوا</small></span></button>` : ''}
    <button class="tool" data-a="scratch">${I('home')}<span>من الصفر<small>${inRoom ? 'بتطلع من هالقعدة وبتفتح وحدة جديدة' : 'قعدة جديدة باسم جديد'}</small></span></button>
    ${inRoom && !own ? `<button class="tool" data-a="leave">${I('door')}<span>اطلع من القعدة<small>وفوت على قعدة تانية بكود</small></span></button>` : ''}`);
}
function toolsSheet(){
  const g = S.st.game, ph = S.st.phase;
  const active = g && ph !== 'end';
  sheet(`<h3>أدوات الريس</h3>
    ${active && g.canRedo && ['ask','vote'].includes(ph) ? `<button class="tool" data-a="pass">${I('skip')}<span>تمرير<small>بنشيل هالكلمة كأنها ما انطرحت، وبيختار الرئيس غيرها</small></span></button>` : ''}
    ${active && g.canRedo ? `<button class="tool" data-a="redo">${I('redo')}<span>إعادة السؤال<small>نفس الكلمة من أول الدور، والنتيجة بتنلغى</small></span></button>` : ''}
    ${active && !g.winner ? `<button class="tool" data-a="newPres">${I('crown')}<span>غيّر الرئيس<small>إذا الرئيس غاب أو بدكن غيرو</small></span></button>` : ''}
    ${active ? `<button class="tool" data-a="stopNow">${I('stop')}<span>سكّر هلّق<small>كل واحد بياخد نتيجته لوين وصل</small></span></button>` : ''}
    <button class="tool" data-a="people">${I('users')}<span>الناس<small>تعديل الاسم، تطليع، تسليم الريس</small></span></button>
    <button class="tool" data-a="roomSet">${I('gear')}<span>القعدة<small>الاسم والنوع وصورة الشلة</small></span></button>
    <button class="tool" data-a="homeMenu">${I('home')}<span>قعدة جديدة<small>بنفس الناس، أو بناس جدد، أو من الصفر</small></span></button>
    <button class="tool" data-a="done" style="color:var(--red)">${I('door')}<span>خلّصنا<small>بتنسكّر القعدة عند الكل</small></span></button>`);
}
function peopleSheet(){
  const st = S.st;
  sheet(`<h3>الناس</h3>${st.players.map(p => `<div class="row" style="padding:6px 0">${av(p, 'width:40px;height:40px', { x: false })}<b class="grow ${p.id === st.me ? 'me-hl' : ''}" style="border-radius:6px;padding:0 6px">${esc(p.name)}${p.id === st.me ? ' (انت)' : ''}</b>${p.id !== st.me ? `<button class="btn ghost sm" data-a="pmenu" data-v="${p.id}">⋯</button>` : ''}</div>`).join('')}`);
}
function roomSheet(){
  const st = S.st; const kinds = ['شلة','رفقة','عيلة','زملاء'];
  sheet(`<h3>القعدة</h3><div class="stack">
    <div><label class="lb">اسم القعدة</label><div class="row"><input class="inp grow" id="mrn" maxlength="30" value="${esc(st.room.name)}"><button class="btn sm" data-a="saveRoom">حفظ</button></div></div>
    <div class="cats">${kinds.map(k => `<span class="chip ${st.room.kind===k?'on':''}" data-a="mkind" data-v="${k}">${k}</span>`).join('')}</div>
    ${S.group ? `<img class="gphoto" src="${S.group}" alt="">` : ''}
    <div class="row wrapf"><button class="btn ghost sm" data-a="groupSelfie">${I('camera')} سيلفي جماعي</button><button class="btn ghost sm" data-a="groupPick">${I('image')} من المعرض</button>${S.group ? `<button class="btn ghost sm" data-a="groupEdit">${I('rotate')} عدّلها</button><button class="btn ghost sm" data-a="groupRm">شيلها</button>` : ''}</div>
  </div>`);
}
function accountSheet(){
  const me = meP(); const pr = me || { name: S.profile.name, gender: S.profile.gender, color: '#D9443A', id: '__me' };
  if (!me) { if (S.profile.photo) S.photos.__me = S.profile.photo; else delete S.photos.__me; }
  const hasPh = me ? S.photos[me.id] : S.profile.photo;
  sheet(`<h3>حسابي</h3><div class="stack">
    <div class="row">${av(pr, 'width:72px;height:72px', { x: false, crown: false })}<div class="row wrapf grow"><button class="btn ghost sm" data-a="accSelfie">${I('camera')} سيلفي</button><button class="btn ghost sm" data-a="accPick">${I('image')} من المعرض</button>${hasPh ? `<button class="btn ghost sm" data-a="accEdit">عدّلها</button><button class="btn ghost sm" data-a="accRm">شيلها</button>` : ''}</div></div>
    <div><label class="lb">اسمي</label><div class="row"><input class="inp grow" id="accn" maxlength="24" value="${esc(pr.name || '')}"><button class="btn sm" data-a="accSave">حفظ</button></div></div>
    <div class="gender"><span class="chip ${pr.gender==='m'?'on':''}" data-a="accG" data-v="m">شب</span><span class="chip ${pr.gender==='f'?'on':''}" data-a="accG" data-v="f">صبية</span></div>
  </div>`);
}
function playerSheet(id){
  const p = P(id); if (!p) return;
  sheet(`<div class="row">${av(p, '', { x: false })}<h3 class="grow">${esc(p.name)}</h3></div>
  <div class="stack" style="margin-top:12px">
    <div class="row"><input class="inp grow" id="rnm" maxlength="24" value="${esc(p.name)}"><button class="btn sm" data-a="rename" data-v="${id}">غيّر الاسم</button></div>
    <button class="btn ghost" data-a="transfer" data-v="${id}">${I('crown')} سلّمو الريس</button>
    <button class="btn red" data-a="kick" data-v="${id}"><span>طلّعو من القعدة</span></button>
  </div>`);
}
function installSheet(){
  if (S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.finally(() => S.installEvt = null); return; }
  sheet(`<h3>نزّل «قعدة غريب» كتطبيق</h3>
    <p><b>آيفون:</b> افتح الرابط بـSafari ← زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</p>
    <p><b>أندرويد:</b> افتح الرابط بـChrome ← القائمة ⋮ ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>
    <p><b>لابتوب:</b> بـChrome أو Edge ← أيقونة التثبيت جنب شريط العنوان ← «تثبيت».</p>`);
}

// ---------- الأحداث ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, v = el.dataset.v;
  if (a === 'close') { if (e.target === el || el.tagName === 'BUTTON') closeSheet(); return; }
  if (el.closest('#drawer')) closeDrawer();
  switch (a) {
    case 'back': goBack(); break;
    case 'fwd': goFwd(); break;
    case 'theme': toggleTheme(); break;
    case 'help': helpSheet(); break;
    case 'account': accountSheet(); break;
    case 'homeMenu': homeSheet(); break;
    case 'tools': toolsSheet(); break;
    case 'install': installSheet(); break;
    case 'goCreate': S.mode = 'create'; S.profile = { name: qName, gender: '', photo: null }; S.roomName = ''; S.group = null; go('profile'); break;
    case 'goJoin': { const c = ($('#code').value || '').trim().toUpperCase(); if (c.length !== 5) return toast('الكود 5 أحرف'); S.joinCode = c; S.mode = 'join'; S.profile = { name: qName, gender: '', photo: null }; go('profile'); break; }
    case 'resume': { if (S.st) { go('room'); break; } const ss = ls.get('gh:session'); if (ss) { go('room'); send({ t: 'resume', code: ss.code, token: ss.token }); } break; }
    case 'kind': saveInputs(); S.kind = v; const kc = $('#kindc'); if (kc) kc.value = ''; render(); break;
    case 'gender': saveInputs(); S.profile.gender = v; render(); break;
    case 'pickPhoto': case 'selfie': { saveInputs(); const d = await photoFlow(a === 'selfie' ? 'user' : null); if (d) S.profile.photo = d; render(); break; }
    case 'editPhoto': { saveInputs(); const d = await photoFlow(null, S.profile.photo); if (d) S.profile.photo = d; render(); break; }
    case 'rmPhoto': saveInputs(); S.profile.photo = null; render(); break;
    case 'groupPick': case 'groupSelfie': case 'groupEdit': {
      saveInputs(); const d = a === 'groupEdit' ? await groupFlow(null, S.group) : await groupFlow(a === 'groupSelfie' ? 'environment' : null);
      if (d) { S.group = d; S.storyUrl = null; if (S.st && isOwner()) send({ t: 'room', group: d }); } render(); break;
    }
    case 'groupRm': S.group = null; S.storyUrl = null; if (S.st && isOwner()) send({ t: 'room', group: null }); closeSheet(); render(); break;
    case 'create': case 'join': {
      saveInputs(); const pr = S.profile;
      if (!pr.name.trim()) return toast('اكتب اسمك');
      if (!pr.gender) return toast('نقّي شب أو صبية');
      if (a === 'create' && !S.roomName.trim()) return toast('حط اسم للقعدة');
      S.st = null; go('room');
      if (a === 'create') send({ t: 'create', name: pr.name, gender: pr.gender, photo: pr.photo, roomName: S.roomName, kind: S.kind, group: S.group });
      else send({ t: 'join', code: S.joinCode, name: pr.name, gender: pr.gender, photo: pr.photo });
      break;
    }
    case 'copy': try { await navigator.clipboard.writeText(v); toast('انسخ الرابط'); } catch(err) { toast(v); } break;
    case 'shareLink': if (navigator.share) navigator.share({ title: 'قعدة غريب', text: 'فوت عالقعدة: ' + S.st.room.code, url: v }).catch(() => {}); else { try { await navigator.clipboard.writeText(v); toast('انسخ الرابط'); } catch(err){} } break;
    case 'str': { const s = S.st.room.settings; const maxN = Math.max(1, Math.floor(Math.max(S.st.room.min, S.st.players.length) / 3)); const autoN = Math.max(1, Math.floor(S.st.players.length / 3)); let n = s.strangers || autoN; n = Math.max(1, Math.min(maxN, n + (+v))); send({ t: 'settings', strangers: n }); break; }
    case 'set': send({ t: 'settings', [el.dataset.k]: !S.st.room.settings[el.dataset.k] }); break;
    case 'timer': send({ t: 'settings', timer: +v }); break;
    case 'start': send({ t: 'start' }); break;
    case 'ready': { const me = meP(); send({ t: 'ready', v: !(me && me.ready) }); sfx.tap(); break; }
    case 'goNow': if (confirmTap(el, 'دق مرة تانية لنبلّش')) send({ t: 'go' }); break;
    case 'cat': S.custom = false; send({ t: 'shuffleWord', category: v, not: el.dataset.not || '' }); sfx.tap(); break;
    case 'custom': S.custom = true; S.suggest = null; render(); break;
    case 'sendSugg': if (S.suggest) send({ t: 'setWord', category: S.suggest.category, word: S.suggest.word }); break;
    case 'sendCustom': { const cc = $('#cc').value.trim(), cw = $('#cw').value.trim(); if (!cc || !cw) return toast('اكتب الموضوع والكلمة'); send({ t: 'setWord', category: cc, word: cw }); break; }
    case 'starter': send({ t: 'starter', id: v }); break;
    case 'nextTurn': send({ t: 'nextTurn' }); sfx.tap(); break;
    case 'prevTurn': send({ t: 'prevTurn' }); break;
    case 'toVote': send({ t: 'toVote' }); break;
    case 'vote': send({ t: 'vote', id: v }); sfx.tap(); vib(20); break;
    case 'closeVote': send({ t: 'closeVote' }); break;
    case 'newQ': send({ t: 'newQuestion' }); break;
    case 'reveal': send({ t: 'reveal', mode: v }); break;
    case 'skipEnd': S.endSkipped = S.st.room.games; S.endStage = 99; S.rankStep = 99; render(); break;
    case 'pass': closeSheet(); send({ t: 'pass' }); break;
    case 'redo': closeSheet(); send({ t: 'redo' }); toast('رجعنا لأول الدور'); break;
    case 'newPres': closeSheet(); send({ t: 'newPresident' }); break;
    case 'stopNow': if (confirmTap(el, 'دق مرة تانية لتسكّر اللعبة')) { closeSheet(); send({ t: 'stopNow' }); } break;
    case 'people': peopleSheet(); break;
    case 'roomSet': roomSheet(); break;
    case 'done': if (confirmTap(el, 'دق مرة تانية لتسكّر القعدة عند الكل')) { closeSheet(); send({ t: 'done' }); } break;
    case 'samePeople': closeSheet(); send({ t: 'samePeople' }); break;
    case 'newPeople': if (confirmTap(el, 'دق مرة تانية: الباقي رح يطلعوا')) { closeSheet(); send({ t: 'newPeople' }); } break;
    case 'scratch': closeSheet(); if (S.st) send({ t: 'leave' }); ls.del('gh:session'); S.st = null; S.group = null; S.photos = {}; S.mode = 'create'; S.profile = { name: '', gender: '', photo: null }; S.roomName = ''; S.back = ['home']; S.fwd = []; S.view = 'profile'; history.replaceState(null, '', location.pathname); render(); break;
    case 'leave': if (confirmTap(el, 'دق مرة تانية لتطلع')) { send({ t: 'leave' }); ls.del('gh:session'); closeSheet(); S.st = null; S.back = []; S.fwd = []; S.view = 'home'; history.replaceState(null, '', location.pathname); render(); } break;
    case 'stheme': S.storyTheme = v; S.storyUrl = null; render(); break;
    case 'sform': S.storyForm = v; S.storyUrl = null; render(); break;
    case 'dlStory': {
      if (!S.storyUrl) await drawStory();
      try { const blob = await (await fetch(S.storyUrl)).blob(); const f = new File([blob], 'qa3da-ghareeb.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'قعدة غريب' }); break; } } catch(err) { if (err && err.name === 'AbortError') break; }
      const l = document.createElement('a'); l.href = S.storyUrl; l.download = 'qa3da-ghareeb.png'; document.body.appendChild(l); l.click(); l.remove(); break;
    }
    case 'friends': if (navigator.share) navigator.share({ title: 'قعدة', url: IG }).catch(() => {}); else window.open(IG, '_blank'); break;
    case 'saveRoom': send({ t: 'room', name: $('#mrn').value }); toast('انحفظ'); break;
    case 'mkind': send({ t: 'room', kind: v }); setTimeout(roomSheet, 250); break;
    case 'pmenu': playerSheet(v); break;
    case 'rename': send({ t: 'rename', id: v, name: $('#rnm').value }); closeSheet(); break;
    case 'transfer': send({ t: 'transfer', id: v }); closeSheet(); break;
    case 'kick': if (confirmTap(el, 'دق مرة تانية للتأكيد')) { send({ t: 'kick', id: v }); closeSheet(); } break;
    case 'accSelfie': case 'accPick': case 'accEdit': {
      const me = meP(); const cur = me ? S.photos[me.id] : S.profile.photo;
      const d = a === 'accEdit' ? await photoFlow(null, cur) : await photoFlow(a === 'accSelfie' ? 'user' : null);
      if (d) { if (me) { S.photos[me.id] = d; send({ t: 'profile', photo: d }); } else S.profile.photo = d; S.storyUrl = null; }
      accountSheet(); render(); break;
    }
    case 'accRm': { const me = meP(); if (me) { delete S.photos[me.id]; send({ t: 'profile', photo: null }); } else S.profile.photo = null; S.storyUrl = null; accountSheet(); render(); break; }
    case 'accSave': { const n = $('#accn').value.trim(); if (!n) return toast('اكتب اسمك'); if (meP()) send({ t: 'profile', name: n }); else S.profile.name = n; S.storyUrl = null; toast('انحفظ'); closeSheet(); render(); break; }
    case 'accG': if (meP()) send({ t: 'profile', gender: v }); else S.profile.gender = v; setTimeout(accountSheet, 200); break;
  }
});
function confirmTap(el, msg){ if (el.dataset.armed) return true; el.dataset.armed = '1'; const t = el.querySelector('span') || el; const o = t.innerHTML; t.textContent = msg; setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; t.innerHTML = o; } }, 2500); return false; }
function saveInputs(){
  const n = $('#pname'); if (n) S.profile.name = n.value;
  const r = $('#rname'); if (r) S.roomName = r.value;
  const k = $('#kindc'); if (k && k.value.trim()) S.kind = k.value.trim();
}
document.addEventListener('input', e => { if (e.target.id === 'code') { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); S.joinCode = e.target.value; } if (['pname','rname','kindc'].includes(e.target.id)) saveInputs(); });

// ---------- بعد الرسم ----------
function afterRender(){
  const grip = $('#grip');
  if (grip) {
    let y0 = null;
    const setD = o => { S.drawer = o; $('#frame').classList.toggle('open', o); grip.querySelector('em').textContent = o ? 'سكّر' : 'اسحب أو المس'; };
    grip.addEventListener('click', () => setD(!S.drawer));
    grip.addEventListener('pointerdown', ev => { y0 = ev.clientY; });
    grip.addEventListener('pointermove', ev => { if (y0 !== null && ev.clientY - y0 > 18 && !S.drawer) { setD(true); y0 = null; } });
    grip.addEventListener('pointerup', () => y0 = null);
  }
  const role = $('#role');
  if (role) {
    const on = ev => { ev.preventDefault(); S.peeking = true; role.classList.add('peek'); vib(15); };
    const off = () => { S.peeking = false; role.classList.remove('peek'); };
    role.addEventListener('pointerdown', on); role.addEventListener('pointerup', off); role.addEventListener('pointerleave', off); role.addEventListener('pointercancel', off);
    role.addEventListener('contextmenu', ev => ev.preventDefault());
  }
  const qr = $('#qr');
  if (qr && S.st) { if (window.qrcode) { const q = qrcode(0, 'M'); q.addData(location.origin + '/?r=' + S.st.room.code); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 5, margin: 0, scalable: true }); const s = qr.querySelector('svg'); if (s) { s.style.width = '150px'; s.style.height = '150px'; s.style.display = 'block'; } } else qr.remove(); }
  if ($('#story') && !S.storyUrl) drawStory();
}
document.addEventListener('pointerdown', e => { if (S.drawer && !e.target.closest('#frame')) closeDrawer(); });
window.addEventListener('pointerup', () => { if (S.peeking) { S.peeking = false; const r = $('#role'); if (r) r.classList.remove('peek'); } });

setInterval(() => { const b = $('#tbar'); if (b && S.endsAt && S.st?.room.settings.timer) b.style.width = Math.max(0, S.endsAt - Date.now()) / (S.st.room.settings.timer * 10) + '%'; }, 500);
setInterval(() => {
  const h = $('#howto'); if (!h) return; S.howStep = (S.howStep + 1) % HOW.length;
  h.querySelectorAll('.scene').forEach((s, i) => s.classList.toggle('on', i === S.howStep));
  h.querySelectorAll('.hdots i').forEach((s, i) => s.classList.toggle('on', i === S.howStep));
  $('#howcap').textContent = HOW[S.howStep].cap; sfx.tap();
}, 3000);
setInterval(() => { if (S.view === 'home' && !layer.innerHTML && !document.activeElement?.dataset?.keep && !S.drawer) render(); }, 4400);

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// البداية: اللي طلع بالغلط بيرجع لحالو لنفس القعدة
const ss = ls.get('gh:session');
if (ss && (!qCode || qCode === ss.code)) { S.view = 'room'; send({ t: 'resume', code: ss.code, token: ss.token }); setTimeout(() => { if (!S.st && S.view === 'room') { S.view = qCode ? 'profile' : 'home'; render(); } }, 5000); }
else if (qCode) { S.view = 'profile'; S.back = ['home']; }
render();
})();
