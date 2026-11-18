import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableBody,
  TableRow, TableCell, Stack, Chip, CircularProgress, Alert,
  TextField, InputAdornment, Grid, Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { reportsApi, type OpenItem, type AgingBucket, type OpenItemsResult } from '../../../api/reports';

const BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

const BUCKET_COLOR: Record<AgingBucket, 'success' | 'default' | 'warning' | 'error' | 'error'> = {
  'current': 'success',
  '1-30':    'default',
  '31-60':   'warning',
  '61-90':   'error',
  '90+':     'error',
};

function bucketLabel(b: AgingBucket, de: boolean): string {
  if (b === 'current') return de ? 'Noch nicht fällig' : 'Not yet due';
  if (b === '90+')     return de ? '> 90 Tage' : '> 90 days';
  return de ? `${b} Tage` : `${b} days`;
}

function fmt(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'de-DE' ? 'de-DE' : 'en-GB');
}

function exportCsv(items: OpenItem[], locale: string) {
  const sep = ';';
  const header = ['Belegnummer', 'Name', 'Rechnungsdatum', 'Fälligkeitsdatum', 'Überfällig (Tage)', 'Offener Betrag (€)', 'Kategorie'].join(sep);
  const rows = items.map(i => [
    i.invoiceNumber,
    i.companyName,
    fmtDate(i.invoiceDate, locale),
    fmtDate(i.dueDate, locale),
    Math.max(0, i.daysOverdue),
    (i.openCents / 100).toFixed(2).replace('.', ','),
    i.bucket,
  ].join(sep));
  const blob = new Blob(['﻿' + [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `offene-posten_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  mode: 'ar' | 'ap';
}

export default function OpenItemsPage({ mode }: Props) {
  const { i18n } = useTranslation();
  const navigate  = useNavigate();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [search,    setSearch]    = useState('');
  const [bucketFilter, setBucket] = useState<AgingBucket | 'all'>('all');

  const { data, isLoading, isError } = useQuery<{ data: OpenItemsResult }>({
    queryKey: ['open-items', mode],
    queryFn:  () => mode === 'ar' ? reportsApi.ar() : reportsApi.ap(),
  });

  const result   = data?.data;
  const allItems = result?.items ?? [];
  const buckets  = result?.buckets ?? {} as Record<AgingBucket, number>;
  const totalOpen = result?.totalOpen ?? 0;

  const filtered = allItems.filter(item => {
    const matchSearch = !search.trim() ||
      item.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      item.companyName.toLowerCase().includes(search.toLowerCase());
    const matchBucket = bucketFilter === 'all' || item.bucket === bucketFilter;
    return matchSearch && matchBucket;
  });

  const detailPath = (item: OpenItem) =>
    mode === 'ar'
      ? `/erp/verkauf/rechnungen/${item._id}`
      : `/erp/einkauf/eingangsrechnungen/${item._id}`;

  const title = mode === 'ar'
    ? (de ? 'Offene Posten Debitoren' : 'Open AR – Accounts Receivable')
    : (de ? 'Offene Posten Kreditoren' : 'Open AP – Accounts Payable');

  const subtitle = mode === 'ar'
    ? (de ? 'Versendete Rechnungen, die noch nicht bezahlt wurden' : 'Sent invoices not yet paid')
    : (de ? 'Freigegebene Eingangsrechnungen, die noch nicht bezahlt wurden' : 'Approved vendor invoices not yet paid');

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
        </Box>
        {allItems.length > 0 && (
          <Button size="small" variant="outlined" startIcon={<DownloadIcon />}
            onClick={() => exportCsv(allItems, locale)}>
            CSV
          </Button>
        )}
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <>
          {/* Aging summary cards */}
          <Grid container spacing={2} mb={3}>
            {/* Total */}
            <Grid item xs={6} sm={4} md={2}>
              <Card
                sx={{ cursor: 'pointer', border: bucketFilter === 'all' ? 2 : 1, borderColor: bucketFilter === 'all' ? 'primary.main' : 'divider' }}
                onClick={() => setBucket('all')}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {de ? 'Gesamt offen' : 'Total open'}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(totalOpen, locale)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{allItems.length} {de ? 'Belege' : 'items'}</Typography>
                </CardContent>
              </Card>
            </Grid>

            {BUCKETS.map(b => {
              const amount = buckets[b] ?? 0;
              const count  = allItems.filter(i => i.bucket === b).length;
              if (count === 0) return null;
              return (
                <Grid item xs={6} sm={4} md={2} key={b}>
                  <Card
                    sx={{ cursor: 'pointer', border: bucketFilter === b ? 2 : 1, borderColor: bucketFilter === b ? 'primary.main' : 'divider' }}
                    onClick={() => setBucket(prev => prev === b ? 'all' : b)}
                  >
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Chip size="small" label={bucketLabel(b, de)} color={BUCKET_COLOR[b]} sx={{ mb: 0.5, fontSize: 10 }} />
                      <Typography variant="subtitle2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(amount, locale)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{count} {de ? 'Belege' : 'items'}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          {/* Search */}
          <Card sx={{ mb: 2, p: 2 }}>
            <TextField
              size="small"
              placeholder={de ? 'Belegnummer oder Name suchen…' : 'Search by invoice number or name…'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ maxWidth: 360 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
          </Card>

          {/* Table */}
          {allItems.length === 0 ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              {de ? 'Keine offenen Posten — alles bezahlt!' : 'No open items — everything is paid!'}
            </Alert>
          ) : (
            <Card>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700 } }}>
                      <TableCell>{de ? 'Belegnummer' : 'Invoice #'}</TableCell>
                      <TableCell>{mode === 'ar' ? (de ? 'Kunde' : 'Customer') : (de ? 'Lieferant' : 'Supplier')}</TableCell>
                      <TableCell>{de ? 'Rechnungsdatum' : 'Invoice date'}</TableCell>
                      <TableCell>{de ? 'Fällig am' : 'Due date'}</TableCell>
                      <TableCell>{de ? 'Überfälligkeit' : 'Overdue'}</TableCell>
                      <TableCell align="right">{de ? 'Offener Betrag' : 'Open amount'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">
                            {de ? 'Keine Treffer.' : 'No results.'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : filtered.map(item => (
                      <TableRow
                        key={item._id} hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(detailPath(item))}
                      >
                        <TableCell>
                          <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                            {item.invoiceNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{item.companyName}</Typography>
                        </TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          <Typography variant="body2">{fmtDate(item.invoiceDate, locale)}</Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography
                            variant="body2"
                            color={item.daysOverdue > 0 ? 'error.main' : 'text.primary'}
                            fontWeight={item.daysOverdue > 0 ? 600 : 400}
                          >
                            {fmtDate(item.dueDate, locale)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {item.daysOverdue <= 0 ? (
                            <Chip size="small" color="success" label={de ? 'Fällig in ' + Math.abs(item.daysOverdue) + ' T.' : `Due in ${Math.abs(item.daysOverdue)}d`} />
                          ) : (
                            <Chip
                              size="small"
                              color={BUCKET_COLOR[item.bucket]}
                              label={de ? `${item.daysOverdue} Tage überfällig` : `${item.daysOverdue}d overdue`}
                            />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2" fontWeight={700}
                            color={item.daysOverdue > 60 ? 'error.main' : item.daysOverdue > 0 ? 'warning.main' : 'text.primary'}
                            sx={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {fmt(item.openCents, locale)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Card>
          )}
        </>
      )}
    </Box>
  );
}
