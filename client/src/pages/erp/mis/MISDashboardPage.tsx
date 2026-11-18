import { useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Card, CardContent, Select, MenuItem, FormControl,
  CircularProgress, Alert, Table, TableHead, TableBody, TableRow, TableCell, Divider,
  Button, Chip, Collapse, IconButton, Tooltip,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import CampaignIcon from '@mui/icons-material/Campaign';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useTranslation } from 'react-i18next';
import { misApi, type AISuggestion, type SuggestionType } from '../../../api/mis';
import { KPITile, GroupedBarChart, DonutChart, BarChart } from './MISCharts';

function fmtEur(euros: number) {
  return euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const SUGGESTION_META: Record<SuggestionType, { icon: React.ReactNode; color: string; bg: string }> = {
  opportunity: { icon: <TrendingUpIcon sx={{ fontSize: 18 }} />, color: '#1b5e20', bg: '#e8f5e9' },
  warning:     { icon: <WarningAmberIcon sx={{ fontSize: 18 }} />, color: '#e65100', bg: '#fff3e0' },
  reorder:     { icon: <Inventory2Icon sx={{ fontSize: 18 }} />, color: '#0d47a1', bg: '#e3f2fd' },
  growth:      { icon: <LightbulbIcon sx={{ fontSize: 18 }} />, color: '#4a148c', bg: '#f3e5f5' },
  promotion:   { icon: <CampaignIcon sx={{ fontSize: 18 }} />, color: '#00695c', bg: '#e0f2f1' },
};

const PRIORITY_COLOR: Record<string, 'error' | 'warning' | 'default'> = {
  high: 'error', medium: 'warning', low: 'default',
};

function AIAdvisorPanel() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [enabled, setEnabled] = useState(false);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['mis-ai-advisor'],
    queryFn: () => misApi.aiAdvisor(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const suggestions: AISuggestion[] = data?.data?.suggestions ?? [];

  return (
    <Card sx={{ mt: 3, border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{
              width: 32, height: 32, borderRadius: 1.5,
              background: 'linear-gradient(135deg, #4a148c, #7b1fa2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <AutoAwesomeIcon sx={{ fontSize: 16, color: '#fff' }} />
            </Box>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                {t('mis.aiAdvisor')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('mis.aiAdvisorSubtitle')}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            {enabled && (
              <Tooltip title={t('mis.aiRefresh')}>
                <IconButton size="small" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton size="small" onClick={() => setOpen(v => !v)}>
              {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Stack>
        </Stack>

        <Collapse in={open}>
          <Box mt={2}>
            {!enabled && (
              <Stack alignItems="center" spacing={2} py={2}>
                <Typography variant="body2" color="text.secondary" textAlign="center" maxWidth={420}>
                  {t('mis.aiAdvisorDesc')}
                </Typography>
                <Button
                  variant="contained" startIcon={<AutoAwesomeIcon />}
                  onClick={() => setEnabled(true)}
                  sx={{ background: 'linear-gradient(135deg, #4a148c, #7b1fa2)', fontWeight: 700 }}
                >
                  {t('mis.aiAnalyse')}
                </Button>
              </Stack>
            )}

            {enabled && isFetching && (
              <Stack alignItems="center" spacing={1.5} py={3}>
                <CircularProgress size={28} />
                <Typography variant="body2" color="text.secondary">{t('mis.aiAnalysing')}</Typography>
              </Stack>
            )}

            {enabled && isError && (
              <Alert severity="error" sx={{ mt: 1 }}>{t('mis.aiError')}</Alert>
            )}

            {enabled && !isFetching && suggestions.length > 0 && (
              <Stack spacing={1.5} mt={1}>
                {suggestions.map((s, i) => {
                  const meta = SUGGESTION_META[s.type] ?? SUGGESTION_META.growth;
                  return (
                    <Box key={i} sx={{
                      display: 'flex', gap: 1.5, p: 1.5, borderRadius: 2,
                      bgcolor: meta.bg,
                      border: '1px solid',
                      borderColor: `${meta.color}22`,
                    }}>
                      <Box sx={{
                        width: 32, height: 32, borderRadius: 1, flexShrink: 0,
                        bgcolor: `${meta.color}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: meta.color,
                      }}>
                        {meta.icon}
                      </Box>
                      <Box flex={1}>
                        <Stack direction="row" alignItems="center" spacing={1} mb={0.3}>
                          <Typography variant="body2" fontWeight={700} color={meta.color}>
                            {s.title}
                          </Typography>
                          <Chip
                            label={t(`mis.priority_${s.priority}`)}
                            size="small"
                            color={PRIORITY_COLOR[s.priority] ?? 'default'}
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                          {s.metric && (
                            <Typography variant="caption" sx={{
                              ml: 'auto', fontWeight: 700, color: meta.color,
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {s.metric}
                            </Typography>
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary" lineHeight={1.5}>
                          {s.body}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

export default function MISDashboardPage() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());

  const results = useQueries({
    queries: [
      { queryKey: ['mis-summary', year],       queryFn: () => misApi.summary(year) },
      { queryKey: ['mis-profit', year],         queryFn: () => misApi.profitMonthly(year) },
      { queryKey: ['mis-payroll-m', year],      queryFn: () => misApi.payrollMonthly(year) },
      { queryKey: ['mis-top-customers', year],  queryFn: () => misApi.topCustomers(year, 5) },
    ],
  });

  const [sumQ, profQ, payQ, custQ] = results;
  const loading = results.some(r => r.isLoading);
  const error   = results.some(r => r.isError);

  const s    = sumQ.data?.data;
  const prof = profQ.data?.data?.months ?? [];
  const pay  = payQ.data?.data?.months ?? [];
  const cust = custQ.data?.data?.customers ?? [];

  const years = [year - 2, year - 1, year, year + 1, year + 2];

  const profitGrouped = prof.map(m => ({
    label: m.label,
    values: [
      { key: 'revenue',  value: m.revenue,  color: '#2e7d32' },
      { key: 'expenses', value: m.expenses, color: '#c62828' },
    ],
  }));

  const payBarData = pay.map(m => ({ label: m.label, value: m.gross, color: '#6a1b9a' }));

  const invoiceSegments = s ? [
    { label: t('mis.statusDraft'),     value: s.invoiceStatusCounts.draft,     color: '#90a4ae' },
    { label: t('mis.statusSent'),      value: s.invoiceStatusCounts.sent,      color: '#1565c0' },
    { label: t('mis.statusPaid'),      value: s.invoiceStatusCounts.paid,      color: '#2e7d32' },
    { label: t('mis.statusCancelled'), value: s.invoiceStatusCounts.cancelled, color: '#c62828' },
  ] : [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('mis.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('mis.overview')}</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {loading && <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>}
      {error   && <Alert severity="error">{t('common.error')}</Alert>}

      {s && (
        <>
          {/* KPI row */}
          <Stack direction="row" gap={1.5} mb={3} flexWrap="wrap">
            <KPITile label={t('mis.revenueYTD')}  value={fmtEur(s.revenueYTD)}     color="success" />
            <KPITile label={t('mis.expensesYTD')} value={fmtEur(s.expensesYTD)}    color="default" />
            <KPITile label={t('mis.netResult')}   value={fmtEur(s.netResultYTD)}
              color={s.netResultYTD >= 0 ? 'success' : 'error'}
              trend={s.netResultYTD >= 0 ? 'up' : 'down'} />
            <KPITile label={t('mis.cashBalance')} value={fmtEur(s.cashBalance)}     color="info" />
            <KPITile label={t('mis.openAR')}      value={fmtEur(s.openAR)}          color="warning" />
            <KPITile
              label={t('mis.overdue')}
              value={fmtEur(s.overdueARAmount)}
              subValue={`${s.overdueARCount} ${t('mis.invoices')}`}
              color={s.overdueARCount > 0 ? 'error' : 'default'}
              trend={s.overdueARCount > 0 ? 'down' : 'neutral'}
            />
          </Stack>

          {/* Charts row */}
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2} mb={3}>
            <Card sx={{ flex: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" mb={2}>
                  {t('mis.revenueVsExpenses')}
                </Typography>
                <GroupedBarChart
                  data={profitGrouped}
                  formatValue={v => fmtEur(v)}
                  legend={[
                    { key: 'revenue',  label: t('mis.revenue'),  color: '#2e7d32' },
                    { key: 'expenses', label: t('mis.costs'),     color: '#c62828' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" mb={2}>
                  {t('mis.invoiceStatus')}
                </Typography>
                <DonutChart segments={invoiceSegments} centerLabel={String(Object.values(s.invoiceStatusCounts).reduce((a, b) => a + b, 0))} />
              </CardContent>
            </Card>
          </Stack>

          {/* Bottom row */}
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" mb={2}>
                  {t('mis.topCustomers')}
                </Typography>
                {cust.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">{t('mis.noData')}</Typography>
                ) : (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('mis.customer')}</TableCell>
                        <TableCell align="right">{t('mis.revenue')}</TableCell>
                        <TableCell align="right">{t('mis.invoiceCount')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cust.map((c, i) => (
                        <TableRow key={i} hover>
                          <TableCell sx={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.companyName}
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {fmtEur(c.total)}
                          </TableCell>
                          <TableCell align="right">{c.invoiceCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" mb={2}>
                  {t('mis.payrollYTD')} — {t('mis.monthly')}
                </Typography>
                <BarChart data={payBarData} formatValue={v => fmtEur(v)} />
              </CardContent>
            </Card>
          </Stack>

          {/* Summary strip */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Stack direction="row" gap={3} flexWrap="wrap" divider={<Divider orientation="vertical" flexItem />}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('mis.payrollYTD')}</Typography>
                  <Typography fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEur(s.payrollYTD)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('mis.payrollRatio')}</Typography>
                  <Typography fontWeight={700}>{s.payrollRatio.toFixed(1)} %</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('mis.openAP')}</Typography>
                  <Typography fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEur(s.openAP)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* AI Advisor panel */}
          <AIAdvisorPanel />
        </>
      )}
    </Box>
  );
}
