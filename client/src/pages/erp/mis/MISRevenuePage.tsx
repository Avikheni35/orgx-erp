import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Card, CardContent, Select, MenuItem, FormControl,
  CircularProgress, Alert, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { misApi } from '../../../api/mis';
import { GroupedBarChart } from './MISCharts';

function fmtEur(euros: number) {
  return euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function MISRevenuePage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());
  const years = [year - 2, year - 1, year, year + 1];

  const results = useQueries({
    queries: [
      { queryKey: ['mis-revenue', year],       queryFn: () => misApi.revenueMonthly(year) },
      { queryKey: ['mis-revenue', year - 1],   queryFn: () => misApi.revenueMonthly(year - 1) },
      { queryKey: ['mis-top-cust', year],      queryFn: () => misApi.topCustomers(year, 10) },
    ],
  });

  const [thisQ, lastQ, custQ] = results;
  const loading = results.some(r => r.isLoading);

  const thisYear = thisQ.data?.data?.months ?? [];
  const lastYear = lastQ.data?.data?.months ?? [];
  const customers = custQ.data?.data?.customers ?? [];

  const totalRevenue = thisYear.reduce((s, m) => s + m.amount, 0);
  const bestMonth    = thisYear.reduce((best, m) => m.amount > best.amount ? m : best, { label: '—', amount: 0, month: 0, count: 0 });
  const avgMonthly   = thisYear.filter(m => m.amount > 0).length > 0
    ? totalRevenue / thisYear.filter(m => m.amount > 0).length
    : 0;

  const grouped = thisYear.map((m, i) => ({
    label: m.label,
    values: [
      { key: 'thisYear', value: m.amount,               color: '#2e7d32' },
      { key: 'lastYear', value: lastYear[i]?.amount ?? 0, color: '#a5d6a7' },
    ],
  }));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('mis.revenue')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('mis.revenueSubtitle')}</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {loading && <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>}

      {!loading && (
        <>
          {/* Summary strip */}
          <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
            {[
              { label: t('mis.revenueYTD'),      value: fmtEur(totalRevenue) },
              { label: t('mis.avgMonthly'),       value: fmtEur(avgMonthly) },
              { label: t('mis.bestMonth'),        value: `${bestMonth.label} (${fmtEur(bestMonth.amount)})` },
            ].map(item => (
              <Card key={item.label} sx={{ flex: 1, minWidth: 160 }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main"
                    sx={{ fontVariantNumeric: 'tabular-nums' }}>{item.value}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {/* YoY chart */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {year} {t('mis.vsLastYear')} {year - 1}
              </Typography>
              <GroupedBarChart
                data={grouped}
                formatValue={v => fmtEur(v)}
                legend={[
                  { key: 'thisYear', label: String(year),     color: '#2e7d32' },
                  { key: 'lastYear', label: String(year - 1), color: '#a5d6a7' },
                ]}
              />
            </CardContent>
          </Card>

          {/* Top customers */}
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>{t('mis.topCustomers')}</Typography>
              {customers.length === 0 ? (
                <Typography variant="body2" color="text.disabled">{t('mis.noData')}</Typography>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('mis.customer')}</TableCell>
                        <TableCell align="right">{t('mis.revenue')}</TableCell>
                        <TableCell align="right">{t('mis.invoiceCount')}</TableCell>
                        <TableCell align="right">{t('mis.avgInvoice')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {customers.map((c, i) => (
                        <TableRow key={i} hover>
                          <TableCell sx={{ color: 'text.disabled', width: 32 }}>{i + 1}</TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.companyName}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'success.main' }}>
                            {fmtEur(c.total)}
                          </TableCell>
                          <TableCell align="right">{c.invoiceCount}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtEur(c.invoiceCount > 0 ? c.total / c.invoiceCount : 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
