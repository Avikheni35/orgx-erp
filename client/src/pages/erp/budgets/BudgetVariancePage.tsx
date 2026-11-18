import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, CircularProgress, Alert,
  Table, TableHead, TableBody, TableRow, TableCell,
  FormControl, InputLabel, Select, MenuItem, LinearProgress, Chip,
  Card, CardContent, Grid,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTranslation } from 'react-i18next';
import { budgetsApi, type VarianceLine } from '../../../api/budgets';
import { fiscalYearsApi, type FiscalYear } from '../../../api/fiscalYears';

function fmtEur(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function VarianceBar({ pct, over }: { pct: number; over: boolean }) {
  const clamped = Math.min(pct, 100);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
      <Box sx={{ flex: 1 }}>
        <LinearProgress
          variant="determinate"
          value={clamped}
          sx={{
            height: 8, borderRadius: 4,
            '& .MuiLinearProgress-bar': {
              bgcolor: over ? 'error.main' : pct >= 80 ? 'warning.main' : 'success.main',
            },
          }}
        />
      </Box>
      <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct}%
      </Typography>
    </Box>
  );
}

export default function BudgetVariancePage() {
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedFY, setSelectedFY] = useState(searchParams.get('fy') ?? '');

  useEffect(() => {
    const fy = searchParams.get('fy');
    if (fy) setSelectedFY(fy);
  }, [searchParams]);

  const fyQ = useQuery({ queryKey: ['fiscal-years'], queryFn: () => fiscalYearsApi.list() });
  const fiscalYears: FiscalYear[] = fyQ.data?.data?.fiscalYears ?? [];

  const varQ = useQuery({
    queryKey: ['budget-variance', selectedFY],
    queryFn:  () => budgetsApi.variance(selectedFY),
    enabled:  !!selectedFY,
  });

  const lines: VarianceLine[] = varQ.data?.data?.lines ?? [];
  const fiscalYear = varQ.data?.data?.fiscalYear;
  const locale = de ? 'de-DE' : 'en-GB';

  const totalBudget   = lines.reduce((s, l) => s + l.budgetCents,   0);
  const totalActual   = lines.reduce((s, l) => s + l.actualCents,   0);
  const totalVariance = lines.reduce((s, l) => s + l.varianceCents, 0);
  const overallPct    = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;

  const overBudgetCount = lines.filter(l => l.varianceCents < 0).length;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Stack direction="row" gap={1} alignItems="center">
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/erp/budget')} size="small">
            {de ? 'Zurück' : 'Back'}
          </Button>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              {de ? 'Plan/Ist-Vergleich' : 'Budget Variance Report'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {fiscalYear ? fiscalYear.name : (de ? 'Budgetabweichungen je Konto' : 'Budget vs. actual per account')}
            </Typography>
          </Box>
        </Stack>
        <Button variant="outlined" startIcon={<SettingsIcon />}
          onClick={() => navigate(`/erp/budget${selectedFY ? `?fy=${selectedFY}` : ''}`)}>
          {de ? 'Budgets verwalten' : 'Manage budgets'}
        </Button>
      </Stack>

      {/* FY selector */}
      <Stack direction="row" gap={2} mb={3}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{de ? 'Geschäftsjahr' : 'Fiscal year'}</InputLabel>
          <Select value={selectedFY} label={de ? 'Geschäftsjahr' : 'Fiscal year'}
            onChange={e => setSelectedFY(e.target.value)}>
            <MenuItem value="">{de ? '— wählen —' : '— select —'}</MenuItem>
            {fiscalYears.map(fy => (
              <MenuItem key={fy._id} value={fy._id}>{fy.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {!selectedFY && (
        <Alert severity="info">{de ? 'Bitte wählen Sie ein Geschäftsjahr.' : 'Please select a fiscal year.'}</Alert>
      )}

      {selectedFY && varQ.isLoading && (
        <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>
      )}
      {selectedFY && varQ.isError && (
        <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>
      )}

      {selectedFY && !varQ.isLoading && !varQ.isError && (
        <>
          {/* KPI cards */}
          <Grid container spacing={2} mb={3}>
            {[
              { label: de ? 'Gesamtbudget' : 'Total budget',   value: fmtEur(totalBudget, locale),   color: 'text.primary' },
              { label: de ? 'Gesamtausgaben' : 'Total actual',  value: fmtEur(totalActual, locale),   color: totalActual > totalBudget ? 'error.main' : 'success.main' },
              { label: de ? 'Verbleibend' : 'Remaining',        value: fmtEur(Math.abs(totalVariance), locale),
                color: totalVariance < 0 ? 'error.main' : 'success.main',
                suffix: totalVariance < 0 ? (de ? ' Überschreitung' : ' over') : (de ? ' frei' : ' free') },
              { label: de ? 'Auslastung' : 'Utilisation',       value: `${overallPct}%`, color: overallPct > 100 ? 'error.main' : overallPct > 80 ? 'warning.main' : 'text.primary' },
            ].map(card => (
              <Grid item xs={6} sm={3} key={card.label}>
                <Card variant="outlined">
                  <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                    <Typography variant="h6" fontWeight={700} color={card.color} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {card.value}{card.suffix ?? ''}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {overBudgetCount > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {de
                ? `${overBudgetCount} ${overBudgetCount === 1 ? 'Position überschreitet' : 'Positionen überschreiten'} das Budget.`
                : `${overBudgetCount} line${overBudgetCount === 1 ? '' : 's'} over budget.`}
            </Alert>
          )}

          {lines.length === 0 && (
            <Alert severity="info">
              {de ? 'Keine Budgets für dieses Geschäftsjahr. Erst Budgets anlegen.' : 'No budgets for this fiscal year. Add budget lines first.'}
            </Alert>
          )}

          {lines.length > 0 && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Bezeichnung' : 'Name'}</TableCell>
                    <TableCell>{de ? 'Konto' : 'Account'}</TableCell>
                    <TableCell>{de ? 'Kostenstelle' : 'Cost center'}</TableCell>
                    <TableCell align="right">{de ? 'Budget' : 'Budget'}</TableCell>
                    <TableCell align="right">{de ? 'Ist' : 'Actual'}</TableCell>
                    <TableCell align="right">{de ? 'Abweichung' : 'Variance'}</TableCell>
                    <TableCell sx={{ minWidth: 180 }}>{de ? 'Auslastung' : 'Usage'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map(l => {
                    const over = l.varianceCents < 0;
                    return (
                      <TableRow key={l._id} hover
                        sx={{ bgcolor: over ? 'error.main' : 'transparent',
                              '&:hover': { bgcolor: over ? 'error.dark' : undefined },
                              opacity: over ? undefined : undefined }}>
                        <TableCell sx={{ fontWeight: 500 }}>
                          {l.name}
                          {l.note && (
                            <Typography variant="caption" display="block" color="text.secondary">{l.note}</Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{l.accountNumber}</TableCell>
                        <TableCell>
                          {l.costCenterName || <Typography variant="caption" color="text.disabled">—</Typography>}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtEur(l.budgetCents, locale)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums',
                          color: over ? 'error.main' : 'text.primary', fontWeight: over ? 700 : 400 }}>
                          {fmtEur(l.actualCents, locale)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums',
                          color: over ? 'error.main' : 'success.main', fontWeight: 600 }}>
                          {over ? '– ' : '+ '}{fmtEur(Math.abs(l.varianceCents), locale)}
                          {over && (
                            <Chip size="small" label={de ? 'Überschreitung' : 'Over'} color="error" sx={{ ml: 1, height: 18, fontSize: 10 }} />
                          )}
                        </TableCell>
                        <TableCell>
                          <VarianceBar pct={l.usedPct} over={over} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Totals row */}
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 700 }}>
                      {de ? 'Gesamt' : 'Total'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtEur(totalBudget, locale)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: totalActual > totalBudget ? 'error.main' : 'text.primary' }}>
                      {fmtEur(totalActual, locale)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: totalVariance < 0 ? 'error.main' : 'success.main' }}>
                      {totalVariance < 0 ? '– ' : '+ '}{fmtEur(Math.abs(totalVariance), locale)}
                    </TableCell>
                    <TableCell>
                      <VarianceBar pct={overallPct} over={totalActual > totalBudget} />
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
