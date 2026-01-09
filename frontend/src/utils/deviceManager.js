import mobileIcon from '../assets/devices/mobile.svg';
import laptopIcon from '../assets/devices/laptop.svg';
import tabletIcon from '../assets/devices/tablet.svg';
import pcIcon from '../assets/devices/pc.svg';
import guestIcon from '../assets/devices/guest.svg';

const DEVICE_STORAGE_KEY = 'drivechat_device';

/**
 * Device types supported
 */
export const DEVICE_TYPES = {
  MOBILE: 'mobile',
  LAPTOP: 'laptop',
  TABLET: 'tablet',
  PC: 'pc',
  GUEST: 'guest',
};

const getBrowserName = () => {
  const ua = (navigator.userAgent || '').toLowerCase();

  // Edge (Chromium-based) - contains 'edg'
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('edga') || ua.includes('edgios')) return 'Edge';

  // Opera
  if (ua.includes('opr/') || ua.includes('opera')) return 'Opera';

  // Vivaldi
  if (ua.includes('vivaldi')) return 'Vivaldi';

  // Brave (UA may include 'brave')
  if (ua.includes('brave')) return 'Brave';

  // Samsung Internet
  if (ua.includes('samsungbrowser')) return 'Samsung Internet';

  // UC Browser
  if (ua.includes('ucbrowser')) return 'UC Browser';

  // QQ / Baidu / Maxthon / Yandex / Puffin
  if (ua.includes('qqbrowser')) return 'QQ Browser';
  if (ua.includes('baidubrowser') || ua.includes('baiduboxapp')) return 'Baidu Browser';
  if (ua.includes('maxthon')) return 'Maxthon';
  if (ua.includes('yabrowser') || ua.includes('yandex')) return 'Yandex';
  if (ua.includes('puffin')) return 'Puffin';

  // Chromium variants and Chrome (iOS uses CriOS)
  if (ua.includes('crios')) return 'Chrome (iOS)';
  if (ua.includes('chromium')) return 'Chromium';
  if (ua.includes('chrome')) return 'Chrome';

  // Firefox (iOS uses FxiOS)
  if (ua.includes('fxios') || ua.includes('firefox')) return 'Firefox';

  // Safari (must come after Chrome checks because Chrome UA contains 'safari')
  if (ua.includes('safari')) return 'Safari';

  // Electron apps
  if (ua.includes('electron')) return 'Electron';

  // Tor Browser (best-effort)
  if (ua.includes('torbrowser') || ua.includes('tor/')) return 'Tor Browser';

  return 'Browser';
};

/**
 * Get icon for device type
 */
export const getDeviceIcon = (type) => {
  switch (type) {
    case DEVICE_TYPES.MOBILE:
      return mobileIcon;
    case DEVICE_TYPES.LAPTOP:
      return laptopIcon;
    case DEVICE_TYPES.TABLET:
      return tabletIcon;
    case DEVICE_TYPES.PC:
      return pcIcon;
    case DEVICE_TYPES.GUEST:
    default:
      return guestIcon;
  }
};

/**
 * Detect device type based on user agent
 */
export const detectDeviceType = () => {
  const ua = navigator.userAgent.toLowerCase();
  const isMobile = /mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua);
  const isTablet = /tablet|ipad|playbook|silk/i.test(ua);
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (isMobile) return DEVICE_TYPES.MOBILE;
  if (isTablet) return DEVICE_TYPES.TABLET;
  if (isTouch) return DEVICE_TYPES.TABLET;

  // Desktop detection
  const isMac = /macintosh|mac os x/i.test(ua);
  const isWindows = /windows/i.test(ua);
  const isLinux = /linux/i.test(ua);

  if (isMac || isWindows || isLinux) {
    // Check screen size for laptop vs desktop
    const screenWidth = window.screen.width;
    if (screenWidth < 1600) return DEVICE_TYPES.LAPTOP;
    return DEVICE_TYPES.PC;
  }

  return DEVICE_TYPES.GUEST;
};

/**
 * Generate a default device name based on type
 */
export const generateDefaultDeviceName = (type) => {
  const browser = getBrowserName();

  const typeNames = {
    [DEVICE_TYPES.MOBILE]: 'Mobile',
    [DEVICE_TYPES.LAPTOP]: 'Laptop',
    [DEVICE_TYPES.TABLET]: 'Tablet',
    [DEVICE_TYPES.PC]: 'PC',
    [DEVICE_TYPES.GUEST]: 'Guest',
  };

  return `${typeNames[type]} (${browser})`;
};

/**
 * Generate a unique device ID
 */
export const generateDeviceId = () => {
  return `device_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Get current device info from localStorage
 */
export const getCurrentDevice = () => {
  try {
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error reading device from localStorage:', error);
  }
  return null;
};

/**
 * Save device info to localStorage
 */
export const saveCurrentDevice = (deviceInfo) => {
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(deviceInfo));
    return true;
  } catch (error) {
    console.error('Error saving device to localStorage:', error);
    return false;
  }
};

/**
 * Clear device info from localStorage
 */
export const clearCurrentDevice = () => {
  try {
    localStorage.removeItem(DEVICE_STORAGE_KEY);
    return true;
  } catch (error) {
    console.error('Error clearing device from localStorage:', error);
    return false;
  }
};

/**
 * Initialize device - get from storage or create new guest device
 */
export const initializeDevice = () => {
  let device = getCurrentDevice();

  if (!device) {
    device = {
      deviceId: generateDeviceId(),
      name: generateDefaultDeviceName(DEVICE_TYPES.GUEST),
      type: DEVICE_TYPES.GUEST,
      isRegistered: false,
      createdAt: new Date().toISOString(),
    };
    saveCurrentDevice(device);
  }

  return device;
};

/**
 * Register current device with custom name and type
 */
export const registerDevice = (name, type) => {
  const device = getCurrentDevice();
  const deviceId = device?.deviceId || generateDeviceId();

  const registeredDevice = {
    deviceId,
    name,
    type,
    isRegistered: true,
    createdAt: device?.createdAt || new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  };

  saveCurrentDevice(registeredDevice);
  return registeredDevice;
};

/**
 * Update current device info
 */
export const updateCurrentDevice = (updates) => {
  const device = getCurrentDevice();
  if (!device) return null;

  const updatedDevice = {
    ...device,
    ...updates,
    lastSeen: new Date().toISOString(),
  };

  saveCurrentDevice(updatedDevice);
  return updatedDevice;
};

/**
 * Check if current device is registered
 */
export const isDeviceRegistered = () => {
  const device = getCurrentDevice();
  return device?.isRegistered || false;
};

/**
 * Get device display info (for UI)
 */
export const getDeviceDisplayInfo = (device) => {
  if (!device) return null;

  return {
    id: device.deviceId,
    name: device.name || generateDefaultDeviceName(device.type),
    type: device.type || DEVICE_TYPES.GUEST,
    icon: getDeviceIcon(device.type || DEVICE_TYPES.GUEST),
    isRegistered: device.isRegistered || false,
    lastSeen: device.lastSeen,
  };
};
