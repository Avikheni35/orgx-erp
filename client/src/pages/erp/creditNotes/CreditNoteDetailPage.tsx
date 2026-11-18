import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import CancelIcon from '@mui/icons-material/Cancel';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { creditNotesApi, type CreditNoteStatus } from '../../../api/creditNotes';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<CreditNoteStatus, 'default' | 'info' | 'success' | 'error'> = {
  draft:     'default',
  sent:      'info',
  posted:    'success',
  cancelled: 'error',
};

export default function CreditNoteDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['credit-note', id],
    queryFn:  () => creditNotesApi.get(id!),
    enabled:  !!id,
  });

  const cn = data?.data;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['credit-notes'] });
    refetch();
    setActionError('');
  }

  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const sentMut    = useMutation({ mutationFn: () => creditNotesApi.updateStatus(id!, 'sent'),      onSuccess: invalidate, onError: onErr });
  const cancelMut  = useMutation({ mutationFn: () => creditNotesApi.updateStatus(id!, 'cancelled'), onSuccess: invalidate, onError: onErr });
  const postMut    = useMutation({ mutationFn: () => creditNotesApi.post(id!),                      onSuccess: invalidate, onError: onErr });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !cn) return <Alert severity="error">{de ? 'Gutschrift nicht gefunden.' : 'Credit note not found.'}</Alert>;

  const STATUS_LABEL: Record<CreditNoteStatus, string> = {
    draft:     de ? 'Entwurf'   : 'Draft',
    sent:      de ? 'Gesendet'  : 'Sent',
    posted:    de ? 'Gebucht'   : 'Posted',
    cancelled: de ? 'Storniert' : 'Cancelled',
  };

  return (
    <Box maxWidth={860}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/verkauf/gutschriften')}>
          {de ? 'Gutschriften' : 'Credit Notes'}
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
                    {cn.creditNoteNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[cn.status]} color={STATUS_COLOR[cn.status]} />
                  {cn.invoiceNumber && (
                    <Chip size="small" variant="outlined" label={`${de ? 'zu' : 'for'} ${cn.invoiceNumber}`} />
                  )}
                  {cn.journalEntryId && (
                    <Chip size="small" variant="outlined" color="success" label={de ? 'Gebucht' : 'Posted'} />
                  )}
                </Stack>
                <Typography variant="h5" fontWeight={700}>{cn.customerName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(cn.creditNoteDate).toLocaleDateString(locale)}
                  {cn.customerAddress && ` · ${cn.customerAddress}`}
                </Typography>
                {cn.reason && (
                  <Typography variant="body2" color="text.secondary" mt={0.5}>
                    {de ? 'Grund' : 'Reason'}: {cn.reason}
                  </Typography>
                )}
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">{de ? 'Gutschriftbetrag' : 'Credit amount'}</Typography>
                <Typography variant="h5" fontWeight={700} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  −{money(cn.totalGrossCents, locale)}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" gap={1} flexWrap="wrap">
              {cn.status === 'draft' && (
                <>
                  <Button variant="outlined" startIcon={<SendIcon />}
                    disabled={sentMut.isPending} onClick={() => sentMut.mutate()}>
                    {de ? 'Als gesendet markieren' : 'Mark as sent'}
                  </Button>
                  <Button variant="contained" color="success" startIcon={<BookmarkIcon />}
                    disabled={postMut.isPending} onClick={() => postMut.mutate()}>
                    {de ? 'Buchen' : 'Post to journal'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                    {de ? 'Stornieren' : 'Cancel'}
                  </Button>
                </>
              )}
              {cn.status === 'sent' && (
                <>
                  <Button variant="contained" color="success" startIcon={<BookmarkIcon />}
                    disabled={postMut.isPending} onClick={() => postMut.mutate()}>
                    {de ? 'Buchen' : 'Post to journal'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                    {de ? 'Stornieren' : 'Cancel'}
                  </Button>
                </>
              )}
              {cn.invoiceId && (
                <Button variant="text" onClick={() => navigate(`/erp/verkauf/rechnungen/${cn.invoiceId}`)}>
                  {de ? 'Zur Rechnung →' : 'View invoice →'}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Line items */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1.5}>{de ? 'Positionen' : 'Line items'}</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell>{de ? 'Einheit' : 'Unit'}</TableCell>
                    <TableCell align="right">{de ? 'Menge' : 'Qty'}</TableCell>
                    <TableCell align="right">{de ? 'Einzelpreis' : 'Unit price'}</TableCell>
                    <TableCell align="right">{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right">{de ? 'Netto' : 'Net'}</TableCell>
                    <TableCell align="right">{de ? 'Brutto' : 'Gross'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {cn.lineItems.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.description || l.itemName || '—'}</TableCell>
                      <TableCell>{l.unit}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{l.quantity}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.unitPriceCents, locale)}</TableCell>
                      <TableCell align="right">{l.vatRate}%</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'error.main' }}>
                        −{money(l.totalNetCents, locale)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'error.main' }}>
                        −{money(l.totalGrossCents, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{de ? 'Netto' : 'Net'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'error.main' }}>
                      −{money(cn.totalNetCents, locale)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'error.main' }}>
                      −{money(cn.totalVatCents, locale)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{de ? 'Gesamt (brutto)' : 'Total (gross)'}</TableCell>
                    <TableCell />
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.95rem', color: 'error.main' }}>
                      −{money(cn.totalGrossCents, locale)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        {/* Accounting */}
        <Card>
          <CardContent>
            <Stack direction="row" gap={4} flexWrap="wrap">
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Debitorenkonto' : 'Debtor account'}</Typography>
                <Typography variant="body2" fontFamily="monospace">{cn.debtorAccount}</Typography>
              </Box>
              {cn.notes && (
                <Box flex={1}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Notizen' : 'Notes'}</Typography>
                  <Typography variant="body2">{cn.notes}</Typography>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  );
}
