import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Card, CardContent, Select, MenuItem, FormControl,
  CircularProgress, Table, TableHead, TableBody, TableRow, TableCell,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { misApi } from '../../../api/mis';
import { GroupedBarChart } from './MISCharts';

function fmtEur(euros: number) {
  return euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function MISCostPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());
  const years = [year - 2, year - 1, year, year + 1];

  const results = useQueries({
    queries: [
      { queryKey: ['mis-expenses', year],     queryFn: () => misApi.expensesMonthly(year) },
      { queryKey: ['mis-expenses', year - 1], queryFn: () => misApi.expensesMonthly(year - 1) },
      { queryKey: ['mis-top-sup', year],      queryFn: () => misApi.topSuppliers(year, 10) },
    ],
  });

  const [thisQ, lastQ, supQ] = results;
  const loading = results.some(r => r.isLoading);

  const thisYear  = thisQ.data?.data?.months ?? [];
  const lastYear  = lastQ.data?.data?.months ?? [];
  const suppliers = supQ.data?.data?.suppliers ?? [];

  const totalExpenses = thisYear.reduce((s, m) => s + m.amount, 0);
  const bestMonth     = thisYear.reduce((best, m) => m.amount > best.amount ? m : best, { label: '—', amount: 0, month: 0, count: 0 });
  const avgMonthly    = thisYear.filter(m => m.amount > 0).length > 0
    ? totalExpenses / thisYear.filter(m => m.amount > 0).length
    : 0;

  const grouped = thisYear.map((m, i) => ({
    label: m.label,
    values: [
      { key: 'thisYear', value: m.amount,               color: '#c62828' },
      { key: 'lastYear', value: lastYear[i]?.amount ?? 0, color: '#ef9a9a' },
    ],
  }));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('mis.costs')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('mis.costsSubtitle')}</Typography>
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
          <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
            {[
              { label: t('mis.expensesYTD'), value: fmtEur(totalExpenses) },
              { label: t('mis.avgMonthly'),  value: fmtEur(avgMonthly) },
              { label: t('mis.peakMonth'),   value: `${bestMonth.label} (${fmtEur(bestMonth.amount)})` },
            ].map(item => (
              <Card key={item.label} sx={{ flex: 1, minWidth: 160 }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="h6" fontWeight={700} color="error.main"
                    sx={{ fontVariantNumeric: 'tabular-nums' }}>{item.value}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {year} {t('mis.vsLastYear')} {year - 1}
              </Typography>
              <GroupedBarChart
                data={grouped}
                formatValue={v => fmtEur(v)}
                legend={[
                  { key: 'thisYear', label: String(year),     color: '#c62828' },
                  { key: 'lastYear', label: String(year - 1), color: '#ef9a9a' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>{t('mis.topSuppliers')}</Typography>
              {suppliers.length === 0 ? (
                <Typography variant="body2" color="text.disabled">{t('mis.noData')}</Typography>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>{t('mis.supplier')}</TableCell>
                        <TableCell align="right">{t('mis.costs')}</TableCell>
                        <TableCell align="right">{t('mis.invoiceCount')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {suppliers.map((s, i) => (
                        <TableRow key={i} hover>
                          <TableCell sx={{ color: 'text.disabled', width: 32 }}>{i + 1}</TableCell>
                          <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {s.companyName}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'error.main' }}>
                            {fmtEur(s.total)}
                          </TableCell>
                          <TableCell align="right">{s.invoiceCount}</TableCell>
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
