import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CancelIcon from '@mui/icons-material/Cancel';
import { useTranslation } from 'react-i18next';
import { salesOrdersApi, type OrderStatus } from '../../../api/salesOrders';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<OrderStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'secondary'> = {
  draft:               'default',
  confirmed:           'info',
  partially_delivered: 'warning',
  delivered:           'success',
  invoiced:            'secondary',
  cancelled:           'error',
};

export default function SalesOrderDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [cancelOpen,  setCancelOpen]  = useState(false);
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales-order', id],
    queryFn:  () => salesOrdersApi.get(id!),
    enabled:  !!id,
  });

  const order = data?.data;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['sales-orders'] });
    refetch();
    setActionError('');
  }

  function onErr(e: unknown) {
    const err = e as { response?: { data?: { message?: string } } };
    setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
  }

  const confirmMut  = useMutation({ mutationFn: () => salesOrdersApi.updateStatus(id!, 'confirmed'),           onSuccess: invalidate, onError: onErr });
  const deliverMut  = useMutation({ mutationFn: () => salesOrdersApi.updateStatus(id!, 'delivered'),           onSuccess: invalidate, onError: onErr });
  const cancelMut   = useMutation({ mutationFn: () => salesOrdersApi.updateStatus(id!, 'cancelled'),           onSuccess: () => { invalidate(); setCancelOpen(false); }, onError: onErr });
  const convertMut  = useMutation({ mutationFn: () => salesOrdersApi.convert(id!),
    onSuccess: res => {
      invalidate();
      navigate(`/erp/verkauf/rechnungen/${res.data.invoice._id}`);
    },
    onError: onErr,
  });

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !order) return <Alert severity="error">{de ? 'Auftrag nicht gefunden.' : 'Sales order not found.'}</Alert>;

  const STATUS_LABEL: Record<OrderStatus, string> = {
    draft:               de ? 'Entwurf'           : 'Draft',
    confirmed:           de ? 'Bestätigt'          : 'Confirmed',
    partially_delivered: de ? 'Teilgeliefert'      : 'Partially delivered',
    delivered:           de ? 'Geliefert'          : 'Delivered',
    invoiced:            de ? 'Berechnet'          : 'Invoiced',
    cancelled:           de ? 'Storniert'          : 'Cancelled',
  };

  return (
    <Box maxWidth={860}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/verkauf/auftraege')}>
          {de ? 'Aufträge' : 'Orders'}
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
                    {order.orderNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[order.status]} color={STATUS_COLOR[order.status]} />
                  {order.quoteNumber && (
                    <Chip size="small" variant="outlined" label={order.quoteNumber} />
                  )}
                  {order.convertedToInvoiceId && (
                    <Chip size="small" variant="outlined" color="secondary" label={de ? 'Berechnet' : 'Invoiced'} />
                  )}
                </Stack>
                <Typography variant="h5" fontWeight={700}>{order.customerName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {new Date(order.orderDate).toLocaleDateString(locale)}
                  {order.deliveryDate && ` · ${de ? 'Lieferung' : 'Delivery'}: ${new Date(order.deliveryDate).toLocaleDateString(locale)}`}
                  {order.customerAddress && ` · ${order.customerAddress}`}
                </Typography>
              </Box>
              <Box textAlign="right">
                <Typography variant="caption" color="text.secondary">{de ? 'Brutto' : 'Gross'}</Typography>
                <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {money(order.totalGrossCents, locale)}
                </Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" gap={1} flexWrap="wrap">
              {order.status === 'draft' && (
                <>
                  <Button variant="contained" color="primary" startIcon={<CheckCircleIcon />}
                    disabled={confirmMut.isPending} onClick={() => confirmMut.mutate()}>
                    {de ? 'Bestätigen' : 'Confirm'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    onClick={() => setCancelOpen(true)}>
                    {de ? 'Stornieren' : 'Cancel'}
                  </Button>
                </>
              )}
              {order.status === 'confirmed' && (
                <>
                  <Button variant="contained" color="success" startIcon={<LocalShippingIcon />}
                    disabled={deliverMut.isPending} onClick={() => deliverMut.mutate()}>
                    {de ? 'Als geliefert markieren' : 'Mark as delivered'}
                  </Button>
                  <Button variant="outlined" color="secondary" startIcon={<ReceiptIcon />}
                    disabled={convertMut.isPending} onClick={() => convertMut.mutate()}>
                    {de ? 'Rechnung erstellen' : 'Create invoice'}
                  </Button>
                  <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                    onClick={() => setCancelOpen(true)}>
                    {de ? 'Stornieren' : 'Cancel'}
                  </Button>
                </>
              )}
              {(order.status === 'delivered' || order.status === 'partially_delivered') && !order.convertedToInvoiceId && (
                <Button variant="contained" color="secondary" startIcon={<ReceiptIcon />}
                  disabled={convertMut.isPending} onClick={() => convertMut.mutate()}>
                  {de ? 'Rechnung erstellen' : 'Create invoice'}
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
                    <TableCell align="right">{de ? 'Gesamt (netto)' : 'Total (net)'}</TableCell>
                    <TableCell align="right">{de ? 'Gesamt (brutto)' : 'Total (gross)'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.lineItems.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.description || l.itemName || '—'}</TableCell>
                      <TableCell>{l.unit}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{l.quantity}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.unitPriceCents, locale)}</TableCell>
                      <TableCell align="right">{l.vatRate}%</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(l.totalNetCents, locale)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(l.totalGrossCents, locale)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{de ? 'Netto' : 'Net'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(order.totalNetCents, locale)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{money(order.totalVatCents, locale)}</TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={5} align="right" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{de ? 'Gesamt (brutto)' : 'Total (gross)'}</TableCell>
                    <TableCell />
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.95rem' }}>{money(order.totalGrossCents, locale)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        {/* Notes */}
        {(order.notes || order.internalNotes || order.deliveryAddress) && (
          <Card>
            <CardContent>
              <Stack gap={1.5}>
                {order.deliveryAddress && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{de ? 'Lieferadresse' : 'Delivery address'}</Typography>
                    <Typography variant="body2">{order.deliveryAddress}</Typography>
                  </Box>
                )}
                {order.notes && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{de ? 'Notizen' : 'Notes'}</Typography>
                    <Typography variant="body2">{order.notes}</Typography>
                  </Box>
                )}
                {order.internalNotes && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{de ? 'Interne Notizen' : 'Internal notes'}</Typography>
                    <Typography variant="body2">{order.internalNotes}</Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>

      {/* Cancel dialog */}
      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)}>
        <DialogTitle>{de ? 'Auftrag stornieren?' : 'Cancel order?'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {de
              ? 'Der Auftrag wird unwiderruflich storniert.'
              : 'This order will be permanently cancelled.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>{de ? 'Abbrechen' : 'Go back'}</Button>
          <Button color="error" variant="contained" disabled={cancelMut.isPending}
            onClick={() => cancelMut.mutate()}>
            {de ? 'Stornieren' : 'Cancel order'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
