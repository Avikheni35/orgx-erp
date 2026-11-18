import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, TextField, Button, Paper,
  ToggleButtonGroup, ToggleButton, Select, MenuItem, FormControl,
  InputLabel, Alert, CircularProgress, Divider, Chip, Skeleton,
} from '@mui/material';
import TrendingUpIcon    from '@mui/icons-material/TrendingUp';
import TrendingDownIcon  from '@mui/icons-material/TrendingDown';
import MoneyIcon         from '@mui/icons-material/Money';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { cashbookApi, type CashEntryType, type CashBookEntryCreate } from '../../api/cashbook';
import { bankAccountsApi } from '../../api/bankAccounts';
import { useTranslation } from 'react-i18next';

const MONO = '"JetBrains Mono", "Courier New", monospace';

function fmtCents(cents: number, locale = 'de-DE') {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}
function fmtTime(iso: string, locale = 'de-DE') {
  return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}
function isToday(iso: string) {
  const d = new Date(iso), t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export default function OpsCashPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const qc       = useQueryClient();

  const [entryType,   setEntryType]   = useState<CashEntryType>('receipt');
  const [cashAcct,    setCashAcct]    = useState('1000');
  const [amount,      setAmount]      = useState('');
  const [description, setDescription] = useState('');
  const [errMsg,      setErrMsg]      = useState('');
  const [okMsg,       setOkMsg]       = useState('');

  /* ── data ─────────────────────────────────────────────────────────────────── */
  const { data: cashData, isLoading: cashLoading } = useQuery({
    queryKey: ['ops-cashbook'],
    queryFn:  () => cashbookApi.list({ limit: 50 }),
    refetchInterval: 60_000,
  });
  const entries = cashData?.data?.entries ?? [];

  const cashBal = entries.reduce((s, e) => {
    if (e.cashAccount !== '1000') return s;
    return e.type === 'receipt' ? s + e.amountCents : s - e.amountCents;
  }, 0);

  const todayStats = useMemo(() => {
    const todayEntries = entries.filter(e => isToday(e.date));
    const receipts = todayEntries.filter(e => e.type === 'receipt').reduce((s, e) => s + e.amountCents, 0);
    const payments = todayEntries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amountCents, 0);
    return { receipts, payments, count: todayEntries.length };
  }, [entries]);

  const { data: bankData } = useQuery({
    queryKey: ['ops-banks'],
    queryFn:  () => bankAccountsApi.list({ isActive: true }),
    refetchInterval: 120_000,
  });
  const banks = bankData?.data?.accounts ?? [];

  /* ── mutation ─────────────────────────────────────────────────────────────── */
  const mutation = useMutation({
    mutationFn: () => {
      const cents = Math.round(parseFloat(amount.replace(',', '.')) * 100);
      if (!cents || cents <= 0) throw new Error('invalid amount');
      const body: CashBookEntryCreate = {
        date:          new Date().toISOString().slice(0, 10),
        type:          entryType,
        description,
        cashAccount:   cashAcct,
        contraAccount: entryType === 'receipt' ? '8400' : '4980',
        amountCents:   cents,
        vatRate:       0,
      };
      return cashbookApi.create(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ops-cashbook'] });
      setAmount(''); setDescription('');
      setOkMsg(de ? 'Eintrag gespeichert.' : 'Entry saved.');
      setErrMsg('');
      setTimeout(() => setOkMsg(''), 3000);
    },
    onError: (err: Error) => {
      setErrMsg(
        err.message === 'invalid amount'
          ? (de ? 'Bitte gültigen Betrag eingeben.' : 'Enter a valid amount.')
          : (de ? 'Fehler beim Speichern.' : 'Failed to save.'),
      );
    },
  });

  const balColor = cashBal > 0 ? 'success.main' : cashBal < 0 ? 'error.main' : 'text.primary';

  /* ── render ───────────────────────────────────────────────────────────────── */
  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
    <Box sx={{ maxWidth: 680, mx: 'auto' }}>

      {/* balance cards */}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} mb={3}>

        {/* cash balance hero */}
        <Paper elevation={3} sx={{ flex: 1.4, borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{
            px: 2.5, py: 2.5,
            background: cashBal > 0
              ? 'linear-gradient(135deg, rgba(76,175,80,0.06) 0%, transparent 100%)'
              : cashBal < 0
                ? 'linear-gradient(135deg, rgba(211,47,47,0.06) 0%, transparent 100%)'
                : 'transparent',
            borderTop: `3px solid`,
            borderColor: cashBal > 0 ? 'success.main' : cashBal < 0 ? 'error.main' : 'divider',
          }}>
            <Stack direction="row" alignItems="center" gap={0.75} mb={1.25}>
              <MoneyIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'text.secondary' }}>
                {de ? 'Kassenbestand' : 'Cash on hand'}
              </Typography>
            </Stack>
            {cashLoading
              ? <Skeleton width={140} height={44} />
              : (
                <Typography sx={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: balColor, lineHeight: 1.1 }}>
                  {fmtCents(cashBal, locale)}
                </Typography>
              )
            }
            {!cashLoading && todayStats.count > 0 && (
              <Stack direction="row" gap={1} mt={1.5}>
                <Chip
                  icon={<TrendingUpIcon sx={{ fontSize: '13px !important' }} />}
                  label={fmtCents(todayStats.receipts, locale)}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', height: 22 }}
                />
                {todayStats.payments > 0 && (
                  <Chip
                    icon={<TrendingDownIcon sx={{ fontSize: '13px !important' }} />}
                    label={fmtCents(todayStats.payments, locale)}
                    size="small"
                    color="error"
                    variant="outlined"
                    sx={{ fontFamily: MONO, fontSize: 11, fontVariantNumeric: 'tabular-nums', height: 22 }}
                  />
                )}
              </Stack>
            )}
          </Box>
        </Paper>

        {/* bank accounts */}
        {banks.map(b => (
          <Paper key={b._id} elevation={2} sx={{ flex: 1, borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 2 }}>
              <Stack direction="row" alignItems="center" gap={0.75} mb={1}>
                <AccountBalanceIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10, fontWeight: 600, color: 'text.secondary' }} noWrap>
                  {b.accountName}
                </Typography>
              </Stack>
              <Typography sx={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: 'text.disabled' }}>—</Typography>
            </Box>
          </Paper>
        ))}
      </Stack>

      {/* quick entry form */}
      <Paper elevation={3} sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'text.secondary' }}>
            {de ? 'Schnelleintrag' : 'Quick entry'}
          </Typography>
        </Box>
        <Box sx={{ p: 2 }}>
          {okMsg  && <Alert severity="success" sx={{ mb: 1.5, borderRadius: 1.5 }} onClose={() => setOkMsg('')}>{okMsg}</Alert>}
          {errMsg && <Alert severity="error"   sx={{ mb: 1.5, borderRadius: 1.5 }} onClose={() => setErrMsg('')}>{errMsg}</Alert>}

          <ToggleButtonGroup
            value={entryType}
            exclusive
            onChange={(_, v) => { if (v) setEntryType(v); }}
            fullWidth
            sx={{ mb: 2.5 }}
          >
            <ToggleButton value="receipt" sx={{
              gap: 1, py: 1.75, fontWeight: 700, fontSize: 14,
              '&.Mui-selected': { bgcolor: 'success.main', color: '#fff', '&:hover': { bgcolor: 'success.dark' } },
            }}>
              <TrendingUpIcon />
              {de ? 'Einnahme' : 'Income'}
            </ToggleButton>
            <ToggleButton value="payment" sx={{
              gap: 1, py: 1.75, fontWeight: 700, fontSize: 14,
              '&.Mui-selected': { bgcolor: 'error.main', color: '#fff', '&:hover': { bgcolor: 'error.dark' } },
            }}>
              <TrendingDownIcon />
              {de ? 'Ausgabe' : 'Expense'}
            </ToggleButton>
          </ToggleButtonGroup>

          {/* amount — large, prominent */}
          <TextField
            fullWidth
            label={de ? 'Betrag (€)' : 'Amount (€)'}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0,00"
            inputProps={{ inputMode: 'decimal', style: { fontFamily: MONO, fontSize: 28, fontWeight: 700 } }}
            sx={{ mb: 2 }}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{de ? 'Konto' : 'Account'}</InputLabel>
              <Select value={cashAcct} label={de ? 'Konto' : 'Account'} onChange={e => setCashAcct(e.target.value)}>
                <MenuItem value="1000">{de ? 'Kasse (1000)' : 'Cash (1000)'}</MenuItem>
                {banks.map(b => (
                  <MenuItem key={b._id} value={b.glAccount}>{b.accountName} ({b.glAccount})</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label={de ? 'Beschreibung' : 'Description'}
              value={description}
              onChange={e => setDescription(e.target.value)}
              sx={{ flex: 1 }}
              onKeyDown={e => { if (e.key === 'Enter' && amount && description) mutation.mutate(); }}
            />

            <Button
              variant="contained"
              size="large"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !amount || !description}
              startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{
                minWidth: 100, fontWeight: 700, py: 1.5, borderRadius: 1.5,
                bgcolor: entryType === 'receipt' ? 'success.main' : 'error.main',
                '&:hover': { bgcolor: entryType === 'receipt' ? 'success.dark' : 'error.dark' },
              }}
            >
              {de ? 'Buchen' : 'Post'}
            </Button>
          </Stack>
        </Box>
      </Paper>

      {/* recent entries */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
        <Typography sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: 600, color: 'text.secondary' }}>
          {de ? 'Letzte Einträge' : 'Recent entries'}
        </Typography>
        {entries.length > 0 && (
          <Typography sx={{ fontFamily: MONO, fontSize: 11, color: 'text.disabled' }}>
            {entries.length} {de ? 'Einträge' : 'entries'}
          </Typography>
        )}
      </Box>

      <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {cashLoading ? (
          <Box sx={{ p: 2.5 }}><CircularProgress size={20} /></Box>
        ) : entries.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography variant="body2">{de ? 'Noch keine Einträge.' : 'No entries yet.'}</Typography>
          </Box>
        ) : (
          entries.map((e, idx) => (
            <Box key={e._id}>
              {idx > 0 && <Divider />}
              <Stack direction="row" alignItems="center" gap={1.5} sx={{
                px: 2, py: 1.5,
                borderLeft: '3px solid',
                borderColor: e.type === 'receipt' ? 'success.main' : 'error.main',
                transition: 'background 0.1s',
                '&:hover': { bgcolor: 'action.hover' },
              }}>
                {e.type === 'receipt'
                  ? <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main', flexShrink: 0 }} />
                  : <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main', flexShrink: 0 }} />
                }
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap fontWeight={500}>{e.description}</Typography>
                  <Typography sx={{ fontFamily: MONO, fontSize: 10, color: 'text.disabled' }}>
                    {isToday(e.date) ? fmtTime(e.date, locale) : new Date(e.date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })}
                    {' · '}{e.cashAccountName}
                  </Typography>
                </Box>
                <Typography sx={{
                  fontFamily: MONO, fontWeight: 700, fontSize: 15,
                  fontVariantNumeric: 'tabular-nums',
                  color: e.type === 'receipt' ? 'success.main' : 'error.main',
                  flexShrink: 0,
                }}>
                  {e.type === 'payment' ? '−' : '+'}{fmtCents(e.amountCents, locale)}
                </Typography>
              </Stack>
            </Box>
          ))
        )}
      </Paper>
    </Box>
    </Box>
  );
}
