import { Box, Typography, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/authStore';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    logout();
    navigate('/login');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <Typography variant="h1" fontWeight={700} color="error.main">403</Typography>
      <Typography variant="h6">{t('unauthorized.title')}</Typography>
      <Typography color="text.secondary">{t('unauthorized.subtitle')}</Typography>
      <Stack direction="row" spacing={2} mt={1}>
        <Button variant="outlined" onClick={handleLogout}>
          {t('auth.logout', 'Abmelden')}
        </Button>
        <Button variant="contained" onClick={() => navigate('/erp/dashboard')}>
          {t('unauthorized.backToDashboard')}
        </Button>
      </Stack>
    </Box>
  );
}
