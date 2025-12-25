export const formatBytes = (bytes = 0, decimals = 1) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/i;

export const extractFirstUrl = (text = '') => {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
};

export const containsUrl = (text = '') => {
  if (!text) return false;
  const regex = new RegExp(URL_REGEX);
  return regex.test(text);
};

export const buildLinkMeta = (url, textValue) => {
  try {
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const u = new URL(normalized);
    const host = u.hostname.replace(/^www\./, '');
    const isPureUrl = !textValue || textValue.trim() === url.trim();
    return {
      linkUrl: normalized,
      linkTitle: isPureUrl ? host : textValue.trim(),
      linkDescription: host,
      linkImage: `https://www.google.com/s2/favicons?sz=128&domain=${host}`,
    };
  } catch {
    return {
      linkUrl: url,
      linkTitle: textValue || url,
      linkDescription: null,
      linkImage: null,
    };
  }
};

export const getHostname = (url = '') => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
