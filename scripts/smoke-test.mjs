/**
 * SMOKE TEST - exercises the restored stack end to end against any base URL.
 * Usage: BASE_URL=http://localhost:5000/api node scripts/smoke-test.mjs
 * Creates fresh synthetic users each run (random suffix), asserts key flows,
 * prints PASS/FAIL per step and exits non-zero on any failure.
 */
const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const RUN = Math.random().toString(36).slice(2, 8);
let failures = 0;

const ADMIN_AUTH = 'Basic ' + Buffer.from(`${process.env.ADMIN_BASIC_USER || 'admin'}:${process.env.ADMIN_BASIC_PASSWORD || 'jeevaadmin123'}`).toString('base64');

async function api(path, { method = 'GET', body, token, form, admin = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers.Authorization = ADMIN_AUTH;
  let payload;
  if (form) { payload = form; }
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function check(name, cond, detail = '') {
  const ok = !!cond;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  -> ' + detail}`);
  if (!ok) failures += 1;
}

const P = { firstName: 'Smoke', lastName: 'Test', email: `smoke.${RUN}@test.dev`, password: 'SmokeTest#123', phone: `+9199${Date.now().toString().slice(-8)}`, dateOfBirth: '1995-03-20', gender: 'female' };

const reg = await api('/auth/register/patient', { method: 'POST', body: P });
check('patient register', reg.status === 201 && reg.data.token, JSON.stringify(reg.data).slice(0, 120));
const tok = reg.data.token, pid = reg.data.patient?.id;

const chat = await api('/triage/chat-next', { method: 'POST', token: tok, body: { conversation_history: [{ role: 'user', content: 'I have fever and cough since 2 days' }] } });
check('chat-next questions', Array.isArray(chat.data.questions) && chat.data.questions.length > 0, JSON.stringify(chat.data).slice(0, 120));

const form = new FormData();
form.append('payload', JSON.stringify({ conversation_history: [{ role: 'user', content: 'high fever, cough, breathless since 2 days' }], context: { age: 31, gender: 'female' }, vitals: { temperature: 39.4, oxygen_saturation: 95, heart_rate: 110 } }));
const an = await api('/triage/analyze', { method: 'POST', token: tok, form });
check('analyze returns risk+urgency', an.status === 200 && typeof an.data?.triage?.risk_score === 'number' && !!an.data?.triage?.urgency_level, JSON.stringify(an.data).slice(0, 200));

const walk = await api('/walkins/self-checkin', { method: 'POST', body: { patientId: pid, deskCode: process.env.DESK_SCANNER_CODE || 'FRONTDESK-QR-001', chiefComplaint: 'Fever and cough', symptoms: ['fever', 'cough'], symptomSeverity: 'moderate', symptomDuration: 48 } });
check('walkin self-checkin', walk.status === 201 && walk.data.triage?.triageId, JSON.stringify(walk.data).slice(0, 150));

const init = await api('/triage/initiate', { method: 'POST', body: { patientId: pid, chiefComplaint: 'Stomach pain since yesterday' } });
check('phased initiate', !!init.data.sessionId, JSON.stringify(init.data).slice(0, 120));
if (init.data.sessionId) {
  for (const ph of ['critical', 'symptom', 'context', 'vitals', 'timeline']) {
    const r = await api(`/triage/assess/${ph}`, { method: 'POST', body: { sessionId: init.data.sessionId, answers: { description: 'stomach pain', severity: 'mild', age: 31 } } });
    if (ph === 'timeline') check('phased assessments complete', r.data.completed === true, JSON.stringify(r.data).slice(0, 120));
  }
  const done = await api('/triage/complete', { method: 'POST', body: { sessionId: init.data.sessionId, patientId: pid } });
  check('phased complete', !!done.data.triageId, JSON.stringify(done.data).slice(0, 150));
}


// --- Security isolation checks (IDOR / authz) ---
const H = (n) => ({ method: 'POST', admin: true, body: { name: `Smoke Hospital ${n} ${RUN}`, code: `SMK${n}${RUN}`.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12), city: 'Testville' } });
const hA = await api('/hospitals', H('A'));
const hB = await api('/hospitals', H('B'));
const hAId = hA.data?.hospital?.id || hA.data?.hospital?._id || hA.data?.id;
const hBId = hB.data?.hospital?.id || hB.data?.hospital?._id || hB.data?.id;
check('create two hospitals', hAId && hBId, JSON.stringify(hA.data).slice(0,120));

let dATok, dAId, dBTok, dBId;
if (hAId && hBId) {
  const deptA = await api('/departments', { method: 'POST', admin: true, body: { hospitalId: hAId, name: 'General Medicine', code: `GEN${RUN}`.toUpperCase().slice(0,10) } });
  const deptB = await api('/departments', { method: 'POST', admin: true, body: { hospitalId: hBId, name: 'General Medicine', code: `GEN${RUN}`.toUpperCase().slice(0,10) } });
  const dAIdDept = deptA.data?.department?.id || deptA.data?.department?._id || deptA.data?.id;
  const dBIdDept = deptB.data?.department?.id || deptB.data?.department?._id || deptB.data?.id;
  check('create departments', dAIdDept && dBIdDept, JSON.stringify(deptA.data).slice(0,120));

  const docBody = (n, hId, dId) => ({ method: 'POST', admin: true, body: { firstName: 'Smoke', lastName: `Doc${n}`, email: `smokedoc${n}.${RUN}@test.dev`, phone: `+9177${Math.floor(Math.random()*1e8).toString().padStart(8,'0')}`, password: 'SmokeDoc#123', specialty: 'General Medicine', licenseNumber: `LIC${RUN}${n}`.toUpperCase(), hospitalId: hId, departmentId: dId } });
  const dA = await api('/auth/register/doctor', docBody('A', hAId, dAIdDept));
  const dB = await api('/auth/register/doctor', docBody('B', hBId, dBIdDept));
  dATok = dA.data?.token; dAId = dA.data?.doctor?.id || dA.data?.doctor?._id;
  dBTok = dB.data?.token; dBId = dB.data?.doctor?.id || dB.data?.doctor?._id;
  check('register two doctors', dATok && dBTok, JSON.stringify(dA.data).slice(0,150));

  if (dATok && dBTok) {
    const xdash = await api(`/doctors/${dAId}/dashboard`, { token: dBTok });
    check('doctor B cannot read doctor A dashboard (403)', xdash.status === 403, `got ${xdash.status}`);
    const ownDash = await api(`/doctors/${dAId}/dashboard`, { token: dATok });
    check('doctor A reads own dashboard', ownDash.status === 200, `got ${ownDash.status}: ${JSON.stringify(ownDash.data).slice(0,80)}`);
    const xprev = await api(`/doctors/${dBId}/patient-preview/${pid}`, { token: dBTok });
    check('doctor B (other hospital) cannot preview patient (403)', xprev.status === 403, `got ${xprev.status}`);
    const noTokPrev = await api(`/doctors/${dAId}/patient-preview/${pid}`, {});
    check('patient-preview rejects no token (401)', noTokPrev.status === 401, `got ${noTokPrev.status}`);
  }
}

// WhatsApp history endpoint must require auth now
const waNoTok = await api('/v1/whatsapp-booking/history/%2B919999999999', {});
check('whatsapp history rejects no token (401)', waNoTok.status === 401, `got ${waNoTok.status}`);

// Twilio signature enforcement when configured
if (process.env.SMOKE_TWILIO_TOKEN_CONFIGURED === '1') {
  const waBadSig = await fetch(`${BASE_URL}/v1/whatsapp-booking`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': 'bogus' }, body: 'From=whatsapp%3A%2B919999999999&Body=START' });
  check('whatsapp webhook rejects bad signature (403)', waBadSig.status === 403, `got ${waBadSig.status}`);
}


// Admin-gating negative checks
const noAdminHosp = await api('/hospitals', H('X') && { method: 'POST', body: { name: 'NoAuth Hosp', code: `NOAUTH${RUN}`.toUpperCase().slice(0,12) } });
check('hospital create rejects no admin auth (401)', noAdminHosp.status === 401, `got ${noAdminHosp.status}`);
const noAdminDoc = await api('/auth/register/doctor', { method: 'POST', body: { firstName: 'X', lastName: 'Y', email: `noauth.${RUN}@test.dev`, phone: '+915500000001', password: 'x', specialty: 'G', licenseNumber: 'X1', hospitalId: hAId, departmentId: 'x' } });
check('doctor register rejects no admin auth (401)', noAdminDoc.status === 401, `got ${noAdminDoc.status}`);

// WhatsApp webhook simulation (dev mode, channel enabled by default, no token = simulation allowed)
const waSim = await fetch(`${BASE_URL}/v1/whatsapp-booking`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `From=whatsapp%3A%2B9199${RUN.slice(0,8).replace(/\D/g,'7')}&Body=START` });
const waText = await waSim.text();
check('whatsapp webhook START returns TwiML reply', waSim.status === 200 && waText.includes('<Message>'), `got ${waSim.status}: ${waText.slice(0,80)}`);


// Department queue tenant isolation + raw doctor-creation gating
const noAdminRawDoc = await api('/doctors', { method: 'POST', body: { firstName: 'Raw', lastName: 'Doc', email: `raw.${RUN}@test.dev` } });
check('POST /doctors rejects no admin auth (401)', noAdminRawDoc.status === 401, `got ${noAdminRawDoc.status}`);
if (dBTok && dAId) {
  const depts = await api(`/departments?hospitalId=${hAId}`, {});
  const deptAId = (depts.data?.departments?.[0]?.id) || (depts.data?.departments?.[0]?._id);
  if (deptAId) {
    const xqueue = await api(`/departments/${deptAId}/queue`, { token: dBTok });
    check('doctor B cannot read hospital A department queue (403)', xqueue.status === 403, `got ${xqueue.status}`);
  }
}


// WhatsApp cross-hospital journey regression: one sender books into hospital A, restarts,
// books into hospital B. Each hospital's doctor must see ONLY their own conversation.
if (dATok && dBTok) {
  const sender = `+9188${RUN.slice(0,8).replace(/\D/g,'5')}`;
  const wa = async (text) => {
    const r = await fetch(`${BASE_URL}/v1/whatsapp-booking`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `From=${encodeURIComponent('whatsapp:' + sender)}&Body=${encodeURIComponent(text)}` });
    const raw = await r.text();
    const m = raw.match(/<Message>([\s\S]*?)<\/Message>/);
    return m ? m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') : raw;
  };
  const pickFromMenu = async (menu, name) => {
    const lines = menu.split('\n').filter(l => /^\d+\./.test(l.trim()));
    const hit = lines.find(l => l.includes(name));
    if (!hit) return { ok: false, menu };
    await wa(hit.trim().split('.')[0]);
    return { ok: true };
  };
  // Journey 1: full start, language, name -> hospital menu, pick hospital A
  await wa('START');
  await wa('1');                       // English
  const menu1 = await wa('Journey Tester'); // name (new patient) -> hospital menu
  const j1 = await pickFromMenu(menu1, `Hospital A ${RUN}`);
  // Journey 2: restart, language, existing patient -> hospital menu directly, pick B
  await wa('START');
  const menu2 = await wa('1');         // English -> hospital menu (known patient)
  const j2 = await pickFromMenu(menu2, `Hospital B ${RUN}`);
  check('whatsapp journeys picked both hospitals', j1.ok && j2.ok, `j1=${j1.ok} j2=${j2.ok}`);

  const histA = await api(`/v1/whatsapp-booking/history/${encodeURIComponent(sender)}`, { token: dATok });
  const histB = await api(`/v1/whatsapp-booking/history/${encodeURIComponent(sender)}`, { token: dBTok });
  const aConvs = histA.data?.conversations || [], bConvs = histB.data?.conversations || [];
  check('doctor A sees only hospital A conversations',
    aConvs.length >= 1 && aConvs.every(c => String(c.collectedData?.hospitalId) === String(hAId)),
    JSON.stringify(aConvs.map(c => c.collectedData?.hospitalId)));
  check('doctor B sees only hospital B conversations',
    bConvs.length >= 1 && bConvs.every(c => String(c.collectedData?.hospitalId) === String(hBId)),
    JSON.stringify(bConvs.map(c => c.collectedData?.hospitalId)));
  const overlap = aConvs.filter(c => bConvs.some(d => String(d.id) === String(c.id)));
  check('no conversation visible to both hospitals', overlap.length === 0, `${overlap.length} shared`);
}


