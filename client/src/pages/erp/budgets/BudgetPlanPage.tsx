import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Chip, CircularProgress, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
  IconButton, Tooltip, Autocomplete,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BarChartIcon from '@mui/icons-material/BarChart';
import { useTranslation } from 'react-i18next';
import { budgetsApi, type Budget, type BudgetPayload } from '../../../api/budgets';
import { fiscalYearsApi, type FiscalYear } from '../../../api/fiscalYears';
import { costCentersApi, type CostCenter } from '../../../api/costcenters';
import { useCanWrite } from '../../../hooks/useCanWrite';

const EMPTY: BudgetPayload = {
  fiscalYearId: '', name: '', accountNumber: '', costCenterId: undefined,
  budgetCents: 0, period: 'annual', note: '',
};

function fmtEur(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function centsFromStr(s: string) {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

export default function BudgetPlanPage() {
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canWrite = useCanWrite();

  const [selectedFY, setSelectedFY] = useState('');
  const [dialogOpen, setDialogOpen]  = useState(false);
  const [editing, setEditing]         = useState<Budget | null>(null);
  const [form, setForm]               = useState<BudgetPayload>(EMPTY);
  const [amountStr, setAmountStr]     = useState('');
  const [saveError, setSaveError]     = useState('');
  const [delConfirm, setDelConfirm]   = useState<string | null>(null);

  const fyQ = useQuery({ queryKey: ['fiscal-years'], queryFn: () => fiscalYearsApi.list() });
  const fiscalYears: FiscalYear[] = fyQ.data?.data?.fiscalYears ?? [];

  const ccQ = useQuery({ queryKey: ['cost-centers'], queryFn: () => costCentersApi.list({ active: true }) });
  const costCenters: CostCenter[] = ccQ.data?.data?.costCenters ?? [];

  const budgetQ = useQuery({
    queryKey: ['budgets', selectedFY],
    queryFn:  () => budgetsApi.list(selectedFY || undefined),
    enabled:  !!selectedFY,
  });
  const budgets: Budget[] = budgetQ.data?.data?.budgets ?? [];

  const saveMut = useMutation({
    mutationFn: (payload: BudgetPayload) =>
      editing ? budgetsApi.update(editing._id, payload) : budgetsApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] });
      setDialogOpen(false);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setSaveError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => budgetsApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setDelConfirm(null); },
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY, fiscalYearId: selectedFY });
    setAmountStr('');
    setSaveError('');
    setDialogOpen(true);
  }

  function openEdit(b: Budget) {
    setEditing(b);
    setForm({
      fiscalYearId: b.fiscalYearId, name: b.name, accountNumber: b.accountNumber,
      costCenterId: b.costCenterId, budgetCents: b.budgetCents, period: b.period, note: b.note,
    });
    setAmountStr((b.budgetCents / 100).toFixed(2));
    setSaveError('');
    setDialogOpen(true);
  }

  function handleSave() {
    const payload = { ...form, budgetCents: centsFromStr(amountStr) };
    if (!payload.fiscalYearId || !payload.name || !payload.accountNumber || payload.budgetCents <= 0) {
      setSaveError(de ? 'Bitte alle Pflichtfelder ausfüllen.' : 'Please fill all required fields.');
      return;
    }
    saveMut.mutate(payload);
  }

  const totalBudget = budgets.reduce((s, b) => s + b.budgetCents, 0);
  const locale = de ? 'de-DE' : 'en-GB';

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Budgetplanung' : 'Budget Planning'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Budgets je Konto und Kostenstelle erfassen' : 'Define budgets per account and cost center'}
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<BarChartIcon />}
            onClick={() => navigate(`/erp/budget/abweichung${selectedFY ? `?fy=${selectedFY}` : ''}`)}
            disabled={!selectedFY}>
            {de ? 'Plan/Ist-Vergleich' : 'Variance report'}
          </Button>
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} disabled={!selectedFY}>
              {de ? 'Budgetzeile' : 'Add line'}
            </Button>
          )}
        </Stack>
      </Stack>

      {/* Fiscal year selector */}
      <Stack direction="row" gap={2} mb={3} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{de ? 'Geschäftsjahr' : 'Fiscal year'}</InputLabel>
          <Select value={selectedFY} label={de ? 'Geschäftsjahr' : 'Fiscal year'}
            onChange={e => setSelectedFY(e.target.value)}>
            <MenuItem value="">{de ? '— wählen —' : '— select —'}</MenuItem>
            {fiscalYears.map(fy => (
              <MenuItem key={fy._id} value={fy._id}>{fy.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {selectedFY && budgets.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {de ? 'Gesamt:' : 'Total:'} <strong>{fmtEur(totalBudget, locale)}</strong>
            {' · '}{budgets.length} {de ? 'Zeilen' : 'lines'}
          </Typography>
        )}
      </Stack>

      {!selectedFY && (
        <Alert severity="info">{de ? 'Bitte wählen Sie ein Geschäftsjahr.' : 'Please select a fiscal year.'}</Alert>
      )}

      {selectedFY && budgetQ.isLoading && (
        <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>
      )}
      {selectedFY && budgetQ.isError && (
        <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>
      )}

      {selectedFY && !budgetQ.isLoading && !budgetQ.isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Bezeichnung' : 'Name'}</TableCell>
                <TableCell>{de ? 'Konto' : 'Account'}</TableCell>
                <TableCell>{de ? 'Kostenstelle' : 'Cost center'}</TableCell>
                <TableCell>{de ? 'Zeitraum' : 'Period'}</TableCell>
                <TableCell align="right">{de ? 'Budget' : 'Budget'}</TableCell>
                {canWrite && <TableCell align="center">{de ? 'Aktionen' : 'Actions'}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {budgets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Noch keine Budgetzeilen. Klicken Sie auf „Budgetzeile" zum Anlegen.' : 'No budget lines yet. Click "Add line" to create one.'}
                  </TableCell>
                </TableRow>
              )}
              {budgets.map(b => (
                <TableRow key={b._id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{b.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{b.accountNumber}</TableCell>
                  <TableCell>{b.costCenterId
                    ? (costCenters.find(c => c._id === b.costCenterId)?.name ?? b.costCenterId)
                    : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={b.period === 'annual' ? (de ? 'Jährlich' : 'Annual') : (de ? 'Monatlich' : 'Monthly')} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtEur(b.budgetCents, locale)}
                  </TableCell>
                  {canWrite && (
                    <TableCell align="center">
                      <Tooltip title={de ? 'Bearbeiten' : 'Edit'}>
                        <IconButton size="small" onClick={() => openEdit(b)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title={de ? 'Löschen' : 'Delete'}>
                        <IconButton size="small" color="error" onClick={() => setDelConfirm(b._id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? (de ? 'Budget bearbeiten' : 'Edit budget') : (de ? 'Neue Budgetzeile' : 'New budget line')}</DialogTitle>
        <DialogContent>
          {saveError && <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert>}
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField required label={de ? 'Bezeichnung' : 'Name'} size="small" fullWidth
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <TextField required label={de ? 'Kontonummer (SKR03)' : 'Account number (SKR03)'} size="small" fullWidth
              value={form.accountNumber} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
              helperText={de ? 'z.B. 4200 (Löhne), 4600 (Miete)' : 'e.g. 4200 (Wages), 4600 (Rent)'} />
            <Autocomplete
              options={costCenters}
              getOptionLabel={cc => `${cc.number} – ${cc.name}`}
              value={costCenters.find(c => c._id === form.costCenterId) ?? null}
              onChange={(_, val) => setForm(f => ({ ...f, costCenterId: val?._id }))}
              renderInput={p => <TextField {...p} label={de ? 'Kostenstelle (optional)' : 'Cost center (optional)'} size="small" />}
            />
            <Stack direction="row" gap={2}>
              <TextField required label={de ? 'Betrag (€)' : 'Amount (€)'} size="small" sx={{ flex: 1 }}
                value={amountStr} onChange={e => setAmountStr(e.target.value)}
                helperText={de ? 'Gesamtbudget für den Zeitraum' : 'Total budget for the period'} />
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>{de ? 'Zeitraum' : 'Period'}</InputLabel>
                <Select value={form.period} label={de ? 'Zeitraum' : 'Period'}
                  onChange={e => setForm(f => ({ ...f, period: e.target.value as 'annual' | 'monthly' }))}>
                  <MenuItem value="annual">{de ? 'Jährlich' : 'Annual'}</MenuItem>
                  <MenuItem value="monthly">{de ? 'Monatlich' : 'Monthly'}</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <TextField label={de ? 'Notiz' : 'Note'} size="small" fullWidth
              value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={saveMut.isPending} onClick={handleSave}>
            {de ? 'Speichern' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delConfirm} onClose={() => setDelConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{de ? 'Löschen bestätigen' : 'Confirm delete'}</DialogTitle>
        <DialogContent>
          <Typography>{de ? 'Diese Budgetzeile wirklich löschen?' : 'Delete this budget line?'}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelConfirm(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button color="error" variant="contained" disabled={delMut.isPending}
            onClick={() => delConfirm && delMut.mutate(delConfirm)}>
            {de ? 'Löschen' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
