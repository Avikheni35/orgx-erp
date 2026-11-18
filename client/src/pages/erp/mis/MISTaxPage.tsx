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

export default function MISTaxPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());
  const years = [year - 2, year - 1, year, year + 1];

  const { data, isLoading, isError } = useQuery({
    queryKey: ['mis-vat', year],
    queryFn: () => misApi.vatMonthly(year),
  });

  const months = data?.data?.months ?? [];

  const totalUst = months.reduce((s, m) => s + m.ust, 0);
  const totalVst = months.reduce((s, m) => s + m.vst, 0);
  const netVat   = totalUst - totalVst;

  const grouped = months.map(m => ({
    label: m.label,
    values: [
      { key: 'ust', value: m.ust, color: '#c62828' },
      { key: 'vst', value: m.vst, color: '#2e7d32' },
    ],
  }));

  const netLineSeries = [{
    label: t('mis.netVat'),
    data: months.map(m => ({ label: m.label, value: m.net })),
    color: '#1565c0',
  }];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('mis.tax')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('mis.taxSubtitle')}</Typography>
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
          <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
            <Card sx={{ flex: 1, minWidth: 160 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.ustCollected')}</Typography>
                <Typography variant="h6" fontWeight={700} color="error.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEur(totalUst)}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 160 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.vstPaid')}</Typography>
                <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEur(totalVst)}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, minWidth: 160, outline: '2px solid', outlineColor: netVat > 0 ? 'error.main' : 'success.main' }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Typography variant="caption" color="text.secondary">{t('mis.netVat')}</Typography>
                <Typography variant="h6" fontWeight={700}
                  color={netVat > 0 ? 'error.main' : 'success.main'}
                  sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtEur(netVat)}
                </Typography>
              </CardContent>
            </Card>
          </Stack>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {t('mis.ustCollected')} / {t('mis.vstPaid')}
              </Typography>
              <GroupedBarChart
                data={grouped}
                formatValue={v => fmtEur(v)}
                legend={[
                  { key: 'ust', label: t('mis.ustCollected'), color: '#c62828' },
                  { key: 'vst', label: t('mis.vstPaid'),      color: '#2e7d32' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" mb={2}>
                {t('mis.netVat')}
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
