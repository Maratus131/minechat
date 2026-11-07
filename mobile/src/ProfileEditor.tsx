import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Profile } from '../../frontend/src/api/contracts';
import { Avatar } from './Avatar';
import { errorMessage, type PickedFile } from './api';
import { discardFile, stageFile } from './files';
import { useSession } from './session';
import { Button, Field, Label, Notice, Title, s } from './ui';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10);
}

function ProfileForm({ profile }: { profile: Profile }) {
  const { api, logout, updateUser } = useSession();
  const cache = useQueryClient();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [birthDate, setBirthDate] = useState(profile.birthDate ?? '');
  const [pickError, setPickError] = useState('');
  const [picking, setPicking] = useState(false);

  function accept(next: Profile) {
    cache.setQueryData(['me'], next);
    updateUser(next);
    void Promise.all([
      cache.invalidateQueries({ queryKey: ['conversations'] }),
      cache.invalidateQueries({ queryKey: ['channels'] }),
      cache.invalidateQueries({ queryKey: ['channel'] }),
      cache.invalidateQueries({ queryKey: ['channel-search'] }),
      cache.invalidateQueries({ queryKey: ['users'] }),
      cache.invalidateQueries({ queryKey: ['history'] }),
      cache.invalidateQueries({ queryKey: ['message-search'] }),
    ]);
  }

  const save = useMutation({ mutationFn: () => {
    const name = displayName.trim();
    const birthday = birthDate.trim();
    if (!name || name.length > 80 || name.includes('\0')) throw new Error('Введите имя длиной от 1 до 80 символов.');
    if (birthday && !validBirthDate(birthday)) throw new Error('Укажите дату рождения в формате ГГГГ-ММ-ДД, не позднее сегодняшнего дня.');
    return api.updateProfile(name, birthday || null);
  }, onSuccess: (next) => { accept(next); setDisplayName(next.displayName); setBirthDate(next.birthDate ?? ''); } });
  const upload = useMutation({ mutationFn: (file: PickedFile) => api.setAvatar(file), onSuccess: accept });
  const remove = useMutation({ mutationFn: () => api.removeAvatar(), onSuccess: accept });
  const busy = save.isPending || upload.isPending || remove.isPending || picking;
  const changed = displayName.trim() !== profile.displayName || (birthDate.trim() || null) !== profile.birthDate;

  async function pickAvatar() {
    setPicking(true); setPickError('');
    let staged: PickedFile | undefined;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Разрешите доступ к фотографиям в настройках устройства.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const mime = (asset.mimeType ?? (/\.png$/i.test(asset.fileName || asset.uri) ? 'image/png' : /\.jpe?g$/i.test(asset.fileName || asset.uri) ? 'image/jpeg' : '')).toLowerCase();
      if (mime !== 'image/jpeg' && mime !== 'image/png') throw new Error('Выберите изображение JPEG или PNG.');
      if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) throw new Error('Аватар должен быть не больше 5 МиБ.');
      staged = { ...await stageFile(asset.uri, mime === 'image/png' ? 'avatar.png' : 'avatar.jpg'), mimeType: mime };
      if (staged.size > MAX_AVATAR_BYTES) throw new Error('Аватар должен быть не больше 5 МиБ.');
      await upload.mutateAsync(staged);
    } catch (error) { setPickError(errorMessage(error)); }
    finally { if (staged) await discardFile(staged.uri); setPicking(false); }
  }

  return <ScrollView style={s.fill} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <Title>Профиль</Title>
    <View style={s.row}><Avatar user={profile} size={72} /><View style={s.fill}><Label>{profile.displayName}</Label><Label>@{profile.username}</Label></View></View>
    <Button title={picking || upload.isPending ? 'Загрузка фото…' : profile.avatarId ? 'Изменить фото' : 'Добавить фото'} disabled={busy} onPress={() => { void pickAvatar(); }} />
    <Label>JPEG/PNG до 5 МиБ. Большие фото уменьшаются автоматически.</Label>
    {profile.avatarId && <Button title={remove.isPending ? 'Удаление…' : 'Удалить фото'} disabled={busy} onPress={() => remove.mutate()} />}
    <Field label="Отображаемое имя" value={displayName} onChangeText={setDisplayName} maxLength={80} editable={!busy} />
    <Field label="Дата рождения (ГГГГ-ММ-ДД)" value={birthDate} onChangeText={setBirthDate} placeholder="Например, 2000-05-24" maxLength={10} editable={!busy} autoCapitalize="none" />
    <Label>Дата рождения видна только вам. Чтобы удалить её, очистите поле и сохраните профиль.</Label>
    <Button title={save.isPending ? 'Сохранение…' : 'Сохранить профиль'} disabled={busy || !changed} onPress={() => save.mutate()} />
    {(pickError || save.error || upload.error || remove.error) && <Notice text={pickError || errorMessage(save.error || upload.error || remove.error)} />}
    <Button title="Выйти" onPress={logout} />
  </ScrollView>;
}

export function ProfileEditor() {
  const { api } = useSession();
  const profile = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => api.me(signal) });
  if (profile.isPending) return <View style={s.content}><Label>Загрузка профиля…</Label></View>;
  if (profile.isError) return <View style={s.content}><Notice text={errorMessage(profile.error)} /><Button title="Повторить" onPress={() => { void profile.refetch(); }} /></View>;
  return <ProfileForm profile={profile.data} />;
}
