import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, Grid, TextField, Select, MenuItem,
  FormControl, InputLabel, Button, Alert, CircularProgress, Stack,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { accountsApi, type AccountType } from '../../../api/accounts';

const TAX_CODES = ['', 'UST19', 'UST7', 'UST0', 'VST19', 'VST7'];

export default function CreateAccountPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { t }    = useTranslation();

  const TYPES: { value: AccountType; label: string }[] = [
    { value: 'asset',     label: t('accounts.types.asset') },
    { value: 'liability', label: t('accounts.types.liability') },
    { value: 'equity',    label: t('accounts.types.equity') },
    { value: 'revenue',   label: t('accounts.types.revenue') },
    { value: 'expense',   label: t('accounts.types.expense') },
  ];

  const [form, setForm] = useState({ number: '', name: '', type: 'expense' as AccountType, subtype: '', taxCode: '', parentNumber: '', notes: '' });

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => accountsApi.create(form),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      navigate(`/erp/accounts/${res.data._id}`);
    },
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const errMsg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

  return (
    <Box maxWidth={700}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/accounts')} size="small">
          {t('accounts.title')}
        </Button>
        <Typography variant="h5" fontWeight={700} flex={1}>{t('accounts.newAccount')}</Typography>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => mutate()} disabled={isPending || !form.number || !form.name}>
          {isPending ? <CircularProgress size={18} color="inherit" /> : t('common.save')}
        </Button>
      </Stack>

      {errMsg && <Alert severity="error" sx={{ mb: 2 }}>{errMsg}</Alert>}

      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField
                label={`${t('accounts.accountNumber')} *`}
                value={form.number}
                onChange={(e) => set('number', e.target.value)}
                fullWidth size="small"
                placeholder="z.B. 4400"
                helperText="Eindeutig, 1–10 Zeichen"
              />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField
                label={`${t('accounts.accountName')} *`}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                fullWidth size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('common.type')} *</InputLabel>
                <Select value={form.type} onChange={(e) => set('type', e.target.value)} label={`${t('common.type')} *`}>
                  {TYPES.map((tp) => <MenuItem key={tp.value} value={tp.value}>{tp.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('accounts.subtype')}
                value={form.subtype}
                onChange={(e) => set('subtype', e.target.value)}
                fullWidth size="small"
                placeholder="z.B. operating, personnel, cogs"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('accounts.taxCode')}</InputLabel>
                <Select value={form.taxCode} onChange={(e) => set('taxCode', e.target.value)} label={t('accounts.taxCode')}>
                  {TAX_CODES.map((c) => <MenuItem key={c} value={c}>{c || '— keines —'}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('accounts.parentAccount')}
                value={form.parentNumber}
                onChange={(e) => set('parentNumber', e.target.value)}
                fullWidth size="small"
                placeholder={t('accounts.parentAccountHint')}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label={t('common.notes')}
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                fullWidth size="small"
                multiline rows={2}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
