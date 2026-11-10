import type { ExpoConfig } from 'expo/config';

const development = process.env.APP_VARIANT === 'development';
const config: ExpoConfig = {
  name: 'Minechat', slug: 'minechat-mobile', version: '0.1.0', scheme: 'minechat',
  orientation: 'default', userInterfaceStyle: 'dark',
  ios: { bundleIdentifier: 'ru.msrpo.minechat', supportsTablet: true },
  android: { package: 'ru.msrpo.minechat', softwareKeyboardLayoutMode: 'resize' },
  plugins: [
    'expo-router', 'expo-font', 'expo-secure-store',
    ['expo-audio', { microphonePermission: 'Разрешите Minechat записывать голосовые сообщения.', enableBackgroundRecording: false, enableBackgroundPlayback: false }],
    ['expo-image-picker', { photosPermission: 'Выберите фото или видео для сообщения.', cameraPermission: false, microphonePermission: false }],
    ['expo-video', { supportsBackgroundPlayback: false, supportsPictureInPicture: false }],
    ['expo-build-properties', { android: { usesCleartextTraffic: development } }],
  ],
};
export default config;
