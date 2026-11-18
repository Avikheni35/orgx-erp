import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, LinearProgress, Table, TableHead, TableBody, TableRow,
  TableCell, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Switch,
  FormControlLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import { useTranslation } from 'react-i18next';
import { costCentersApi } from '../../../api/costcenters';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function CostCenterDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [editOpen,   setEditOpen]   = useState(false);
  const [editName,   setEditName]   = useState('');
  const [editDesc,   setEditDesc]   = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editError,  setEditError]  = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['costcenter', id],
    queryFn:  () => costCentersApi.get(id!),
    enabled:  !!id,
  });

  const updateMutation = useMutation({
    mutationFn: () => costCentersApi.update(id!, {
      name:              editName,
      description:       editDesc,
      annualBudgetCents: Math.round(parseFloat(editBudget.replace(',', '.') || '0') * 100),
      isActive:          editActive,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costcenter', id] });
      qc.invalidateQueries({ queryKey: ['costcenters'] });
      setEditOpen(false);
      setEditError('');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setEditError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  const det = data?.data;
  const cc  = det?.costCenter;

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !cc) return <Alert severity="error">{de ? 'Kostenstelle nicht gefunden.' : 'Cost center not found.'}</Alert>;

  const netCents    = det.actualDebitCents - det.actualCreditCents;
  const budgetPct   = cc.annualBudgetCents > 0 ? Math.min(Math.round((netCents / cc.annualBudgetCents) * 100), 100) : 0;
  const overBudget  = cc.annualBudgetCents > 0 && netCents > cc.annualBudgetCents;

  function openEdit() {
    setEditName(cc!.name);
    setEditDesc(cc!.description);
    setEditBudget(String((cc!.annualBudgetCents / 100).toFixed(2)));
    setEditActive(cc!.isActive);
    setEditError('');
    setEditOpen(true);
  }

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/kostenstellen')}>
          {de ? 'Kostenstellen' : 'Cost Centers'}
        </Button>
      </Stack>

      <Stack gap={3}>
        {/* Header */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Stack direction="row" gap={1.5} alignItems="center" mb={0.5}>
                  <Typography variant="overline" color="text.secondary" fontFamily="monospace" fontWeight={700}>
                    KST {cc.number}
                  </Typography>
                  <Chip size="small" label={cc.isActive ? (de ? 'Aktiv' : 'Active') : (de ? 'Inaktiv' : 'Inactive')}
                    color={cc.isActive ? 'success' : 'default'} />
                </Stack>
                <Typography variant="h5" fontWeight={700}>{cc.name}</Typography>
                {cc.description && <Typography variant="body2" color="text.secondary" mt={0.5}>{cc.description}</Typography>}
              </Box>
              <Button size="small" startIcon={<EditIcon />} onClick={openEdit}>
                {de ? 'Bearbeiten' : 'Edit'}
              </Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction={{ xs: 'column', sm: 'row' }} gap={4}>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Gesamtaufwand (Soll)' : 'Total debit (costs)'}</Typography>
                <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(det.actualDebitCents, locale)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Gesamtertrag (Haben)' : 'Total credit'}</Typography>
                <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }} color="text.secondary">{fmtCents(det.actualCreditCents, locale)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Nettoaufwand' : 'Net cost'}</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }} color={overBudget ? 'error.main' : 'inherit'}>
                  {fmtCents(netCents, locale)}
                </Typography>
              </Box>
              {cc.annualBudgetCents > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{de ? 'Jahresbudget' : 'Annual budget'}</Typography>
                  <Typography variant="h6" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(cc.annualBudgetCents, locale)}</Typography>
                </Box>
              )}
            </Stack>

            {cc.annualBudgetCents > 0 && (
              <Box mt={2}>
                <LinearProgress
                  variant="determinate" value={budgetPct}
                  color={overBudget ? 'error' : budgetPct > 80 ? 'warning' : 'primary'}
                  sx={{ height: 8, borderRadius: 1 }}
                />
                <Typography variant="caption" color={overBudget ? 'error' : 'text.secondary'}>
                  {budgetPct}% {de ? 'des Jahresbudgets verbraucht' : 'of annual budget used'}
                  {overBudget && (de ? ' — Budget überschritten!' : ' — Over budget!')}
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Recent journal lines */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              {de ? 'Letzte Buchungen (auf diese Kostenstelle)' : 'Recent postings (tagged to this cost center)'}
            </Typography>
            {det.recentEntries.length === 0 ? (
              <Alert severity="info">
                {de
                  ? 'Keine Buchungen gefunden. Wählen Sie diese Kostenstelle beim Buchen in manuellen Journaleinträgen aus.'
                  : 'No postings found. Select this cost center when creating manual journal entries.'}
              </Alert>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Buchungssatz' : 'Entry'}</TableCell>
                      <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                      <TableCell>{de ? 'Konto' : 'Account'}</TableCell>
                      <TableCell>{de ? 'Text' : 'Text'}</TableCell>
                      <TableCell align="right">{de ? 'Soll' : 'Debit'}</TableCell>
                      <TableCell align="right">{de ? 'Haben' : 'Credit'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {det.recentEntries.flatMap(entry =>
                      entry.lines
                        .filter(l => l.costCenter === cc.number)
                        .map((l, li) => (
                          <TableRow key={`${entry._id}-${li}`}>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.entryNumber}</TableCell>
                            <TableCell>{new Date(entry.date).toLocaleDateString(locale)}</TableCell>
                            <TableCell sx={{ fontFamily: 'monospace' }}>{l.accountNumber}</TableCell>
                            <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {l.description || entry.description}
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: l.debit > 0 ? 'text.primary' : 'text.disabled' }}>
                              {l.debit > 0 ? l.debit.toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €' : '—'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: l.credit > 0 ? 'text.secondary' : 'text.disabled' }}>
                              {l.credit > 0 ? l.credit.toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €' : '—'}
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Kostenstelle bearbeiten' : 'Edit cost center'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <TextField label={de ? 'Bezeichnung' : 'Name'} size="small" fullWidth value={editName}
              onChange={e => setEditName(e.target.value)} />
            <TextField label={de ? 'Beschreibung' : 'Description'} size="small" multiline rows={2}
              value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            <TextField label={de ? 'Jahresbudget (€)' : 'Annual budget (€)'} size="small" value={editBudget}
              onChange={e => setEditBudget(e.target.value)} />
            <FormControlLabel
              control={<Switch checked={editActive} onChange={e => setEditActive(e.target.checked)} />}
              label={de ? 'Aktiv' : 'Active'}
            />
            {editError && <Alert severity="error">{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={!editName || updateMutation.isPending} onClick={() => updateMutation.mutate()}>
            {updateMutation.isPending ? <CircularProgress size={20} /> : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
