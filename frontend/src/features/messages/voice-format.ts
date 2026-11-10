// Prefer explicit codecs that the browser can both record and play.
export function voiceRecordingType(canRecord: (type: string) => boolean, canPlay: (type: string) => string) {
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm']
    .find((type) => canRecord(type) && !!canPlay(type));
}

export function voicePlaybackError(cause: unknown) {
  const name = cause instanceof Error || cause instanceof DOMException ? cause.name : '';
  if (name === 'AbortError') return '';
  if (name === 'NotAllowedError') return 'Браузер заблокировал звук. Разрешите его в настройках сайта и нажмите воспроизведение снова.';
  if (name === 'NotSupportedError') return 'Этот браузер не поддерживает формат записи. Попробуйте другой браузер или скачайте запись.';
  return 'Не удалось воспроизвести запись. Попробуйте ещё раз.';
}
