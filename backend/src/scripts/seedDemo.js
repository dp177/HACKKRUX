/**
 * DEMO SEED - synthetic data only, safe for a public demo deployment.
 * Creates one demo hospital, six departments, one doctor per department and
 * one demo patient. Idempotent: skips anything that already exists.
 * Run: BASE_URL=http://localhost:5000/api node src/scripts/seedDemo.js
 * Doctor login: demo.<dept-code lowercase>@demo.hackkrux / password DEMO_DOCTOR_PASSWORD env (default DemoDoc#2026)
 * Patient login: demo.patient@demo.hackkrux / password DEMO_PATIENT_PASSWORD env (default DemoPat#2026)
 */

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD || 'DemoDoc#2026';
const PATIENT_PASSWORD = process.env.DEMO_PATIENT_PASSWORD || 'DemoPat#2026';

const HOSPITAL = { name: 'City Care Demo Hospital', code: 'DEMO-CCH', city: 'Jaipur', state: 'Rajasthan' };
const DEPARTMENTS = [
  { name: 'General Medicine', code: 'GM' },
  { name: 'Cardiology', code: 'CARD' },
  { name: 'Pulmonology', code: 'PULM' },
  { name: 'Orthopedics', code: 'ORTH' },
  { name: 'Gastroenterology', code: 'GASTRO' },
  { name: 'Neurology', code: 'NEURO' }
];

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function main() {
  console.log(`Seeding demo data against ${BASE_URL}`);

  let hospitalId;
  const hospitals = await api('/hospitals');
  const existing = (hospitals.data.hospitals || hospitals.data || []).find?.(
    (h) => h.code === HOSPITAL.code || h.name === HOSPITAL.name
  );
  if (existing) {
    hospitalId = existing._id || existing.id;
    console.log('Hospital exists:', hospitalId);
  } else {
    const created = await api('/hospitals', { method: 'POST', body: HOSPITAL });
    hospitalId = created.data?.hospital?.id;
    console.log('Hospital created:', hospitalId, created.status);
  }
  if (!hospitalId) throw new Error('no hospital id');

  const deptIds = {};
  for (const dept of DEPARTMENTS) {
    const created = await api('/departments', {
      method: 'POST',
      body: { hospitalId, name: dept.name, code: dept.code }
    });
    if (created.status === 201) {
      deptIds[dept.code] = created.data.department.id;
      console.log(`Department ${dept.name} created`);
    } else if ((created.data.error || '').includes('already exists')) {
      const list = await api(`/departments?hospitalId=${hospitalId}`);
      const found = (list.data.departments || []).find((d) => d.code === dept.code);
      deptIds[dept.code] = found?._id || found?.id;
      console.log(`Department ${dept.name} exists`);
    } else {
      console.log(`Department ${dept.name} failed:`, created.status, created.data);
    }
  }

  for (const dept of DEPARTMENTS) {
    const email = `demo.${dept.code.toLowerCase()}@demo.hackkrux`;
    const reg = await api('/auth/register/doctor', {
      method: 'POST',
      body: {
        firstName: 'Demo',
        lastName: `${dept.name} Doctor`,
        email,
        phone: `+91910000${String(DEPARTMENTS.indexOf(dept)).padStart(4, '0')}`,
        password: DOCTOR_PASSWORD,
        specialty: dept.name,
        licenseNumber: `DEMO-${dept.code}-0001`,
        hospitalId,
        departmentId: deptIds[dept.code]
      }
    });
    console.log(`Doctor ${dept.name}:`, reg.status === 201 ? 'created' : reg.data.error || reg.status);
  }

  const pat = await api('/auth/register/patient', {
    method: 'POST',
    body: {
      firstName: 'Demo',
      lastName: 'Patient',
      email: 'demo.patient@demo.hackkrux',
      phone: '+919100009999',
      password: PATIENT_PASSWORD,
      dateOfBirth: '1994-01-15',
      gender: 'male'
    }
  });
  console.log('Demo patient:', pat.status === 201 ? 'created' : pat.data.error || pat.status);

  console.log('Demo seed complete. All data is synthetic.');
}

main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
