import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, Select, MenuItem, FormControl, InputLabel, Pagination,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { salesInvoicesApi, type InvoiceStatus } from '../../../api/salesInvoices';
import { useCanWrite } from '../../../hooks/useCanWrite';

const STATUS_COLOR: Record<InvoiceStatus, 'default'|'warning'|'info'|'success'|'error'> = {
  draft:     'default',
  sent:      'info',
  paid:      'success',
  cancelled: 'error',
};

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function SalesInvoiceListPage() {
  const navigate  = useNavigate();
  const { t, i18n } = useTranslation();
  const canWrite  = useCanWrite();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const STATUS_LABEL: Record<InvoiceStatus, string> = {
    draft:     t('salesInvoices.status.draft'),
    sent:      t('salesInvoices.status.sent'),
    paid:      t('salesInvoices.status.paid'),
    cancelled: t('salesInvoices.status.cancelled'),
  };

  const [status, setStatus] = useState('');
  const [page, setPage]     = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['sales-invoices', status, page],
    queryFn: () => salesInvoicesApi.list({
      status:  (status as InvoiceStatus) || undefined,
      page,
      limit: 50,
    }),
  });

  const invoices   = data?.data?.invoices   ?? [];
  const total      = data?.data?.total      ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;
  const now        = new Date();

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('salesInvoices.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('salesInvoices.count', { count: total })}</Typography>
        </Box>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/verkauf/rechnungen/new')}>
            {t('salesInvoices.createInvoice')}
          </Button>
        )}
      </Stack>

      <Card sx={{ mb: 3, p: 2 }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{t('common.status')}</InputLabel>
          <Select value={status} label={t('common.status')} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <MenuItem value="">{t('common.all')}</MenuItem>
            {(Object.keys(STATUS_LABEL) as InvoiceStatus[]).map(s => (
              <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Card>

      <Card>
        {isLoading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
        ) : invoices.length === 0 ? (
          <Box textAlign="center" py={6}>
            <Typography color="text.secondary">{t('salesInvoices.noInvoices')}</Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('salesInvoices.invoiceNumber')}</TableCell>
                <TableCell>{t('salesInvoices.customer')}</TableCell>
                <TableCell>{t('salesInvoices.invoiceDate')}</TableCell>
                <TableCell>{t('salesInvoices.dueDate')}</TableCell>
                <TableCell align="right">{t('salesInvoices.netAmount')}</TableCell>
                <TableCell align="right">{t('salesInvoices.grossAmount')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map(inv => {
                const overdue = inv.status === 'sent' && new Date(inv.dueDate) < now;
                return (
                  <TableRow
                    key={inv._id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/erp/verkauf/rechnungen/${inv._id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{inv.invoiceNumber}</Typography>
                    </TableCell>
                    <TableCell>{inv.customerSnapshot.companyName}</TableCell>
                    <TableCell>{new Date(inv.invoiceDate).toLocaleDateString(locale)}</TableCell>
                    <TableCell>
                      <Stack direction="row" alignItems="center" gap={0.5}>
                        {new Date(inv.dueDate).toLocaleDateString(locale)}
                        {overdue && <Chip size="small" label={t('salesInvoices.overdue')} color="error" />}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">{money(inv.totalNetCents, locale)}</TableCell>
                    <TableCell align="right"><strong>{money(inv.totalGrossCents, locale)}</strong></TableCell>
                    <TableCell>
                      <Chip size="small" label={STATUS_LABEL[inv.status]} color={STATUS_COLOR[inv.status]} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {totalPages > 1 && (
          <Box display="flex" justifyContent="center" py={2}>
            <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
          </Box>
        )}
      </Card>
    </Box>
  );
}
