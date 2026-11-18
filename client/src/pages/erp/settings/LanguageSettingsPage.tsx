import { Box, Card, CardContent, Typography, Stack, Button, Alert } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageIcon from '@mui/icons-material/Language';
import CheckIcon from '@mui/icons-material/Check';

export default function LanguageSettingsPage() {
  const { t, i18n } = useTranslation();
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState(i18n.language.startsWith('en') ? 'en' : 'de');

  const handleSave = () => {
    i18n.changeLanguage(selected);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const options = [
    { code: 'de', label: t('settings.language.de'), flag: '🇩🇪' },
    { code: 'en', label: t('settings.language.en'), flag: '🇬🇧' },
  ];

  return (
    <Box maxWidth={600}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('settings.language.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('settings.language.subtitle')}</Typography>
        </Box>
        <Button variant="contained" onClick={handleSave}>{t('settings.company.saveChanges')}</Button>
      </Box>

      {saved && <Alert severity="success" sx={{ mb: 2 }}>{t('settings.language.saved')}</Alert>}

      <Stack spacing={2}>
        {options.map((opt) => {
          const isActive = selected === opt.code;
          return (
            <Card
              key={opt.code}
              onClick={() => setSelected(opt.code)}
              sx={{
                cursor: 'pointer',
                border: isActive ? '2px solid #1a56a8' : '2px solid transparent',
                bgcolor: isActive ? '#eff6ff' : 'background.paper',
                '&:hover': { boxShadow: 3 },
              }}
            >
              <CardContent>
                <Stack direction="row" alignItems="center" gap={2}>
                  <Box sx={{ fontSize: 28 }}>{opt.flag}</Box>
                  <Box flex={1}>
                    <Typography variant="subtitle1" fontWeight={600}>{opt.label}</Typography>
                  </Box>
                  <LanguageIcon color={isActive ? 'primary' : 'disabled'} />
                  {isActive && <CheckIcon color="primary" />}
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
