import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, LinearProgress, Switch,
  FormControlLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { costCentersApi, type CostCenterCreate } from '../../../api/costcenters';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const EMPTY: CostCenterCreate = { number: '', name: '', description: '', annualBudgetCents: 0 };

export default function CostCenterListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [showAll,  setShowAll]  = useState(false);
  const [dlgOpen,  setDlgOpen]  = useState(false);
  const [form,     setForm]     = useState<CostCenterCreate>(EMPTY);
  const [budgetStr, setBudgetStr] = useState('0');
  const [dlgError, setDlgError] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['costcenters', showAll],
    queryFn:  () => costCentersApi.list(showAll ? undefined : { active: true }),
  });
  const centers = data?.data?.costCenters ?? [];

  const createMutation = useMutation({
    mutationFn: (body: CostCenterCreate) => costCentersApi.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costcenters'] });
      setDlgOpen(false);
      setForm(EMPTY);
      setBudgetStr('0');
      setDlgError('');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setDlgError(err?.response?.data?.message ?? (de ? 'Fehler beim Erstellen.' : 'Create failed.'));
    },
  });

  function handleCreate() {
    const budgetCents = Math.round(parseFloat(budgetStr.replace(',', '.') || '0') * 100);
    createMutation.mutate({ ...form, annualBudgetCents: budgetCents });
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Kostenstellen' : 'Cost Centers'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Interne Abteilungen und Projekte für die Kostenrechnung' : 'Internal departments and projects for cost accounting'}
          </Typography>
        </Box>
        <Stack direction="row" gap={1} alignItems="center">
          <FormControlLabel
            control={<Switch size="small" checked={showAll} onChange={e => setShowAll(e.target.checked)} />}
            label={<Typography variant="caption">{de ? 'Auch inaktive' : 'Show inactive'}</Typography>}
          />
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDlgOpen(true)}>
            {de ? 'Neue Kostenstelle' : 'New cost center'}
          </Button>
        </Stack>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                <TableCell>{de ? 'Bezeichnung' : 'Name'}</TableCell>
                <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'Jahresbudget' : 'Annual budget'}</TableCell>
                <TableCell>{de ? 'Budget-Auslastung' : 'Budget usage'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {centers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Kostenstellen vorhanden.' : 'No cost centers found.'}
                  </TableCell>
                </TableRow>
              )}
              {centers.map(cc => (
                <TableRow key={cc._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/kostenstellen/${cc._id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{cc.number}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight={500}>{cc.name}</Typography></TableCell>
                  <TableCell sx={{ color: 'text.secondary', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cc.description || '—'}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={cc.isActive ? (de ? 'Aktiv' : 'Active') : (de ? 'Inaktiv' : 'Inactive')}
                      color={cc.isActive ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {cc.annualBudgetCents > 0 ? fmtCents(cc.annualBudgetCents, locale) : '—'}
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    {cc.annualBudgetCents > 0
                      ? <LinearProgress variant="indeterminate" sx={{ height: 6, borderRadius: 1 }} />
                      : <Typography variant="caption" color="text.disabled">{de ? 'Kein Budget' : 'No budget'}</Typography>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Create dialog */}
      <Dialog open={dlgOpen} onClose={() => { setDlgOpen(false); setDlgError(''); }} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Neue Kostenstelle anlegen' : 'Create cost center'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <Stack direction="row" gap={2}>
              <TextField
                label={de ? 'Kostenstellen-Nr.' : 'Cost center no.'} size="small" sx={{ width: 180 }}
                value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                placeholder="100"
              />
              <TextField
                label={de ? 'Bezeichnung' : 'Name'} size="small" fullWidth required
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </Stack>
            <TextField
              label={de ? 'Beschreibung' : 'Description'} size="small" multiline rows={2}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
            <TextField
              label={de ? 'Jahresbudget (€)' : 'Annual budget (€)'} size="small"
              value={budgetStr} onChange={e => setBudgetStr(e.target.value)}
              helperText={de ? '0 = kein Budget' : '0 = no budget'}
            />
            {dlgError && <Alert severity="error">{dlgError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDlgOpen(false); setDlgError(''); }}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={!form.number || !form.name || createMutation.isPending} onClick={handleCreate}>
            {createMutation.isPending ? <CircularProgress size={20} /> : (de ? 'Erstellen' : 'Create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
