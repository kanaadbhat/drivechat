/**
 * Simple logger utility
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

const logger = {
  error: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.error) {
      console.error('❌ [ERROR]', new Date().toISOString(), ...args);
    }
  },

  warn: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.warn) {
      console.warn('⚠️  [WARN]', new Date().toISOString(), ...args);
    }
  },

  info: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.info) {
      console.log('ℹ️  [INFO]', new Date().toISOString(), ...args);
    }
  },

  debug: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.debug) {
      console.log('🐛 [DEBUG]', new Date().toISOString(), ...args);
    }
  },

  success: (...args) => {
    if (currentLogLevel >= LOG_LEVELS.info) {
      console.log('✅ [SUCCESS]', new Date().toISOString(), ...args);
    }
  },
};

export default logger;
