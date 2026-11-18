import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
  TextField, FormControl, InputLabel,
  Select, MenuItem, IconButton, Tooltip, Alert, CircularProgress, Table,
  TableHead, TableBody, TableRow, TableCell, Tabs, Tab, Autocomplete,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useTranslation } from 'react-i18next';
import { cashbookApi, type CashBookEntry } from '../../../api/cashbook';
import { accountsApi, type Account } from '../../../api/accounts';

const PAYMENT_METHODS = [
  { value: '1000', label: 'Kasse (Bar)',    labelEn: 'Cash (Petty cash)' },
  { value: '1200', label: 'Bank',           labelEn: 'Bank' },
];


function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function centsFromStr(s: string) {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100);
}
function thisMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { from, to };
}

// ── Entry form dialog ─────────────────────────────────────────────────────────
function EntryDialog({
  open, mode, onClose, onSaved, de, locale,
}: {
  open: boolean;
  mode: 'expense' | 'income';
  onClose: () => void;
  onSaved: () => void;
  de: boolean;
  locale: string;
}) {
  const qc = useQueryClient();
  const isExpense = mode === 'expense';

  const [contraAccount, setContraAccount] = useState<Account | null>(null);
  const [date,          setDate]          = useState(() => new Date().toISOString().slice(0, 10));
  const [amountStr,     setAmountStr]     = useState('');
  const [description,   setDescription]   = useState('');
  const [payMethod,     setPayMethod]     = useState('1000');
  const [vatRate,       setVatRate]       = useState(19);
  const [formError,     setFormError]     = useState('');

  const accountType = isExpense ? 'expense' : 'revenue';
  const { data: acctData } = useQuery({
    queryKey: ['accounts-for-dialog', accountType],
    queryFn: () => accountsApi.list({ type: accountType, active: 'true' }),
  });
  const accounts = acctData?.data?.accounts ?? [];

  const amountCents = centsFromStr(amountStr);
  const vatCents    = vatRate > 0 ? Math.round(amountCents * vatRate / (100 + vatRate)) : 0;
  const netCents    = amountCents - vatCents;

  const mutation = useMutation({
    mutationFn: () => cashbookApi.create({
      date,
      type:          isExpense ? 'payment' : 'receipt',
      description:   description || (contraAccount ? `${contraAccount.number} ${contraAccount.name}` : ''),
      cashAccount:   payMethod,
      contraAccount: contraAccount!.number,
      amountCents,
      vatRate,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      onSaved();
      setAmountStr(''); setDescription(''); setFormError('');
      setContraAccount(null); setVatRate(19);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setFormError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function handleSave() {
    setFormError('');
    if (!contraAccount)  return setFormError(de ? 'Konto auswählen.' : 'Select an account.');
    if (amountCents < 1) return setFormError(de ? 'Betrag > 0 erforderlich.' : 'Amount > 0 required.');
    if (!date)           return setFormError(de ? 'Datum erforderlich.' : 'Date required.');
    mutation.mutate();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          {isExpense ? <TrendingDownIcon color="error" /> : <TrendingUpIcon color="success" />}
          {isExpense
            ? (de ? 'Ausgabe erfassen' : 'Record Expense')
            : (de ? 'Einnahme erfassen' : 'Record Income')}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack gap={2.5} mt={0.5}>

          {/* Account autocomplete */}
          <Autocomplete
            options={accounts}
            value={contraAccount}
            onChange={(_, v) => setContraAccount(v)}
            getOptionLabel={(a) => `${a.number} – ${a.name}`}
            isOptionEqualToValue={(a, b) => a._id === b._id}
            renderInput={(params) => (
              <TextField
                {...params}
                label={de ? 'Konto' : 'Account'}
                size="small"
                placeholder={de ? 'Kontonummer oder Name suchen…' : 'Search account number or name…'}
              />
            )}
            renderOption={(props, a) => (
              <li {...props} key={a._id}>
                <Stack>
                  <Typography variant="body2" fontFamily="monospace">{a.number}</Typography>
                  <Typography variant="caption" color="text.secondary">{a.name}</Typography>
                </Stack>
              </li>
            )}
          />

          {/* Amount + Date */}
          <Stack direction="row" gap={2}>
            <TextField
              label={de ? 'Brutto (€)' : 'Gross (€)'}
              size="small"
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
              placeholder="0,00"
              sx={{ flex: 1 }}
              autoFocus
            />
            <TextField
              label={de ? 'Datum' : 'Date'}
              type="date"
              size="small"
              value={date}
              onChange={e => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>

          {/* Description */}
          <TextField
            label={de ? 'Beschreibung (optional)' : 'Description (optional)'}
            size="small"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={contraAccount ? `${contraAccount.number} ${contraAccount.name}` : ''}
          />

          {/* Payment method + VAT */}
          <Stack direction="row" gap={2}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>{de ? 'Zahlungsweg' : 'Pay via'}</InputLabel>
              <Select value={payMethod} label={de ? 'Zahlungsweg' : 'Pay via'} onChange={e => setPayMethod(e.target.value)}>
                {PAYMENT_METHODS.map(m => (
                  <MenuItem key={m.value} value={m.value}>{de ? m.label : m.labelEn}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <InputLabel>{de ? 'MwSt.' : 'VAT'}</InputLabel>
              <Select value={vatRate} label={de ? 'MwSt.' : 'VAT'} onChange={e => setVatRate(Number(e.target.value))}>
                {[0, 7, 19].map(r => <MenuItem key={r} value={r}>{r} %</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          {/* VAT breakdown */}
          {vatRate > 0 && amountCents > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">{de ? 'Netto:' : 'Net:'}</Typography>
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

          {formError && <Alert severity="error">{formError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{de ? 'Abbrechen' : 'Cancel'}</Button>
        <Button
          variant="contained"
          color={isExpense ? 'error' : 'success'}
          disabled={mutation.isPending}
          onClick={handleSave}
        >
          {mutation.isPending
            ? <CircularProgress size={18} color="inherit" />
            : (de ? 'Buchen' : 'Post')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';
  const qc     = useQueryClient();

  const [tab,          setTab]          = useState(0); // 0=all, 1=expenses, 2=income
  const [dialogMode,   setDialogMode]   = useState<'expense' | 'income' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CashBookEntry | null>(null);
  const [from, setFrom] = useState(() => thisMonthRange().from);
  const [to,   setTo]   = useState(() => thisMonthRange().to);
  const [page, setPage] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['expenses', from, to, page],
    queryFn:  () => cashbookApi.list({ from: from || undefined, to: to || undefined, page: page + 1, limit: 100 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cashbookApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setDeleteTarget(null); },
  });

  const allEntries = data?.data?.entries ?? [];

  const expenses = allEntries.filter(e => e.type === 'payment');
  const incomes  = allEntries.filter(e => e.type === 'receipt');

  const totalExpenses = expenses.reduce((s, e) => s + e.amountCents, 0);
  const totalIncome   = incomes.reduce((s,  e) => s + e.amountCents, 0);
  const netCents      = totalIncome - totalExpenses;

  const visibleEntries = useMemo(() => {
    if (tab === 1) return expenses;
    if (tab === 2) return incomes;
    return [...allEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [tab, allEntries, expenses, incomes]);

  return (
    <Box>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}>
        <Stack direction="row" alignItems="center" gap={1}>
          <ReceiptLongIcon color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>
              {de ? 'Ausgaben & Einnahmen' : 'Expenses & Income'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {de ? 'Betriebsausgaben und sonstige Einnahmen erfassen' : 'Record business expenses and miscellaneous income'}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" color="success" startIcon={<TrendingUpIcon />} onClick={() => setDialogMode('income')}>
            {de ? 'Einnahme' : 'Add Income'}
          </Button>
          <Button variant="contained" color="error" startIcon={<TrendingDownIcon />} onClick={() => setDialogMode('expense')}>
            {de ? 'Ausgabe' : 'Add Expense'}
          </Button>
        </Stack>
      </Stack>

      {/* Summary cards */}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: '14px !important' }}>
            <Typography variant="caption" color="text.secondary">{de ? 'Ausgaben' : 'Expenses'}</Typography>
            <Typography variant="h5" fontWeight={700} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              − {fmtCents(totalExpenses, locale)}
            </Typography>
            <Typography variant="caption" color="text.secondary">{expenses.length} {de ? 'Buchungen' : 'entries'}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: '14px !important' }}>
            <Typography variant="caption" color="text.secondary">{de ? 'Einnahmen' : 'Income'}</Typography>
            <Typography variant="h5" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              + {fmtCents(totalIncome, locale)}
            </Typography>
            <Typography variant="caption" color="text.secondary">{incomes.length} {de ? 'Buchungen' : 'entries'}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, bgcolor: netCents >= 0 ? 'success.main' : 'error.main', color: '#fff' }}>
          <CardContent sx={{ py: '14px !important' }}>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>{de ? 'Netto (Zeitraum)' : 'Net (period)'}</Typography>
            <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {netCents >= 0 ? '+' : '−'} {fmtCents(Math.abs(netCents), locale)}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* Filters */}
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} mb={2} alignItems="center">
        <TextField size="small" type="date" label={de ? 'Von' : 'From'}
          InputLabelProps={{ shrink: true }} value={from}
          onChange={e => { setFrom(e.target.value); setPage(0); }} sx={{ width: 160 }} />
        <TextField size="small" type="date" label={de ? 'Bis' : 'To'}
          InputLabelProps={{ shrink: true }} value={to}
          onChange={e => { setTo(e.target.value); setPage(0); }} sx={{ width: 160 }} />
        {(from || to) && (
          <Button size="small" onClick={() => { setFrom(''); setTo(''); setPage(0); }}>
            {de ? 'Zurücksetzen' : 'Reset'}
          </Button>
        )}
      </Stack>

      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tab label={`${de ? 'Alle' : 'All'} (${allEntries.length})`} />
          <Tab label={`${de ? 'Ausgaben' : 'Expenses'} (${expenses.length})`} />
          <Tab label={`${de ? 'Einnahmen' : 'Income'} (${incomes.length})`} />
        </Tabs>

        {isLoading && <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>}
        {isError   && <Alert severity="error" sx={{ m: 2 }}>{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

        {!isLoading && !isError && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                  <TableCell>{de ? 'Kategorie' : 'Category'}</TableCell>
                  <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                  <TableCell>{de ? 'Zahlungsweg' : 'Via'}</TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>{de ? 'Ausgabe' : 'Expense'}</TableCell>
                  <TableCell align="right" sx={{ color: 'success.main' }}>{de ? 'Einnahme' : 'Income'}</TableCell>
                  <TableCell>{de ? 'Beleg' : 'Ref.'}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {visibleEntries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5, color: 'text.disabled' }}>
                      {de ? 'Keine Einträge gefunden.' : 'No entries found.'}
                    </TableCell>
                  </TableRow>
                )}
                {visibleEntries.map(e => {
                  const isExpense = e.type === 'payment';
                  return (
                    <TableRow key={e._id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">{new Date(e.date).toLocaleDateString(locale)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={e.contraAccountName ? `${e.contraAccount} ${e.contraAccountName}` : e.contraAccount}
                          color={isExpense ? 'error' : 'success'}
                          variant="outlined"
                          sx={{ fontSize: 11 }}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Typography variant="body2" color="text.secondary">{e.description}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {e.cashAccount === '1000' ? (de ? 'Bar' : 'Cash') : 'Bank'}
                        </Typography>
                        {e.vatRate > 0 && (
                          <Chip size="small" label={`${e.vatRate}%`} sx={{ ml: 0.5, height: 16, fontSize: 10 }} />
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {isExpense
                          ? <Typography variant="body2" fontWeight={600} color="error.main">− {fmtCents(e.amountCents, locale)}</Typography>
                          : null}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {!isExpense
                          ? <Typography variant="body2" fontWeight={600} color="success.main">+ {fmtCents(e.amountCents, locale)}</Typography>
                          : null}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.disabled" fontFamily="monospace">{e.entryNumber}</Typography>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={de ? 'Stornieren' : 'Void'}>
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(e)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      {/* Dialogs */}
      {dialogMode && (
        <EntryDialog
          open
          mode={dialogMode}
          onClose={() => setDialogMode(null)}
          onSaved={() => setDialogMode(null)}
          de={de}
          locale={locale}
        />
      )}

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
