/**
 * MAIN SERVER - Node.js Express Backend
 * Handles: Patient data, Doctor profiles, Appointments, Auth
 * Integrates with: Python triage engine for risk scoring
 * Database: MongoDB with Mongoose ODM
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { connectDatabase, isConnected } = require('./models');
const { setSocketServer } = require('./utils/socketServer');
const { startTriageRescoreJob } = require('./jobs/triageRescoreJob');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
  }
});

setSocketServer(io);

io.on('connection', (socket) => {
  socket.on('doctor:slots:subscribe', ({ doctorId, date }) => {
    if (!doctorId || !date) return;
    socket.join(`doctor:${doctorId}:slots:${date}`);
  });

  socket.on('doctor:slots:unsubscribe', ({ doctorId, date }) => {
    if (!doctorId || !date) return;
    socket.leave(`doctor:${doctorId}:slots:${date}`);
  });

  socket.on('queue:subscribe', ({ patientId, departmentId }) => {
    if (patientId) {
      socket.join(`patient:${patientId}`);
    }
    if (departmentId) {
      socket.join(`department:${departmentId}`);
    }
  });

  socket.on('queue:unsubscribe', ({ patientId, departmentId }) => {
    if (patientId) {
      socket.leave(`patient:${patientId}`);
    }
    if (departmentId) {
      socket.leave(`department:${departmentId}`);
    }
  });
});
const PORT = process.env.PORT || 5000;

// ═══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Rate limiting
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100 // limit each IP to 100 requests per windowMs
// });
// app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// Health check
app.get('/health', async (req, res) => {
  const connected = await isConnected();
  res.json({
    status: connected ? 'healthy' : 'unhealthy',
    service: 'Node.js Backend API',
    timestamp: new Date().toISOString(),
    database: connected ? 'connected' : 'disconnected'
  });
});

// Auth routes
app.use('/api/auth', require('./routes/auth'));

// Patient routes
app.use('/api/patients', require('./routes/patients'));

// Doctor routes
app.use('/api/doctors', require('./routes/doctors'));

// Appointment routes
app.use('/api/appointments', require('./routes/appointments'));

// Triage integration routes (calls Python engine)
app.use('/api/triage', require('./routes/triage'));
app.use('/api/v1/triage', require('./routes/triage'));

// Visit/medical records routes
app.use('/api/visits', require('./routes/visits'));

// Department routes
app.use('/api/departments', require('./routes/departments'));

// Hospital routes
app.use('/api/hospitals', require('./routes/hospitals'));

// Walk-in routes (self check-in + receptionist assisted)
app.use('/api/walkins', require('./routes/walkins'));

// Department queue routes (patient + doctor live queue status)
app.use('/api/queue', require('./routes/queue'));
app.use('/api/v1/queue', require('./routes/queue'));

// WhatsApp booking webhook route (Twilio)
app.use('/api/v1', require('./routes/whatsapp'));

// Hospital onboarding request routes (public)
app.use('/api/hospital-onboarding', require('./features/hospital-onboarding/hospitalOnboardingRoutes'));

// Admin onboarding review routes (protected by ADMIN_ONBOARDING_KEY header)
app.use('/api/admin', require('./features/admin/adminRoutes'));

// Hospital portal routes (hospital admin/receptionist auth)
app.use('/api/hospital-portal', require('./features/hospital-portal/hospitalPortalRoutes'));

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ═══════════════════════════════════════════════════════════════
// DATABASE & SERVER STARTUP
// ═══════════════════════════════════════════════════════════════

async function startServer() {
  try {
    // Connect to MongoDB
    const connected = await connectDatabase();
    if (!connected) {
      throw new Error('Failed to connect to MongoDB');
    }
    
    // Start optional triage queue re-scoring worker.
    startTriageRescoreJob();

    // Start server
    const server = httpServer.listen(PORT, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  🏥 TRIAGE BACKEND API - RUNNING');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`  Server:        http://localhost:${PORT}`);
      console.log(`  Environment:   ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Database:      MongoDB @ ${process.env.MONGODB_URI || 'mongodb://localhost:27017/triage_db'}`);
      console.log(`  Triage Engine: ${process.env.TRIAGE_ENGINE_URL || 'http://localhost:5001'}`);
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
    });

    // Graceful shutdown (for production)
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, gracefully closing server...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
      // Force exit after 10 seconds
      setTimeout(() => {
        console.error('Forced shutdown');
        process.exit(1);
      }, 10000);
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, gracefully closing server...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  const { disconnectDatabase } = require('./models');
  await disconnectDatabase();
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;
