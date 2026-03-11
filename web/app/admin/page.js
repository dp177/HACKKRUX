'use client';

import { useEffect, useState } from 'react';
import {
  createDepartment,
  createHospital,
  getDepartmentsByHospital,
  getHospitals,
  registerDoctorAdmin,
  registerPatientAdmin
} from '../../lib/api';

export default function AdminPage() {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [hospitals, setHospitals] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [doctorDepartments, setDoctorDepartments] = useState([]);

  const [hospitalForm, setHospitalForm] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    state: '',
    phone: ''
  });

  const [departmentForm, setDepartmentForm] = useState({
    hospitalId: '',
    name: '',
    code: '',
    description: '',
    floor: '',
    capacity: ''
  });

  const [doctorForm, setDoctorForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    specialty: '',
    licenseNumber: '',
    hospitalId: '',
    departmentId: ''
  });

  const [patientForm, setPatientForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    dateOfBirth: '',
    gender: 'Other',
    bloodType: ''
  });

  useEffect(() => {
    loadHospitals();
  }, []);

  useEffect(() => {
    if (!selectedHospitalId) {
      setDepartments([]);
      return;
    }
    loadDepartments(selectedHospitalId);
  }, [selectedHospitalId]);

  useEffect(() => {
    const initialHospitalId = doctorForm.hospitalId || selectedHospitalId || hospitals[0]?.id || '';
    if (initialHospitalId) {
      setDoctorForm((prev) => ({ ...prev, hospitalId: initialHospitalId }));
      loadDoctorDepartments(initialHospitalId);
    }
  }, [selectedHospitalId, hospitals]);

  async function loadHospitals() {
    try {
      const data = await getHospitals();
      const list = data.hospitals || [];
      setHospitals(list);

      if (!selectedHospitalId && list.length) {
        setSelectedHospitalId(list[0].id);
        setDepartmentForm((prev) => ({ ...prev, hospitalId: list[0].id }));
        setDoctorForm((prev) => ({ ...prev, hospitalId: list[0].id }));
        loadDoctorDepartments(list[0].id);
      }
    } catch {
      setHospitals([]);
    }
  }

  async function loadDepartments(hospitalId) {
    try {
      const data = await getDepartmentsByHospital(hospitalId);
      setDepartments(data.departments || []);
    } catch {
      setDepartments([]);
    }
  }

  async function loadDoctorDepartments(hospitalId) {
    if (!hospitalId) {
      setDoctorDepartments([]);
      return;
    }

    try {
      const data = await getDepartmentsByHospital(hospitalId);
      setDoctorDepartments(data.departments || []);
    } catch {
      setDoctorDepartments([]);
    }
  }

  async function handleCreateHospital(event) {
    event.preventDefault();
    setError('');
    setStatus('Creating hospital...');
    try {
      const data = await createHospital(hospitalForm);
      const newHospitalId = data.hospital.id;

      setStatus(`Hospital created: ${data.hospital.name} (${data.hospital.id})`);
      setHospitalForm({ name: '', code: '', address: '', city: '', state: '', phone: '' });

      await loadHospitals();
      setSelectedHospitalId(newHospitalId);
      setDepartmentForm((prev) => ({ ...prev, hospitalId: newHospitalId }));
      await loadDepartments(newHospitalId);
    } catch (createError) {
      setError(createError.message);
      setStatus('');
    }
  }

  async function handleCreateDepartment(event) {
    event.preventDefault();
    setError('');
    setStatus('Creating department...');

    if (!departmentForm.hospitalId) {
      setError('Please select a hospital first.');
      setStatus('');
      return;
    }

    try {
      const payload = {
        ...departmentForm,
        floor: departmentForm.floor ? String(departmentForm.floor) : null,
        capacity: departmentForm.capacity ? Number(departmentForm.capacity) : null
      };
      const data = await createDepartment(payload);
      setStatus(`Department created: ${data.department.name} (${data.department.id})`);
      setDepartmentForm({ hospitalId: selectedHospitalId, name: '', code: '', description: '', floor: '', capacity: '' });
      await loadDepartments(selectedHospitalId);
    } catch (createError) {
      setError(createError.message);
      setStatus('');
    }
  }

  async function handleCreateDoctor(event) {
    event.preventDefault();
    setError('');
    setStatus('Creating doctor...');

    if (!doctorForm.hospitalId) {
      setError('Please select a hospital for this doctor.');
      setStatus('');
      return;
    }

    if (!doctorForm.departmentId) {
      setError('Please select a department for this doctor.');
      setStatus('');
      return;
    }

    try {
      const payload = {
        ...doctorForm,
        practiceType: 'hospital',
        yearsOfExperience: 0,
        consultationDuration: 15
      };
      const data = await registerDoctorAdmin(payload);
      setStatus(`Doctor created: ${data.doctor.name} (${data.doctor.id})`);
      setDoctorForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        specialty: '',
        licenseNumber: '',
        hospitalId: selectedHospitalId || '',
        departmentId: ''
      });
      setDoctorDepartments([]);
    } catch (createError) {
      setError(createError.message);
      setStatus('');
    }
  }

  async function handleCreatePatient(event) {
    event.preventDefault();
    setError('');
    setStatus('Creating patient...');
    try {
      const data = await registerPatientAdmin(patientForm);
      setStatus(`Patient created: ${data.patient.name} (${data.patient.id})`);
      setPatientForm({
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        password: '',
        dateOfBirth: '',
        gender: 'Other',
        bloodType: ''
      });
    } catch (createError) {
      setError(createError.message);
      setStatus('');
    }
  }

  return (
    <main className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Admin Setup Console</h1>
        <a href="/" style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Open Doctor Dashboard</a>
      </div>
      <p>Doctor registration is configured for hospital setup only.</p>

      {status && <p className="success">{status}</p>}
      {error && <p className="error">{error}</p>}

      <section className="row row-2" style={{ marginTop: 12 }}>
        <div className="card">
            <h2>Create Hospital</h2>
            <form onSubmit={handleCreateHospital} className="row">
              <input placeholder="Hospital Name" value={hospitalForm.name} onChange={(event) => setHospitalForm((prev) => ({ ...prev, name: event.target.value }))} required />
              <input placeholder="Hospital Code (e.g. HACK01)" value={hospitalForm.code} onChange={(event) => setHospitalForm((prev) => ({ ...prev, code: event.target.value }))} required />
              <input placeholder="Address" value={hospitalForm.address} onChange={(event) => setHospitalForm((prev) => ({ ...prev, address: event.target.value }))} />
              <input placeholder="City" value={hospitalForm.city} onChange={(event) => setHospitalForm((prev) => ({ ...prev, city: event.target.value }))} />
              <input placeholder="State" value={hospitalForm.state} onChange={(event) => setHospitalForm((prev) => ({ ...prev, state: event.target.value }))} />
              <input placeholder="Phone" value={hospitalForm.phone} onChange={(event) => setHospitalForm((prev) => ({ ...prev, phone: event.target.value }))} />
              <button type="submit">Create Hospital</button>
            </form>

            <div style={{ marginTop: 12 }}>
              <h3>Existing Hospitals</h3>
              {!hospitals.length && <p>No hospitals found.</p>}
              {hospitals.map((hospital) => (
                <p key={hospital.id} style={{ margin: '6px 0' }}>
                  {hospital.name} ({hospital.code}) - ID: {hospital.id}
                </p>
              ))}
            </div>
          </div>

        <div className="card">
            <h2>Create Department</h2>
            <form onSubmit={handleCreateDepartment} className="row">
              <select
                value={departmentForm.hospitalId}
                onChange={(event) => {
                  const hospitalId = event.target.value;
                  setDepartmentForm((prev) => ({ ...prev, hospitalId }));
                  setSelectedHospitalId(hospitalId);
                  setDoctorForm((prev) => ({ ...prev, departmentId: '' }));
                }}
                required
              >
                <option value="">Select Hospital</option>
                {hospitals.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>{hospital.name}</option>
                ))}
              </select>
              <input placeholder="Name" value={departmentForm.name} onChange={(event) => setDepartmentForm((prev) => ({ ...prev, name: event.target.value }))} required />
              <input placeholder="Code (e.g. CARDIO)" value={departmentForm.code} onChange={(event) => setDepartmentForm((prev) => ({ ...prev, code: event.target.value }))} required />
              <input placeholder="Description" value={departmentForm.description} onChange={(event) => setDepartmentForm((prev) => ({ ...prev, description: event.target.value }))} />
              <input placeholder="Floor" value={departmentForm.floor} onChange={(event) => setDepartmentForm((prev) => ({ ...prev, floor: event.target.value }))} />
              <input placeholder="Capacity" value={departmentForm.capacity} onChange={(event) => setDepartmentForm((prev) => ({ ...prev, capacity: event.target.value }))} />
              <button type="submit">Create Department</button>
            </form>

            <div style={{ marginTop: 12 }}>
              <h3>Departments In Selected Hospital</h3>
              {!departments.length && <p>No departments found.</p>}
              {departments.map((department) => (
                <p key={department.id} style={{ margin: '6px 0' }}>
                  {department.name} ({department.code}) - ID: {department.id}
                </p>
              ))}
            </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Create Hospital Doctor</h2>
        <form onSubmit={handleCreateDoctor} className="row">
          <input placeholder="First Name" value={doctorForm.firstName} onChange={(event) => setDoctorForm((prev) => ({ ...prev, firstName: event.target.value }))} required />
          <input placeholder="Last Name" value={doctorForm.lastName} onChange={(event) => setDoctorForm((prev) => ({ ...prev, lastName: event.target.value }))} required />
          <input placeholder="Email" type="email" value={doctorForm.email} onChange={(event) => setDoctorForm((prev) => ({ ...prev, email: event.target.value }))} required />
          <input placeholder="Phone" value={doctorForm.phone} onChange={(event) => setDoctorForm((prev) => ({ ...prev, phone: event.target.value }))} required />
          <input placeholder="Password" type="password" value={doctorForm.password} onChange={(event) => setDoctorForm((prev) => ({ ...prev, password: event.target.value }))} required />
          <input placeholder="Specialty" value={doctorForm.specialty} onChange={(event) => setDoctorForm((prev) => ({ ...prev, specialty: event.target.value }))} required />
          <input placeholder="License Number" value={doctorForm.licenseNumber} onChange={(event) => setDoctorForm((prev) => ({ ...prev, licenseNumber: event.target.value }))} required />

          <select
            value={doctorForm.hospitalId}
            onChange={(event) => {
              const hospitalId = event.target.value;
              setDoctorForm((prev) => ({ ...prev, hospitalId, departmentId: '' }));
              loadDoctorDepartments(hospitalId);
            }}
            required
          >
            <option value="">Select Hospital</option>
            {hospitals.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>{hospital.name}</option>
            ))}
          </select>

          <select
            value={doctorForm.departmentId}
            onChange={(event) => setDoctorForm((prev) => ({ ...prev, departmentId: event.target.value }))}
            required
          >
            <option value="">Select Department</option>
            {doctorDepartments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>

          <button type="submit">Create Doctor</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Create Patient</h2>
        <form onSubmit={handleCreatePatient} className="row row-2">
          <input placeholder="First Name" value={patientForm.firstName} onChange={(event) => setPatientForm((prev) => ({ ...prev, firstName: event.target.value }))} required />
          <input placeholder="Last Name" value={patientForm.lastName} onChange={(event) => setPatientForm((prev) => ({ ...prev, lastName: event.target.value }))} required />
          <input placeholder="Phone" value={patientForm.phone} onChange={(event) => setPatientForm((prev) => ({ ...prev, phone: event.target.value }))} required />
          <input placeholder="Email" type="email" value={patientForm.email} onChange={(event) => setPatientForm((prev) => ({ ...prev, email: event.target.value }))} required />
          <input placeholder="Password" type="password" value={patientForm.password} onChange={(event) => setPatientForm((prev) => ({ ...prev, password: event.target.value }))} required />
          <input placeholder="Date of Birth (YYYY-MM-DD)" value={patientForm.dateOfBirth} onChange={(event) => setPatientForm((prev) => ({ ...prev, dateOfBirth: event.target.value }))} required />
          <select value={patientForm.gender} onChange={(event) => setPatientForm((prev) => ({ ...prev, gender: event.target.value }))}>
            <option value="M">Male (M)</option>
            <option value="F">Female (F)</option>
            <option value="Other">Other</option>
            <option value="Prefer not to say">Prefer not to say</option>
          </select>
          <input placeholder="Blood Type (optional)" value={patientForm.bloodType} onChange={(event) => setPatientForm((prev) => ({ ...prev, bloodType: event.target.value }))} />
          <div />
          <button type="submit">Create Patient</button>
        </form>
      </section>
    </main>
  );
}
