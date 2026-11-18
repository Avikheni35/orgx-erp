import { Box, Typography, Chip } from '@mui/material';
import { useLocation } from 'react-router-dom';
import BuildIcon from '@mui/icons-material/Build';
import { useTranslation } from 'react-i18next';

export default function ComingSoonPage() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  return (
    <Box sx={{ textAlign: 'center', py: 12 }}>
      <BuildIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
      <Typography variant="h5" fontWeight={600} mb={1}>{t('comingSoon.title')}</Typography>
      <Typography variant="body1" color="text.secondary" mb={2}>{t('comingSoon.subtitle')}</Typography>
      <Chip label={pathname} size="small" variant="outlined" />
    </Box>
  );
}
