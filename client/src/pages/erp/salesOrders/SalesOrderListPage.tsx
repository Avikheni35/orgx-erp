import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Table, TableHead, TableBody, TableRow,
  TableCell, CircularProgress, Alert, Chip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { salesOrdersApi, type OrderStatus } from '../../../api/salesOrders';

function fmtCents(cents: number, locale: string) {
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

export default function SalesOrderListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [statusFilter, setStatus] = useState('');

  const STATUS_LABEL: Record<OrderStatus, string> = {
    draft:               de ? 'Entwurf'           : 'Draft',
    confirmed:           de ? 'Bestätigt'          : 'Confirmed',
    partially_delivered: de ? 'Teilgeliefert'      : 'Partially delivered',
    delivered:           de ? 'Geliefert'          : 'Delivered',
    invoiced:            de ? 'Berechnet'          : 'Invoiced',
    cancelled:           de ? 'Storniert'          : 'Cancelled',
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['sales-orders', statusFilter],
    queryFn:  () => salesOrdersApi.list({ status: statusFilter || undefined }),
  });
  const orders = data?.data?.orders ?? [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Aufträge' : 'Sales Orders'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Bestätigte Kundenaufträge und Lieferstatus' : 'Confirmed customer orders and delivery status'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/verkauf/auftraege/new')}>
          {de ? 'Neuer Auftrag' : 'New order'}
        </Button>
      </Stack>

      <Stack direction="row" gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatus(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map(s => (
              <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                <TableCell>{de ? 'Auftragsdatum' : 'Order date'}</TableCell>
                <TableCell>{de ? 'Lieferdatum' : 'Delivery date'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'Betrag (brutto)' : 'Total (gross)'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Aufträge gefunden.' : 'No sales orders found.'}
                  </TableCell>
                </TableRow>
              )}
              {orders.map(o => (
                <TableRow key={o._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/verkauf/auftraege/${o._id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{o.orderNumber}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight={500}>{o.customerName}</Typography></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(o.orderDate).toLocaleDateString(locale)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString(locale) : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={STATUS_LABEL[o.status]} color={STATUS_COLOR[o.status]} />
                    {o.quoteNumber && (
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {o.quoteNumber}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtCents(o.totalGrossCents, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
