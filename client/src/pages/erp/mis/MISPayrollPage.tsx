import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Card, CardContent, Select, MenuItem, FormControl,
  CircularProgress, Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { misApi } from '../../../api/mis';
import { BarChart, LineChart } from './MISCharts';

function fmtEur(euros: number) {
  return euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function MISPayrollPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());
  const years = [year - 2, year - 1, year, year + 1];

  const results = useQueries({
    queries: [
      { queryKey: ['mis-payroll-m', year],  queryFn: () => misApi.payrollMonthly(year) },
      { queryKey: ['mis-revenue', year],    queryFn: () => misApi.revenueMonthly(year) },
    ],
  });

  const [payQ, revQ] = results;
  const loading = results.some(r => r.isLoading);
  const error   = results.some(r => r.isError);

  const payMonths = payQ.data?.data?.months ?? [];
  const revMonths = revQ.data?.data?.months ?? [];

  const totalGross = payMonths.reduce((s, m) => s + m.gross, 0);
  const totalNet   = payMonths.reduce((s, m) => s + m.net,   0);
  const totalRev   = revMonths.reduce((s, m) => s + m.amount, 0);
  const ytdRatio   = totalRev > 0 ? (totalGross / totalRev) * 100 : 0;

  const grossBarData = payMonths.map(m => ({ label: m.label, value: m.gross, color: '#6a1b9a' }));

  const ratioLineSeries = [{
    label: t('mis.payrollRatio'),
    data: payMonths.map((m, i) => ({
      label: m.label,
      value: revMonths[i]?.amount > 0 ? (m.gross / revMonths[i].amount) * 100 : 0,
    })),
    color: '#6a1b9a',
  }];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('mis.payroll')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('mis.payrollSubtitle')}</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {loading && <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>}
      {error   && <Alert severity="error">{t('common.error')}</Alert>}

      {!loading && (
        <>
          <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
            <Card sx={{ flex: 1, minWidth: 160 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.payrollGross')}</Typography>
                <Typography variant="h6" fontWeight={700} color="#6a1b9a" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEur(totalGross)}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 160 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.payrollNet')}</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEur(totalNet)}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 160 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.payrollRatio')}</Typography>
                <Typography variant="h6" fontWeight={700} color={ytdRatio > 50 ? 'error.main' : 'text.primary'}>
                  {ytdRatio.toFixed(1)} %
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {t('mis.payrollGross')} — {t('mis.monthly')}
              </Typography>
              <BarChart data={grossBarData} formatValue={v => fmtEur(v)} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {t('mis.payrollRatio')} (%)
              </Typography>
              <LineChart
                series={ratioLineSeries}
                formatValue={v => v.toFixed(1) + ' %'}
                formatYAxis={v => v.toFixed(0) + ' %'}
              />
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
