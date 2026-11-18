import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Card, CardContent, Select, MenuItem, FormControl,
  CircularProgress, Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { misApi } from '../../../api/mis';
import { GroupedBarChart, LineChart } from './MISCharts';

function fmtEur(euros: number) {
  return euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function MISCashflowPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());
  const years = [year - 2, year - 1, year, year + 1];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mis-cashflow', year],
    queryFn: () => misApi.cashflowMonthly(year),
  });

  const months = data?.data?.months ?? [];

  const totalReceipts = months.reduce((s, m) => s + m.receipts, 0);
  const totalPayments = months.reduce((s, m) => s + m.payments, 0);
  const netCashflow   = totalReceipts - totalPayments;

  const grouped = months.map(m => ({
    label: m.label,
    values: [
      { key: 'receipts', value: m.receipts, color: '#2e7d32' },
      { key: 'payments', value: m.payments, color: '#c62828' },
    ],
  }));

  const netLineSeries = [{
    label: t('mis.netCashflow'),
    data: months.map(m => ({ label: m.label, value: m.net })),
    color: '#1565c0',
  }];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('mis.cashflow')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('mis.cashflowSubtitle')}</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{t('common.error')}</Alert>}

      {!isLoading && months.length > 0 && (
        <>
          {/* Summary */}
          <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
            <Card sx={{ flex: 1, minWidth: 160 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.receipts')}</Typography>
                <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  + {fmtEur(totalReceipts)}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 160 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.payments')}</Typography>
                <Typography variant="h6" fontWeight={700} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  − {fmtEur(totalPayments)}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 160, outline: '2px solid', outlineColor: netCashflow >= 0 ? 'success.main' : 'error.main' }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.netCashflow')}</Typography>
                <Typography variant="h6" fontWeight={700}
                  color={netCashflow >= 0 ? 'success.main' : 'error.main'}
                  sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {netCashflow >= 0 ? '+' : '−'} {fmtEur(Math.abs(netCashflow))}
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          {/* Grouped bars */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {t('mis.receipts')} / {t('mis.payments')}
              </Typography>
              <GroupedBarChart
                data={grouped}
                formatValue={v => fmtEur(v)}
                legend={[
                  { key: 'receipts', label: t('mis.receipts'), color: '#2e7d32' },
                  { key: 'payments', label: t('mis.payments'), color: '#c62828' },
                ]}
              />
            </CardContent>
          </Card>

          {/* Net line */}
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {t('mis.netCashflow')}
              </Typography>
              <LineChart
                series={netLineSeries}
                formatValue={v => fmtEur(v)}
                formatYAxis={v => fmtEur(v)}
              />
            </CardContent>
          </Card>
        </>
      )}

      {!isLoading && months.length === 0 && (
        <Alert severity="info">{t('mis.noData')}</Alert>
      )}
    </Box>
  );
}
