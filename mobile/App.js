import React, { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  bookAppointment,
  getPatientDashboard,
  loginPatient,
  receptionistWalkinCheckin,
  registerPatient,
  searchDepartments,
  searchDoctors,
  selfWalkinCheckin,
  submitQuickTriage
} from './src/api';

export default function App() {
  const [token, setToken] = useState('');
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [status, setStatus] = useState('');

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [registerForm, setRegisterForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    password: '',
    dateOfBirth: '',
    gender: 'Other',
    bloodType: 'Unknown'
  });

  const [triageForm, setTriageForm] = useState({
    chiefComplaint: '',
    symptoms: '',
    symptomSeverity: 'moderate',
    symptomDuration: '24',
    bloodPressure: '',
    heartRate: '',
    temperature: ''
  });

  const [doctorQuery, setDoctorQuery] = useState('');
  const [departmentQuery, setDepartmentQuery] = useState('');
  const [doctorResults, setDoctorResults] = useState([]);
  const [departmentResults, setDepartmentResults] = useState([]);

  const [appointmentForm, setAppointmentForm] = useState({
    doctorId: '',
    scheduledDate: '',
    scheduledTime: '',
    chiefComplaint: ''
  });

  const [selfWalkinForm, setSelfWalkinForm] = useState({
    deskCode: '',
    chiefComplaint: '',
    symptoms: ''
  });

  const [receptionWalkinForm, setReceptionWalkinForm] = useState({
    existingPatientId: '',
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'Other',
    phone: '',
    email: '',
    chiefComplaint: '',
    symptoms: ''
  });

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    const savedToken = await AsyncStorage.getItem('patientToken');
    const savedPatientId = await AsyncStorage.getItem('patientId');
    const savedPatientName = await AsyncStorage.getItem('patientName');

    if (savedToken && savedPatientId) {
      setToken(savedToken);
      setPatientId(savedPatientId);
      setPatientName(savedPatientName || 'Patient');
      await loadDashboard(savedPatientId, savedToken);
      await loadSearchData();
    }
  }

  async function handleLogin() {
    try {
      setStatus('Logging in...');
      const data = await loginPatient(phone, password);
      setToken(data.token);
      setPatientId(data.patient.id);
      setPatientName(data.patient.name);
      await AsyncStorage.setItem('patientToken', data.token);
      await AsyncStorage.setItem('patientId', String(data.patient.id));
      await AsyncStorage.setItem('patientName', data.patient.name);
      setStatus('Login successful');
      await loadDashboard(data.patient.id, data.token);
      await loadSearchData();
    } catch (error) {
      Alert.alert('Login failed', error.message);
      setStatus('');
    }
  }

  async function handleRegister() {
    try {
      setStatus('Creating account...');
      const data = await registerPatient(registerForm);
      setToken(data.token);
      setPatientId(data.patient.id);
      setPatientName(data.patient.name);
      await AsyncStorage.setItem('patientToken', data.token);
      await AsyncStorage.setItem('patientId', String(data.patient.id));
      await AsyncStorage.setItem('patientName', data.patient.name);
      setStatus('Registration successful. Credentials email sent if mail server is configured.');
      await loadDashboard(data.patient.id, data.token);
      await loadSearchData();
    } catch (error) {
      Alert.alert('Registration failed', error.message);
      setStatus('');
    }
  }

  async function loadDashboard(id = patientId, authToken = token) {
    if (!id || !authToken) return;

    try {
      setStatus('Loading dashboard...');
      const data = await getPatientDashboard(id, authToken);
      setDashboard(data);
      setStatus('Dashboard loaded');
    } catch (error) {
      Alert.alert('Dashboard error', error.message);
      setStatus('');
    }
  }

  async function loadSearchData() {
    try {
      const [doctorsData, departmentsData] = await Promise.all([
        searchDoctors(doctorQuery),
        searchDepartments(departmentQuery)
      ]);
      setDoctorResults(doctorsData.doctors || []);
      setDepartmentResults(departmentsData.departments || []);
    } catch (error) {
      setDoctorResults([]);
      setDepartmentResults([]);
    }
  }

  async function searchBookingCatalog() {
    try {
      setStatus('Searching doctors and departments...');
      const [doctorsData, departmentsData] = await Promise.all([
        searchDoctors(doctorQuery),
        searchDepartments(departmentQuery)
      ]);
      setDoctorResults(doctorsData.doctors || []);
      setDepartmentResults(departmentsData.departments || []);
      setStatus('Search completed');
    } catch (error) {
      Alert.alert('Search failed', error.message);
      setStatus('');
    }
  }

  async function handleQuickTriage() {
    try {
      setStatus('Submitting triage...');
      const result = await submitQuickTriage(
        {
          patientId,
          chiefComplaint: triageForm.chiefComplaint,
          symptoms: triageForm.symptoms
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          symptomSeverity: triageForm.symptomSeverity,
          symptomDuration: Number(triageForm.symptomDuration) || 24,
          vitalSigns: {
            bloodPressure: triageForm.bloodPressure || undefined,
            heartRate: triageForm.heartRate ? Number(triageForm.heartRate) : undefined,
            temperature: triageForm.temperature ? Number(triageForm.temperature) : undefined
          },
          mode: 'clinic'
        },
        token
      );

      Alert.alert(
        'Triage Complete',
        `Priority: ${result.priorityLevel}\nRisk Score: ${result.riskScore}\nQueue Position: ${result.queuePosition}`
      );
      setStatus('Triage submitted');
      await loadDashboard();
    } catch (error) {
      Alert.alert('Triage failed', error.message);
      setStatus('');
    }
  }

  async function handleBookAppointment() {
    try {
      setStatus('Booking appointment...');
      const result = await bookAppointment(
        {
          doctorId: appointmentForm.doctorId,
          scheduledDate: appointmentForm.scheduledDate,
          scheduledTime: appointmentForm.scheduledTime,
          chiefComplaint: appointmentForm.chiefComplaint,
          appointmentType: 'routine'
        },
        token
      );
      Alert.alert('Booked', `Appointment ID: ${result.appointment.id}`);
      setStatus('Appointment booked');
      await loadDashboard();
    } catch (error) {
      Alert.alert('Booking failed', error.message);
      setStatus('');
    }
  }

  async function handleSelfWalkin() {
    try {
      setStatus('Submitting self walk-in...');
      const result = await selfWalkinCheckin({
        patientId,
        deskCode: selfWalkinForm.deskCode,
        chiefComplaint: selfWalkinForm.chiefComplaint,
        symptoms: selfWalkinForm.symptoms
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        mode: 'clinic'
      });

      Alert.alert(
        'Self Check-in Successful',
        `Priority: ${result.triage.priorityLevel}\nQueue Position: ${result.triage.queuePosition}\nWait: ${result.triage.estimatedWaitMinutes} min`
      );
      setStatus('Self walk-in submitted');
      await loadDashboard();
    } catch (error) {
      Alert.alert('Self walk-in failed', error.message);
      setStatus('');
    }
  }

  async function handleReceptionWalkin() {
    try {
      setStatus('Submitting receptionist walk-in...');
      const result = await receptionistWalkinCheckin({
        ...receptionWalkinForm,
        symptoms: receptionWalkinForm.symptoms
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        mode: 'clinic'
      });

      const credentialsText = result.credentials
        ? `\nTemp Login ID: ${result.credentials.loginId}\nTemp Password: ${result.credentials.temporaryPassword}`
        : '';

      Alert.alert(
        'Receptionist Check-in Successful',
        `Patient: ${result.patient.name}\nQueue Position: ${result.triage.queuePosition}${credentialsText}`
      );
      setStatus('Receptionist walk-in submitted');
    } catch (error) {
      Alert.alert('Receptionist walk-in failed', error.message);
      setStatus('');
    }
  }

  async function handleLogout() {
    await AsyncStorage.multiRemove(['patientToken', 'patientId', 'patientName']);
    setToken('');
    setPatientId('');
    setPatientName('');
    setDashboard(null);
    setStatus('Logged out');
  }

  if (!token) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Patient App</Text>
        <Text style={styles.subtitle}>Login</Text>
        <TextInput style={styles.input} placeholder="Phone" value={phone} onChangeText={setPhone} />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin}>
          <Text style={styles.buttonText}>Login</Text>
        </TouchableOpacity>

        <Text style={[styles.subtitle, { marginTop: 28 }]}>Register (credentials sent to email)</Text>
        <TextInput
          style={styles.input}
          placeholder="First Name"
          value={registerForm.firstName}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, firstName: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Last Name"
          value={registerForm.lastName}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, lastName: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Phone"
          value={registerForm.phone}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, phone: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={registerForm.email}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, email: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={registerForm.password}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, password: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Date of Birth (YYYY-MM-DD)"
          value={registerForm.dateOfBirth}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, dateOfBirth: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Gender (M/F/Other)"
          value={registerForm.gender}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, gender: value }))}
        />
        <TextInput
          style={styles.input}
          placeholder="Blood Type (optional)"
          value={registerForm.bloodType}
          onChangeText={(value) => setRegisterForm((prev) => ({ ...prev, bloodType: value }))}
        />
        <TouchableOpacity style={styles.secondaryButton} onPress={handleRegister}>
          <Text style={styles.buttonText}>Register</Text>
        </TouchableOpacity>

        {status ? <Text style={styles.status}>{status}</Text> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome, {patientName}</Text>
      <Text style={styles.caption}>Patient ID: {patientId}</Text>

      <View style={styles.tabsWrap}>
        <TabButton label="Dashboard" active={tab === 'dashboard'} onPress={() => setTab('dashboard')} />
        <TabButton label="Triage" active={tab === 'triage'} onPress={() => setTab('triage')} />
        <TabButton label="Booking" active={tab === 'booking'} onPress={() => setTab('booking')} />
        <TabButton label="Walk-in" active={tab === 'walkin'} onPress={() => setTab('walkin')} />
      </View>

      {tab === 'dashboard' && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>My Dashboard</Text>
          <TouchableOpacity style={styles.button} onPress={() => loadDashboard()}>
            <Text style={styles.buttonText}>Refresh</Text>
          </TouchableOpacity>
          <Text style={styles.line}>Visits: {dashboard?.visitHistory?.totalVisits ?? 0}</Text>
          <Text style={styles.line}>Upcoming Appointments: {(dashboard?.upcomingAppointments || []).length}</Text>
          <Text style={styles.line}>Recent Triage: {(dashboard?.recentTriageAssessments || []).length}</Text>
        </View>
      )}

      {tab === 'triage' && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Quick Triage</Text>
          <TextInput
            style={styles.input}
            placeholder="Chief complaint"
            value={triageForm.chiefComplaint}
            onChangeText={(value) => setTriageForm((prev) => ({ ...prev, chiefComplaint: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Symptoms (comma separated)"
            value={triageForm.symptoms}
            onChangeText={(value) => setTriageForm((prev) => ({ ...prev, symptoms: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Severity: mild/moderate/severe"
            value={triageForm.symptomSeverity}
            onChangeText={(value) => setTriageForm((prev) => ({ ...prev, symptomSeverity: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Duration hours"
            keyboardType="numeric"
            value={triageForm.symptomDuration}
            onChangeText={(value) => setTriageForm((prev) => ({ ...prev, symptomDuration: value }))}
          />
          <TouchableOpacity style={styles.button} onPress={handleQuickTriage}>
            <Text style={styles.buttonText}>Submit Triage</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'booking' && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Book Appointment (easy search)</Text>
          <TextInput
            style={styles.input}
            placeholder="Search doctor by name/specialty/department"
            value={doctorQuery}
            onChangeText={setDoctorQuery}
          />
          <TextInput
            style={styles.input}
            placeholder="Search hospital department"
            value={departmentQuery}
            onChangeText={setDepartmentQuery}
          />
          <TouchableOpacity style={styles.button} onPress={searchBookingCatalog}>
            <Text style={styles.buttonText}>Search</Text>
          </TouchableOpacity>

          <Text style={styles.subtitleSmall}>Doctors</Text>
          {doctorResults.slice(0, 8).map((doctor) => (
            <View key={doctor.id} style={styles.listItem}>
              <Text style={styles.line}>{doctor.name} • {doctor.specialty}</Text>
              <Text style={styles.caption}>Dept: {doctor.department || 'N/A'}</Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setAppointmentForm((prev) => ({ ...prev, doctorId: doctor.id }))}
              >
                <Text style={styles.buttonText}>Select Doctor</Text>
              </TouchableOpacity>
            </View>
          ))}

          <Text style={styles.subtitleSmall}>Departments</Text>
          {departmentResults.slice(0, 8).map((department) => (
            <View key={department.id} style={styles.listItem}>
              <Text style={styles.line}>{department.name} ({department.code})</Text>
              <Text style={styles.caption}>{department.description || 'No description'}</Text>
            </View>
          ))}

          <TextInput
            style={styles.input}
            placeholder="Selected Doctor ID"
            value={appointmentForm.doctorId}
            onChangeText={(value) => setAppointmentForm((prev) => ({ ...prev, doctorId: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Date YYYY-MM-DD"
            value={appointmentForm.scheduledDate}
            onChangeText={(value) => setAppointmentForm((prev) => ({ ...prev, scheduledDate: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Time HH:MM"
            value={appointmentForm.scheduledTime}
            onChangeText={(value) => setAppointmentForm((prev) => ({ ...prev, scheduledTime: value }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Chief complaint"
            value={appointmentForm.chiefComplaint}
            onChangeText={(value) => setAppointmentForm((prev) => ({ ...prev, chiefComplaint: value }))}
          />
          <TouchableOpacity style={styles.button} onPress={handleBookAppointment}>
            <Text style={styles.buttonText}>Book Appointment</Text>
          </TouchableOpacity>
        </View>
      )}

      {tab === 'walkin' && (
        <View>
          <View style={styles.card}>
            <Text style={styles.subtitle}>Self Check-in via Desk Scanner Code</Text>
            <TextInput
              style={styles.input}
              placeholder="Desk scanner code"
              value={selfWalkinForm.deskCode}
              onChangeText={(value) => setSelfWalkinForm((prev) => ({ ...prev, deskCode: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Chief complaint"
              value={selfWalkinForm.chiefComplaint}
              onChangeText={(value) => setSelfWalkinForm((prev) => ({ ...prev, chiefComplaint: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Symptoms (comma separated)"
              value={selfWalkinForm.symptoms}
              onChangeText={(value) => setSelfWalkinForm((prev) => ({ ...prev, symptoms: value }))}
            />
            <TouchableOpacity style={styles.button} onPress={handleSelfWalkin}>
              <Text style={styles.buttonText}>Self Check-in</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.subtitle}>Receptionist Assisted Walk-in</Text>
            <Text style={styles.caption}>Use existing patient ID or enter new patient details.</Text>
            <TextInput
              style={styles.input}
              placeholder="Existing Patient ID (optional)"
              value={receptionWalkinForm.existingPatientId}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, existingPatientId: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="First Name"
              value={receptionWalkinForm.firstName}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, firstName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              value={receptionWalkinForm.lastName}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, lastName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Date of Birth YYYY-MM-DD"
              value={receptionWalkinForm.dateOfBirth}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, dateOfBirth: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Gender (M/F/Other)"
              value={receptionWalkinForm.gender}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, gender: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone"
              value={receptionWalkinForm.phone}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, phone: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={receptionWalkinForm.email}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, email: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Chief complaint"
              value={receptionWalkinForm.chiefComplaint}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, chiefComplaint: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Symptoms (comma separated)"
              value={receptionWalkinForm.symptoms}
              onChangeText={(value) => setReceptionWalkinForm((prev) => ({ ...prev, symptoms: value }))}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={handleReceptionWalkin}>
              <Text style={styles.buttonText}>Receptionist Check-in</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {status ? <Text style={styles.status}>{status}</Text> : null}
      <TouchableOpacity style={styles.secondaryButton} onPress={handleLogout}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TabButton({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f7fb',
    flexGrow: 1
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10
  },
  subtitleSmall: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8
  },
  caption: {
    color: '#6b7280',
    marginBottom: 16
  },
  tabsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16
  },
  tabButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff'
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb'
  },
  tabText: {
    color: '#1f2937',
    fontWeight: '500'
  },
  tabTextActive: {
    color: '#ffffff'
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16
  },
  listItem: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  secondaryButton: {
    backgroundColor: '#4b5563',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 10
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600'
  },
  line: {
    marginBottom: 8
  },
  status: {
    marginTop: 8,
    marginBottom: 12,
    color: '#047857'
  }
});
