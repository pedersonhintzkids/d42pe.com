export const STORY_LINK = 'https://d42pe.com/halloweekend/?ref=VIPStory&utm_source=attendee&utm_medium=story&utm_campaign=halloweekend_2026';
export const STORY_CAPTION = 'D42PE giveaway entry';
export const TEXT_NUMBER = '+15126107851';
export const STORY_MESSAGE = 'HALLOWEEKEND VIP — Story entry\nMy Instagram/Snapchat username: ';
export const FREE_MESSAGE = 'HALLOWEEKEND VIP — Free entry\nMy name: ';

export function smsLink(body, { userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const isAppleMobile = /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  return `sms:${TEXT_NUMBER}${isAppleMobile ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

// Copy actions confirm only copying. They do not submit or verify an entry.
export async function copyText(text, clipboard, fallback) {
  try {
    if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
    await clipboard.writeText(text);
    return true;
  } catch {
    fallback(text);
    return false;
  }
}
