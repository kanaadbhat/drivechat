import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import http from 'http';

// Load environment variables
dotenv.config();

// Import routes
import messageRoutes from './routes/messages.js';
import fileRoutes from './routes/files.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import authenticationRoutes from './routes/authentication.js';
import authorizationRoutes from './routes/authorization.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';

// Import queue system
import { initializeQueues } from './queues/index.js';
import { initRealtime } from './realtime/realtimeHub.js';

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API Routes
app.use('/api/messages', messageRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/authentication', authenticationRoutes);
app.use('/api/authorization', authorizationRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handler
app.use(errorHandler);

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);

  // Debug: surface realtime / redis config at startup
  console.log('CONFIG ENABLE_REALTIME=', String(process.env.ENABLE_REALTIME || 'false'));
  console.log(
    'CONFIG SKIP_PERIODIC_CLEANUP=',
    String(process.env.SKIP_PERIODIC_CLEANUP || 'false')
  );
  console.log('CONFIG REDIS_HOST=', process.env.REDIS_HOST || 'localhost');
  console.log('CONFIG REALTIME_STREAM_MAXLEN=', process.env.REALTIME_STREAM_MAXLEN || '10000');

  // Initialize realtime (Socket.IO + Redis Streams)
  try {
    initRealtime(server);
  } catch (error) {
    console.error('Failed to initialize realtime:', error);
    console.warn('⚠️  Realtime may not be available');
  }

  // Initialize preview queue system
  try {
    await initializeQueues();
  } catch (error) {
    console.error('Failed to initialize queues:', error);
    console.warn('⚠️  Preview generation queue may not be available');
    // Don't exit, server can still run without queues
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err);
  process.exit(1);
});

export default app;
