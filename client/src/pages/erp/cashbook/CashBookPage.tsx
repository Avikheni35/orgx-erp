import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, Table,
  TableHead, TableBody, TableRow, TableCell, TablePagination,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Autocomplete, ToggleButton, ToggleButtonGroup,
  Select, MenuItem, FormControl, InputLabel, IconButton, Tooltip,
  DialogContentText, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import { useTranslation } from 'react-i18next';
import { cashbookApi, type CashBookEntry, type CashBookEntryCreate } from '../../../api/cashbook';
import { accountsApi } from '../../../api/accounts';

const COMMON_CASH_ACCOUNTS = ['1000'];
const VAT_OPTIONS = [0, 7, 19];

// Quick-pick presets for common internal expenses (SKR03 accounts)
const EXPENSE_PRESETS = [
  { label: 'Snacks / Getränke', labelEn: 'Snacks / Drinks',     account: '4650', vat: 19 },
  { label: 'Bewirtung',          labelEn: 'Catering / Meals',    account: '4650', vat: 19 },
  { label: 'Reparatur',          labelEn: 'Repairs',             account: '4800', vat: 19 },
  { label: 'Bürobedarf',         labelEn: 'Office supplies',     account: '4930', vat: 19 },
  { label: 'Porto / Versand',    labelEn: 'Postage / Shipping',  account: '4910', vat: 19 },
  { label: 'Reinigung',          labelEn: 'Cleaning',            account: '4800', vat: 19 },
  { label: 'Fahrtkosten',        labelEn: 'Travel costs',        account: '4670', vat:  0 },
  { label: 'Sonstiges',          labelEn: 'Other',               account: '4980', vat: 19 },
];

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function centsFromStr(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// ── New entry form ─────────────────────────────────────────────────────────────
function NewEntryDialog({
  open, onClose, onSaved, de, locale,
}: { open: boolean; onClose: () => void; onSaved: () => void; de: boolean; locale: string }) {
  const qc = useQueryClient();

  const [type,          setType]          = useState<'receipt' | 'payment'>('payment');
  const [date,          setDate]          = useState(() => new Date().toISOString().slice(0, 10));
  const [amountStr,     setAmountStr]     = useState('');
  const [vatRate,       setVatRate]       = useState(0);
  const [cashAccount,   setCashAccount]   = useState('1000');
  const [contraAccount, setContraAccount] = useState('');
  const [description,   setDescription]  = useState('');
  const [formError,     setFormError]     = useState('');

  const { data: acctData } = useQuery({ queryKey: ['accounts'], queryFn: () => accountsApi.list() });
  const accounts = useMemo(() => (acctData?.data?.accounts ?? []).filter(a => a.isActive), [acctData]);
  const cashAccounts = useMemo(
    () => accounts.filter(a => COMMON_CASH_ACCOUNTS.includes(a.number) || a.number.startsWith('10') || a.number.startsWith('12')),
    [accounts]
  );
  // Filter contra accounts by type: expense accounts for payments, revenue for receipts
  const contraAccounts = useMemo(
    () => accounts.filter(a => type === 'payment' ? a.type === 'expense' : a.type === 'revenue'),
    [accounts, type]
  );

  function applyPreset(preset: typeof EXPENSE_PRESETS[0]) {
    setContraAccount(preset.account);
    setVatRate(preset.vat);
    if (!description) setDescription(de ? preset.label : preset.labelEn);
  }

  const amountCents = centsFromStr(amountStr);
  const vatCents    = vatRate > 0 ? Math.round(amountCents * vatRate / (100 + vatRate)) : 0;
  const netCents    = amountCents - vatCents;

  const mutation = useMutation({
    mutationFn: (body: CashBookEntryCreate) => cashbookApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      onSaved();
      // reset
      setAmountStr(''); setDescription(''); setContraAccount('');
      setVatRate(0); setFormError('');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setFormError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function handleSave() {
    setFormError('');
    if (!date)            return setFormError(de ? 'Datum erforderlich.' : 'Date required.');
    if (amountCents < 1)  return setFormError(de ? 'Betrag > 0 erforderlich.' : 'Amount > 0 required.');
    if (!cashAccount)     return setFormError(de ? 'Kassenkonto erforderlich.' : 'Cash account required.');
    if (!contraAccount)   return setFormError(de ? 'Gegenkonto erforderlich.' : 'Contra account required.');
    if (!description)     return setFormError(de ? 'Text erforderlich.' : 'Description required.');
    mutation.mutate({ date, type, description, cashAccount, contraAccount, amountCents, vatRate });
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {de ? 'Kassenbucheintrag erfassen' : 'New cash book entry'}
      </DialogTitle>
      <DialogContent>
        <Stack gap={2.5} mt={1}>
          {/* Type toggle */}
          <ToggleButtonGroup exclusive value={type} onChange={(_, v) => { if (v) { setType(v); setContraAccount(''); } }} fullWidth size="small">
            <ToggleButton value="payment" color="error" sx={{ gap: 1 }}>
              <RemoveCircleOutlineIcon fontSize="small" />
              {de ? 'Ausgabe' : 'Payment'}
            </ToggleButton>
            <ToggleButton value="receipt" color="success" sx={{ gap: 1 }}>
              <AddCircleOutlineIcon fontSize="small" />
              {de ? 'Einnahme' : 'Receipt'}
            </ToggleButton>
          </ToggleButtonGroup>

          <Stack direction="row" gap={2}>
            <TextField
              label={de ? 'Datum' : 'Date'}
              type="date"
              size="small"
              value={date}
              onChange={e => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <TextField
              label={de ? 'Brutto (€)' : 'Gross (€)'}
              size="small"
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
              placeholder="0,00"
              sx={{ flex: 1 }}
            />
          </Stack>

          <Stack direction="row" gap={2}>
            <Autocomplete
              size="small"
              sx={{ flex: 1 }}
              options={cashAccounts}
              getOptionLabel={a => `${a.number} – ${a.name}`}
              value={cashAccounts.find(a => a.number === cashAccount) ?? null}
              onChange={(_, v) => setCashAccount(v?.number ?? '')}
              renderInput={(params) => (
                <TextField {...params} label={de ? 'Kassenkonto' : 'Cash account'} />
              )}
            />
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>{de ? 'MwSt.' : 'VAT'}</InputLabel>
              <Select value={vatRate} label={de ? 'MwSt.' : 'VAT'} onChange={e => setVatRate(Number(e.target.value))}>
                {VAT_OPTIONS.map(r => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          {/* Quick-pick presets — only for payments */}
          {type === 'payment' && (
            <Box>
              <Stack direction="row" alignItems="center" gap={0.5} mb={1}>
                <FlashOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary">
                  {de ? 'Schnellauswahl' : 'Quick pick'}
                </Typography>
              </Stack>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {EXPENSE_PRESETS.map((p) => (
                  <Chip
                    key={`${p.account}-${p.label}`}
                    label={de ? p.label : p.labelEn}
                    size="small"
                    variant={contraAccount === p.account && (de ? description === p.label : description === p.labelEn) ? 'filled' : 'outlined'}
                    color={contraAccount === p.account ? 'primary' : 'default'}
                    onClick={() => applyPreset(p)}
                    sx={{ cursor: 'pointer', fontSize: 11 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          <Autocomplete
            size="small"
            options={contraAccounts}
            getOptionLabel={a => `${a.number} – ${a.name}`}
            value={contraAccounts.find(a => a.number === contraAccount) ?? null}
            onChange={(_, v) => setContraAccount(v?.number ?? '')}
            renderInput={(params) => (
              <TextField {...params}
                label={type === 'payment'
                  ? (de ? 'Aufwandskonto (Gegenkonto)' : 'Expense account (contra)')
                  : (de ? 'Ertragskonto (Gegenkonto)' : 'Revenue account (contra)')}
              />
            )}
          />

          <TextField
            label={de ? 'Buchungstext / Beleg' : 'Description / reference'}
            size="small"
            value={description}
            onChange={e => setDescription(e.target.value)}
            multiline
            rows={2}
          />

          {/* VAT preview */}
          {vatRate > 0 && amountCents > 0 && (
            <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">{de ? 'Nettobetrag:' : 'Net amount:'}</Typography>
                <Typography variant="caption" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(netCents, locale)}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">MwSt. {vatRate}%:</Typography>
                <Typography variant="caption" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(vatCents, locale)}</Typography>
              </Stack>
              <Divider sx={{ my: 0.5 }} />
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" fontWeight={700}>{de ? 'Brutto:' : 'Gross:'}</Typography>
                <Typography variant="caption" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(amountCents, locale)}</Typography>
              </Stack>
            </Box>
          )}

          {formError && <Alert severity="error" sx={{ mt: 0 }}>{formError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{de ? 'Abbrechen' : 'Cancel'}</Button>
        <Button variant="contained" disabled={mutation.isPending} onClick={handleSave}>
          {mutation.isPending ? <CircularProgress size={18} /> : (de ? 'Buchen' : 'Post')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CashBookPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const qc       = useQueryClient();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const filterAccount = searchParams.get('account') ?? '1000';
  const from          = searchParams.get('from')    ?? '';
  const to            = searchParams.get('to')      ?? '';
  const page          = Number(searchParams.get('page') ?? 0);

  const setParam = (updates: Record<string, string>) =>
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k));
      return next;
    }, { replace: true });

  const [dialogOpen,   setDialogOpen]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CashBookEntry | null>(null);

  const { data: acctData } = useQuery({ queryKey: ['accounts'], queryFn: () => accountsApi.list() });
  const cashAccounts = useMemo(() => {
    const all = acctData?.data?.accounts ?? [];
    return all.filter(a => a.isActive && (a.number.startsWith('10') || a.number.startsWith('12')));
  }, [acctData]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cashbook', filterAccount, from, to, page],
    queryFn:  () => cashbookApi.list({
      cashAccount: filterAccount,
      from: from || undefined,
      to:   to   || undefined,
      page: page + 1,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cashbookApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cashbook'] });
      setDeleteTarget(null);
    },
  });

  const entries = data?.data?.entries ?? [];
  const total   = data?.data?.total   ?? 0;

  // Balance summary from current page
  const totalReceipts = entries.filter(e => e.type === 'receipt').reduce((s, e) => s + e.amountCents, 0);
  const totalPayments = entries.filter(e => e.type === 'payment').reduce((s, e) => s + e.amountCents, 0);
  const endBalance    = entries[entries.length - 1]?.runningBalance ?? 0;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <AccountBalanceWalletIcon color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>{de ? 'Kassenbuch' : 'Cash Book'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {de ? 'Bareinnahmen und -ausgaben — automatische Buchungssatzerstellung' : 'Cash receipts and payments — auto-posts journal entries'}
            </Typography>
          </Box>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          {de ? 'Neuer Eintrag' : 'New entry'}
        </Button>
      </Stack>

      {/* Summary cards */}
      {entries.length > 0 && (
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} mb={2}>
          <Card sx={{ flex: 1 }}>
            <CardContent sx={{ py: '12px !important' }}>
              <Typography variant="caption" color="text.secondary">{de ? 'Einnahmen (Seite)' : 'Receipts (page)'}</Typography>
              <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                + {fmtCents(totalReceipts, locale)}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}>
            <CardContent sx={{ py: '12px !important' }}>
              <Typography variant="caption" color="text.secondary">{de ? 'Ausgaben (Seite)' : 'Payments (page)'}</Typography>
              <Typography variant="h6" fontWeight={700} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                − {fmtCents(totalPayments, locale)}
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
            <CardContent sx={{ py: '12px !important' }}>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>{de ? 'Kassenstand (Ende)' : 'Closing balance'}</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtCents(endBalance, locale)}
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      )}

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{de ? 'Konto' : 'Account'}</InputLabel>
          <Select value={filterAccount} label={de ? 'Konto' : 'Account'}
            onChange={e => setParam({ account: e.target.value, page: '' })}>
            {cashAccounts.map(a => <MenuItem key={a.number} value={a.number}>{a.number} – {a.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size="small" type="date" label={de ? 'Von' : 'From'}
          InputLabelProps={{ shrink: true }} value={from}
          onChange={e => setParam({ from: e.target.value, page: '' })} />
        <TextField size="small" type="date" label={de ? 'Bis' : 'To'}
          InputLabelProps={{ shrink: true }} value={to}
          onChange={e => setParam({ to: e.target.value, page: '' })} />
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 100 }}>{de ? 'Nr.' : 'No.'}</TableCell>
                  <TableCell sx={{ width: 100 }}>{de ? 'Datum' : 'Date'}</TableCell>
                  <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                  <TableCell>{de ? 'Text' : 'Description'}</TableCell>
                  <TableCell>{de ? 'Kassenkonto' : 'Cash acct'}</TableCell>
                  <TableCell>{de ? 'Gegenkonto' : 'Contra'}</TableCell>
                  <TableCell align="right">{de ? 'Ausgabe' : 'Payment'}</TableCell>
                  <TableCell align="right">{de ? 'Einnahme' : 'Receipt'}</TableCell>
                  <TableCell align="right">{de ? 'Kassenstand' : 'Balance'}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                      {de ? 'Keine Einträge vorhanden.' : 'No entries found.'}
                    </TableCell>
                  </TableRow>
                )}
                {entries.map(e => (
                  <TableRow
                    key={e._id}
                    hover
                    sx={{ cursor: e.journalEntryId ? 'pointer' : 'default' }}
                    onClick={() => e.journalEntryId && navigate(`/erp/buchfuehrung/${e.journalEntryId}`)}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.entryNumber}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleDateString(locale)}</TableCell>
                    <TableCell>
                      {e.type === 'receipt' ? (
                        <Chip size="small" icon={<AddCircleOutlineIcon />} label={de ? 'Einnahme' : 'Receipt'} color="success" variant="outlined" />
                      ) : (
                        <Chip size="small" icon={<RemoveCircleOutlineIcon />} label={de ? 'Ausgabe' : 'Payment'} color="error" variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.description}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {e.cashAccount}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {e.contraAccount}
                      {e.vatRate > 0 && (
                        <Chip size="small" label={`${e.vatRate}%`} sx={{ ml: 0.5, height: 16, fontSize: 10 }} />
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'error.main' }}>
                      {e.type === 'payment' ? fmtCents(e.amountCents, locale) : ''}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'success.main' }}>
                      {e.type === 'receipt' ? fmtCents(e.amountCents, locale) : ''}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                      color: (e.runningBalance ?? 0) < 0 ? 'error.main' : 'inherit' }}>
                      {e.runningBalance !== undefined ? fmtCents(e.runningBalance, locale) : '—'}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={de ? 'Stornieren' : 'Void'}>
                        <IconButton size="small" color="error" onClick={ev => { ev.stopPropagation(); setDeleteTarget(e); }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={100}
            rowsPerPageOptions={[100]}
            onPageChange={(_, p) => setParam({ page: String(p) })}
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} ${de ? 'von' : 'of'} ${count}`}
          />
        </>
      )}

      {/* New entry dialog */}
      <NewEntryDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => setDialogOpen(false)}
        de={de}
        locale={locale}
      />

      {/* Void confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{de ? 'Eintrag stornieren?' : 'Void entry?'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {de
              ? `${deleteTarget?.entryNumber} wird storniert und der Buchungssatz umgekehrt.`
              : `${deleteTarget?.entryNumber} will be voided and its journal entry reversed.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button color="error" variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget._id)}>
            {de ? 'Stornieren' : 'Void'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
