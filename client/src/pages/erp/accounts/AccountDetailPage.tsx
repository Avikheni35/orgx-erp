import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, Grid, TextField, Select, MenuItem,
  FormControl, InputLabel, Button, Alert, CircularProgress, Stack, Chip,
  Divider, Table, TableHead, TableBody, TableRow, TableCell, Tabs, Tab,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useTranslation } from 'react-i18next';
import { accountsApi, type AccountType } from '../../../api/accounts';
import { journalApi } from '../../../api/journal';

const TYPE_COLORS: Record<AccountType, 'info' | 'error' | 'success' | 'warning' | 'default'> = {
  asset: 'info', liability: 'error', equity: 'success', revenue: 'warning', expense: 'default',
};
const TAX_CODES = ['', 'UST19', 'UST7', 'UST0', 'VST19', 'VST7'];

export default function AccountDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';

  const TYPE_LABELS: Record<AccountType, string> = {
    asset: t('accounts.types.asset'),
    liability: t('accounts.types.liability'),
    equity: t('accounts.types.equity'),
    revenue: t('accounts.types.revenue'),
    expense: t('accounts.types.expense'),
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = Number(searchParams.get('tab') ?? 0);
  const setTab = (v: number) => setSearchParams({ tab: String(v) }, { replace: true });
  const [editing, setEditing] = useState(false);
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerTo,   setLedgerTo]   = useState('');
  const [form, setForm]       = useState<{ name: string; subtype: string; taxCode: string; parentNumber: string; notes: string }>({
    name: '', subtype: '', taxCode: '', parentNumber: '', notes: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['account', id],
    queryFn: () => accountsApi.get(id!),
    enabled: !!id,
  });
  const account = data?.data;

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['account-ledger', account?.number, ledgerFrom, ledgerTo],
    queryFn: () => journalApi.ledger(account!.number, {
      from: ledgerFrom || undefined,
      to:   ledgerTo   || undefined,
    }),
    enabled: !!account?.number,
  });

  const startEdit = () => {
    if (!account) return;
    setForm({ name: account.name, subtype: account.subtype, taxCode: account.taxCode, parentNumber: account.parentNumber, notes: account.notes });
    setEditing(true);
  };

  const { mutate: save, isPending: saving, error } = useMutation({
    mutationFn: () => accountsApi.update(id!, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account', id] }); qc.invalidateQueries({ queryKey: ['accounts'] }); setEditing(false); },
  });

  const { mutate: deactivate } = useMutation({
    mutationFn: () => accountsApi.deactivate(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account', id] }); qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });
  const { mutate: reactivate } = useMutation({
    mutationFn: () => accountsApi.reactivate(id!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['account', id] }); qc.invalidateQueries({ queryKey: ['accounts'] }); },
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const errMsg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;

  if (isLoading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!account)  return <Alert severity="error">{t('common.noData')}</Alert>;

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/accounts')} size="small">
          {t('accounts.title')}
        </Button>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>{account.number} · {account.name}</Typography>
          <Stack direction="row" gap={1} mt={0.5}>
            <Chip label={TYPE_LABELS[account.type]} color={TYPE_COLORS[account.type]} size="small" />
            <Chip label={account.isActive ? t('common.active') : t('common.inactive')} size="small" color={account.isActive ? 'success' : 'default'} />
            {account.isLocked && <Chip label={t('common.locked')} size="small" color="error" />}
            {account.taxCode && <Chip label={account.taxCode} size="small" variant="outlined" />}
          </Stack>
        </Box>
      </Stack>

      {errMsg && <Alert severity="error" sx={{ mb: 2 }}>{errMsg}</Alert>}

      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label={t('accounts.accountMasterData')} />
          <Tab label={`${t('accounts.ledger')} (${ledgerData?.data?.ledger?.length ?? 0})`} />
        </Tabs>

        {/* ── Tab 0: Master data ─────────────────────────────────────────── */}
        {tab === 0 && (
          <CardContent>
            <Stack direction="row" justifyContent="flex-end" gap={1} mb={2}>
              {!account.isLocked && (
                <>
                  {!editing ? (
                    <Button variant="outlined" size="small" onClick={startEdit}>{t('common.edit')}</Button>
                  ) : (
                    <>
                      <Button size="small" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
                      <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={() => save()} disabled={saving}>
                        {saving ? <CircularProgress size={16} color="inherit" /> : t('common.save')}
                      </Button>
                    </>
                  )}
                  {account.isActive ? (
                    <Button color="warning" size="small" startIcon={<PauseIcon />} onClick={() => deactivate()}>{t('common.deactivate')}</Button>
                  ) : (
                    <Button color="success" size="small" startIcon={<PlayArrowIcon />} onClick={() => reactivate()}>{t('common.reactivate')}</Button>
                  )}
                </>
              )}
            </Stack>

            {!editing ? (
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">{t('common.number')}</Typography><Typography fontWeight={600} fontFamily="monospace">{account.number}</Typography></Grid>
                <Grid item xs={6} sm={5}><Typography variant="caption" color="text.secondary">{t('accounts.accountName')}</Typography><Typography>{account.name}</Typography></Grid>
                <Grid item xs={6} sm={4}><Typography variant="caption" color="text.secondary">{t('accounts.subtype')}</Typography><Typography>{account.subtype || '—'}</Typography></Grid>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">{t('accounts.taxCode')}</Typography><Typography>{account.taxCode || '—'}</Typography></Grid>
                <Grid item xs={6} sm={3}><Typography variant="caption" color="text.secondary">{t('accounts.parentAccount')}</Typography><Typography>{account.parentNumber || '—'}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="caption" color="text.secondary">{t('common.notes')}</Typography><Typography>{account.notes || '—'}</Typography></Grid>
              </Grid>
            ) : (
              <Grid container spacing={2}>
                <Grid item xs={12} sm={8}>
                  <TextField label={t('accounts.accountName')} value={form.name} onChange={(e) => set('name', e.target.value)} fullWidth size="small" />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField label={t('accounts.subtype')} value={form.subtype} onChange={(e) => set('subtype', e.target.value)} fullWidth size="small" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('accounts.taxCode')}</InputLabel>
                    <Select value={form.taxCode} onChange={(e) => set('taxCode', e.target.value)} label={t('accounts.taxCode')}>
                      {TAX_CODES.map((c) => <MenuItem key={c} value={c}>{c || (de ? '— keines —' : '— none —')}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField label={t('accounts.parentAccount')} value={form.parentNumber} onChange={(e) => set('parentNumber', e.target.value)} fullWidth size="small" placeholder={t('accounts.parentAccountHint')} />
                </Grid>
                <Grid item xs={12}>
                  <TextField label={t('common.notes')} value={form.notes} onChange={(e) => set('notes', e.target.value)} fullWidth size="small" multiline rows={2} />
                </Grid>
              </Grid>
            )}
          </CardContent>
        )}

        {/* ── Tab 1: Ledger ──────────────────────────────────────────────── */}
        {tab === 1 && (
          <CardContent>
            {(() => {
              const rows = ledgerData?.data?.ledger ?? [];
              const finalBalance   = ledgerData?.data?.finalBalance   ?? 0;
              const openingBalance = ledgerData?.data?.openingBalance ?? 0;
              const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
              const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
              const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';
              const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
              const de = i18n.language === 'de';

              return (
                <>
                  {/* Summary strip */}
                  <Grid container spacing={2} mb={2}>
                    {[
                      ...(ledgerFrom ? [[de ? 'Eröffnungssaldo' : 'Opening balance', fmt(Math.abs(openingBalance))]] : []),
                      [t('accounts.debitCumulated'),  fmt(totalDebit)],
                      [t('accounts.creditCumulated'), fmt(totalCredit)],
                      [de ? 'Schlusssaldo' : 'Closing balance', fmt(Math.abs(finalBalance))],
                      [t('accounts.postings'),        String(rows.length)],
                    ].map(([label, val]) => (
                      <Grid item xs={6} sm={3} key={label}>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                        <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{val}</Typography>
                      </Grid>
                    ))}
                  </Grid>

                  <Divider sx={{ mb: 2 }} />

                  {/* Date filter */}
                  <Stack direction="row" gap={1} alignItems="center" mb={2} flexWrap="wrap">
                    <TextField
                      type="date" size="small" label={de ? 'Von' : 'From'}
                      value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)}
                      InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
                    />
                    <TextField
                      type="date" size="small" label={de ? 'Bis' : 'To'}
                      value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)}
                      InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
                    />
                    {(ledgerFrom || ledgerTo) && (
                      <Button size="small" onClick={() => { setLedgerFrom(''); setLedgerTo(''); }}>
                        {de ? 'Zurücksetzen' : 'Reset'}
                      </Button>
                    )}
                  </Stack>

                  {/* Transactions */}
                  {ledgerLoading ? (
                    <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
                  ) : rows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                      {de ? 'Keine Buchungen auf diesem Konto.' : 'No postings on this account.'}
                    </Typography>
                  ) : (
                    <Box sx={{ overflowX: 'auto' }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                            <TableCell>{de ? 'Beleg' : 'Entry'}</TableCell>
                            <TableCell>{de ? 'Text' : 'Description'}</TableCell>
                            <TableCell align="right">{de ? 'Soll' : 'Debit'}</TableCell>
                            <TableCell align="right">{de ? 'Haben' : 'Credit'}</TableCell>
                            <TableCell align="right">{de ? 'Saldo' : 'Balance'}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {ledgerFrom && (
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                              <TableCell colSpan={4}>
                                <Typography variant="caption" fontWeight={700} color="text.secondary">
                                  {de ? 'Eröffnungssaldo' : 'Opening balance'}
                                </Typography>
                              </TableCell>
                              <TableCell colSpan={2} align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                <Typography variant="caption" fontWeight={700}>
                                  {fmt(Math.abs(openingBalance))}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                          {[...rows].reverse().map((row, i) => (
                            <TableRow
                              key={i}
                              hover
                              onClick={() => navigate(`/erp/buchfuehrung/${row.entryId}`)}
                              sx={{ cursor: 'pointer' }}
                            >
                              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                                <Typography variant="caption">{new Date(row.date).toLocaleDateString(locale)}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" fontFamily="monospace">{row.entryNumber}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" color="text.secondary">{row.description}</Typography>
                                {row.reference && <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>({row.reference})</Typography>}
                              </TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                <Typography variant="caption" color={row.debit > 0 ? 'text.primary' : 'text.disabled'}>
                                  {row.debit > 0 ? fmt(row.debit) : '—'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                <Typography variant="caption" color={row.credit > 0 ? 'text.primary' : 'text.disabled'}>
                                  {row.credit > 0 ? fmt(row.credit) : '—'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                <Typography variant="caption" fontWeight={600} color={row.balance < 0 ? 'error.main' : 'text.primary'}>
                                  {fmt(Math.abs(row.balance))}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Box>
                  )}
                </>
              );
            })()}
          </CardContent>
        )}
      </Card>
    </Box>
  );
}
