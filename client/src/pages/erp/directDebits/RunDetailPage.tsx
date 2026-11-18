import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { directDebitsApi, type RunStatus } from '../../../api/directDebits';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<RunStatus, 'default' | 'info' | 'success' | 'error'> = {
  draft:     'default',
  submitted: 'info',
  settled:   'success',
  returned:  'error',
};

export default function RunDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['direct-debit-run', id],
    queryFn:  () => directDebitsApi.getRun(id!),
    enabled:  !!id,
  });
  const run = data?.data;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['direct-debit-runs'] });
    refetch();
    setActionError('');
  }

  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const submitMut = useMutation({ mutationFn: () => directDebitsApi.submitRun(id!),  onSuccess: invalidate, onError: onErr });
  const settleMut = useMutation({ mutationFn: () => directDebitsApi.settleRun(id!),  onSuccess: invalidate, onError: onErr });
  const returnMut = useMutation({ mutationFn: () => directDebitsApi.returnRun(id!),  onSuccess: invalidate, onError: onErr });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !run) return <Alert severity="error">{de ? 'Lauf nicht gefunden.' : 'Run not found.'}</Alert>;

  const STATUS_LABEL: Record<RunStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    submitted: de ? 'Eingereicht' : 'Submitted',
    settled:   de ? 'Abgerechnet' : 'Settled',
    returned:  de ? 'Rückläufer'  : 'Returned',
  };

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/zahlungen/lastschrift')}>
          {de ? 'Lastschrift' : 'Direct Debit'}
        </Button>
      </Stack>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      <Stack gap={3}>
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                  <Typography variant="overline" color="text.secondary" fontFamily="monospace" fontWeight={700}>
                    {run.runNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[run.status]} color={STATUS_COLOR[run.status]} />
                </Stack>
                <Typography variant="h6" fontWeight={700}>
                  {de ? 'Einzugsdatum: ' : 'Collection date: '}
                  {new Date(run.collectionDate).toLocaleDateString(locale)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {run.entries.length} {de ? 'Positionen' : 'entries'} · {de ? 'Bankkonto' : 'Bank account'}: {run.bankAccount}
                </Typography>
                {run.notes && (
                  <Typography variant="body2" color="text.secondary" mt={0.5}>{run.notes}</Typography>
                )}
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">{de ? 'Gesamtbetrag' : 'Total amount'}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(run.totalAmountCents, locale)}
                </Typography>
              </Box>
            </Stack>

            {run.journalEntryId && (
              <Box mt={1}>
                <Button size="small" variant="text" startIcon={<OpenInNewIcon fontSize="small" />}
                  onClick={() => navigate(`/erp/buchfuehrung/${run.journalEntryId}`)}>
                  {de ? 'Buchungssatz ansehen' : 'View journal entry'}
                </Button>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" gap={1} flexWrap="wrap">
              {run.status === 'draft' && (
                <Button variant="contained" startIcon={<SendIcon />}
                  disabled={submitMut.isPending} onClick={() => submitMut.mutate()}>
                  {de ? 'Einreichen & buchen' : 'Submit & post'}
                </Button>
              )}
              {run.status === 'submitted' && (
                <>
                  <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
                    disabled={settleMut.isPending} onClick={() => settleMut.mutate()}>
                    {de ? 'Als abgerechnet markieren' : 'Mark as settled'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<ReplayIcon />}
                    disabled={returnMut.isPending} onClick={() => returnMut.mutate()}>
                    {de ? 'Rückläufer melden' : 'Mark as returned'}
                  </Button>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1.5}>
              {de ? 'Positionen' : 'Entries'}
            </Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Mandatsreferenz' : 'Mandate ref.'}</TableCell>
                    <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                    <TableCell>IBAN</TableCell>
                    <TableCell>{de ? 'Verwendungszweck' : 'Description'}</TableCell>
                    <TableCell>{de ? 'Referenz' : 'Ref.'}</TableCell>
                    <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {run.entries.map((e, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.mandateReference}</TableCell>
                      <TableCell><Typography variant="body2" fontWeight={500}>{e.customerName}</Typography></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.iban}</TableCell>
                      <TableCell>{e.description}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 11 }}>{e.invoiceRef || '—'}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {money(e.amountCents, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                      {money(run.totalAmountCents, locale)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