// Positive tenant check: walk-in patient at hospital A must be previewable by hospital A's doctor
// (triage-record relationship), still invisible to hospital B's doctor.
if (dATok && dBTok && hAId) {
  const deptListA = await api(`/departments?hospitalId=${hAId}`, {});
  const deptAId2 = (deptListA.data?.departments?.[0]?.id) || (deptListA.data?.departments?.[0]?._id);
  const regA = await api('/auth/register/patient', { method: 'POST', body: { ...P, email: `smokeA.${RUN}@test.dev`, phone: `+9161${Date.now().toString().slice(-8)}` } });
  const pidA = regA.data?.patient?.id;
  if (pidA && deptAId2) {
    const w = await api('/walkins/self-checkin', { method: 'POST', body: { patientId: pidA, deskCode: process.env.DESK_SCANNER_CODE || 'FRONTDESK-QR-001', chiefComplaint: 'Headache', symptoms: ['headache'], symptomSeverity: 'mild', symptomDuration: 12, departmentId: deptAId2 } });
    check('walkin at hospital A succeeds', w.status === 201, JSON.stringify(w.data).slice(0,100));
    const prevA = await api(`/doctors/${dAId}/patient-preview/${pidA}`, { token: dATok });
    check('hospital A doctor CAN preview its walk-in patient', prevA.status === 200, `got ${prevA.status}: ${JSON.stringify(prevA.data).slice(0,80)}`);
    const prevB = await api(`/doctors/${dBId}/patient-preview/${pidA}`, { token: dBTok });
    check('hospital B doctor still blocked from that patient (403)', prevB.status === 403, `got ${prevB.status}`);
  }
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);
