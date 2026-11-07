const mediaTypes: Record<string, { kind: 'image' | 'video' | 'audio'; mime: string }> = {
  png: { kind: 'image', mime: 'image/png' }, jpg: { kind: 'image', mime: 'image/jpeg' }, jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' }, webp: { kind: 'image', mime: 'image/webp' }, avif: { kind: 'image', mime: 'image/avif' }, bmp: { kind: 'image', mime: 'image/bmp' },
  mp4: { kind: 'video', mime: 'video/mp4' }, webm: { kind: 'video', mime: 'video/webm' }, ogv: { kind: 'video', mime: 'video/ogg' }, mov: { kind: 'video', mime: 'video/quicktime' },
  weba: { kind: 'audio', mime: 'audio/webm' }, m4a: { kind: 'audio', mime: 'audio/mp4' },
  ogg: { kind: 'audio', mime: 'audio/ogg' }, mp3: { kind: 'audio', mime: 'audio/mpeg' },
  wav: { kind: 'audio', mime: 'audio/wav' }, aac: { kind: 'audio', mime: 'audio/aac' },
};
export function mediaType(filename: string) {
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
  return Object.hasOwn(mediaTypes, extension) ? mediaTypes[extension] : undefined;
}

export function isVoiceFile(filename: string) {
  return filename.startsWith('voice-') && mediaType(filename)?.kind === 'audio';
}
