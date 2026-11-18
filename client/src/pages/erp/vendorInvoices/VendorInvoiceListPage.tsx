import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, Stack, Chip, Table, TableHead, TableBody,
  TableRow, TableCell, TablePagination, TextField, Select, MenuItem,
  FormControl, InputLabel, CircularProgress, Alert, Checkbox, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { vendorInvoicesApi, type VendorInvoiceStatus } from '../../../api/vendorInvoices';

const STATUS_COLOR: Record<VendorInvoiceStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default', pending_approval: 'warning', approved: 'info', rejected: 'error', paid: 'success', cancelled: 'error',
};

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function VendorInvoiceListPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const STATUS_LABEL: Record<VendorInvoiceStatus, string> = {
    draft:            t('vendorInvoices.status.draft'),
    pending_approval: t('vendorInvoices.status.pending_approval'),
    approved:         t('vendorInvoices.status.approved'),
    rejected:         t('vendorInvoices.status.rejected'),
    paid:             t('vendorInvoices.status.paid'),
    cancelled:        t('vendorInvoices.status.cancelled'),
  };

  const [status, setStatus]           = useState('');
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(0);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [sepaLoading, setSepaLoading] = useState(false);
  const [sepaError, setSepaError]     = useState('');
  const rowsPerPage                   = 25;

  const { data, isLoading, error } = useQuery({
    queryKey: ['vendor-invoices', { status, page }],
    queryFn: () => vendorInvoicesApi.list({ status: (status as VendorInvoiceStatus) || undefined, page: page + 1, limit: rowsPerPage }),
  });

  const invoices = data?.data?.invoices ?? [];
  const total    = data?.data?.total ?? 0;

  const filtered = search
    ? invoices.filter(inv =>
        inv.supplierInvoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
        inv.supplierSnapshot.companyName.toLowerCase().includes(search.toLowerCase())
      )
    : invoices;

  const approvedFiltered = filtered.filter(inv => inv.status === 'approved');

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === approvedFiltered.length && approvedFiltered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(approvedFiltered.map(i => i._id)));
    }
  }

  async function handleSepaExport() {
    if (!selected.size) return;
    setSepaLoading(true);
    setSepaError('');
    try {
      const res = await vendorInvoicesApi.sepaExport([...selected]);
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sepa-export-${new Date().toISOString().slice(0, 10)}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      setSelected(new Set());
    } catch {
      setSepaError(t('vendorInvoices.sepaExportError', 'SEPA-Export fehlgeschlagen'));
    } finally {
      setSepaLoading(false);
    }
  }

  const allApprovedSelected = approvedFiltered.length > 0 && selected.size === approvedFiltered.length;
  const someSelected = selected.size > 0 && !allApprovedSelected;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('vendorInvoices.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('vendorInvoices.subtitle')}</Typography>
        </Box>
        <Stack direction="row" gap={1}>
          {selected.size > 0 && (
            <Tooltip title={t('vendorInvoices.sepaExportHint', 'Ausgewählte Rechnungen als SEPA pain.001 exportieren')}>
              <span>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<DownloadIcon />}
                  onClick={handleSepaExport}
                  disabled={sepaLoading}
                >
                  {sepaLoading
                    ? t('common.loading')
                    : `SEPA Export (${selected.size})`}
                </Button>
              </span>
            </Tooltip>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/einkauf/eingangsrechnungen/new')}>
            {t('vendorInvoices.createInvoice')}
          </Button>
        </Stack>
      </Stack>

      {sepaError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSepaError('')}>{sepaError}</Alert>}

      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction="row" gap={2} flexWrap="wrap">
          <TextField
            size="small"
            placeholder={t('common.search')}
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select value={status} label={t('common.status')} onChange={e => { setStatus(e.target.value); setPage(0); }}>
              <MenuItem value="">{t('common.all')}</MenuItem>
              <MenuItem value="draft">{STATUS_LABEL.draft}</MenuItem>
              <MenuItem value="approved">{STATUS_LABEL.approved}</MenuItem>
              <MenuItem value="paid">{STATUS_LABEL.paid}</MenuItem>
              <MenuItem value="cancelled">{STATUS_LABEL.cancelled}</MenuItem>
            </Select>
          </FormControl>
          {approvedFiltered.length > 0 && (
            <Typography variant="body2" color="text.secondary" alignSelf="center">
              {t('vendorInvoices.sepaSelectHint', 'Genehmigte Rechnungen für SEPA-Export auswählen')}
            </Typography>
          )}
        </Stack>
      </Card>

      {isLoading && <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>}
      {error && <Alert severity="error">{t('common.error')}</Alert>}

      {!isLoading && (
        <Card>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Tooltip title={t('vendorInvoices.selectApproved', 'Alle genehmigten auswählen')}>
                    <Checkbox
                      checked={allApprovedSelected}
                      indeterminate={someSelected}
                      onChange={toggleAll}
                      disabled={approvedFiltered.length === 0}
                      size="small"
                    />
                  </Tooltip>
                </TableCell>
                <TableCell>{t('vendorInvoices.supplierInvoiceNumber')}</TableCell>
                <TableCell>{t('vendorInvoices.supplier')}</TableCell>
                <TableCell>{t('vendorInvoices.invoiceDate')}</TableCell>
                <TableCell>{t('vendorInvoices.dueDate')}</TableCell>
                <TableCell align="right">{t('vendorInvoices.grossAmount')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {t('vendorInvoices.noInvoices')}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(inv => {
                  const overdue = inv.status === 'approved' && new Date(inv.dueDate) < new Date();
                  const isApproved = inv.status === 'approved';
                  const isChecked = selected.has(inv._id);
                  return (
                    <TableRow
                      key={inv._id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/erp/einkauf/eingangsrechnungen/${inv._id}`)}
                    >
                      <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          size="small"
                          checked={isChecked}
                          onChange={() => toggleSelect(inv._id)}
                          disabled={!isApproved}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                          {inv.supplierInvoiceNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>{inv.supplierSnapshot.companyName}</TableCell>
                      <TableCell>{new Date(inv.invoiceDate).toLocaleDateString(locale)}</TableCell>
                      <TableCell sx={{ color: overdue ? 'error.main' : 'inherit' }}>
                        {new Date(inv.dueDate).toLocaleDateString(locale)}
                        {overdue && <Chip size="small" label={t('vendorInvoices.overdue')} color="error" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {money(inv.totalGrossCents, locale)}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={STATUS_LABEL[inv.status]} color={STATUS_COLOR[inv.status]} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[rowsPerPage]}
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
          />
        </Card>
      )}
    </Box>
  );
}
