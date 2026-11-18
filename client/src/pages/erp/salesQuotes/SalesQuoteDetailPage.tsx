import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useTranslation } from 'react-i18next';
import { salesQuotesApi, type QuoteStatus } from '../../../api/salesQuotes';

const STATUS_COLOR: Record<QuoteStatus, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  draft:     'default',
  sent:      'info',
  accepted:  'success',
  rejected:  'error',
  expired:   'warning',
  converted: 'warning',
};

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function SalesQuoteDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales-quote', id],
    queryFn:  () => salesQuotesApi.get(id!),
    enabled:  !!id,
  });

  const quote = data?.data;

  const STATUS_LABEL: Record<QuoteStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    sent:      de ? 'Gesendet'    : 'Sent',
    accepted:  de ? 'Akzeptiert'  : 'Accepted',
    rejected:  de ? 'Abgelehnt'   : 'Rejected',
    expired:   de ? 'Abgelaufen'  : 'Expired',
    converted: de ? 'Umgewandelt' : 'Converted',
  };

  function makeStatusMutation(newStatus: QuoteStatus) {
    return useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
      mutationFn: () => salesQuotesApi.updateStatus(id!, newStatus),
      onSuccess:  () => { qc.invalidateQueries({ queryKey: ['sales-quotes'] }); refetch(); setActionError(''); },
      onError: (e: unknown) => {
        const err = e as { response?: { data?: { message?: string } } };
        setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
      },
    });
  }

  const sentMut     = makeStatusMutation('sent');
  const acceptMut   = makeStatusMutation('accepted');
  const rejectMut   = makeStatusMutation('rejected');

  const convertMut = useMutation({
    mutationFn: () => salesQuotesApi.convert(id!),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['sales-quotes'] });
      navigate(`/erp/verkauf/rechnungen/${res.data.invoice._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  const convertToOrderMut = useMutation({
    mutationFn: () => salesQuotesApi.convertToOrder(id!),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['sales-quotes'] });
      navigate(`/erp/verkauf/auftraege/${res.data.order._id}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !quote) return <Alert severity="error">{de ? 'Angebot nicht gefunden.' : 'Quote not found.'}</Alert>;

  const anyPending = sentMut.isPending || acceptMut.isPending || rejectMut.isPending || convertMut.isPending || convertToOrderMut.isPending;

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/verkauf/angebote')}>
          {de ? 'Angebote' : 'Quotes'}
        </Button>
      </Stack>

      {actionError && <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>}

      <Stack gap={3}>
        {/* Header card */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Stack direction="row" gap={1} alignItems="center" mb={0.5}>
                  <Typography variant="overline" color="text.secondary" fontFamily="monospace" fontWeight={700}>
                    {quote.quoteNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[quote.status]} color={STATUS_COLOR[quote.status]} />
                </Stack>
                <Typography variant="h5" fontWeight={700}>{quote.customerName}</Typography>
                {quote.customerAddress && (
                  <Typography variant="body2" color="text.secondary">{quote.customerAddress}</Typography>
                )}
                <Stack direction="row" gap={3} mt={1}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">{de ? 'Datum' : 'Date'}</Typography>
                    <Typography variant="body2">{new Date(quote.quoteDate).toLocaleDateString(locale)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">{de ? 'Gültig bis' : 'Valid until'}</Typography>
                    <Typography variant="body2">{new Date(quote.validUntil).toLocaleDateString(locale)}</Typography>
                  </Box>
                </Stack>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">{de ? 'Bruttobetrag' : 'Total'}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(quote.totalGrossCents, locale)}
                </Typography>
              </Box>
            </Stack>

            {/* Action buttons */}
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" gap={1} flexWrap="wrap">
              {quote.status === 'draft' && (
                <Button variant="outlined" startIcon={<SendIcon />} disabled={anyPending} onClick={() => sentMut.mutate()}>
                  {de ? 'Als gesendet markieren' : 'Mark as sent'}
                </Button>
              )}
              {quote.status === 'sent' && (
                <>
                  <Button variant="contained" color="success" startIcon={<CheckCircleIcon />}
                    disabled={anyPending} onClick={() => acceptMut.mutate()}>
                    {de ? 'Akzeptiert' : 'Mark accepted'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    disabled={anyPending} onClick={() => rejectMut.mutate()}>
                    {de ? 'Abgelehnt' : 'Mark rejected'}
                  </Button>
                </>
              )}
              {quote.status === 'accepted' && (
                <>
                  <Button variant="contained" color="primary" startIcon={<AssignmentIcon />}
                    disabled={anyPending} onClick={() => convertToOrderMut.mutate()}>
                    {convertToOrderMut.isPending
                      ? <CircularProgress size={20} color="inherit" />
                      : (de ? 'In Auftrag umwandeln' : 'Convert to order')}
                  </Button>
                  <Button variant="outlined" color="secondary" startIcon={<ReceiptIcon />}
                    disabled={anyPending} onClick={() => convertMut.mutate()}>
                    {convertMut.isPending
                      ? <CircularProgress size={20} color="inherit" />
                      : (de ? 'Direkt Rechnung erstellen' : 'Create invoice directly')}
                  </Button>
                </>
              )}
              {quote.convertedToInvoiceId && (
                <Button variant="text" onClick={() => navigate(`/erp/verkauf/rechnungen/${quote.convertedToInvoiceId}`)}>
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
                    <TableCell>{de ? 'Bezeichnung' : 'Description'}</TableCell>
                    <TableCell align="right">{de ? 'Menge' : 'Qty'}</TableCell>
                    <TableCell>{de ? 'Einheit' : 'Unit'}</TableCell>
                    <TableCell align="right">{de ? 'EP netto' : 'Unit price'}</TableCell>
                    <TableCell align="right">{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right">{de ? 'Netto' : 'Net'}</TableCell>
                    <TableCell align="right">{de ? 'Brutto' : 'Gross'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {quote.lineItems.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.description || l.itemName || '—'}</TableCell>
                      <TableCell align="right">{l.quantity}</TableCell>
                      <TableCell>{l.unit}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.unitPriceCents, locale)}</TableCell>
                      <TableCell align="right">{l.vatRate}%</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.totalNetCents, locale)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.totalGrossCents, locale)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} />
                    <TableCell align="right">
                      <Stack gap={0.5}>
                        <Typography variant="caption" color="text.secondary">{de ? 'Netto' : 'Net'}</Typography>
                        <Typography variant="caption" color="text.secondary">{de ? 'MwSt.' : 'VAT'}</Typography>
                        <Typography variant="body2" fontWeight={700}>{de ? 'Brutto' : 'Total'}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Stack gap={0.5}>
                        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(quote.totalNetCents, locale)}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(quote.totalVatCents, locale)}</Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(quote.totalGrossCents, locale)}</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        {/* Notes */}
        {(quote.notes || quote.internalNotes) && (
          <Card>
            <CardContent>
              <Stack gap={2}>
                {quote.notes && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" mb={0.5}>{de ? 'Anmerkungen' : 'Notes'}</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{quote.notes}</Typography>
                  </Box>
                )}
                {quote.internalNotes && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" mb={0.5}>{de ? 'Interne Notizen' : 'Internal notes'}</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{quote.internalNotes}</Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}
