import assert from 'node:assert/strict';
import test from 'node:test';
import { voiceRecordingType, voicePlaybackError } from '../src/features/messages/voice-format.ts';

test('Recorder prefers explicit Opus and excludes formats the browser cannot play', () => {
  assert.equal(voiceRecordingType(() => true, () => 'probably'), 'audio/webm;codecs=opus');
  assert.equal(voiceRecordingType(() => true, (type) => type === 'audio/mp4' ? 'maybe' : ''), 'audio/mp4');
  assert.equal(voiceRecordingType(() => false, () => 'probably'), undefined);
  assert.equal(voiceRecordingType(() => true, () => ''), undefined);
});

test('Intentional playback cancellation is silent; permission and codec failures are explained', () => {
  assert.equal(voicePlaybackError(new DOMException('Interrupted by pause', 'AbortError')), '');
  assert.match(voicePlaybackError(new DOMException('', 'NotAllowedError')), /Разрешите/);
  assert.match(voicePlaybackError(new DOMException('', 'NotSupportedError')), /формат/);
  assert.match(voicePlaybackError(new Error('Failure')), /Попробуйте ещё раз/);
});
