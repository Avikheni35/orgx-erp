import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert, Box, Button, Card, CardContent, Divider, Stack, TextField, Typography,
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LockIcon from '@mui/icons-material/Lock';
import { authApi } from '../../../api/auth';
import { useAuthStore } from '../../../stores/authStore';

export default function UserProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName,  setLastName]  = useState(user?.lastName  ?? '');
  const [profileMsg, setProfileMsg] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [pwMsg,     setPwMsg]     = useState('');
  const [pwError,   setPwError]   = useState('');

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({ firstName, lastName }).then((r) => r.data),
    onSuccess: () => { setProfileMsg(t('settings.profile.saved')); setTimeout(() => setProfileMsg(''), 3000); },
  });

  const passwordMutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPw, newPw).then((r) => r.data),
    onSuccess: () => {
      setPwMsg(t('settings.profile.passwordSaved'));
      setCurrentPw(''); setNewPw('');
      setPwError('');
    },
    onError: () => { setPwError(t('settings.profile.passwordError')); },
  });

  return (
    <Box maxWidth={600}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={3}>
        <AccountCircleIcon sx={{ fontSize: 32, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('settings.profile.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('settings.profile.subtitle')}</Typography>
        </Box>
      </Stack>

      {/* Profile info */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>{t('settings.profile.title')}</Typography>
          {profileMsg && <Alert severity="success" sx={{ mb: 2 }}>{profileMsg}</Alert>}
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label={t('settings.profile.firstName')}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                fullWidth
              />
              <TextField
                label={t('settings.profile.lastName')}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                fullWidth
              />
            </Stack>
            <TextField
              label={t('settings.profile.email')}
              value={user?.email ?? ''}
              disabled
              fullWidth
              helperText="E-Mail kann nur vom Administrator geändert werden."
            />
            <Box textAlign="right">
              <Button
                variant="contained"
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending || !firstName}
              >
                {t('settings.company.saveChanges')}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Password change */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" mb={2}>
            <LockIcon fontSize="small" color="action" />
            <Typography variant="subtitle1" fontWeight={600}>{t('settings.profile.changePassword')}</Typography>
          </Stack>
          <Divider sx={{ mb: 2 }} />
          {pwMsg   && <Alert severity="success" sx={{ mb: 2 }}>{pwMsg}</Alert>}
          {pwError && <Alert severity="error"   sx={{ mb: 2 }}>{pwError}</Alert>}
          <Stack spacing={2}>
            <TextField
              label={t('settings.profile.currentPassword')}
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              fullWidth
            />
            <TextField
              label={t('settings.profile.newPassword')}
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              fullWidth
              inputProps={{ minLength: 8 }}
              helperText="Mindestens 8 Zeichen."
            />
            <Box textAlign="right">
              <Button
                variant="contained"
                color="warning"
                onClick={() => passwordMutation.mutate()}
                disabled={!currentPw || newPw.length < 8 || passwordMutation.isPending}
              >
                {t('settings.profile.changePassword')}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
