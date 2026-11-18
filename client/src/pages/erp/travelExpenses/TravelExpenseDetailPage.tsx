import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SendIcon from '@mui/icons-material/Send';
import PaidIcon from '@mui/icons-material/Paid';
import { useTranslation } from 'react-i18next';
import { travelExpensesApi, type TravelExpenseStatus, type ExpenseCategory } from '../../../api/travelExpenses';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<TravelExpenseStatus, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  draft: 'default', submitted: 'info', approved: 'success', rejected: 'error', paid: 'warning',
};

const CATEGORY_LABELS: Record<ExpenseCategory, { de: string; en: string }> = {
  mileage:   { de: 'Km-Pauschale',  en: 'Mileage' },
  hotel:     { de: 'Hotel',         en: 'Hotel' },
  meal:      { de: 'Verpflegung',   en: 'Meals' },
  transport: { de: 'Fahrtkosten',   en: 'Transport' },
  parking:   { de: 'Parkgebühren', en: 'Parking' },
  other:     { de: 'Sonstige',      en: 'Other' },
};

export default function TravelExpenseDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [rejectOpen,  setRejectOpen]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError,  setActionError]  = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['travel-expense', id],
    queryFn:  () => travelExpensesApi.get(id!),
    enabled:  !!id,
  });

  const exp = data?.data;

  function makeMutation(fn: () => Promise<unknown>) {
    return useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
      mutationFn: fn,
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['travel-expenses'] }); refetch(); setActionError(''); },
      onError: (e: unknown) => {
        const err = e as { response?: { data?: { message?: string } } };
        setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
      },
    });
  }

  const submitMut  = makeMutation(() => travelExpensesApi.submit(id!));
  const approveMut = makeMutation(() => travelExpensesApi.approve(id!));
  const rejectMut  = makeMutation(() => travelExpensesApi.reject(id!, rejectReason));
  const paidMut    = makeMutation(() => travelExpensesApi.markPaid(id!));

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !exp) return <Alert severity="error">{de ? 'Abrechnung nicht gefunden.' : 'Expense claim not found.'}</Alert>;

  const STATUS_LABEL: Record<TravelExpenseStatus, string> = {
    draft: de ? 'Entwurf' : 'Draft', submitted: de ? 'Eingereicht' : 'Submitted',
    approved: de ? 'Genehmigt' : 'Approved', rejected: de ? 'Abgelehnt' : 'Rejected',
    paid: de ? 'Ausgezahlt' : 'Paid',
  };

  const days = Math.round((new Date(exp.endDate).getTime() - new Date(exp.startDate).getTime()) / 86400000) + 1;

  return (
    <Box maxWidth={860}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/reisekosten')}>
          {de ? 'Reisekosten' : 'Travel Expenses'}
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
                    {exp.expenseNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[exp.status]} color={STATUS_COLOR[exp.status]} />
                  {exp.journalEntryId && <Chip size="small" variant="outlined" label={de ? 'Gebucht' : 'Posted'} color="success" />}
                </Stack>
                <Typography variant="h5" fontWeight={700}>{exp.purpose}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {exp.employeeName}
                  {exp.destination && ` · ${exp.destination}`}
                  {' · '}{new Date(exp.startDate).toLocaleDateString(locale)}
                  {exp.startDate !== exp.endDate && ` – ${new Date(exp.endDate).toLocaleDateString(locale)}`}
                  {' '}{de ? `(${days} Tag${days > 1 ? 'e' : ''})` : `(${days} day${days > 1 ? 's' : ''})`}
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtCents(exp.totalAmountCents, locale)}
              </Typography>
            </Stack>

            {/* Action buttons */}
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" gap={1} flexWrap="wrap">
              {exp.status === 'draft' && (
                <Button variant="outlined" color="primary" startIcon={<SendIcon />}
                  disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
                  {de ? 'Einreichen' : 'Submit'}
                </Button>
              )}
              {exp.status === 'submitted' && (
                <>
                  <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
                    disabled={approveMut.isPending} onClick={() => approveMut.mutate()}>
                    {de ? 'Genehmigen' : 'Approve'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    onClick={() => setRejectOpen(true)}>
                    {de ? 'Ablehnen' : 'Reject'}
                  </Button>
                </>
              )}
              {exp.status === 'approved' && (
                <Button variant="contained" color="warning" startIcon={<PaidIcon />}
                  disabled={paidMut.isPending} onClick={() => paidMut.mutate()}>
                  {de ? 'Als ausgezahlt markieren' : 'Mark as paid'}
                </Button>
              )}
            </Stack>

            {exp.status === 'rejected' && exp.rejectionReason && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {de ? 'Ablehnungsgrund: ' : 'Rejection reason: '}{exp.rejectionReason}
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{de ? 'Kostenarten' : 'Expense items'}</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Art' : 'Category'}</TableCell>
                    <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell>{de ? 'Km' : 'Km'}</TableCell>
                    <TableCell>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell>{de ? 'Beleg' : 'Receipt'}</TableCell>
                    <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {exp.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell><Chip size="small" label={de ? CATEGORY_LABELS[l.category].de : CATEGORY_LABELS[l.category].en} variant="outlined" /></TableCell>
                      <TableCell>{l.description || '—'}</TableCell>
                      <TableCell>{l.km ? `${l.km} km` : '—'}</TableCell>
                      <TableCell>{l.vatRate > 0 ? `${l.vatRate}%` : '—'}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{l.receiptNumber || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {fmtCents(l.amountCents, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} sx={{ fontWeight: 700 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '1rem' }}>
                      {fmtCents(exp.totalAmountCents, locale)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        {/* Meta */}
        <Card>
          <CardContent>
            <Stack direction="row" gap={4} flexWrap="wrap">
              {[
                { label: de ? 'Personalkonto' : 'Personnel account', value: exp.personnelAccount },
                { label: de ? 'Aufwandskonto'  : 'Expense account',  value: exp.expenseAccount },
                { label: de ? 'Kostenstelle'   : 'Cost center',      value: exp.costCenterNumber || '—' },
              ].map(item => (
                <Box key={item.label}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="body2" fontFamily="monospace">{item.value}</Typography>
                </Box>
              ))}
            </Stack>
            {exp.notes && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="caption" color="text.secondary">{de ? 'Notizen' : 'Notes'}</Typography>
                <Typography variant="body2">{exp.notes}</Typography>
              </>
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Abrechnung ablehnen' : 'Reject expense claim'}</DialogTitle>
        <DialogContent>
          <TextField label={de ? 'Ablehnungsgrund' : 'Rejection reason'} size="small" fullWidth multiline rows={3}
            value={rejectReason} onChange={e => setRejectReason(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button color="error" variant="contained" disabled={rejectMut.isPending}
            onClick={() => { rejectMut.mutate(); setRejectOpen(false); }}>
            {de ? 'Ablehnen' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
