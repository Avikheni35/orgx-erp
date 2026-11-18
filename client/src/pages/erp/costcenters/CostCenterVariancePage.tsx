import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, Stack, Grid, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, TextField, LinearProgress,
  Chip, Button,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useTranslation } from 'react-i18next';
import { vendorInvoicesApi, type CostCenterVarianceLine } from '../../../api/vendorInvoices';

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function currentYear() {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

function VarianceBar({ pct }: { pct: number | null }) {
  if (pct === null) return <Typography variant="caption" color="text.disabled">—</Typography>;
  const clamp = Math.min(pct, 100);
  const color = pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'success';
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      <Box sx={{ flex: 1, minWidth: 80 }}>
        <LinearProgress variant="determinate" value={clamp} color={color} sx={{ height: 8, borderRadius: 4 }} />
      </Box>
      <Typography variant="caption" sx={{ minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct} %
      </Typography>
    </Stack>
  );
}

export default function CostCenterVariancePage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [from, setFrom] = useState(currentYear().from);
  const [to,   setTo]   = useState(currentYear().to);

  const { data, isLoading, error } = useQuery({
    queryKey: ['cc-variance', from, to],
    queryFn: () => vendorInvoicesApi.costCenterVariance({ from, to }),
  });

  const lines: CostCenterVarianceLine[] = data?.data?.lines ?? [];
  const withBudget  = lines.filter(l => l.budgetCents > 0);
  const overBudget  = withBudget.filter(l => l.usedPct !== null && l.usedPct >= 100);
  const totalBudget = lines.reduce((s, l) => s + l.budgetCents, 0);
  const totalActual = lines.reduce((s, l) => s + l.actualSpendCents, 0);
  const totalVar    = totalBudget - totalActual;

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/kostenstellen')} size="small">
          {de ? 'Kostenstellen' : 'Cost Centers'}
        </Button>
        <Typography variant="h5" fontWeight={700}>
          {de ? 'Kostenstellenauswertung' : 'Cost Center Variance'}
        </Typography>
      </Stack>

      <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
        <TextField
          label={de ? 'Von' : 'From'}
          type="date" size="small"
          value={from}
          onChange={e => setFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          label={de ? 'Bis' : 'To'}
          type="date" size="small"
          value={to}
          onChange={e => setTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      {isLoading && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4 }} />}
      {error && <Alert severity="error">{t('common.error')}</Alert>}

      {!isLoading && !error && (
        <>
          {overBudget.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {de
                ? `${overBudget.length} Kostenstelle(n) über Budget.`
                : `${overBudget.length} cost center(s) over budget.`}
            </Alert>
          )}

          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Gesamtbudget' : 'Total Budget'}</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money(totalBudget, locale)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Ist-Kosten' : 'Actual Spend'}</Typography>
                  <Typography
                    variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}
                    color={totalActual > totalBudget && totalBudget > 0 ? 'error.main' : 'success.main'}
                  >
                    {money(totalActual, locale)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Abweichung' : 'Variance'}</Typography>
                  <Typography
                    variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}
                    color={totalVar < 0 ? 'error.main' : 'text.primary'}
                  >
                    {totalVar >= 0 ? '+' : ''}{money(totalVar, locale)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Über Budget' : 'Over Budget'}</Typography>
                  <Typography variant="h6" fontWeight={700} color={overBudget.length > 0 ? 'error.main' : 'text.primary'}>
                    {overBudget.length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                  <TableCell>{de ? 'Kostenstelle' : 'Cost Center'}</TableCell>
                  <TableCell align="right">{de ? 'Budget' : 'Budget'}</TableCell>
                  <TableCell align="right">{de ? 'Ist-Kosten' : 'Actual'}</TableCell>
                  <TableCell align="right">{de ? 'Abweichung' : 'Variance'}</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>{de ? 'Auslastung' : 'Usage'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map(l => {
                  const overBudgetLine = l.usedPct !== null && l.usedPct >= 100;
                  return (
                    <TableRow
                      key={l.costCenter._id}
                      hover
                      sx={{ cursor: 'pointer', bgcolor: overBudgetLine ? 'error.50' : undefined }}
                      onClick={() => navigate(`/erp/kostenstellen/${l.costCenter._id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">{l.costCenter.number}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{l.costCenter.name}</Typography>
                        {overBudgetLine && <Chip size="small" label={de ? 'Über Budget' : 'Over budget'} color="error" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {l.budgetCents > 0 ? money(l.budgetCents, locale) : <Typography variant="caption" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {money(l.actualSpendCents, locale)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ fontVariantNumeric: 'tabular-nums', color: l.varianceCents < 0 ? 'error.main' : 'text.primary', fontWeight: l.varianceCents < 0 ? 700 : 400 }}
                      >
                        {l.budgetCents > 0 ? (
                          <>{l.varianceCents >= 0 ? '+' : ''}{money(l.varianceCents, locale)}</>
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <VarianceBar pct={l.usedPct} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell colSpan={2} sx={{ fontWeight: 700 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(totalBudget, locale)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{money(totalActual, locale)}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: totalVar < 0 ? 'error.main' : 'text.primary' }}
                  >
                    {totalVar >= 0 ? '+' : ''}{money(totalVar, locale)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        </>
      )}
    </Box>
  );
}
