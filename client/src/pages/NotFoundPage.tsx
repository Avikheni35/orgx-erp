import { Box, Typography, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <Typography variant="h1" fontWeight={700} color="text.disabled">404</Typography>
      <Typography variant="h6">{t('notFound.title')}</Typography>
      <Button variant="contained" onClick={() => navigate('/erp/dashboard')}>{t('notFound.backToDashboard')}</Button>
    </Box>
  );
}
