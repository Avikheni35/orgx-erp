import { useState } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { APP_ERP, APP_PLATFORM } from '@/config/brand';
import {
  Alert, Box, Button, Divider, InputAdornment, IconButton,
  Link, Stack, TextField, Typography,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import EmailIcon from '@mui/icons-material/Email';
import LockIcon from '@mui/icons-material/Lock';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import BadgeIcon from '@mui/icons-material/Badge';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AssuredWorkloadIcon from '@mui/icons-material/AssuredWorkload';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';
import type { AuthUser, M3UserRole } from '../../types';
import { portalHome } from '../../types';
import { setApiToken } from '../../api/client';

const FEATURES = [
  { icon: <AccountTreeIcon sx={{ fontSize: 20 }} />, text: 'Doppelte Buchführung nach SKR03' },
  { icon: <ReceiptLongIcon sx={{ fontSize: 20 }} />, text: 'Ausgangs- & Eingangsrechnungen' },
  { icon: <AssuredWorkloadIcon sx={{ fontSize: 20 }} />, text: 'GoBD-konform & DATEV-Export' },
  { icon: <BadgeIcon sx={{ fontSize: 20 }} />, text: 'Lohnabrechnung & Personalverwaltung' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { t } = useTranslation();
  const [step, setStep]     = useState<'login' | 'otp'>('login');
  const [email, setEmail]   = useState('');
  const [password, setPass] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [tenant, setTenant] = useState('demo');
  const [otp, setOtp]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await authApi.login(email, password, tenant || undefined);
      const data = res.data;
      if ('requiresOtp' in data && data.requiresOtp) {
        setStep('otp');
      } else {
        const d = data as { accessToken: string; user: AuthUser };
        setApiToken(d.accessToken);
        setAuth(d.user, d.accessToken);
        navigate(portalHome(d.user.role as M3UserRole));
      }
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setError(ex.response?.data?.message ?? t('auth.signIn') + ' fehlgeschlagen');
    } finally { setLoading(false); }
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await authApi.verifyOtp(email, otp, tenant || undefined);
      setApiToken(res.data.accessToken);
      setAuth(res.data.user, res.data.accessToken);
      navigate(portalHome(res.data.user.role as M3UserRole));
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setError(ex.response?.data?.message ?? 'Ungültiges OTP');
    } finally { setLoading(false); }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* ── Left branding panel ── */}
      <Box sx={{
        display: { xs: 'none', md: 'flex' },
        width: '42%', flexShrink: 0,
        flexDirection: 'column', justifyContent: 'center',
        px: 6, py: 8,
        background: 'linear-gradient(160deg, #0f1923 0%, #1a2f4b 55%, #1e3a5f 100%)',
        color: '#fff', position: 'relative', overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: 'rgba(14,165,233,0.09)', top: -80, right: -90, pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', background: 'rgba(14,165,233,0.06)', bottom: 60, left: -40, pointerEvents: 'none' }} />

        <Stack spacing={1} mb={5} sx={{ position: 'relative' }}>
          <Box sx={{ width: 52, height: 52, borderRadius: 2, bgcolor: 'rgba(14,165,233,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
            <AccountBalanceIcon sx={{ fontSize: 28, color: '#7dd3fc' }} />
          </Box>
          <Typography variant="overline" sx={{ color: '#38bdf8', letterSpacing: 3, fontSize: '0.7rem' }}>{APP_PLATFORM}</Typography>
          <Typography variant="h4" fontWeight={800} lineHeight={1.2}>
            ERP &amp;<br />Buchhaltung
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 1, maxWidth: 280 }}>
            Die vollständige Buchhaltungslösung für deutsche KMU — GoBD-konform, DATEV-ready.
          </Typography>
        </Stack>

        <Stack spacing={2} sx={{ position: 'relative' }}>
          {FEATURES.map((f) => (
            <Stack key={f.text} direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ width: 36, height: 36, borderRadius: 1.5, flexShrink: 0, bgcolor: 'rgba(14,165,233,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7dd3fc' }}>
                {f.icon}
              </Box>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>{f.text}</Typography>
            </Stack>
          ))}
        </Stack>

        <Box sx={{ mt: 'auto', pt: 6, position: 'relative' }}>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)', mb: 2.5 }} />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
            Demo: admin@erp.demo / Erp1234! (Code: demo)
          </Typography>
        </Box>
      </Box>

      {/* ── Right form panel ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: { xs: 3, sm: 6 }, py: 6, bgcolor: 'background.default' }}>
        {/* Mobile logo */}
        <Stack alignItems="center" spacing={0.5} mb={4} sx={{ display: { md: 'none' } }}>
          <Box sx={{ width: 48, height: 48, borderRadius: 2, background: 'linear-gradient(135deg, #1a2f4b, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AccountBalanceIcon sx={{ color: '#fff', fontSize: 26 }} />
          </Box>
          <Typography variant="h6" fontWeight={700}>{APP_ERP}</Typography>
        </Stack>

        <Box sx={{ width: '100%', maxWidth: 400 }}>
          {step === 'login' ? (
            <>
              <Typography variant="h5" fontWeight={700} mb={0.5}>{t('auth.signIn')}</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>{t('auth.subtitle')}</Typography>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <form onSubmit={handleLogin}>
                <Stack spacing={2.5}>
                  <TextField
                    label={t('auth.tenantCode')} fullWidth
                    value={tenant} onChange={(e) => setTenant(e.target.value)}
                    placeholder="z.B. demo" helperText="Von Ihrem Administrator bereitgestellt"
                  />
                  <TextField
                    label={t('auth.email')} type="email" fullWidth required autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
                  />
                  <TextField
                    label={t('auth.password')} type={showPw ? 'text' : 'password'} fullWidth required
                    value={password} onChange={(e) => setPass(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start"><LockIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowPw((v) => !v)} edge="end">
                            {showPw ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1 }}>
                    <Link component={RouterLink} to="/forgot-password" variant="caption">Passwort vergessen?</Link>
                  </Box>
                  <Button type="submit" variant="contained" fullWidth size="large" disabled={loading}
                    sx={{ background: 'linear-gradient(135deg, #1a2f4b, #0ea5e9)', '&:hover': { background: 'linear-gradient(135deg, #1a2f4b, #0284c7)' }, fontWeight: 700, py: 1.4 }}>
                    {loading ? t('common.loading') : t('auth.loginButton')}
                  </Button>
                </Stack>
              </form>
            </>
          ) : (
            <>
              <Typography variant="h5" fontWeight={700} mb={0.5}>{t('auth.otp')}</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>{t('auth.otpSubtitle')}</Typography>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              <form onSubmit={handleOtp}>
                <Stack spacing={2.5}>
                  <TextField
                    label={t('auth.otp')} fullWidth required autoFocus
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 }}
                  />
                  <Button type="submit" variant="contained" fullWidth size="large" disabled={loading || otp.length !== 6}
                    sx={{ background: 'linear-gradient(135deg, #1a2f4b, #0ea5e9)', fontWeight: 700, py: 1.4 }}>
                    {loading ? t('common.loading') : t('auth.confirmCode')}
                  </Button>
                  <Button variant="text" fullWidth onClick={() => { setStep('login'); setOtp(''); setError(''); }}>
                    {t('common.back')}
                  </Button>
                </Stack>
              </form>
            </>
          )}
        </Box>

        <Stack direction="row" spacing={2} mt={6} flexWrap="wrap" justifyContent="center">
          <Link component={RouterLink} to="/impressum" variant="caption" color="text.disabled" underline="hover">Impressum</Link>
          <Link component={RouterLink} to="/datenschutz" variant="caption" color="text.disabled" underline="hover">Datenschutz</Link>
          <Link component={RouterLink} to="/agb" variant="caption" color="text.disabled" underline="hover">AGB</Link>
        </Stack>
      </Box>
    </Box>
  );
}
