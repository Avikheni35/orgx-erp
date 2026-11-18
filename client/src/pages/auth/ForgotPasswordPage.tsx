import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { APP_ERP } from '@/config/brand';
import { Alert, Box, Button, InputAdornment, Stack, TextField, Typography, Link } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import EmailIcon from '@mui/icons-material/Email';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { authApi } from '../../api/auth';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [tenant, setTenant]   = useState('demo');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await authApi.forgotPassword(email, tenant || undefined);
      setSent(true);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      setError(ex.response?.data?.message ?? 'Fehler beim Senden der E-Mail');
    } finally { setLoading(false); }
  };

  return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      bgcolor: '#f1f5f9', px: 3,
    }}>
      <Box sx={{ maxWidth: 400, width: '100%' }}>
        {/* Logo */}
        <Stack alignItems="center" spacing={0.5} mb={4}>
          <Box sx={{ width: 48, height: 48, borderRadius: 2, background: 'linear-gradient(135deg, #1a2f4b, #0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AccountBalanceIcon sx={{ color: '#fff', fontSize: 26 }} />
          </Box>
          <Typography variant="h6" fontWeight={700}>{APP_ERP}</Typography>
        </Stack>

        <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 3, p: { xs: 3, sm: 4 } }}>
          {sent ? (
            <Box textAlign="center" py={1}>
              <MarkEmailReadIcon sx={{ fontSize: 52, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" fontWeight={700} gutterBottom>E-Mail gesendet</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Falls diese E-Mail-Adresse in unserem System existiert, wurde ein Reset-Link gesendet. Bitte prüfen Sie Ihr Postfach.
              </Typography>
              <Link component={RouterLink} to="/login" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <ArrowBackIcon sx={{ fontSize: 16 }} />Zurück zur Anmeldung
              </Link>
            </Box>
          ) : (
            <>
              <Typography variant="h5" fontWeight={700} gutterBottom>Passwort vergessen</Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten einen Link zum Zurücksetzen Ihres Passworts.
              </Typography>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              <form onSubmit={handleSubmit}>
                <Stack spacing={2.5}>
                  <TextField
                    label="Mandant-Code" value={tenant} onChange={(e) => setTenant(e.target.value)}
                    fullWidth placeholder="z.B. demo"
                  />
                  <TextField
                    label="E-Mail-Adresse" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    fullWidth required autoFocus
                    InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
                  />
                  <Button type="submit" variant="contained" fullWidth size="large" disabled={loading}
                    sx={{ background: 'linear-gradient(135deg, #1a2f4b, #0ea5e9)', fontWeight: 700, py: 1.4 }}>
                    {loading ? 'Wird gesendet…' : 'Reset-Link senden'}
                  </Button>
                </Stack>
              </form>

              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Link component={RouterLink} to="/login" variant="body2" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <ArrowBackIcon sx={{ fontSize: 16 }} />Zurück zur Anmeldung
                </Link>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
