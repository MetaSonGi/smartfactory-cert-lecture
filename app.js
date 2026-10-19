/* 스마트팩토리 자격증 강의 — NCS 기반 자격증 학습 + LMS (Firebase + 데모 모드)
* LMS(출석·진도·퀴즈·AI도구)는 metasongi-class 구조를 포팅. 수료증·화이트보드 제외.
* Firestore는 기존 hina-class 프로젝트의 metasongi-class 보안 규칙으로 커버됨 (새 컬렉션 없음).
*/
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const CFG = window.HINA_CONFIG || {};
const DEMO =!CFG.firebase;
const esc = (s) => String(s?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

let db = null, auth = null;
let user = null; // {uid,email,name,photo,role,classId}

if (!DEMO) {
firebase.initializeApp(CFG.firebase);
auth = firebase.auth(); db = firebase.firestore();
} else {
$('demoBanner').style.display = 'block';
$('demoRow').style.display = 'flex';
}

/* ================= 데모 DB (localStorage) ================= */
const DKEY = 'sfcl_demo_v1';
function demoDb() {
let d;
try { d = JSON.parse(localStorage.getItem(DKEY));} catch (e) { d = null;}
if (!d) {
d = {
users: [
{ uid: 't1', email: 'teacher@demo', name: '김강사', role: 'teacher'},
{ uid: 's0', email: 'wait@demo', name: '박대기', role: 'pending'},
{ uid: 's1', email: 'stu@demo', name: '이학생', role: 'student', classId: 'c1'},
],
classes: [{ id: 'c1', name: '자동화설비기능사 대비반'}],
sessions: [], attendance: [], views: {},
quizzes: [], quizResults: [],
assignments: [], submissions: [],
aiKnowledge: '',
};
localStorage.setItem(DKEY, JSON.stringify(d));
}
if (!Array.isArray(d.sessions)) d.sessions = [];
if (!Array.isArray(d.attendance)) d.attendance = [];
if (!d.views || typeof d.views!== 'object') d.views = {};
if (!Array.isArray(d.quizzes)) d.quizzes = [];
if (!Array.isArray(d.quizResults)) d.quizResults = [];
if (!Array.isArray(d.assignments)) d.assignments = [];
if (!Array.isArray(d.submissions)) d.submissions = [];
if (typeof d.aiKnowledge!== 'string') d.aiKnowledge = '';
return d;
}
function demoSave(d) { localStorage.setItem(DKEY, JSON.stringify(d));}
const nid = (p) => p + Math.random().toString(36).slice(2, 9);

/* ================= 화면 전환 ================= */
function show(id) {
['view-login', 'view-pending', 'view-teacher', 'view-student', 'view-guest'].forEach((v) =>
$(v).style.display = v === id? 'block': 'none');
window.scrollTo(0, 0);
}

/* 과정 둘러보기 컨테이너 (학생/게스트 공용) */
let B_HOME = null, B_VIEW = null;
function browseCtx(homeId, viewId) { B_HOME = $(homeId); B_VIEW = $(viewId); }

/* 게스트(로그인 없이) 둘러보기 */
$('guestEnter').addEventListener('click', () => {
user = null; browseCtx('gCourseHome', 'gLessonView'); show('view-guest'); renderCourseHome();
});
$('guestLogin').addEventListener('click', () => show('view-login'));

/* ================= 인증 ================= */
$('googleLogin').addEventListener('click', async () => {
if (DEMO) { alert('데모 모드입니다. 아래 데모 버튼으로 입장하세요.'); return;}
try {
const prov = new firebase.auth.GoogleAuthProvider();
await auth.signInWithPopup(prov);
} catch (e) { alert('로그인 실패: ' + e.message);}
});

$('demoTeacher').addEventListener('click', () => loginDemo('t1'));
$('demoStudent').addEventListener('click', () => loginDemo('s1'));
function loginDemo(uid) {
const d = demoDb();
user = d.users.find((u) => u.uid === uid);
route();
}

['logout1', 'logout2', 'logout3'].forEach((id) => $(id).addEventListener('click', async () => {
if (!DEMO) await auth.signOut();
user = null; show('view-login');
}));

if (!DEMO) {
auth.onAuthStateChanged(async (fu) => {
if (!fu) { user = null; show('view-login'); return;}
const ref = db.collection('users').doc(fu.uid);
const snap = await ref.get();
const role = await resolveRole(fu);
if (!snap.exists) {
user = { uid: fu.uid, email: fu.email, name: fu.displayName, photo: fu.photoURL, role, classId: null};
await ref.set({...user, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
} else {
user = { uid: fu.uid,...snap.data()};
if (role === 'teacher' && user.role!== 'teacher') {
user.role = 'teacher';
await ref.update({ role: 'teacher'});
}
}
route();
});
}

// 강사 판정: teachers/{uid} 문서 존재 여부.
// 최초 1회는 config/admins 문서의 emails 목록과 대조해 teachers 문서를 만든다.
async function resolveRole(fu) {
try {
const t = await db.collection('teachers').doc(fu.uid).get();
if (t.exists) return 'teacher';
const a = await db.collection('config').doc('admins').get();
const emails = a.exists? (a.data().emails || []): [];
if (emails.includes(fu.email)) {
await db.collection('teachers').doc(fu.uid).set({
email: fu.email, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
});
return 'teacher';
}
} catch (e) { console.warn('role resolve failed', e);}
return 'pending';
}

$('pendingRefresh').addEventListener('click', async () => {
if (DEMO) { route(); return;}
const snap = await db.collection('users').doc(user.uid).get();
user = { uid: user.uid,...snap.data()};
route();
});

function route() {
if (!user) { show('view-login'); return;}
if (user.role === 'teacher') { show('view-teacher'); $('tName').textContent = user.name; initTeacher();}
else if (user.role === 'student') { show('view-student'); $('sName').textContent = user.name; initStudent();}
else { show('view-pending');}
}

/* 탭 전환 (공용) */
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
const scope = t.dataset.t[0]; // t- / s-
document.querySelectorAll(`.tab[data-t^="${scope}-"]`).forEach((x) => x.classList.toggle('active', x === t));
document.querySelectorAll('.tpanel').forEach((p) => p.classList.toggle('active', p.id === t.dataset.t));
}));

function classOptions(sel, classes, selectedId) {
sel.innerHTML = classes.map((c) => `<option value="${c.id}" ${c.id === selectedId? 'selected': ''}>${esc(c.name)}</option>`).join('')
|| '<option value="">(반 없음)</option>';
}
async function getClasses() {
if (DEMO) return demoDb().classes;
const s = await db.collection('classes').orderBy('createdAt').get();
return s.docs.map((d) => ({ id: d.id,...d.data()}));
}

/* ================= 과정 데이터 헬퍼 ================= */
const LESSON_IDS = Object.keys(LESSONS);
function lessonTitle(sid) { return (LESSONS[sid] && LESSONS[sid].title) || sid;}
function certOfSubject(sid) {
const idx = SUBJECT_INDEX[sid];
return idx? getCert(idx.certId): null;
}

/* ================= 강사 ================= */
let tClasses = [];
let tStudents = [];
let tSubsMap = {}, tAssignsMap = {};
async function initTeacher() {
tClasses = await getClasses();
['classSelect', 'attClass', 'progClass', 'quizClass', 'asClass'].forEach((id) => classOptions($(id), tClasses, tClasses[0]?.id));
await Promise.all([loadPending(), loadRoster(), loadAssignments()]);
initTeacherLms();
}

$('createClass').addEventListener('click', async () => {
const name = $('newClassName').value.trim();
if (!name) { alert('반 이름을 입력하세요.'); return;}
if (DEMO) { const d = demoDb(); const c = { id: nid('c'), name}; d.classes.push(c); demoSave(d);}
else await db.collection('classes').add({ name, teacherId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
$('newClassName').value = '';
initTeacher();
});

async function loadPending() {
let list;
if (DEMO) list = demoDb().users.filter((u) => u.role === 'pending');
else { const s = await db.collection('users').where('role', '==', 'pending').get(); list = s.docs.map((d) => ({ uid: d.id,...d.data()}));}
$('pendingList').innerHTML = list.length? list.map((u) => `
<li><span>${esc(u.name)} <span class="meta">${esc(u.email)}</span></span>
<button class="btn small primary" data-approve="${u.uid}">승인 → ${esc($('classSelect').selectedOptions[0]?.text || '반')}</button></li>`).join('')
: '<li><span class="meta">대기 중인 학생이 없습니다</span></li>';
$('pendingList').querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => approve(b.dataset.approve)));
}

async function approve(uid) {
const classId = $('classSelect').value;
if (!classId) { alert('먼저 반을 만드세요.'); return;}
if (DEMO) { const d = demoDb(); const u = d.users.find((x) => x.uid === uid); u.role = 'student'; u.classId = classId; demoSave(d);}
else await db.collection('users').doc(uid).update({ role: 'student', classId});
loadPending(); loadRoster();
}

