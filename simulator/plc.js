/* =====================================================================
 * PLC 래더 연동 — picuino/neumatic 포크 추가분
 * Copyright (C) 2026 — GNU General Public License v3.0 (simulator/LICENSE)
 * 원본: https://github.com/picuino/neumatic (C) 2025 Carlos Félix Pardo Martín
 * ===================================================================== */
(function () {
'use strict';

/* ================= PlcCore: 순수 래더 연산 로직 (DOM 의존 없음) =================
 * 량(rung) = 직렬 접점들(AND) + 코일 1개.
 * 같은 코일을 여러 량이 구동하면 OR(병렬)로 동작 → 자기유지 회로 가능.
 * 접점: X(입력) / Y(출력) / T(타이머) / C(카운터), a접점·b접점
 * 코일: Y(출력) / T(TON 타이머, 초) / C(CTU 카운터) / CR(카운터 리셋)
 */
class PlcCore {
  constructor() {
    this.X = new Array(8).fill(false);
    this.Y = new Array(8).fill(false);
    this.T = [];
    for (let i = 0; i < 4; i++) this.T.push({ preset: 2.0, acc: 0, done: false });
    this.C = [];
    for (let i = 0; i < 4; i++) this.C.push({ preset: 5, count: 0, done: false, _prev: false });
    this.rungs = [];
    this.scanCount = 0;
  }

  contactValue(c) {
    let v = false;
    if (c.dev === 'X') v = !!this.X[c.idx];
    else if (c.dev === 'Y') v = !!this.Y[c.idx];
    else if (c.dev === 'T') v = !!(this.T[c.idx] && this.T[c.idx].done);
    else if (c.dev === 'C') v = !!(this.C[c.idx] && this.C[c.idx].done);
    return c.nc ? !v : v;
  }

  rungCond(r) {
    let v = true;
    for (const c of (r.contacts || [])) v = v && this.contactValue(c);
    return v;
  }

  coilPreset(dev, idx) {
    for (const r of this.rungs) {
      if (r.coil && r.coil.dev === dev && r.coil.idx === idx && r.coil.preset != null)
        return r.coil.preset;
    }
    return undefined;
  }

  scan(dt) {
    const conds = this.rungs.map((r) => this.rungCond(r));
    const yOr = new Array(8).fill(false), yDrv = new Array(8).fill(false);
    const tEn = new Array(4).fill(false), tDrv = new Array(4).fill(false);
    const cEn = new Array(4).fill(false), cDrv = new Array(4).fill(false);
    const crEn = new Array(4).fill(false);
    this.rungs.forEach((r, i) => {
      const k = r.coil; if (!k) return;
      const c = conds[i];
      if (k.dev === 'Y') { yOr[k.idx] = yOr[k.idx] || c; yDrv[k.idx] = true; }
      else if (k.dev === 'T') { tEn[k.idx] = tEn[k.idx] || c; tDrv[k.idx] = true; }
      else if (k.dev === 'C') { cEn[k.idx] = cEn[k.idx] || c; cDrv[k.idx] = true; }
      else if (k.dev === 'CR') { crEn[k.idx] = crEn[k.idx] || c; }
    });
    for (let i = 0; i < 8; i++) if (yDrv[i]) this.Y[i] = yOr[i];
    for (let i = 0; i < 4; i++) {
      const t = this.T[i];
      if (tDrv[i]) {
        const p = Number(this.coilPreset('T', i));
        if (!isNaN(p) && p > 0) t.preset = p;
        if (tEn[i]) t.acc += dt; else t.acc = 0;
        t.done = t.acc >= t.preset;
      }
      const c = this.C[i];
      if (crEn[i]) { c.count = 0; c.done = false; c._prev = false; }
      else if (cDrv[i]) {
        const p = Math.round(Number(this.coilPreset('C', i)));
        if (!isNaN(p) && p >= 1) c.preset = p;
        if (cEn[i] && !c._prev) c.count++;
        c._prev = cEn[i];
        c.done = c.count >= c.preset;
      }
    }
    this.scanCount++;
  }

  resetAll() {
    this.X.fill(false); this.Y.fill(false);
    for (const t of this.T) { t.acc = 0; t.done = false; }
    for (const c of this.C) { c.count = 0; c.done = false; c._prev = false; }
    this.scanCount = 0;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PlcCore };
if (typeof window !== 'undefined') window.PlcCore = PlcCore;

/* ================= 브라우저 UI ================= */
if (typeof window === 'undefined' || typeof document === 'undefined') return;
if (!window.__sim || !window.__sim.engine) {
  console.error('[PLC] __sim.engine 을 찾을 수 없습니다.');
  return;
}
const engine = window.__sim.engine;

const LS_KEY = 'sf_plc_v1';
const SCAN_MS = 100;

const plc = {
  running: false,
  timer: null,
  core: new PlcCore(),
  btn: new Array(8).fill(false),
  inMap: [],   // {src:'none'|'btn'|'roller', type, x, y}
  outMap: [],  // null | {type, x, y}
};
for (let i = 0; i < 8; i++) {
  plc.inMap.push({ src: 'none' });
  plc.outMap.push(null);
}

const VALVE_TYPES = ['Valve52p', 'Valve32p', 'Valve42m'];
const VALVE_LABEL = { Valve52p: '5/2 파일럿', Valve32p: '3/2 파일럿', Valve42m: '4/2 수동' };

function findComp(d) {
  if (!d || !d.type) return null;
  for (const c of engine.components) {
    if (c.type === d.type && c.x === d.x && c.y === d.y) return c;
  }
  return null;
}
function listRollers() {
  return engine.components.filter((c) => c.type === 'Roller');
}
function listValves() {
  return engine.components.filter((c) => VALVE_TYPES.includes(c.type));
}

/* ---------- 스캔 루프 ---------- */
function plcScan() {
  for (let i = 0; i < 8; i++) {
    const m = plc.inMap[i];
    let v = false;
    if (m.src === 'btn') v = plc.btn[i];
    else if (m.src === 'roller') {
      const r = findComp(m);
      v = !!(r && r.active);
    }
    plc.core.X[i] = v;
  }
  plc.core.scan(SCAN_MS / 1000);
  for (let i = 0; i < 8; i++) {
    const d = plc.outMap[i];
    if (!d) continue;
    const v = findComp(d);
    if (v) { v.plcDriven = true; v.active = !!plc.core.Y[i]; }
  }
  plcUpdateLeds();
}

function plcStart() {
  if (plc.running) return;
  // 공압 시뮬레이션이 꺼져 있으면 같이 켜줌
  try {
    if (typeof simulationActive !== 'undefined' && !simulationActive &&
        typeof simulationPlayPause === 'function') simulationPlayPause();
  } catch (e) { /* 무시 */ }
  plc.running = true;
  plc.timer = setInterval(plcScan, SCAN_MS);
  plcRefreshRunUI();
}
function plcStop() {
  plc.running = false;
  if (plc.timer) { clearInterval(plc.timer); plc.timer = null; }
  // PLC가 구동하던 밸브를 놓아줌
  for (let i = 0; i < 8; i++) {
    const d = plc.outMap[i];
    if (!d) continue;
    const v = findComp(d);
    if (v) { v.plcDriven = false; v.active = false; }
  }
  plc.core.resetAll();
  plcRefreshRunUI();
  plcUpdateLeds();
}

/* ================= PLC 패널 UI ================= */
const PLC_CSS = `
#plcPanel{position:fixed;top:35px;right:0;bottom:0;width:360px;max-width:94vw;background:#fff;
  border-left:1px solid #999;z-index:1001;overflow-y:auto;font-family:sans-serif;font-size:13px;
  box-shadow:-2px 0 8px rgba(0,0,0,.15);display:none}
#plcPanel.open{display:block}
.plc-head{position:sticky;top:0;background:#1f2937;color:#fff;padding:8px 10px;display:flex;
  align-items:center;gap:8px;z-index:2}
.plc-head b{flex:1}
.plc-sec{padding:8px 10px;border-bottom:1px solid #e5e7eb}
.plc-sec h3{margin:0 0 6px;font-size:13px}
.plc-row{display:flex;align-items:center;gap:6px;margin:3px 0;flex-wrap:wrap}
.plc-led{width:14px;height:14px;border-radius:50%;background:#d1d5db;border:1px solid #9ca3af;
  display:inline-block;flex:none}
.plc-led.on{background:#22c55e;border-color:#16a34a;box-shadow:0 0 4px #22c55e}
.plc-led.out.on{background:#3b82f6;border-color:#2563eb;box-shadow:0 0 4px #3b82f6}
.plc-lbl{font-family:monospace;font-weight:bold;width:26px;flex:none}
.plc-btn{cursor:pointer;border:1px solid #9ca3af;background:#f3f4f6;border-radius:4px;padding:3px 8px;font-size:12px}
.plc-btn:hover{background:#e5e7eb}
.plc-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb}
.plc-btn.primary:hover{background:#1d4ed8}
.plc-btn.danger{background:#dc2626;color:#fff;border-color:#dc2626}
.plc-btn:disabled{opacity:.45;cursor:default}
.plc-sel{font-size:12px;max-width:220px}
.plc-num{width:52px;font-size:12px}
.plc-rung{border:1px solid #d1d5db;border-radius:6px;padding:6px;margin:6px 0;background:#f9fafb}
.plc-rung-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
.plc-contact{display:inline-flex;align-items:center;gap:3px;background:#fff;border:1px solid #9ca3af;
  border-radius:4px;padding:2px 4px;margin:2px;font-size:12px}
.plc-coil{display:inline-flex;align-items:center;gap:3px;background:#dbeafe;border:1px solid #3b82f6;
  border-radius:4px;padding:2px 4px;margin:2px;font-size:12px}
.plc-arrow{font-weight:bold;color:#6b7280}
.plc-hint{font-size:11px;color:#6b7280;line-height:1.5}
.plc-vbtn{min-width:44px;min-height:26px}
.plc-vbtn.pressed{background:#22c55e;color:#fff;border-color:#16a34a}
#plcToggleBtn.on{background:#2563eb;color:#fff}
`;

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const CONTACT_DEVS = [];
for (let i = 0; i < 8; i++) CONTACT_DEVS.push({ v: 'X' + i, t: 'X' + i });
for (let i = 0; i < 8; i++) CONTACT_DEVS.push({ v: 'Y' + i, t: 'Y' + i });
for (let i = 0; i < 4; i++) CONTACT_DEVS.push({ v: 'T' + i, t: 'T' + i });
for (let i = 0; i < 4; i++) CONTACT_DEVS.push({ v: 'C' + i, t: 'C' + i });
const COIL_DEVS = [];
for (let i = 0; i < 8; i++) COIL_DEVS.push({ v: 'Y' + i, t: 'Y' + i + ' 출력' });
for (let i = 0; i < 4; i++) COIL_DEVS.push({ v: 'T' + i, t: 'T' + i + ' 타이머' });
for (let i = 0; i < 4; i++) COIL_DEVS.push({ v: 'C' + i, t: 'C' + i + ' 카운터' });
for (let i = 0; i < 4; i++) COIL_DEVS.push({ v: 'CR' + i, t: 'C' + i + ' 리셋' });

function parseDev(str) { return { dev: str[0] === 'C' && str[1] === 'R' ? 'CR' : str[0], idx: parseInt(str.replace(/^[A-Z]+/, ''), 10) }; }
function devStr(dev, idx) { return dev + idx; }

function buildPanel() {
  const st = document.createElement('style');
  st.textContent = PLC_CSS;
  document.head.appendChild(st);

  const p = el(`<div id="plcPanel">
    <div class="plc-head"><b>🔌 PLC 래더</b>
      <button class="plc-btn primary" id="plcRun">▶ Run</button>
      <button class="plc-btn danger" id="plcStop" disabled>⏹ Stop</button>
      <button class="plc-btn" id="plcClose">✕</button>
    </div>
    <div class="plc-sec"><div class="plc-row">
      <span class="plc-led" id="plcRunLed"></span><span id="plcStatus">정지</span>
      <span class="plc-hint" id="plcScanInfo"></span>
    </div>
    <div class="plc-hint">스캔 주기 100ms · Run을 누르면 공압 시뮬레이션도 함께 시작됩니다.</div></div>
    <div class="plc-sec"><h3>💡 I/O 모니터</h3><div id="plcIoMon"></div></div>
    <div class="plc-sec"><h3>🔗 I/O 매핑 <button class="plc-btn" id="plcMapRefresh" style="font-size:11px">🔄 부품 목록 새로고침</button></h3>
      <div id="plcInMap"></div><div id="plcOutMap" style="margin-top:6px"></div></div>
    <div class="plc-sec"><h3>🪜 래더 프로그램</h3>
      <div id="plcRungs"></div>
      <div class="plc-row">
        <button class="plc-btn" id="plcAddRung">➕ 량 추가</button>
        <button class="plc-btn" id="plcExample">📥 실린더 왕복 예제</button>
        <button class="plc-btn" id="plcClear">🗑 전체 삭제</button>
      </div>
      <div class="plc-hint">같은 코일을 여러 량이 구동하면 OR(병렬)로 동작합니다. 예: 자기유지 = [X0→Y0] + [Y0 a접점, X1 b접점 → Y0]</div>
    </div>
    <div class="plc-sec"><h3>📖 간단 사용법</h3><div class="plc-hint">
      1) 공압 회로를 그립니다 (실린더+5/2 파일럿 밸브+롤러 2개).<br>
      2) I/O 매핑에서 X←롤러, Y→밸브를 연결합니다.<br>
      3) 래더를 작성하고 ▶ Run을 누릅니다.<br>
      4) "📥 실린더 왕복 예제"는 예제 회로+래더를 한 번에 불러옵니다.<br>
      <span style="color:#999">fork: picuino/neumatic (GPL-3.0) + PLC 연동 추가</span>
    </div></div>
  </div>`);
  document.body.appendChild(p);

  document.getElementById('plcRun').onclick = plcStart;
  document.getElementById('plcStop').onclick = plcStop;
  document.getElementById('plcClose').onclick = togglePanel;
  document.getElementById('plcAddRung').onclick = () => { plc.core.rungs.push({ contacts: [], coil: null }); savePlc(); renderRungs(); };
  document.getElementById('plcClear').onclick = () => { if (confirm('래더 프로그램을 모두 삭제할까요?')) { plc.core.rungs = []; savePlc(); renderRungs(); } };
  document.getElementById('plcExample').onclick = loadExample;
  document.getElementById('plcMapRefresh').onclick = () => { renderIoMap(); renderIoMon(); };

  renderIoMon(); renderIoMap(); renderRungs(); plcRefreshRunUI();
}

function togglePanel() {
  const p = document.getElementById('plcPanel');
  p.classList.toggle('open');
  const b = document.getElementById('plcToggleBtn');
  if (b) b.classList.toggle('on', p.classList.contains('open'));
  if (p.classList.contains('open')) { renderIoMap(); renderIoMon(); renderRungs(); }
}

function addToolbarButton() {
  const bar = document.querySelector('li.sim-toolbar');
  if (!bar) return;
  const b = el('<button class="sim-btn" id="plcToggleBtn" title="PLC 래더 패널">🔌</button>');
  b.style.fontSize = '15px';
  b.onclick = togglePanel;
  const sep = bar.querySelector('.sim-separator');
  if (sep && sep.nextSibling) bar.insertBefore(b, sep.nextSibling);
  else bar.appendChild(b);
}

/* ---------- I/O 모니터 ---------- */
function renderIoMon() {
  const box = document.getElementById('plcIoMon');
  if (!box) return;
  box.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const m = plc.inMap[i];
    const row = el(`<div class="plc-row"><span class="plc-lbl">X${i}</span>
      <span class="plc-led" id="plcLedX${i}"></span><span class="plc-hint" id="plcSrcX${i}"></span></div>`);
    if (m.src === 'btn') {
      const vb = el(`<button class="plc-btn plc-vbtn" id="plcVbtn${i}">누름</button>`);
      const on = (e) => { e.preventDefault(); plc.btn[i] = true; vb.classList.add('pressed'); };
      const off = () => { plc.btn[i] = false; vb.classList.remove('pressed'); };
      vb.addEventListener('mousedown', on);
      vb.addEventListener('mouseup', off);
      vb.addEventListener('mouseleave', off);
      vb.addEventListener('touchstart', on, { passive: false });
      vb.addEventListener('touchend', off);
      row.appendChild(vb);
    }
    box.appendChild(row);
  }
  for (let i = 0; i < 8; i++) {
    const row = el(`<div class="plc-row"><span class="plc-lbl">Y${i}</span>
      <span class="plc-led out" id="plcLedY${i}"></span><span class="plc-hint" id="plcDstY${i}"></span></div>`);
    box.appendChild(row);
  }
  plcUpdateIoLabels();
}

function srcLabel(m) {
  if (!m || m.src === 'none') return '미사용';
  if (m.src === 'btn') return '가상 버튼';
  if (m.src === 'roller') return `롤러(${m.x},${m.y})`;
  return m.src;
}
function dstLabel(d) {
  if (!d) return '미사용';
  return `${VALVE_LABEL[d.type] || d.type}(${d.x},${d.y})`;
}
function plcUpdateIoLabels() {
  for (let i = 0; i < 8; i++) {
    const s = document.getElementById('plcSrcX' + i);
    if (s) s.textContent = srcLabel(plc.inMap[i]);
    const d = document.getElementById('plcDstY' + i);
    if (d) d.textContent = dstLabel(plc.outMap[i]);
  }
}
function plcUpdateLeds() {
  for (let i = 0; i < 8; i++) {
    const lx = document.getElementById('plcLedX' + i);
    if (lx) lx.classList.toggle('on', !!plc.core.X[i]);
    const ly = document.getElementById('plcLedY' + i);
    if (ly) ly.classList.toggle('on', !!plc.core.Y[i]);
  }
  const info = document.getElementById('plcScanInfo');
  if (info && plc.running) info.textContent = `스캔 ${plc.core.scanCount}회`;
}

/* ---------- I/O 매핑 ---------- */
function renderIoMap() {
  const rollers = listRollers();
  const valves = listValves();
  const inBox = document.getElementById('plcInMap');
  inBox.innerHTML = '<div class="plc-hint" style="margin-bottom:4px">입력 X0~X7 ← 신호원</div>';
  for (let i = 0; i < 8; i++) {
    const m = plc.inMap[i];
    const sel = el('<select class="plc-sel"></select>');
    sel.appendChild(new Option('미사용', 'none'));
    sel.appendChild(new Option('가상 푸쉬버튼', 'btn'));
    rollers.forEach((r) => {
      const o = new Option(`롤러 ${r.options.reference || ''} (${r.x},${r.y})`, `roller:${r.x},${r.y}`);
      sel.appendChild(o);
    });
    sel.value = m.src === 'roller' ? `roller:${m.x},${m.y}` : m.src;
    if (m.src === 'roller' && !rollers.some((r) => r.x === m.x && r.y === m.y)) {
      const o = new Option(`롤러 (없음:${m.x},${m.y})`, `roller:${m.x},${m.y}`);
      sel.appendChild(o); sel.value = o.value;
    }
    sel.onchange = () => {
      const v = sel.value;
      if (v === 'none') plc.inMap[i] = { src: 'none' };
      else if (v === 'btn') plc.inMap[i] = { src: 'btn' };
      else { const [, xy] = v.split(':'); const [x, y] = xy.split(',').map(Number); plc.inMap[i] = { src: 'roller', type: 'Roller', x, y }; }
      savePlc(); renderIoMon(); plcUpdateIoLabels();
    };
    const row = el(`<div class="plc-row"><span class="plc-lbl">X${i}</span></div>`);
    row.appendChild(sel);
    inBox.appendChild(row);
  }
  const outBox = document.getElementById('plcOutMap');
  outBox.innerHTML = '<div class="plc-hint" style="margin-bottom:4px">출력 Y0~Y7 → 밸브</div>';
  for (let i = 0; i < 8; i++) {
    const d = plc.outMap[i];
    const sel = el('<select class="plc-sel"></select>');
    sel.appendChild(new Option('미사용', 'none'));
    valves.forEach((v) => {
      sel.appendChild(new Option(`${VALVE_LABEL[v.type]} (${v.x},${v.y})`, `${v.type}:${v.x},${v.y}`));
    });
    sel.value = d ? `${d.type}:${d.x},${d.y}` : 'none';
    if (d && !valves.some((v) => v.type === d.type && v.x === d.x && v.y === d.y)) {
      const o = new Option(`${VALVE_LABEL[d.type] || d.type} (없음)`, `${d.type}:${d.x},${d.y}`);
      sel.appendChild(o); sel.value = o.value;
    }
    sel.onchange = () => {
      const prev = plc.outMap[i];
      if (prev) { const pv = findComp(prev); if (pv) { pv.plcDriven = false; } }
      const v = sel.value;
      plc.outMap[i] = v === 'none' ? null : (() => {
        const [type, xy] = v.split(':'); const [x, y] = xy.split(',').map(Number);
        return { type, x, y };
      })();
      savePlc(); plcUpdateIoLabels();
    };
    const row = el(`<div class="plc-row"><span class="plc-lbl">Y${i}</span></div>`);
    row.appendChild(sel);
    outBox.appendChild(row);
  }
  plcUpdateIoLabels();
}

/* ---------- 래더 에디터 ---------- */
function renderRungs() {
  const box = document.getElementById('plcRungs');
  if (!box) return;
  box.innerHTML = '';
  if (plc.core.rungs.length === 0) {
    box.appendChild(el('<div class="plc-hint">량이 없습니다. "➕ 량 추가" 또는 "📥 실린더 왕복 예제"를 눌러보세요.</div>'));
    return;
  }
  plc.core.rungs.forEach((rung, ri) => {
    const div = el(`<div class="plc-rung"><div class="plc-rung-head"><b>량 ${ri + 1}</b>
      <button class="plc-btn" data-act="del">삭제</button></div></div>`);
    div.querySelector('[data-act=del]').onclick = () => { plc.core.rungs.splice(ri, 1); savePlc(); renderRungs(); };

    const cbox = el('<div></div>');
    (rung.contacts || []).forEach((c, ci) => {
      const cd = el('<span class="plc-contact">─| |-</span>');
      const dsel = el('<select class="plc-sel" style="max-width:64px"></select>');
      CONTACT_DEVS.forEach((d) => dsel.appendChild(new Option(d.t, d.v)));
      dsel.value = devStr(c.dev, c.idx);
      dsel.onchange = () => { const p = parseDev(dsel.value); c.dev = p.dev === 'CR' ? 'C' : p.dev; c.idx = p.idx; savePlc(); };
      const ncb = el(`<button class="plc-btn" title="a/b접점 전환" style="font-size:11px">${c.nc ? 'b접점' : 'a접점'}</button>`);
      ncb.onclick = () => { c.nc = !c.nc; savePlc(); renderRungs(); };
      const del = el('<button class="plc-btn" style="font-size:11px">x</button>');
      del.onclick = () => { rung.contacts.splice(ci, 1); savePlc(); renderRungs(); };
      cd.innerHTML = '';
      cd.appendChild(dsel); cd.appendChild(ncb); cd.appendChild(del);
      cbox.appendChild(cd);
    });
    const addC = el('<button class="plc-btn" style="font-size:11px">+ 접점</button>');
    addC.onclick = () => { rung.contacts.push({ dev: 'X', idx: 0, nc: false }); savePlc(); renderRungs(); };
    cbox.appendChild(addC);
    div.appendChild(cbox);

    const kbox = el('<div style="margin-top:4px"></div>');
    kbox.appendChild(el('<span class="plc-arrow">──▶ </span>'));
    if (!rung.coil) {
      const mk = el('<button class="plc-btn" style="font-size:11px">+ 코일</button>');
      mk.onclick = () => { rung.coil = { dev: 'Y', idx: 0 }; savePlc(); renderRungs(); };
      kbox.appendChild(mk);
    } else {
      const kc = el('<span class="plc-coil">( )</span>');
      const ksel = el('<select class="plc-sel" style="max-width:96px"></select>');
      COIL_DEVS.forEach((d) => ksel.appendChild(new Option(d.t, d.v)));
      ksel.value = devStr(rung.coil.dev, rung.coil.idx);
      ksel.onchange = () => {
        const p = parseDev(ksel.value);
        rung.coil = { dev: p.dev, idx: p.idx };
        if (p.dev === 'T') rung.coil.preset = 2.0;
        if (p.dev === 'C') rung.coil.preset = 5;
        savePlc(); renderRungs();
      };
      kc.appendChild(ksel);
      if (rung.coil.dev === 'T' || rung.coil.dev === 'C') {
        const lbl = el(`<span style="font-size:11px">${rung.coil.dev === 'T' ? '초' : '회'}</span>`);
        const pn = el('<input type="number" class="plc-num" min="0.1" step="0.1">');
        pn.value = rung.coil.preset != null ? rung.coil.preset : (rung.coil.dev === 'T' ? 2 : 5);
        pn.onchange = () => { rung.coil.preset = Number(pn.value); savePlc(); };
        kc.appendChild(pn); kc.appendChild(lbl);
      }
      const kdel = el('<button class="plc-btn" style="font-size:11px">x</button>');
      kdel.onclick = () => { rung.coil = null; savePlc(); renderRungs(); };
      kc.appendChild(kdel);
      kbox.appendChild(kc);
    }
    div.appendChild(kbox);
    box.appendChild(div);
  });
}

/* ---------- 예제 ---------- */
function loadExample() {
  const go = () => {
    // 예제 회로 불러오기
    if (typeof openFile === 'function') openFile('./circuits/plc-reciprocating.txt');
    // 예제 래더: 자기유지 왕복
    plc.core.rungs = [
      { contacts: [{ dev: 'X', idx: 0, nc: false }], coil: { dev: 'Y', idx: 0 } },
      { contacts: [{ dev: 'Y', idx: 0, nc: false }, { dev: 'X', idx: 1, nc: true }], coil: { dev: 'Y', idx: 0 } },
    ];
    savePlc(); renderRungs();
    // I/O 자동 매핑 (reference X0/X1 롤러, 첫 번째 5/2 파일럿 밸브)
    setTimeout(() => {
      const rollers = listRollers();
      const r0 = rollers.find((r) => r.options.reference === 'X0') || rollers[0];
      const r1 = rollers.find((r) => r.options.reference === 'X1') || rollers[1];
      if (r0) plc.inMap[0] = { src: 'roller', type: 'Roller', x: r0.x, y: r0.y };
      if (r1) plc.inMap[1] = { src: 'roller', type: 'Roller', x: r1.x, y: r1.y };
      const v = listValves().find((vv) => vv.type === 'Valve52p') || listValves()[0];
      if (v) plc.outMap[0] = { type: v.type, x: v.x, y: v.y };
      savePlc(); renderIoMap(); renderIoMon();
    }, 600);
  };
  if (engine.components.length > 0) {
    if (confirm('예제 회로를 불러오면 현재 회로가 교체됩니다. 계속할까요?')) go();
  } else go();
}

/* ---------- 저장/불러오기 ---------- */
function savePlc() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      rungs: plc.core.rungs,
      inMap: plc.inMap,
      outMap: plc.outMap,
    }));
  } catch (e) { /* 무시 */ }
}
function loadPlc() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY));
    if (!d) return;
    if (Array.isArray(d.rungs)) plc.core.rungs = d.rungs;
    if (Array.isArray(d.inMap)) d.inMap.forEach((m, i) => { if (i < 8 && m) plc.inMap[i] = m; });
    if (Array.isArray(d.outMap)) d.outMap.forEach((m, i) => { if (i < 8) plc.outMap[i] = m || null; });
  } catch (e) { /* 무시 */ }
}

function plcRefreshRunUI() {
  const run = document.getElementById('plcRun');
  const stop = document.getElementById('plcStop');
  const led = document.getElementById('plcRunLed');
  const st = document.getElementById('plcStatus');
  if (run) run.disabled = plc.running;
  if (stop) stop.disabled = !plc.running;
  if (led) led.classList.toggle('on', plc.running);
  if (st) st.textContent = plc.running ? '운전 중 (100ms 스캔)' : '정지';
  if (!plc.running) {
    const info = document.getElementById('plcScanInfo');
    if (info) info.textContent = '';
  }
}

/* ---------- 초기화 ---------- */
loadPlc();
buildPanel();
addToolbarButton();
window.__plc = plc;
window.plcStop = plcStop; // fork 추가: 시뮬레이터 초기화 버튼에서 PLC 정지용으로 노출
window.plcStart = plcStart;

})();
