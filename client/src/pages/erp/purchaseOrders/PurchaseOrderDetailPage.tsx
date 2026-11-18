import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Chip, CircularProgress,
  Alert, Divider, Table, TableHead, TableBody, TableRow, TableCell,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendIcon from '@mui/icons-material/Send';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CancelIcon from '@mui/icons-material/Cancel';
import { useTranslation } from 'react-i18next';
import { purchaseOrdersApi, type PurchaseOrderStatus } from '../../../api/purchaseOrders';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<PurchaseOrderStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  draft:              'default',
  sent:               'info',
  partially_received: 'warning',
  received:           'success',
  cancelled:          'error',
};

export default function PurchaseOrderDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState<string[]>([]);
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn:  () => purchaseOrdersApi.get(id!),
    enabled:  !!id,
  });
  const po = data?.data;

  function makeStatusMutation(status: PurchaseOrderStatus) {
    return useMutation({ // eslint-disable-line react-hooks/rules-of-hooks
      mutationFn: () => purchaseOrdersApi.updateStatus(id!, status),
      onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); refetch(); setActionError(''); },
      onError: (e: unknown) => {
        const err = e as { response?: { data?: { message?: string } } };
        setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
      },
    });
  }

  const sendMut   = makeStatusMutation('sent');
  const cancelMut = makeStatusMutation('cancelled');

  const receiveMut = useMutation({
    mutationFn: () => {
      const lines = (po?.lineItems ?? []).map((_, i) => ({
        lineIndex:   i,
        receivedQty: parseFloat(receiveQtys[i] ?? '0') || 0,
      }));
      return purchaseOrdersApi.receive(id!, lines);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      refetch();
      setReceiveOpen(false);
      setActionError('');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  const convertMut = useMutation({
    mutationFn: () => purchaseOrdersApi.convert(id!),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      navigate(`/erp/einkauf/eingangsrechnungen/${res.data.invoiceId}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setActionError(err?.response?.data?.message ?? (de ? 'Fehler.' : 'Error.'));
    },
  });

  function openReceiveDialog() {
    setReceiveQtys((po?.lineItems ?? []).map(() => '0'));
    setReceiveOpen(true);
  }

  if (isLoading) return <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>;
  if (isError || !po) return <Alert severity="error">{de ? 'Bestellung nicht gefunden.' : 'Purchase order not found.'}</Alert>;

  const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
    draft:              de ? 'Entwurf'              : 'Draft',
    sent:               de ? 'Gesendet'             : 'Sent',
    partially_received: de ? 'Teilweise erhalten'   : 'Partially received',
    received:           de ? 'Vollständig erhalten' : 'Received',
    cancelled:          de ? 'Storniert'            : 'Cancelled',
  };

  const canReceive  = ['sent', 'partially_received'].includes(po.status);
  const canConvert  = ['received', 'partially_received'].includes(po.status) && !po.convertedToVendorInvoiceId;
  const canSend     = po.status === 'draft';
  const canCancel   = ['draft', 'sent', 'partially_received'].includes(po.status);

  return (
    <Box maxWidth={900}>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/einkauf/bestellungen')}>
          {de ? 'Bestellungen' : 'Purchase Orders'}
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
                    {po.poNumber}
                  </Typography>
                  <Chip size="small" label={STATUS_LABEL[po.status]} color={STATUS_COLOR[po.status]} />
                  {po.convertedToVendorInvoiceId && (
                    <Chip size="small" variant="outlined" label={de ? 'Umgewandelt' : 'Converted'} color="success"
                      onClick={() => navigate(`/erp/einkauf/eingangsrechnungen/${po.convertedToVendorInvoiceId}`)} />
                  )}
                </Stack>
                <Typography variant="h5" fontWeight={700}>{po.supplierName}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {de ? 'Bestelldatum: ' : 'Order date: '}{new Date(po.orderDate).toLocaleDateString(locale)}
                  {po.expectedDeliveryDate && ` · ${de ? 'Lieferung erwartet: ' : 'Expected: '}${new Date(po.expectedDeliveryDate).toLocaleDateString(locale)}`}
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtCents(po.totalCents, locale)}
              </Typography>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" gap={1} flexWrap="wrap">
              {canSend && (
                <Button variant="outlined" startIcon={<SendIcon />}
                  disabled={sendMut.isPending} onClick={() => sendMut.mutate()}>
                  {de ? 'Als gesendet markieren' : 'Mark as sent'}
                </Button>
              )}
              {canReceive && (
                <Button variant="contained" color="primary" startIcon={<LocalShippingIcon />}
                  onClick={openReceiveDialog}>
                  {de ? 'Wareneingang erfassen' : 'Record receipt'}
                </Button>
              )}
              {canConvert && (
                <Button variant="contained" color="success" startIcon={<ReceiptIcon />}
                  disabled={convertMut.isPending} onClick={() => convertMut.mutate()}>
                  {convertMut.isPending ? <CircularProgress size={20} color="inherit" /> : (de ? 'In Eingangsrechnung umwandeln' : 'Convert to invoice')}
                </Button>
              )}
              {canCancel && (
                <Button variant="outlined" color="error" startIcon={<CancelIcon />}
                  disabled={cancelMut.isPending} onClick={() => cancelMut.mutate()}>
                  {de ? 'Stornieren' : 'Cancel'}
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
                    <TableCell>{de ? 'Einheit' : 'Unit'}</TableCell>
                    <TableCell align="right">{de ? 'Bestellt' : 'Ordered'}</TableCell>
                    <TableCell align="right">{de ? 'Erhalten' : 'Received'}</TableCell>
                    <TableCell>{de ? 'Fortschritt' : 'Progress'}</TableCell>
                    <TableCell align="right">{de ? 'Einzelpreis' : 'Unit price'}</TableCell>
                    <TableCell>{de ? 'MwSt.' : 'VAT'}</TableCell>
                    <TableCell align="right">{de ? 'Gesamt (netto)' : 'Total (net)'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {po.lineItems.map((l, i) => {
                    const pct = l.quantity > 0 ? Math.round((l.receivedQuantity / l.quantity) * 100) : 0;
                    return (
                      <TableRow key={i}>
                        <TableCell>{l.description || '—'}</TableCell>
                        <TableCell>{l.unit}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{l.quantity}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: pct === 100 ? 'success.main' : 'text.primary' }}>
                          {l.receivedQuantity}
                        </TableCell>
                        <TableCell sx={{ minWidth: 100 }}>
                          <Stack gap={0.25}>
                            <LinearProgress variant="determinate" value={pct} color={pct === 100 ? 'success' : 'primary'} sx={{ height: 5, borderRadius: 1 }} />
                            <Typography variant="caption" color="text.secondary">{pct}%</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(l.unitPriceCents, locale)}</TableCell>
                        <TableCell>{l.vatRate}%</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(l.lineTotalCents, locale)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>

            {/* Totals */}
            <Stack alignItems="flex-end" gap={0.5} mt={2}>
              <Stack direction="row" gap={4}>
                <Typography variant="body2" color="text.secondary">{de ? 'Nettobetrag' : 'Net'}</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{fmtCents(po.subtotalCents, locale)}</Typography>
              </Stack>
              <Stack direction="row" gap={4}>
                <Typography variant="body2" color="text.secondary">{de ? 'MwSt.' : 'VAT'}</Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{fmtCents(po.vatTotalCents, locale)}</Typography>
              </Stack>
              <Divider sx={{ width: 240 }} />
              <Stack direction="row" gap={4}>
                <Typography variant="body1" fontWeight={700}>{de ? 'Gesamt (brutto)' : 'Total (gross)'}</Typography>
                <Typography variant="body1" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>{fmtCents(po.totalCents, locale)}</Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {/* Notes */}
        {(po.notes || po.deliveryAddress) && (
          <Card>
            <CardContent>
              <Stack gap={1.5}>
                {po.deliveryAddress && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{de ? 'Lieferadresse' : 'Delivery address'}</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{po.deliveryAddress}</Typography>
                  </Box>
                )}
                {po.notes && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{de ? 'Anmerkungen' : 'Notes'}</Typography>
                    <Typography variant="body2">{po.notes}</Typography>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Stack>

      {/* Receive dialog */}
      <Dialog open={receiveOpen} onClose={() => setReceiveOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{de ? 'Wareneingang erfassen' : 'Record goods receipt'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{de ? 'Position' : 'Item'}</TableCell>
                  <TableCell align="right">{de ? 'Bestellt' : 'Ordered'}</TableCell>
                  <TableCell align="right">{de ? 'Bereits erhalten' : 'Already received'}</TableCell>
                  <TableCell align="right">{de ? 'Jetzt erhalten' : 'Now receiving'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(po.lineItems ?? []).map((l, i) => (
                  <TableRow key={i}>
                    <TableCell>{l.description || `Position ${i + 1}`}</TableCell>
                    <TableCell align="right">{l.quantity}</TableCell>
                    <TableCell align="right">{l.receivedQuantity}</TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small" type="number" sx={{ width: 90 }}
                        value={receiveQtys[i] ?? '0'}
                        inputProps={{ min: 0, max: l.quantity - l.receivedQuantity, step: '0.01', style: { textAlign: 'right' } }}
                        onChange={e => setReceiveQtys(qs => { const n = [...qs]; n[i] = e.target.value; return n; })}
                        disabled={l.receivedQuantity >= l.quantity}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="contained" disabled={receiveMut.isPending} onClick={() => receiveMut.mutate()}>
            {receiveMut.isPending ? <CircularProgress size={20} /> : (de ? 'Eingang buchen' : 'Record')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