async function loadRoster() {
let students;
if (DEMO) students = demoDb().users.filter((u) => u.role === 'student');
else { const s = await db.collection('users').where('role', '==', 'student').get(); students = s.docs.map((d) => ({ uid: d.id,...d.data()}));}
tStudents = students;
const unassigned = students.filter((s) =>!s.classId);
$('classRoster').innerHTML = tClasses.map((c) => {
const members = students.filter((s) => s.classId === c.id);
return `<div class="week-group"><div class="week-title">${esc(c.name)} (${members.length}명)
<button class="btn small ghost" data-renameclass="${c.id}" data-name="${esc(c.name)}" style="margin-left:8px">이름 변경</button>
<button class="btn small ghost" data-delclass="${c.id}" data-name="${esc(c.name)}" style="margin-left:4px">삭제</button></div>
${members.map((m) => `<div class="mat-item"><span>${esc(m.name)} <span class="meta">${esc(m.email)}</span></span></div>`).join('') || '<p class="hint">학생 없음</p>'}</div>`;
}).join('') + (unassigned.length? `<div class="week-group"><div class="week-title">미배정 (${unassigned.length}명)</div>
${unassigned.map((m) => `<div class="mat-item"><span>${esc(m.name)} <span class="meta">${esc(m.email)}</span></span></div>`).join('')}</div>`: '');
$('classRoster').querySelectorAll('[data-renameclass]').forEach((b) =>
b.addEventListener('click', () => renameClass(b.dataset.renameclass, b.dataset.name)));
$('classRoster').querySelectorAll('[data-delclass]').forEach((b) =>
b.addEventListener('click', () => delClass(b.dataset.delclass, b.dataset.name)));
}

async function renameClass(id, oldName) {
const name = prompt('반 새 이름', oldName);
if (name === null) return;
const newName = name.trim();
if (!newName) { alert('반 이름을 입력하세요.'); return;}
if (newName === oldName) return;
if (DEMO) { const d = demoDb(); const c = d.classes.find((x) => x.id === id); if (c) c.name = newName; demoSave(d);}
else await db.collection('classes').doc(id).update({ name: newName});
initTeacher();
}

// 반 삭제: 관련 출석·퀴즈·과제·제출까지 함께 삭제, 소속 학생은 미배정
async function delClass(id, name) {
const members = tStudents.filter((s) => s.classId === id);
if (!confirm(`'${name}' 반을 삭제할까요?\n출석·퀴즈·과제 기록도 함께 지워집니다.${members.length? `\n학생 ${members.length}명은 미배정 상태가 됩니다.`: ''}`)) return;
if (DEMO) {
const d = demoDb();
d.classes = d.classes.filter((c) => c.id!== id);
const aids = d.assignments.filter((a) => a.classId === id).map((a) => a.id);
d.assignments = d.assignments.filter((a) => a.classId!== id);
d.submissions = d.submissions.filter((s) =>!aids.includes(s.assignmentId));
d.sessions = d.sessions.filter((s) => s.classId!== id);
d.attendance = d.attendance.filter((a) => a.classId!== id);
d.quizzes = d.quizzes.filter((q) => q.classId!== id);
d.quizResults = d.quizResults.filter((r) => r.classId!== id);
d.users.forEach((u) => { if (u.classId === id) u.classId = null;});
demoSave(d);
} else {
const [assigns, sess, attRecs, quizRecs, qresRecs] = await Promise.all([
db.collection('assignments').where('classId', '==', id).get(),
db.collection('classes').doc(id).collection('sessions').get(),
db.collection('classes').doc(id).collection('attendance').get(),
db.collection('classes').doc(id).collection('quizzes').get(),
db.collection('classes').doc(id).collection('quizResults').get(),
]);
const batch = db.batch();
const aids = [];
assigns.forEach((x) => { aids.push(x.id); batch.delete(x.ref);});
for (const aid of aids) {
const subs = await db.collection('submissions').where('assignmentId', '==', aid).get();
subs.forEach((x) => batch.delete(x.ref));
}
members.forEach((s) => batch.update(db.collection('users').doc(s.uid), { classId: null}));
sess.forEach((x) => batch.delete(x.ref));
attRecs.forEach((x) => batch.delete(x.ref));
quizRecs.forEach((x) => batch.delete(x.ref));
qresRecs.forEach((x) => batch.delete(x.ref));
batch.delete(db.collection('classes').doc(id));
await batch.commit();
}
initTeacher();
}

/* ================= 학생: 과정 카탈로그·강의자료·연습문제 ================= */
function renderCourseHome() {
if (!B_HOME || !B_VIEW) browseCtx('courseHome', 'lessonView');
B_VIEW.style.display = 'none';
B_HOME.style.display = 'block';
B_HOME.innerHTML = `<h2>🏠 자격증 과정</h2>
<p class="hint" style="margin-top:0">NCS(국가직무능력표준)를 참고해 자체 제작한 강의 자료와 연습문제입니다. 과목을 눌러 학습을 시작하세요.</p>
<div class="cert-grid">${CERTS.map((c) => `
<div class="cert-card" data-cert="${c.id}">
<div class="badge-emoji">${c.badge}</div>
<h3>${esc(c.name)}</h3>
${c.oldName? `<div class="old-name">(구 ${esc(c.oldName)} · 2024년 명칭 변경)</div>`: ''}
<p>${esc(c.desc)}</p>
</div>`).join('')}</div>`;
B_HOME.querySelectorAll('[data-cert]').forEach((el) =>
el.addEventListener('click', () => renderCertDetail(el.dataset.cert)));
}

function renderCertDetail(certId) {
const c = getCert(certId);
if (!c) return;
B_HOME.style.display = 'none';
const lv = B_VIEW;
lv.style.display = 'block';
lv.innerHTML = `
<button class="btn small ghost back-btn" id="backToHome">← 과정 목록</button>
<div class="lesson-head"><h2>${c.badge} ${esc(c.name)}</h2>
${c.oldName? `<div class="meta">구 명칭: ${esc(c.oldName)} (2024년 변경)</div>`: ''}
<div class="meta">${esc(c.desc)}</div></div>
${c.parts.map((p) => `
<div class="part-block">
<div class="part-head"><h3>${p.name === 'written'? '✏️ 필기': '🔧 실기'}</h3>
<div class="meta">${esc(p.examInfo)}</div></div>
${p.subjects.map((sid) => {
const done = isPracticeDone(sid);
return `<div class="subject-row" data-subject="${sid}">
<span>📖 ${esc(lessonTitle(sid))}</span>
<span>${done? '<span class="pill done">연습문제 완료</span>': '<span class="pill wait">학습 전</span>'}</span>
</div>`;
}).join('')}
</div>`).join('')}`;
$('backToHome').addEventListener('click', renderCourseHome);
lv.querySelectorAll('[data-subject]').forEach((el) =>
el.addEventListener('click', () => renderLesson(el.dataset.subject)));
window.scrollTo(0, 0);
}

