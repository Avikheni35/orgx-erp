import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Table, TableHead, TableBody, TableRow, TableCell, TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { payrollApi, type PayrollStatus, type PayrollEntry } from '../../../api/payroll';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<PayrollStatus, 'default' | 'info' | 'success'> = {
  draft: 'default', finalized: 'info', posted: 'success',
};

interface EditState {
  hoursWorked:         string;
  additionalCents:     string;
  deductionCents:      string;
  taxCents:            string;
  socialSecurityCents: string;
  note:                string;
}

function entryToEdit(e: PayrollEntry): EditState {
  return {
    hoursWorked:         String(e.hoursWorked),
    additionalCents:     String(e.additionalCents / 100),
    deductionCents:      String(e.deductionCents / 100),
    taxCents:            String(e.taxCents / 100),
    socialSecurityCents: String(e.socialSecurityCents / 100),
    note:                e.note,
  };
}

export default function PayrollDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll', id],
    queryFn:  () => payrollApi.get(id!),
    enabled:  !!id,
  });

  const payroll = data?.data;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['payrolls'] });
    refetch();
    setActionError('');
  }

  function onMutError(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const finalizeMut = useMutation({
    mutationFn: () => payrollApi.finalize(id!),
    onSuccess: invalidate, onError: onMutError,
  });

  const postMut = useMutation({
    mutationFn: () => payrollApi.post(id!),
    onSuccess: invalidate, onError: onMutError,
  });

  const updateEntryMut = useMutation({
    mutationFn: ({ empId, body }: { empId: string; body: Parameters<typeof payrollApi.updateEntry>[2] }) =>
      payrollApi.updateEntry(id!, empId, body),
    onSuccess: () => { invalidate(); setEditingId(null); setEditState(null); },
    onError: onMutError,
  });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !payroll) return <Alert severity="error">{de ? 'Lohnabrechnung nicht gefunden.' : 'Payroll run not found.'}</Alert>;

  const STATUS_LABEL: Record<PayrollStatus, string> = {
    draft: de ? 'Entwurf' : 'Draft',
    finalized: de ? 'Abgeschlossen' : 'Finalized',
    posted: de ? 'Gebucht' : 'Posted',
  };

  function formatPeriod(period: string) {
    const [y, m] = period.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString(locale, { month: 'long', year: 'numeric' });
  }

  function startEdit(entry: PayrollEntry) {
    setEditingId(String(entry.employeeId));
    setEditState(entryToEdit(entry));
  }

  function saveEdit(entry: PayrollEntry) {
    if (!editState) return;
    updateEntryMut.mutate({
      empId: String(entry.employeeId),
      body: {
        hoursWorked:         parseFloat(editState.hoursWorked) || 0,
        additionalCents:     Math.round(parseFloat(editState.additionalCents) * 100 || 0),
        deductionCents:      Math.round(parseFloat(editState.deductionCents) * 100 || 0),
        taxCents:            Math.round(parseFloat(editState.taxCents) * 100 || 0),
        socialSecurityCents: Math.round(parseFloat(editState.socialSecurityCents) * 100 || 0),
        note:                editState.note,
      },
    });
  }

  return (
    <Box maxWidth={1000}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/lohn')}>
          {de ? 'Lohnabrechnung' : 'Payroll'}
        </Button>
      </Stack>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      <Stack gap={3}>
        {/* Header */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                  <Typography variant="overline" color="text.secondary" fontFamily="monospace" fontWeight={700}>
                    {payroll.payrollNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[payroll.status]} color={STATUS_COLOR[payroll.status]} />
                  {payroll.journalEntryId && (
                    <Chip size="small" variant="outlined" label={de ? 'Gebucht' : 'Posted'} color="success" />
                  )}
                </Stack>
                <Typography variant="h5" fontWeight={700}>{formatPeriod(payroll.period)}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {payroll.entries.length} {de ? 'Mitarbeiter' : 'employees'}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">{de ? 'Gesamtbrutto' : 'Total gross'}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCents(payroll.totalGrossCents, locale)}
                </Typography>
                <Typography variant="caption" color="text.secondary">{de ? 'Gesamtnetto' : 'Total net'}</Typography>
                <Typography variant="h6" fontWeight={600} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtCents(payroll.totalNetCents, locale)}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Stack direction="row" gap={1}>
              {payroll.status === 'draft' && (
                <Button variant="contained" color="primary" startIcon={<CheckCircleIcon />}
                  disabled={finalizeMut.isPending} onClick={() => finalizeMut.mutate()}>
                  {de ? 'Abschließen' : 'Finalize'}
                </Button>
              )}
              {payroll.status === 'finalized' && (
                <Button variant="contained" color="success" startIcon={<BookmarkIcon />}
                  disabled={postMut.isPending} onClick={() => postMut.mutate()}>
                  {de ? 'Buchen' : 'Post to journal'}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Entries table */}
        <Card>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: 2, pb: 0 }}>
              <Typography variant="subtitle2" color="text.secondary">
                {de ? 'Abrechnungsdetails' : 'Payroll entries'}
              </Typography>
            </Box>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Mitarbeiter' : 'Employee'}</TableCell>
                    <TableCell>{de ? 'Lohnart' : 'Type'}</TableCell>
                    <TableCell align="right">{de ? 'Std.' : 'Hrs'}</TableCell>
                    <TableCell align="right">{de ? 'Brutto' : 'Gross'}</TableCell>
                    <TableCell align="right">{de ? 'Zulagen' : 'Additional'}</TableCell>
                    <TableCell align="right">{de ? 'Abzüge' : 'Deductions'}</TableCell>
                    <TableCell align="right">{de ? 'Lohnsteuer' : 'Income tax'}</TableCell>
                    <TableCell align="right">{de ? 'SV' : 'Social sec.'}</TableCell>
                    <TableCell align="right">{de ? 'Netto' : 'Net'}</TableCell>
                    {payroll.status === 'draft' && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payroll.entries.map((entry) => {
                    const empId    = String(entry.employeeId);
                    const isEditing = editingId === empId;
                    return (
                      <TableRow key={empId} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{entry.employeeName}</Typography>
                          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                            {entry.employeeNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {entry.salaryType === 'monthly' ? (de ? 'Gehalt' : 'Salary') : (de ? 'Stundenlohn' : 'Hourly')}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField size="small" type="number" sx={{ width: 70 }}
                              value={editState!.hoursWorked}
                              onChange={e => setEditState(s => s && ({ ...s, hoursWorked: e.target.value }))}
                              inputProps={{ min: 0, step: 0.5, style: { textAlign: 'right' } }} />
                          ) : entry.hoursWorked || '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCents(entry.grossCents, locale)}
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField size="small" type="number" sx={{ width: 90 }}
                              value={editState!.additionalCents}
                              onChange={e => setEditState(s => s && ({ ...s, additionalCents: e.target.value }))}
                              inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                          ) : (
                            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {entry.additionalCents > 0 ? fmtCents(entry.additionalCents, locale) : '—'}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField size="small" type="number" sx={{ width: 90 }}
                              value={editState!.deductionCents}
                              onChange={e => setEditState(s => s && ({ ...s, deductionCents: e.target.value }))}
                              inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                          ) : (
                            <Typography variant="body2" color={entry.deductionCents > 0 ? 'error' : undefined}
                              sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {entry.deductionCents > 0 ? `−${fmtCents(entry.deductionCents, locale)}` : '—'}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField size="small" type="number" sx={{ width: 90 }}
                              value={editState!.taxCents}
                              onChange={e => setEditState(s => s && ({ ...s, taxCents: e.target.value }))}
                              inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                          ) : (
                            <Typography variant="body2" color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {fmtCents(entry.taxCents, locale)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField size="small" type="number" sx={{ width: 90 }}
                              value={editState!.socialSecurityCents}
                              onChange={e => setEditState(s => s && ({ ...s, socialSecurityCents: e.target.value }))}
                              inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                          ) : (
                            <Typography variant="body2" color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {fmtCents(entry.socialSecurityCents, locale)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtCents(entry.netCents, locale)}
                          </Typography>
                        </TableCell>
                        {payroll.status === 'draft' && (
                          <TableCell>
                            {isEditing ? (
                              <Stack direction="row" gap={0.5}>
                                <Button size="small" variant="contained" startIcon={<SaveIcon fontSize="small" />}
                                  disabled={updateEntryMut.isPending}
                                  onClick={() => saveEdit(entry)}>
                                  {de ? 'OK' : 'Save'}
                                </Button>
                                <Button size="small" onClick={() => { setEditingId(null); setEditState(null); }}>
                                  {de ? 'Abbr.' : 'Cancel'}
                                </Button>
                              </Stack>
                            ) : (
                              <Button size="small" onClick={() => startEdit(entry)}>
                                {de ? 'Bearbeiten' : 'Edit'}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}

                  {/* Totals row */}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 700 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {fmtCents(payroll.totalGrossCents, locale)}
                    </TableCell>
                    <TableCell colSpan={4} />
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '1rem' }}>
                      {fmtCents(payroll.totalNetCents, locale)}
                    </TableCell>
                    {payroll.status === 'draft' && <TableCell />}
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        {payroll.notes && (
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">{de ? 'Notizen' : 'Notes'}</Typography>
              <Typography variant="body2">{payroll.notes}</Typography>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}
