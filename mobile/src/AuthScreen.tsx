import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useSession } from './session';
import { errorMessage } from './api';
import { Button, Field, Notice, Title, s } from './ui';

export function AuthScreen() {
  const { signIn } = useSession();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const submit = useMutation({ mutationFn: async () => {
    if (!username.trim() || !password) throw new Error('Введите логин и пароль.');
    if (new TextEncoder().encode(password).length > 72) throw new Error('Пароль должен занимать не более 72 байт UTF-8.');
    if (register && (!/^[a-zA-Z0-9_]{3,32}$/.test(username) || !displayName.trim() || displayName.length > 80 || password.length < 8)) throw new Error('Логин: 3–32 латинских буквы, цифры или _. Имя: 1–80 символов. Пароль: от 8 символов.');
    return signIn(register ? { username, password, displayName: displayName.trim() } : { username, password }, register);
  } });
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
    <Title>MINECHAT</Title><Title>{register ? 'Регистрация' : 'Вход'}</Title>
    <Field label="Логин" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={32} textContentType="username" />
    {register && <Field label="Имя" value={displayName} onChangeText={setDisplayName} maxLength={80} />}
    <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry textContentType={register ? 'newPassword' : 'password'} />
    {submit.error && <Notice text={errorMessage(submit.error)} />}
    <View style={s.content}><Button title={submit.isPending ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'} disabled={submit.isPending} onPress={() => submit.mutate()} />
      <Button title={register ? 'Уже есть аккаунт' : 'Регистрация'} disabled={submit.isPending} onPress={() => { setRegister(!register); submit.reset(); }} /></View>
  </ScrollView></KeyboardAvoidingView>;
}
