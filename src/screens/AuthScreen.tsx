import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

const BLUE = ['#5AB0FF', '#1F4FFF'] as const;

const translate = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Email o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ya existe una cuenta con ese email.';
  if (m.includes('not confirmed')) return 'Tienes que confirmar tu email antes de entrar.';
  if (m.includes('network')) return 'No hay conexión con el servidor. Revisa tu internet.';
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera un momento.';
  if (m.includes('password')) return 'La contraseña no es válida (mínimo 6 caracteres).';
  if (m.includes('valid email') || m.includes('invalid email')) return 'El email no es válido.';
  return msg;
};

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isRegister = mode === 'register';

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError('');
    setInfo('');
  };

  const submit = async () => {
    setError('');
    setInfo('');
    const mail = email.trim();
    const uname = username.trim().toLowerCase();

    if (!mail.includes('@')) return setError('Escribe un email válido.');
    if (password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (isRegister && !/^[a-z0-9_]{3,20}$/.test(uname)) {
      return setError('El usuario debe tener 3-20 caracteres: letras, números o guion bajo.');
    }

    setLoading(true);
    try {
      if (isRegister) {
        const { data: free, error: e1 } = await supabase.rpc('username_available', { u: uname });
        if (e1) throw e1;
        if (!free) {
          setError('Ese nombre de usuario ya está en uso.');
          setLoading(false);
          return;
        }
        const { data, error: e2 } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { data: { username: uname, display_name: displayName.trim() } },
        });
        if (e2) throw e2;
        // Si "Confirm email" está activado en Supabase no hay sesión hasta confirmar
        if (!data.session) {
          setInfo('Cuenta creada. Confirma tu email y después inicia sesión.');
          setMode('login');
        }
      } else {
        const { error: e3 } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (e3) throw e3;
      }
    } catch (e: any) {
      setError(translate(e?.message ?? 'Algo ha salido mal.'));
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>GymApp</Text>
        <Text style={styles.subtitle}>
          {isRegister ? 'Crea tu cuenta' : 'Inicia sesión para continuar'}
        </Text>

        <View style={styles.form}>
          {isRegister && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Nombre de usuario (ej. juan_fit)"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                maxLength={20}
              />
              <TextInput
                style={styles.input}
                placeholder="Tu nombre (opcional)"
                placeholderTextColor="#666"
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={30}
              />
            </>
          )}
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="#666"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!info && <Text style={styles.info}>{info}</Text>}

          <Pressable onPress={submit} disabled={loading} style={({ pressed }) => pressed && { opacity: 0.8 }}>
            <LinearGradient
              colors={BLUE}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.button}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{isRegister ? 'Crear cuenta' : 'Entrar'}</Text>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={switchMode} style={{ marginTop: 18 }}>
            <Text style={styles.switch}>
              {isRegister ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
              <Text style={styles.switchStrong}>{isRegister ? 'Inicia sesión' : 'Regístrate'}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { color: '#fff', fontSize: 44, fontWeight: '800', letterSpacing: -1, textAlign: 'center' },
  subtitle: { color: '#8a94a6', fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 32 },
  form: { gap: 12 },
  input: {
    backgroundColor: '#141414',
    borderColor: '#262626',
    borderWidth: 1,
    borderRadius: 14,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  button: { paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: '#ff6b5e', fontSize: 14, textAlign: 'center' },
  info: { color: '#7dd3fc', fontSize: 14, textAlign: 'center' },
  switch: { color: '#8a94a6', fontSize: 14, textAlign: 'center' },
  switchStrong: { color: '#5AB0FF', fontWeight: '700' },
});