function renderLesson(sid) {
const l = LESSONS[sid];
if (!l) return;
const cert = certOfSubject(sid);
const lv = B_VIEW;
lv.innerHTML = `
<button class="btn small ghost back-btn" id="backToCert">← ${esc(cert? cert.name: '과정')}</button>
<div class="lesson-head"><h2>📖 ${esc(l.title)}</h2>
<div class="meta">${esc(cert? cert.name: '')} · ${l.part === 'written'? '필기': '실기'}</div>
<div class="meta">${esc(l.examInfo)}</div></div>

<h2>🔗 NCS 연계</h2>
<div class="table-wrap"><table class="ncs-table">
<tr><th>능력단위 코드</th><th>능력단위명</th><th>수준</th><th>세분류</th></tr>
${l.ncs.map((n) => `<tr><td class="code">${esc(n.code)}</td><td>${esc(n.name)}</td><td>${esc(n.level)}</td><td>${esc(n.cls)}</td></tr>`).join('')}
</table></div>
<p class="hint" style="margin-top:6px">NCS 명칭·코드·체계는 국가직무능력표준(고용노동부·한국산업인력공단)을 참고·인용한 것입니다.</p>

<h2>📚 핵심 정리</h2>
${l.summary.map((s) => `<div class="lesson-sec"><h3>${esc(s.h)}</h3>
<ul>${s.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`).join('')}

<h2>📝 연습문제 (10문항 · 자체 제작)</h2>
<div id="practiceArea">
<button class="btn primary" id="practiceStart">▶ 연습문제 풀기</button>
<p class="hint">${(PRACTICE_QUIZZES[sid] || []).some((q) => q.selfcheck)
    ? '객관식은 자동 채점, 서술형은 모범답안을 보고 스스로 체크합니다. 실제 기출문제가 아닌 자체 제작 문제입니다.'
    : '자동 채점되며, 해설이 함께 표시됩니다. 실제 기출문제가 아닌 자체 제작 문제입니다.'}</p>
</div>`;
$('backToCert').addEventListener('click', () => renderCertDetail(l.certId));
$('practiceStart').addEventListener('click', () => startPracticeQuiz(sid));
window.scrollTo(0, 0);
recordLessonView(sid);
}

/* ---------- 연습문제 응시·채점 ---------- */
function startPracticeQuiz(sid) {
const qs = PRACTICE_QUIZZES[sid];
if (!qs ||!qs.length) { alert('연습문제가 없습니다.'); return;}
const hasSelf = qs.some((q) => q.selfcheck);
$('practiceArea').innerHTML = `
<div class="assign-card"><h3>📝 ${esc(lessonTitle(sid))} — 연습문제 ${qs.length}문항${hasSelf? ' (객관식 자동채점 + 서술형 자가체크)': ''}</h3></div>
${qs.map((qq, i) => `<div class="quiz-q"><b>Q${i + 1}. ${esc(qq.q)}</b>
${qq.selfcheck
    ? `<textarea class="selfcheck-input" id="pqtext${i}" rows="3" placeholder="답안을 직접 작성해보세요 (서술형 · 자가체크)"></textarea>
       <details class="model-answer"><summary>📖 모범답안 보기</summary><div class="explain-box">${esc(qq.modelAnswer || '')}</div></details>`
    : qq.choices.map((c, j) => `<label class="choice-row"><input type="radio" name="pq${i}" value="${j}" /> <span>${esc(c)}</span></label>`).join('')}
</div>`).join('')}
<div class="row"><button id="practiceSubmit" class="btn primary">제출하기</button>
<button id="practiceCancel" class="btn ghost">취소</button></div>`;
$('practiceArea').scrollIntoView?.({ behavior: 'smooth', block: 'start'});
$('practiceCancel').addEventListener('click', () => renderLesson(sid));
$('practiceSubmit').addEventListener('click', () => submitPracticeQuiz(sid));
}

async function submitPracticeQuiz(sid) {
const qs = PRACTICE_QUIZZES[sid];
const answers = qs.map((qq, i) => {
if (qq.selfcheck) {
const ta = document.getElementById(`pqtext${i}`);
return ta? ta.value.trim(): '';
}
const sel = document.querySelector(`input[name="pq${i}"]:checked`);
return sel? +sel.value: -1;
});
const objIdx = qs.map((qq, i) => (qq.selfcheck? -1: i)).filter((i) => i >= 0);
if (objIdx.some((i) => answers[i] < 0) &&!confirm('풀지 않은 객관식 문항이 있습니다. 그래도 제출할까요?')) return;
let score = 0;
objIdx.forEach((i) => { if (answers[i] === qs[i].answer) score++;});
await savePracticeResult(sid, score, objIdx.length, answers);
const totalLabel = objIdx.length < qs.length? `${score}/${objIdx.length}점 (서술형 ${qs.length - objIdx.length}문항은 자가체크)` : `${score}/${qs.length}점`;
$('practiceArea').innerHTML = `
<div class="assign-card quiz-result-card"><h3>🎉 채점 완료</h3>
<p class="score">${totalLabel} (${objIdx.length? Math.round((score / objIdx.length) * 100): 0}점)</p>
${score === objIdx.length && objIdx.length? '<p>💯 만점입니다! 훌륭해요.</p>': '<p class="hint">아래 해설을 확인하고 다시 도전해보세요. 서술형은 모범답안과 비교해 스스로 체크하세요.</p>'}
<div class="row" style="justify-content:center"><button id="practiceRetry" class="btn small">🔄 다시 풀기</button></div>
</div>
${qs.map((qq, i) => {
if (qq.selfcheck) {
return `<div class="quiz-q"><b>Q${i + 1}. ${esc(qq.q)}</b>
<div class="explain-box"><b>✍️ 서술형 자가체크</b><br />
내 답안: ${esc(answers[i] || '(미작성)')}<br />
📖 모범답안: ${esc(qq.modelAnswer || '')}
<br />💡 ${esc(qq.explain)}</div></div>`;
}
const ok = answers[i] === qq.answer;
return `<div class="quiz-q"><b>Q${i + 1}. ${esc(qq.q)}</b>
<div class="explain-box"><b class="${ok? 'correct': 'wrong'}">${ok? '⭕ 정답': '❌ 오답'}</b>
내 답: ${answers[i] < 0? '미선택': esc(qq.choices[answers[i]])} · 정답: ${esc(qq.choices[qq.answer])}
<br />💡 ${esc(qq.explain)}</div></div>`;
}).join('')}`;
$('practiceRetry').addEventListener('click', () => startPracticeQuiz(sid));
$('practiceArea').scrollIntoView?.({ behavior: 'smooth', block: 'start'});
refreshMyStats();
}

/* 연습문제 결과 저장: localStorage(항상) + Firestore(반 배정된 로그인 사용자)
* 재응시를 허용하기 위해 문서 ID에 타임스탬프를 포함 (학생은 create만 가능) */
async function savePracticeResult(sid, score, total, answers) {
const lsKey = 'sfcl_pq_' + (user? user.uid: 'guest');
let map = {};
try { map = JSON.parse(localStorage.getItem(lsKey)) || {};} catch (e) { map = {};}
const prev = map[sid];
if (!prev || score > prev.score) map[sid] = { score, total, at: Date.now()};
localStorage.setItem(lsKey, JSON.stringify(map));

if (user && user.classId) {
const doc = {
classId: user.classId, quizId: sid, title: lessonTitle(sid) + ' 연습문제',
isPractice: true, uid: user.uid, name: user.name,
score, total, answers, submittedAt: Date.now(),
};
const docId = sid + '_' + user.uid + '_' + Date.now();
try {
if (DEMO) { const d = demoDb(); d.quizResults.push({ id: docId,...doc}); demoSave(d);}
else await db.collection('classes').doc(user.classId).collection('quizResults').doc(docId)
.set({...doc, submittedAt: firebase.firestore.FieldValue.serverTimestamp()});
} catch (e) { console.warn('practice result save failed', e);}
}
}

function getLocalPractice() {
const lsKey = 'sfcl_pq_' + (user? user.uid: 'guest');
try { return JSON.parse(localStorage.getItem(lsKey)) || {};} catch (e) { return {};}
}

function isPracticeDone(sid) {
if (getLocalPractice()[sid]) return true;
return false; // Firestore 결과는 내 학습 탭에서 집계
}

/* ---------- 강의자료 열람 기록 (진도율 추적) ---------- */
async function recordLessonView(sid) {
if (!user) return;
try {
if (DEMO) {
const d = demoDb();
d.views[user.uid] = d.views[user.uid] || {};
if (!d.views[user.uid][sid]) {
d.views[user.uid][sid] = { viewedAt: Date.now(), classId: user.classId || null};
demoSave(d);
}
} else {
await db.collection('progress').doc(user.uid).collection('views').doc(sid)
.set({ viewedAt: firebase.firestore.FieldValue.serverTimestamp(), classId: user.classId || null}, { merge: true});
}
} catch (e) { console.warn('view record failed', e);}
}

/* ================= 학생 ================= */
async function initStudent() {
browseCtx('courseHome', 'lessonView');
renderCourseHome();
// 과제 목록 미리 로드 (탭 전환 시 바로 표시)
await loadStudentAssignments();
initStudentLms();
}

/* ================= LMS: 출석·진도·퀴즈 ================= */
const todayStr = () => {
const d = new Date();
return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const pct = (a, b) => (b > 0? Math.round((a / b) * 100): 100);
function fmtDateTime(t) {
if (!t) return '';
const d = t.toDate? t.toDate(): new Date(t);
const p = (n) => String(n).padStart(2, '0');
return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 공용 조회 ---------- */
async function getSessions(classId) {
if (!classId) return [];
if (DEMO) return demoDb().sessions.filter((s) => s.classId === classId).sort((a, b) => (a.date < b.date? -1: 1));
const s = await db.collection('classes').doc(classId).collection('sessions').orderBy('date').get();
return s.docs.map((d) => ({ id: d.id,...d.data()}));
}
async function getAttendance(classId) {
if (!classId) return [];
if (DEMO) return demoDb().attendance.filter((a) => a.classId === classId);
const s = await db.collection('classes').doc(classId).collection('attendance').get();
return s.docs.map((d) => ({ id: d.id,...d.data()}));
}
async function getQuizzes(classId, includeUnpublished) {
if (!classId) return [];
if (DEMO) {
const q = demoDb().quizzes.filter((x) => x.classId === classId);
return (includeUnpublished? q: q.filter((x) => x.published)).sort((a, b) => (a.createdAt > b.createdAt? -1: 1));
}
let q = db.collection('classes').doc(classId).collection('quizzes');
if (!includeUnpublished) q = q.where('published', '==', true);
const s = await q.get();
return s.docs.map((d) => ({ id: d.id,...d.data()}));
}
// uid가 주어지면 해당 학생 것만, isPracticeOnly면 연습문제 결과만
async function getQuizResults(classId, uid, practiceOnly) {
let r;
if (DEMO) {
r = demoDb().quizResults.filter((x) =>!classId || x.classId === classId);
} else if (classId) {
let q = db.collection('classes').doc(classId).collection('quizResults');
if (uid) q = q.where('uid', '==', uid);
const s = await q.get();
r = s.docs.map((d) => d.data());
} else {
r = [];
}
if (uid) r = r.filter((x) => x.uid === uid);
if (practiceOnly === true) r = r.filter((x) => x.isPractice);
if (practiceOnly === false) r = r.filter((x) =>!x.isPractice);
return r;
}
async function getViews(uid) {
if (DEMO) return demoDb().views[uid] || {};
const s = await db.collection('progress').doc(uid).collection('views').get();
const views = {};
s.forEach((d) => { views[d.id] = d.data();});
return views;
}
async function getClassStudents() {
if (DEMO) return demoDb().users.filter((u) => u.role === 'student');
if (tStudents.length) return tStudents;
const s = await db.collection('users').where('role', '==', 'student').get();
return s.docs.map((d) => ({ uid: d.id,...d.data()}));
}

/* ---------- 학생별 통계 ---------- */
async function computeStudentStats(classId, uid) {
const views = await getViews(uid);
const viewedIds = LESSON_IDS.filter((sid) => views[sid]);
// 연습문제 완료: Firestore 결과 + localStorage 최고기록
const fres = classId? await getQuizResults(classId, uid, true): [];
const local = getLocalPracticeFor(uid);
const doneSet = new Set();
const best = {};
fres.forEach((r) => {
doneSet.add(r.quizId);
if (!best[r.quizId] || r.score > best[r.quizId].score) best[r.quizId] = r;
});
Object.keys(local).forEach((sid) => {
doneSet.add(sid);
if (!best[sid] || local[sid].score > best[sid].score) best[sid] = { quizId: sid, score: local[sid].score, total: local[sid].total};
});
const practiceDone = LESSON_IDS.filter((sid) => doneSet.has(sid));
const practiceAvg = practiceDone.length
? Math.round(practiceDone.reduce((s, sid) => s + (best[sid].score / best[sid].total) * 100, 0) / practiceDone.length)
: null;
const progressRate = pct(viewedIds.length + practiceDone.length, LESSON_IDS.length * 2);
// 출석
const sessions = (await getSessions(classId)).filter((s) => s.date <= todayStr());
const att = classId? (DEMO? demoDb().attendance.filter((a) => a.classId === classId && a.uid === uid)
: (await db.collection('classes').doc(classId).collection('attendance').where('uid', '==', uid).get()).docs.map((d) => d.data())): [];
const attBySession = {};
att.forEach((x) => { attBySession[x.sessionId] = x.status;});
let attScore = 0, present = 0, late = 0, absent = 0;
sessions.forEach((s) => {
const st = attBySession[s.id];
if (st === 'present') { attScore += 1; present++;}
else if (st === 'late') { attScore += 0.5; late++;}
else absent++;
});
const attendRate = pct(attScore, sessions.length);
// 강사 출제 퀴즈
const tQuizzes = await getQuizzes(classId, false);
const tResults = classId? await getQuizResults(classId, uid, false): [];
const tTaken = tQuizzes.filter((q) => tResults.some((r) => r.quizId === q.id));
const tAvg = tTaken.length
? Math.round(tTaken.reduce((s, q) => { const r = tResults.find((x) => x.quizId === q.id); return s + (r.score / r.total) * 100;}, 0) / tTaken.length)
: null;
return {
progressRate, attendRate, viewedIds, practiceDone, practiceAvg, best,
totalLessons: LESSON_IDS.length,
present, late, absent, totalSessions: sessions.length,
tQuizAvg: tAvg, tQuizTaken: tTaken.length, tQuizTotal: tQuizzes.length,
};
}

// 특정 uid의 localStorage 연습문제 기록 (교사용 집계용)
function getLocalPracticeFor(uid) {
try { return JSON.parse(localStorage.getItem('sfcl_pq_' + uid)) || {};}
catch (e) { return {};}
}

/* ---------- 강사: 출석 ---------- */
function initTeacherLms() {
$('sessDate').value = todayStr();
quizQuestions = []; renderQuizQList();
$('aiKeyT').value = aiKey();
loadAiKnowledge();
loadSessions(); loadProgTable(); loadQuizListT();
}
$('attClass').addEventListener('change', loadSessions);
$('progClass').addEventListener('change', loadProgTable);
$('progRefresh').addEventListener('click', loadProgTable);
$('quizClass').addEventListener('change', loadQuizListT);

$('sessionCreate').addEventListener('click', async () => {
const classId = $('attClass').value || tClasses[0]?.id;
const title = $('sessTitle').value.trim(), date = $('sessDate').value;
if (!classId) { alert('반을 먼저 만드세요.'); return;}
if (!title ||!date) { alert('회차 제목과 날짜를 입력하세요.'); return;}
const doc = { classId, title, date, createdBy: user.uid};
if (DEMO) { const d = demoDb(); doc.id = nid('ss'); doc.createdAt = Date.now(); d.sessions.push(doc); demoSave(d);}
else await db.collection('classes').doc(classId).collection('sessions').add({...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
$('sessTitle').value = '';
loadSessions();
});

async function loadSessions() {
const classId = $('attClass').value || tClasses[0]?.id;
if (!classId) { $('sessionList').innerHTML = '<p class="hint">반을 먼저 만드세요</p>'; return;}
$('sessionList').innerHTML = '<p class="hint">불러오는 중…</p>';
const [sessions, att, students] = await Promise.all([getSessions(classId), getAttendance(classId), getClassStudents()]);
const clsStudents = students.filter((s) => s.classId === classId);
const attMap = {};
att.forEach((a) => { attMap[a.sessionId + '_' + a.uid] = a;});
$('sessionList').innerHTML = sessions.map((ss) => {
const rows = clsStudents.map((st) => {
const rec = attMap[ss.id + '_' + st.uid];
const cur = rec? rec.status: '';
const mark = rec
? `<span class="meta">${rec.by === 'self'? '셀프': '강사'} · ${esc(fmtDateTime(rec.checkedAt))}</span>`
: '<span class="meta">미체크</span>';
return `<tr><td style="text-align:left">${esc(st.name)}</td><td>${mark}</td>
<td><div class="att-btns">
<button class="btn small ${cur === 'present'? 'primary': ''}" data-att="${ss.id}|${st.uid}|present">출석</button>
<button class="btn small ${cur === 'late'? 'primary': ''}" data-att="${ss.id}|${st.uid}|late">지각</button>
<button class="btn small ${cur === 'absent'? 'primary': ''}" data-att="${ss.id}|${st.uid}|absent">결석</button>
</div></td></tr>`;
}).join('') || '<tr><td colspan="3"><span class="meta">이 반에 학생이 없습니다</span></td></tr>';
return `<div class="assign-card"><h3>🗓️ ${esc(ss.title)} <span class="meta">${esc(ss.date)}</span>
<button class="btn small ghost" data-delsess="${ss.id}" style="margin-left:8px">삭제</button></h3>
<div class="table-wrap"><table class="lms-table"><tr><th>학생</th><th>체크 정보</th><th>출석 처리</th></tr>${rows}</table></div></div>`;
}).join('') || '<p class="hint">만든 회차가 없습니다</p>';
$('sessionList').querySelectorAll('[data-att]').forEach((b) => b.addEventListener('click', () => {
const [sid, uid, status] = b.dataset.att.split('|');
const st = clsStudents.find((x) => x.uid === uid);
markAttendance(classId, sid, uid, st? st.name: '', status);
}));
$('sessionList').querySelectorAll('[data-delsess]').forEach((b) => b.addEventListener('click', () => delSession(classId, b.dataset.delsess)));
}

async function markAttendance(classId, sessionId, uid, name, status) {
if (DEMO) {
const d = demoDb();
const i = d.attendance.findIndex((a) => a.sessionId === sessionId && a.uid === uid);
if (i >= 0) d.attendance[i] = {...d.attendance[i], status, checkedAt: Date.now(), by: 'teacher'};
else d.attendance.push({ id: sessionId + '_' + uid, classId, sessionId, uid, name, status, checkedAt: Date.now(), by: 'teacher'});
demoSave(d);
} else {
await db.collection('classes').doc(classId).collection('attendance').doc(sessionId + '_' + uid)
.set({ classId, sessionId, uid, name, status, by: 'teacher', checkedAt: firebase.firestore.FieldValue.serverTimestamp()}, { merge: true});
}
loadSessions();
}

async function delSession(classId, sessionId) {
if (!confirm('이 회차와 출석 기록을 삭제할까요?')) return;
if (DEMO) {
const d = demoDb();
d.sessions = d.sessions.filter((s) => s.id!== sessionId);
d.attendance = d.attendance.filter((a) => a.sessionId!== sessionId);
demoSave(d);
} else {
const batch = db.batch();
batch.delete(db.collection('classes').doc(classId).collection('sessions').doc(sessionId));
const at = await db.collection('classes').doc(classId).collection('attendance').where('sessionId', '==', sessionId).get();
at.forEach((x) => batch.delete(x.ref));
await batch.commit();
}
loadSessions();
}

/* ---------- 강사: 반 학습 현황 ---------- */
async function loadProgTable() {
const classId = $('progClass').value || tClasses[0]?.id;
if (!classId) { $('progTable').innerHTML = '<p class="hint">반을 먼저 만드세요</p>'; return;}
$('progTable').innerHTML = '<p class="hint">계산 중…</p>';
const students = (await getClassStudents()).filter((s) => s.classId === classId);
const rows = [];
for (const st of students) {
rows.push({ st, stats: await computeStudentStats(classId, st.uid)});
}
rows.sort((a, b) => b.stats.progressRate - a.stats.progressRate);
$('progTable').innerHTML = `<div class="table-wrap"><table class="lms-table">
<tr><th>학생</th><th>진도율</th><th>출석률</th><th>연습문제</th><th>강사 퀴즈 평균</th></tr>
${rows.map(({ st, stats}) => `<tr><td style="text-align:left">${esc(st.name)}</td>
<td><div class="bar mini"><i style="width:${stats.progressRate}%"></i></div>${stats.progressRate}%</td>
<td>${stats.attendRate}% <span class="meta">(${stats.present}출 ${stats.late}지 ${stats.absent}결)</span></td>
<td>${stats.practiceDone.length}/${stats.totalLessons}${stats.practiceAvg!== null? ` <span class="meta">평균 ${stats.practiceAvg}점</span>`: ''}</td>
<td>${stats.tQuizAvg === null? '<span class="meta">-</span>': stats.tQuizAvg + '%'}</td></tr>`).join('')
|| '<tr><td colspan="5"><span class="meta">이 반에 학생이 없습니다</span></td></tr>'}</table></div>`;
}

/* ---------- 강사: 퀴즈 출제 ---------- */
let quizQuestions = [];
function renderQuizQList() {
$('quizQList').innerHTML = quizQuestions.map((qq, i) => `
<div class="quiz-q" data-qi="${i}">
<div class="row"><b>문항 ${i + 1}</b><span style="flex:1"></span>
<button class="btn small ghost" data-delq="${i}">삭제</button></div>
<input type="text" data-f="q" placeholder="질문을 입력하세요" value="${esc(qq.q)}" style="width:100%" />
${qq.choices.map((c, j) => `
<div class="choice-row">
<input type="radio" name="qans${i}" data-f="ans" value="${j}" ${qq.answer === j? 'checked': ''} title="정답 표시" />
<input type="text" data-f="c${j}" placeholder="보기 ${j + 1}" value="${esc(c)}" style="flex:1" />
</div>`).join('')}
<p class="hint">○ 라디오 버튼으로 정답을 표시하세요</p>
</div>`).join('') || '<p class="hint">문항 추가 버튼으로 문제를 만드세요</p>';
}
$('quizAddQ').addEventListener('click', () => {
quizQuestions.push({ q: '', choices: ['', '', '', ''], answer: 0});
renderQuizQList();
});
$('quizQList').addEventListener('input', (e) => {
const box = e.target.closest('.quiz-q'); if (!box) return;
const i = +box.dataset.qi, f = e.target.dataset.f;
if (f === 'q') quizQuestions[i].q = e.target.value;
else if (f && f[0] === 'c') quizQuestions[i].choices[+f.slice(1)] = e.target.value;
});
$('quizQList').addEventListener('change', (e) => {
const box = e.target.closest('.quiz-q'); if (!box) return;
if (e.target.dataset.f === 'ans') quizQuestions[+box.dataset.qi].answer = +e.target.value;
});
$('quizQList').addEventListener('click', (e) => {
const b = e.target.closest('[data-delq]'); if (!b) return;
quizQuestions.splice(+b.dataset.delq, 1); renderQuizQList();
});

$('quizCreate').addEventListener('click', async () => {
const classId = $('quizClass').value || tClasses[0]?.id;
const title = $('quizTitle').value.trim();
if (!classId) { alert('반을 먼저 만드세요.'); return;}
if (!title) { alert('퀴즈 제목을 입력하세요.'); return;}
if (!quizQuestions.length) { alert('문항을 1개 이상 추가하세요.'); return;}
for (let i = 0; i < quizQuestions.length; i++) {
const qq = quizQuestions[i];
if (!qq.q.trim() || qq.choices.some((c) =>!c.trim())) { alert(`문항 ${i + 1}의 질문과 보기 4개를 모두 입력하세요.`); return;}
}
const doc = {
classId, title, dueDate: $('quizDue').value || '',
published: $('quizPublished').checked,
questions: quizQuestions.map((qq) => ({ q: qq.q.trim(), choices: qq.choices.map((c) => c.trim()), answer: qq.answer})),
createdBy: user.uid,
};
if (DEMO) { const d = demoDb(); doc.id = nid('q'); doc.createdAt = Date.now(); d.quizzes.push(doc); demoSave(d);}
else await db.collection('classes').doc(classId).collection('quizzes').add({...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
$('quizTitle').value = ''; $('quizDue').value = ''; $('quizPublished').checked = true;
quizQuestions = []; renderQuizQList();
loadQuizListT();
});

async function loadQuizListT() {
const classId = $('quizClass').value || tClasses[0]?.id;
if (!classId) { $('quizListT').innerHTML = '<p class="hint">반을 먼저 만드세요</p>'; return;}
$('quizListT').innerHTML = '<p class="hint">불러오는 중…</p>';
const [quizzes, results, students] = await Promise.all([
getQuizzes(classId, true), getQuizResults(classId, null, false), getClassStudents(),
]);
const clsStudents = students.filter((s) => s.classId === classId);
$('quizListT').innerHTML = '<h2>출제된 퀴즈</h2>' + (quizzes.map((qz) => {
const rs = results.filter((r) => r.quizId === qz.id);
const avg = rs.length? Math.round(rs.reduce((s, r) => s + (r.score / r.total) * 100, 0) / rs.length): null;
const rows = clsStudents.map((st) => {
const r = rs.find((x) => x.uid === st.uid);
return `<div class="sub-row"><span>${esc(st.name)}</span>${r
? `<span>${r.score}/${r.total}점 <span class="pill done">${Math.round((r.score / r.total) * 100)}점</span></span>`
: '<span class="no">미응시</span>'}</div>`;
}).join('');
return `<div class="assign-card"><h3>📝 ${esc(qz.title)}</h3>
<div class="meta">문항 ${qz.questions.length}개 · 마감: ${esc(qz.dueDate || '없음')} · ${qz.published? '공개 중': '비공개'} · 응시 ${rs.length}/${clsStudents.length}명${avg!== null? ` · 평균 ${avg}점`: ''}</div>
<div class="row" style="margin-top:8px">
<button class="btn small" data-pubquiz="${qz.id}" data-pub="${qz.published? 0: 1}">${qz.published? '비공개로 전환': '공개하기'}</button>
<button class="btn small ghost" data-delquiz="${qz.id}">삭제</button>
</div>${rows}</div>`;
}).join('') || '<p class="hint">출제한 퀴즈가 없습니다</p>');
$('quizListT').querySelectorAll('[data-delquiz]').forEach((b) => b.addEventListener('click', () => delQuiz(classId, b.dataset.delquiz)));
$('quizListT').querySelectorAll('[data-pubquiz]').forEach((b) => b.addEventListener('click', () => toggleQuizPub(classId, b.dataset.pubquiz, b.dataset.pub === '1')));
}

async function delQuiz(classId, quizId) {
if (!confirm('퀴즈와 응시 결과를 삭제할까요?')) return;
if (DEMO) {
const d = demoDb();
d.quizzes = d.quizzes.filter((q) => q.id!== quizId);
d.quizResults = d.quizResults.filter((r) => r.quizId!== quizId);
demoSave(d);
} else {
const batch = db.batch();
batch.delete(db.collection('classes').doc(classId).collection('quizzes').doc(quizId));
const rs = await db.collection('classes').doc(classId).collection('quizResults').where('quizId', '==', quizId).get();
rs.forEach((x) => batch.delete(x.ref));
await batch.commit();
}
loadQuizListT();
}
async function toggleQuizPub(classId, quizId, pub) {
if (DEMO) { const d = demoDb(); const q = d.quizzes.find((x) => x.id === quizId); if (q) q.published = pub; demoSave(d);}
else await db.collection('classes').doc(classId).collection('quizzes').doc(quizId).update({ published: pub});
loadQuizListT();
}

/* ---------- 강사: 과제 ---------- */
async function loadAssignments() {
let assigns, subs, students;
if (DEMO) {
const d = demoDb(); assigns = d.assignments; subs = d.submissions;
students = d.users.filter((u) => u.role === 'student');
} else {
const [a, s, u] = await Promise.all([
db.collection('assignments').get(), db.collection('submissions').get(),
db.collection('users').where('role', '==', 'student').get(),
]);
assigns = a.docs.map((x) => ({ id: x.id,...x.data()}));
subs = s.docs.map((x) => ({ id: x.id,...x.data()}));
students = u.docs.map((x) => ({ uid: x.id,...x.data()}));
}
const cls = $('asClass').value || tClasses[0]?.id;
const clsStudents = students.filter((x) => x.classId === cls);
tSubsMap = {}; subs.forEach((s) => { tSubsMap[s.id] = s;});
tAssignsMap = {}; assigns.forEach((a) => { tAssignsMap[a.id] = a;});
$('assignList').innerHTML = assigns.filter((a) => a.classId === cls).map((a) => {
const aSubs = subs.filter((x) => x.assignmentId === a.id);
return `<div class="assign-card"><h3>📝 ${esc(a.title)}</h3>
<div class="meta">${esc(a.desc || '')} · 마감: ${esc(a.due || '없음')} · Git 제출 ${a.allowGit? '허용': '불가'}</div>
${clsStudents.map((st) => {
const sub = aSubs.find((x) => x.studentId === st.uid);
return `<div class="sub-row"><span>${esc(st.name)}</span>
${sub? `<span>${sub.type === 'git'? `🔗 <a href="${esc(sub.url)}" target="_blank" rel="noopener">${esc(sub.url)}</a>`: `📎 <a href="${esc(sub.url)}" target="_blank" rel="noopener">${esc(sub.name || sub.url)}</a>`}
<span class="pill done">제출됨</span>
<button class="btn small" data-aifb="${sub.id}" title="AI가 피드백 초안을 만듭니다">🤖 AI 피드백${sub.aiFeedback? ' ✓': ''}</button></span>`
: `<span class="no">미제출 <span class="pill wait">대기</span></span>`}</div>`;
}).join('') || '<p class="hint">이 반에 학생이 없습니다</p>'}</div>`;
}).join('') || '<p class="hint">만든 과제가 없습니다</p>';
$('assignList').querySelectorAll('[data-aifb]').forEach((b) => b.addEventListener('click', () => openAiFeedback(b.dataset.aifb)));
}
$('asClass').addEventListener('change', loadAssignments);
$('asCreate').addEventListener('click', async () => {
const classId = $('asClass').value, title = $('asTitle').value.trim();
if (!classId ||!title) { alert('반과 과제 제목을 입력하세요.'); return;}
const doc = { classId, title, desc: $('asDesc').value.trim(), due: $('asDue').value, allowGit: $('asGit').checked};
if (DEMO) { const d = demoDb(); doc.id = nid('a'); d.assignments.push(doc); demoSave(d);}
else await db.collection('assignments').add({...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
$('asTitle').value = ''; $('asDesc').value = ''; $('asDue').value = '';
loadAssignments();
});

/* ---------- 학생: 내 학습 ---------- */
async function initStudentLms() {
$('aiKeyS').value = aiKey();
await refreshMyStats();
loadCheckin();
loadQuizHistory();
}

async function refreshMyStats() {
if (!user) return;
const stats = await computeStudentStats(user.classId, user.uid);
renderMyStats(stats);
renderChecklist(stats);
}

function renderMyStats(stats) {
$('myStats').innerHTML = `
<div class="stat-card"><div class="stat-num">${stats.progressRate}%</div><div class="stat-label">진도율</div>
<div class="bar"><i style="width:${stats.progressRate}%"></i></div>
<div class="meta">과목 열람 ${stats.viewedIds.length}/${stats.totalLessons} · 연습문제 ${stats.practiceDone.length}/${stats.totalLessons}</div></div>
<div class="stat-card"><div class="stat-num">${stats.attendRate}%</div><div class="stat-label">출석률</div>
<div class="bar"><i style="width:${stats.attendRate}%"></i></div>
<div class="meta">출석 ${stats.present} · 지각 ${stats.late} · 결석 ${stats.absent} (회차 ${stats.totalSessions})</div></div>
<div class="stat-card"><div class="stat-num">${stats.practiceAvg === null? '-': stats.practiceAvg + '%'}</div><div class="stat-label">연습문제 평균</div>
<div class="meta">${stats.practiceDone.length}/${stats.totalLessons} 과목 완료 (최고기록 기준)</div></div>`;
}

function renderChecklist(stats) {
let html = '<h2 style="margin-top:20px">🗂️ 과목별 체크리스트</h2>';
html += CERTS.map((c) => `<div class="week-group"><div class="week-title">${c.badge} ${esc(c.name)}</div>` +
c.parts.flatMap((p) => p.subjects).map((sid) => {
const v = stats.viewedIds.includes(sid);
const p = stats.practiceDone.includes(sid);
const best = stats.best[sid];
return `<div class="mat-item"><span>${v? '✅': '⬜'} ${p? '📝': '▫️'} ${esc(lessonTitle(sid))}</span>
<span>${best? `<span class="pill done">최고 ${best.score}/${best.total}</span>`: '<span class="meta">미응시</span>'}</span></div>`;
}).join('') + '</div>').join('');
$('myChecklist').innerHTML = html;
}

async function getMyAttendance(classId) {
if (!classId) return [];
if (DEMO) return demoDb().attendance.filter((a) => a.classId === classId && a.uid === user.uid);
const s = await db.collection('classes').doc(classId).collection('attendance').where('uid', '==', user.uid).get();
return s.docs.map((d) => d.data());
}

async function loadCheckin() {
if (!user.classId) { $('checkinList').innerHTML = '<p class="hint">반 배정 후 출석할 수 있습니다</p>'; return;}
const sessions = (await getSessions(user.classId)).filter((s) => s.date === todayStr());
const mine = await getMyAttendance(user.classId);
const map = {}; mine.forEach((a) => { map[a.sessionId] = a;});
$('checkinList').innerHTML = sessions.map((ss) => {
const rec = map[ss.id];
const label = rec? (rec.status === 'present'? '출석': rec.status === 'late'? '지각': '결석'): '';
return `<div class="mat-item"><span>🗓️ ${esc(ss.title)} <span class="meta">${esc(ss.date)}</span></span>
${rec? `<span class="pill done">${label} 완료</span>`
: `<button class="btn small primary" data-checkin="${ss.id}">출석하기</button>`}</div>`;
}).join('') || '<p class="hint">오늘 출석할 회차가 없습니다</p>';
$('checkinList').querySelectorAll('[data-checkin]').forEach((b) => b.addEventListener('click', () => selfCheckin(b.dataset.checkin)));
}

async function selfCheckin(sessionId) {
const classId = user.classId;
const mine = await getMyAttendance(classId);
if (mine.some((a) => a.sessionId === sessionId)) { alert('이미 출석했습니다.'); loadCheckin(); return;}
const doc = { classId, sessionId, uid: user.uid, name: user.name, status: 'present', by: 'self'};
if (DEMO) {
const d = demoDb();
d.attendance.push({ id: sessionId + '_' + user.uid,...doc, checkedAt: Date.now()});
demoSave(d);
} else {
await db.collection('classes').doc(classId).collection('attendance').doc(sessionId + '_' + user.uid)
.set({...doc, checkedAt: firebase.firestore.FieldValue.serverTimestamp()});
}
alert('출석 체크 완료!');
loadCheckin();
refreshMyStats();
}

/* ---------- 학생: 내 퀴즈 기록 (연습문제 + 강사 출제) ---------- */
async function loadQuizHistory() {
const classId = user.classId;
const [pRes, tQuizzes, tRes] = await Promise.all([
getQuizResults(classId, user.uid, true),
getQuizzes(classId, false),
getQuizResults(classId, user.uid, false),
]);
const local = getLocalPractice();
const best = {};
pRes.forEach((r) => { if (!best[r.quizId] || r.score > best[r.quizId].score) best[r.quizId] = { score: r.score, total: r.total, at: r.submittedAt};});
Object.keys(local).forEach((sid) => {
if (!best[sid] || local[sid].score > best[sid].score) best[sid] = { score: local[sid].score, total: local[sid].total, at: local[sid].at};
});
const pDone = Object.keys(best);
const tRows = tQuizzes.map((qz) => {
const r = tRes.find((x) => x.quizId === qz.id);
return `<div class="mat-item"><span>📝 ${esc(qz.title)}</span>
${r? `<span class="pill done">${r.score}/${r.total}점</span>`: '<span class="meta">미응시</span>'}</div>`;
}).join('');
$('quizHistory').innerHTML =
`<h3 style="font-size:14px;margin:0 0 8px">📝 연습문제 최고기록 (${pDone.length}/${LESSON_IDS.length})</h3>` +
(pDone.map((sid) => `<div class="mat-item"><span>${esc(lessonTitle(sid))}</span>
<span class="pill done">${best[sid].score}/${best[sid].total}점</span></div>`).join('')
|| '<p class="hint">아직 푼 연습문제가 없습니다</p>') +
`<h3 style="font-size:14px;margin:16px 0 8px">🧑‍🏫 강사 출제 퀴즈</h3>` +
(tRows || '<p class="hint">공개된 퀴즈가 없습니다</p>') +
`<div id="quizTake"></div>`;
// 강사 퀴즈 응시 버튼 바인딩
const tList = tQuizzes.filter((qz) =>!tRes.some((x) => x.quizId === qz.id));
if (tList.length) {
const btnRow = document.createElement('div');
btnRow.className = 'row';
btnRow.innerHTML = tList.map((qz) => `<button class="btn small primary" data-takequiz="${qz.id}">▶ ${esc(qz.title)} 응시</button>`).join('');
$('quizHistory').appendChild(btnRow);
btnRow.querySelectorAll('[data-takequiz]').forEach((b) => b.addEventListener('click', () => {
const qz = tQuizzes.find((x) => x.id === b.dataset.takequiz);
if (qz) takeQuiz(qz);
}));
}
}

function takeQuiz(qz) {
$('quizTake').innerHTML = `<div class="assign-card"><h3>📝 ${esc(qz.title)} — 응시 중</h3>
${qz.questions.map((qq, i) => `<div class="quiz-q"><b>Q${i + 1}. ${esc(qq.q)}</b>
${qq.choices.map((c, j) => `<label class="choice-row"><input type="radio" name="tq${i}" value="${j}" /> <span>${esc(c)}</span></label>`).join('')}
</div>`).join('')}
<div class="row"><button id="quizSubmitBtn" class="btn primary">제출하기</button>
<button id="quizCancelBtn" class="btn ghost">취소</button></div></div>`;
$('quizTake').scrollIntoView?.({ behavior: 'smooth', block: 'start'});
$('quizCancelBtn').addEventListener('click', () => { $('quizTake').innerHTML = '';});
$('quizSubmitBtn').addEventListener('click', () => submitQuiz(qz));
}

async function submitQuiz(qz) {
const answers = qz.questions.map((_, i) => {
const sel = document.querySelector(`input[name="tq${i}"]:checked`);
return sel? +sel.value: -1;
});
if (answers.some((a) => a < 0) &&!confirm('풀지 않은 문항이 있습니다. 그래도 제출할까요?')) return;
let score = 0;
qz.questions.forEach((qq, i) => { if (answers[i] === qq.answer) score++;});
const doc = { classId: user.classId, quizId: qz.id, uid: user.uid, name: user.name, score, total: qz.questions.length, answers};
try {
if (DEMO) {
const d = demoDb();
if (d.quizResults.some((r) => r.quizId === qz.id && r.uid === user.uid)) { alert('이미 응시한 퀴즈입니다.'); return;}
d.quizResults.push({ id: qz.id + '_' + user.uid,...doc, submittedAt: Date.now()});
demoSave(d);
} else {
await db.collection('classes').doc(user.classId).collection('quizResults').doc(qz.id + '_' + user.uid)
.set({...doc, submittedAt: firebase.firestore.FieldValue.serverTimestamp()});
}
} catch (e) {
alert(e && e.code === 'permission-denied'? '이미 응시한 퀴즈입니다.': '제출 실패: ' + e.message);
return;
}
$('quizTake').innerHTML = `<div class="assign-card" style="text-align:center"><h3>🎉 채점 완료</h3>
<p style="font-size:28px;font-weight:800;margin:8px 0">${score}/${qz.questions.length}점 (${Math.round((score / qz.questions.length) * 100)}점)</p></div>`;
loadQuizHistory();
refreshMyStats();
}

/* ---------- 학생: 과제 제출 ---------- */
let sAssignsCache = [];
async function loadStudentAssignments() {
let assigns, subs;
if (DEMO) { const d = demoDb(); assigns = d.assignments; subs = d.submissions;}
else {
const [a, s] = await Promise.all([
user.classId? db.collection('assignments').where('classId', '==', user.classId).get(): { docs: []},
db.collection('submissions').where('studentId', '==', user.uid).get(),
]);
assigns = a.docs.map((x) => ({ id: x.id,...x.data()}));
subs = s.docs.map((x) => ({ id: x.id,...x.data()}));
}
sAssignsCache = assigns;
$('sAssignList').innerHTML = assigns.map((a) => {
const sub = subs.find((x) => x.assignmentId === a.id);
return `<div class="assign-card"><h3>📝 ${esc(a.title)}</h3>
<div class="meta">${esc(a.desc || '')} · 마감: ${esc(a.due || '없음')}</div>
${sub? `<div><span class="pill done">제출 완료</span>
${sub.type === 'git'? ` <a href="${esc(sub.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(sub.url)}</a>`: ` <a href="${esc(sub.url)}" target="_blank" rel="noopener" style="color:#58a6ff">${esc(sub.name || sub.url)}</a>`}</div>
${sub.aiFeedback? `<div class="ai-fb"><b>🤖 AI 피드백</b><p>${esc(sub.aiFeedback)}</p></div>`: ''}`
: `<div class="row">
<input type="url" id="link_${a.id}" placeholder="파일/드라이브 공유 링크" style="flex:1" />
${a.allowGit? `<input type="url" id="git_${a.id}" placeholder="Git 저장소 URL (선택)" style="flex:1" />`: ''}
<button class="btn small primary" data-submit="${a.id}">제출하기</button>
</div>`}</div>`;
}).join('') || '<p class="hint">등록된 과제가 없습니다</p>';
$('sAssignList').querySelectorAll('[data-submit]').forEach((b) => b.addEventListener('click', () => submitAssignment(b.dataset.submit)));
}

async function submitAssignment(assignId) {
const linkUrl = $(`link_${assignId}`)?.value.trim();
const gitUrl = $(`git_${assignId}`)?.value.trim();
if (!linkUrl &&!gitUrl) { alert('파일/드라이브 링크 또는 Git URL을 입력하세요.'); return;}
try {
const doc = gitUrl
? { assignmentId: assignId, studentId: user.uid, studentName: user.name, type: 'git', url: gitUrl, createdAt: Date.now()}
: { assignmentId: assignId, studentId: user.uid, studentName: user.name, type: 'link', url: linkUrl, createdAt: Date.now()};
if (DEMO) { const d = demoDb(); doc.id = nid('s'); d.submissions.push(doc); demoSave(d);}
else await db.collection('submissions').add({...doc, createdAt: firebase.firestore.FieldValue.serverTimestamp()});
alert('제출 완료!');
loadStudentAssignments();
} catch (e) { alert('제출 실패: ' + e.message);}
}

/* ================= AI (Gemini BYOK) ================= */
const AI_KEY = 'msc_gemini_key'; // metasongi-class와 동일한 키 저장소 (브라우저별)
function aiKey() { return (localStorage.getItem(AI_KEY) || '').trim();}
function requireAiKey() {
const k = aiKey();
if (!k) { alert('Gemini API 키를 먼저 입력하세요.\nGoogle AI Studio(aistudio.google.com)에서 무료로 발급받을 수 있습니다.'); return null;}
return k;
}
async function callGemini(apiKey, prompt, jsonMode) {
const body = { contents: [{ parts: [{ text: prompt}]}], generationConfig: { temperature: 0.7}};
if (jsonMode) body.generationConfig.responseMimeType = 'application/json';
let res;
try {
res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(apiKey), {
method: 'POST', headers: { 'Content-Type': 'application/json'}, body: JSON.stringify(body),
});
} catch (e) { throw new Error('NETWORK:' + (e && e.message));}
if (!res.ok) {
let msg = 'HTTP ' + res.status;
try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message;} catch (e2) { /* 무시 */}
throw new Error(msg);
}
const data = await res.json();
const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts || [])
.map((p) => p.text || '').join('').trim();
if (!text) throw new Error('EMPTY_RESPONSE');
return text;
}
function geminiErrorKo(e) {
const m = String((e && e.message) || e || '');
if (/NETWORK/.test(m)) return '네트워크 오류입니다. 인터넷 연결을 확인하세요.';
if (/API key not valid|API_KEY_INVALID/i.test(m)) return 'API 키가 유효하지 않습니다. 키를 다시 확인하세요.';
if (/quota|429|RESOURCE_EXHAUSTED/i.test(m)) return 'API 할당량을 초과했습니다. 잠시 후 다시 시도하세요.';
if (/EMPTY_RESPONSE/.test(m)) return 'AI가 빈 응답을 보냈습니다. 다시 시도해 주세요.';
return 'AI 호출 실패: ' + m;
}
function parseGeminiJson(text) {
let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
try { const v = JSON.parse(t); return v;} catch (e) { /* 다음 시도 */}
const m = t.match(/\[[\s\S]*\]/);
if (m) { try { return JSON.parse(m[0]);} catch (e2) { /* 실패 */}}
return null;
}
function normalizeQuizQ(q) {
if (!q || typeof q.q!== 'string' ||!Array.isArray(q.choices)) return null;
const qq = q.q.trim();
if (!qq) return null;
const choices = q.choices.map((c) => String(c?? '').trim()).slice(0, 4);
while (choices.length < 4) choices.push('');
let answer = parseInt(q.answer, 10);
if (isNaN(answer) || answer < 0 || answer > 3) answer = 0;
return { q: qq, choices, answer};
}

/* ---------- 강사: API 키 + 수업 지식 ---------- */
$('aiKeySaveT').addEventListener('click', () => {
localStorage.setItem(AI_KEY, $('aiKeyT').value.trim());
alert('API 키를 저장했습니다. (이 브라우저에만 저장됨)');
});
$('aiKeySaveS').addEventListener('click', () => {
localStorage.setItem(AI_KEY, $('aiKeyS').value.trim());
alert('API 키를 저장했습니다. (이 브라우저에만 저장됨)');
});
async function loadAiKnowledge() {
let text = '';
if (DEMO) text = demoDb().aiKnowledge || '';
else {
try {
const s = await db.collection('config').doc('ai_knowledge').get();
if (s.exists) text = s.data().text || '';
} catch (e) { console.warn('ai knowledge load failed', e);}
}
if ($('aiKnowledge')) $('aiKnowledge').value = text;
}
$('aiKnowledgeSave').addEventListener('click', async () => {
const text = $('aiKnowledge').value.trim();
try {
if (DEMO) { const d = demoDb(); d.aiKnowledge = text; demoSave(d);}
else await db.collection('config').doc('ai_knowledge').set({ text, updatedAt: firebase.firestore.FieldValue.serverTimestamp()}, { merge: true});
alert('수업 지식을 저장했습니다.');
} catch (e) { alert('저장 실패: ' + e.message);}
});
async function getAiKnowledge() {
if (DEMO) return demoDb().aiKnowledge || '';
try {
const s = await db.collection('config').doc('ai_knowledge').get();
return s.exists? (s.data().text || ''): '';
} catch (e) { console.warn('ai knowledge read failed', e); return '';}
}

/* 과정 강의자료에서 AI 지식 베이스 자동 생성 */
function buildCourseKnowledge() {
return CERTS.map((c) => {
const parts = c.parts.map((p) => {
const subs = p.subjects.map((sid) => {
const l = LESSONS[sid];
if (!l) return '';
const pts = l.summary.map((s) => `[${s.h}] ${s.points.join(' / ')}`).join('\n');
return `■ 과목: ${l.title}\n${pts}`;
}).join('\n');
return `(${p.name}) ${p.examInfo}\n${subs}`;
}).join('\n');
return `\n${parts}`;
}).join('\n\n');
}

/* ---------- 강사: AI 퀴즈 생성기 ---------- */
$('aiQuizGen').addEventListener('click', async () => {
const key = requireAiKey(); if (!key) return;
const src = $('aiQuizSrc').value.trim();
const n = Math.min(20, Math.max(1, parseInt($('aiQuizCount').value, 10) || 5));
const level = $('aiQuizLevel').value;
if (!src) { alert('주제나 수업 내용을 입력하세요.'); return;}
const btn = $('aiQuizGen');
btn.disabled = true; btn.textContent = '생성 중…';
$('aiQuizPreview').innerHTML = '<p class="hint">AI가 문제를 만들고 있습니다…</p>';
try {
const prompt = '다음 수업 내용을 바탕으로 객관식 문제 ' + n + '개를 만들어줘. 난이도: ' + level + '.\n'
+ '반드시 아래 JSON 배열 형식으로만 답해. 다른 설명은 절대 쓰지 마.\n'
+ '[{"q":"질문","choices":["보기1","보기2","보기3","보기4"],"answer":0}]\n'
+ 'answer는 정답 보기의 인덱스(0~3).\n\n[수업 내용]\n' + src;
const raw = await callGemini(key, prompt, true);
const parsed = parseGeminiJson(raw);
const norm = (Array.isArray(parsed)? parsed: []).map(normalizeQuizQ).filter(Boolean);
if (!norm.length) throw new Error('PARSE_FAILED');
quizQuestions = norm;
renderQuizQList();
$('aiQuizPreview').innerHTML = '<p class="hint">✅ ' + norm.length + '개 문항을 생성했습니다. 위 문항 목록에서 수정·삭제 후 "📝 퀴즈 만들기"를 눌러 등록하세요.</p>';
} catch (e) {
const msg = String((e && e.message) || e) === 'PARSE_FAILED'
? 'AI 응답을 문제 형식으로 변환하지 못했습니다. 다시 시도해 주세요.'
: geminiErrorKo(e);
$('aiQuizPreview').innerHTML = '<p class="hint">❌ ' + esc(msg) + '</p>';
} finally { btn.disabled = false; btn.textContent = '✨ 문제 생성';}
});

/* ---------- 학생: AI 학습 도우미 ---------- */
function addChatBubble(who, text) {
const div = document.createElement('div');
div.className = 'chat-bubble ' + who;
div.textContent = text;
$('aiChatLog').appendChild(div);
$('aiChatLog').scrollTop = $('aiChatLog').scrollHeight;
return div;
}
async function sendAiChat() {
const key = requireAiKey(); if (!key) return;
const q = $('aiChatInput').value.trim();
if (!q) return;
$('aiChatInput').value = '';
addChatBubble('user', q);
const loadingEl = addChatBubble('ai', '답변을 생각 중…');
loadingEl.classList.add('loading');
try {
const custom = await getAiKnowledge();
const course = buildCourseKnowledge();
const knowledge = (custom? '[강사 추가 수업 지식]\n' + custom + '\n\n': '')
+ '[과정 강의 자료]\n' + course;
const prompt = '너는 스마트팩토리 자격증 강의(자동화설비기능사·자동화설비산업기사·공유압기능사)의 학습 도우미야. '
+ '아래 강의 자료를 기반으로 한국어로 친절하게 답변해. 자료에 없는 내용이면 모른다고 솔직히 말해.\n\n'
+ knowledge + '\n\n[학생 질문]\n' + q;
const ans = await callGemini(key, prompt, false);
loadingEl.textContent = ans;
} catch (e) {
loadingEl.textContent = '❌ ' + geminiErrorKo(e);
} finally {
loadingEl.classList.remove('loading');
$('aiChatLog').scrollTop = $('aiChatLog').scrollHeight;
}
}
$('aiChatSend').addEventListener('click', sendAiChat);
$('aiChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAiChat();});

/* ---------- 강사: AI 과제 피드백 ---------- */
let aiFbSubId = null, aiFbCtx = null;
async function openAiFeedback(subId) {
const key = requireAiKey(); if (!key) return;
const sub = tSubsMap[subId];
if (!sub) { alert('제출물을 찾을 수 없습니다.'); return;}
const a = tAssignsMap[sub.assignmentId] || {};
aiFbSubId = subId;
aiFbCtx = { title: a.title || '', desc: a.desc || '', url: sub.url || '', name: sub.studentName || ''};
$('aiFbMeta').textContent = (a.title || '과제') + ' · ' + (sub.studentName || '');
$('aiFbText').value = sub.aiFeedback || '';
$('aiFbModal').style.display = 'flex';
if (!sub.aiFeedback) regenAiFeedback();
}
async function regenAiFeedback() {
const key = requireAiKey(); if (!key) return;
if (!aiFbCtx) return;
const btn = $('aiFbRegen');
btn.disabled = true; btn.textContent = '생성 중…';
try {
const prompt = '너는 스마트팩토리 자격증 강의의 조교야. 아래 과제 제출물에 대해 학생에게 전달할 피드백을 한국어로 3~5문장으로 작성해줘. '
+ '잘한 점 1가지와 개선할 점 1가지를 꼭 포함해. 피드백 본문만 출력해.\n\n'
+ '[과제 제목] ' + aiFbCtx.title + '\n[과제 설명] ' + aiFbCtx.desc + '\n'
+ '[제출자] ' + aiFbCtx.name + '\n[제출 링크] ' + aiFbCtx.url;
const fb = await callGemini(key, prompt, false);
$('aiFbText').value = fb.trim();
} catch (e) { alert(geminiErrorKo(e));}
finally { btn.disabled = false; btn.textContent = '🔄 다시 생성';}
}
$('aiFbClose').addEventListener('click', () => { $('aiFbModal').style.display = 'none';});
$('aiFbSave').addEventListener('click', async () => {
if (!aiFbSubId) return;
const text = $('aiFbText').value.trim();
try {
if (DEMO) {
const d = demoDb();
const s = d.submissions.find((x) => x.id === aiFbSubId);
if (s) s.aiFeedback = text;
demoSave(d);
} else {
await db.collection('submissions').doc(aiFbSubId).update({ aiFeedback: text});
}
if (tSubsMap[aiFbSubId]) tSubsMap[aiFbSubId].aiFeedback = text;
alert('AI 피드백을 저장했습니다.');
$('aiFbModal').style.display = 'none';
loadAssignments();
} catch (e) { alert('저장 실패: ' + e.message);}
});

})();
