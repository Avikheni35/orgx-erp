import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, Stack, Select, MenuItem, FormControl,
  InputLabel, CircularProgress, Alert, Divider, Chip,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useTranslation } from 'react-i18next';
import { reportsApi, type BwaGroup } from '../../../api/reports';
import { fiscalYearsApi } from '../../../api/fiscalYears';

function fmt(n: number, locale: string) {
  return (n / 1).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function ResultChip({ value }: { value: number }) {
  if (value > 0) return <Chip size="small" color="success" icon={<TrendingUpIcon />} label={`+${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`} />;
  if (value < 0) return <Chip size="small" color="error"   icon={<TrendingDownIcon />} label={`${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`} />;
  return <Chip size="small" label="0,00 €" />;
}

function GroupRow({ label, value, locale, indent }: { label: string; value: number; locale: string; indent?: boolean }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.75, pl: indent ? 2 : 0 }}>
      <Typography variant="body2" color={indent ? 'text.secondary' : 'text.primary'}>{label}</Typography>
      <Typography
        variant="body2"
        fontWeight={indent ? 400 : 500}
        sx={{ fontVariantNumeric: 'tabular-nums' }}
        color={value < 0 ? 'error.main' : 'inherit'}
      >
        {fmt(value, locale)}
      </Typography>
    </Stack>
  );
}

function SubtotalRow({ label, value, locale }: { label: string; value: number; locale: string }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1, px: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
      <Typography variant="body2" fontWeight={700}>{label}</Typography>
      <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }} color={value < 0 ? 'error.main' : 'success.main'}>
        {fmt(value, locale)}
      </Typography>
    </Stack>
  );
}

export default function BwaPage() {
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [fyId, setFyId] = useState('');

  const { data: fyData } = useQuery({
    queryKey: ['fiscal-years'],
    queryFn:  () => fiscalYearsApi.list(),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['report-bwa', fyId],
    queryFn:  () => reportsApi.bwa(fyId ? { fyId } : undefined),
  });

  const fys     = fyData?.data?.fiscalYears ?? [];
  const groups  = data?.data?.groups ?? [];
  const summary = data?.data?.summary;

  const groupMap = Object.fromEntries(groups.map((g: BwaGroup) => [g.key, g]));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            {de ? 'Betriebswirtschaftliche Auswertung' : 'Management Report (BWA)'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Erfolgsrechnung nach SKR03-Kontengruppen' : 'P&L statement by SKR03 account groups'}
          </Typography>
        </Box>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{de ? 'Geschäftsjahr' : 'Fiscal year'}</InputLabel>
          <Select
            value={fyId}
            label={de ? 'Geschäftsjahr' : 'Fiscal year'}
            onChange={e => setFyId(e.target.value)}
          >
            <MenuItem value="">{de ? 'Alle Zeiträume' : 'All periods'}</MenuItem>
            {fys.map(fy => (
              <MenuItem key={fy._id} value={fy._id}>{fy.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden der Daten.' : 'Failed to load report.'}</Alert>}

      {!isLoading && !isError && summary && (
        <Card>
          <CardContent sx={{ maxWidth: 640 }}>

            {/* Revenue */}
            <Typography variant="overline" color="text.secondary" letterSpacing={1.2}>
              {de ? 'Betriebsleistung' : 'Operating Revenue'}
            </Typography>
            <GroupRow label={groupMap['revenue']?.label ?? 'Umsatzerlöse'} value={summary.revenue} locale={locale} indent />
            <SubtotalRow label={de ? 'Gesamtleistung' : 'Total revenue'} value={summary.revenue} locale={locale} />

            <Divider sx={{ my: 2 }} />

            {/* COGS */}
            <Typography variant="overline" color="text.secondary" letterSpacing={1.2}>
              {de ? 'Materialeinsatz' : 'Cost of goods sold'}
            </Typography>
            <GroupRow label={groupMap['cogs']?.label ?? 'Wareneinsatz'} value={summary.cogs} locale={locale} indent />
            <SubtotalRow label={de ? 'Rohertrag' : 'Gross profit'} value={summary.grossProfit} locale={locale} />

            <Divider sx={{ my: 2 }} />

            {/* Operating expenses */}
            <Typography variant="overline" color="text.secondary" letterSpacing={1.2}>
              {de ? 'Betriebsaufwand' : 'Operating expenses'}
            </Typography>
            {(['personnel', 'depreciation', 'other_ops', 'misc_exp'] as const).map(key => {
              const g = groupMap[key];
              if (!g || g.value === 0) return null;
              return <GroupRow key={key} label={g.label} value={g.value} locale={locale} indent />;
            })}
            <GroupRow label={de ? 'Gesamt Betriebsaufwand' : 'Total operating expenses'} value={summary.opExp} locale={locale} />
            <SubtotalRow label={de ? 'Betriebsergebnis (EBIT)' : 'Operating profit (EBIT)'} value={summary.ebit} locale={locale} />

            <Divider sx={{ my: 2 }} />

            {/* Financial result */}
            <Typography variant="overline" color="text.secondary" letterSpacing={1.2}>
              {de ? 'Finanzergebnis' : 'Financial result'}
            </Typography>
            {summary.interestInc !== 0 && (
              <GroupRow label={groupMap['interest_inc']?.label ?? 'Zinserträge'} value={summary.interestInc} locale={locale} indent />
            )}
            {summary.interestExp !== 0 && (
              <GroupRow label={groupMap['interest_exp']?.label ?? 'Zinsaufwand'} value={-summary.interestExp} locale={locale} indent />
            )}
            {(summary.interestInc !== 0 || summary.interestExp !== 0) && (
              <GroupRow label={de ? 'Finanzergebnis gesamt' : 'Total financial result'} value={summary.finResult} locale={locale} />
            )}

            <Divider sx={{ my: 2 }} />

            {/* EBT */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 1.5, px: 1.5, borderRadius: 1, bgcolor: summary.ebt >= 0 ? 'success.light' : 'error.light', opacity: 0.9 }}>
              <Typography variant="subtitle1" fontWeight={800}>
                {de ? 'Jahresergebnis (EBT)' : 'Net result (EBT)'}
              </Typography>
              <ResultChip value={summary.ebt} />
            </Stack>

          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !summary && (
        <Alert severity="info">
          {de
            ? 'Keine gebuchten Buchungssätze vorhanden. Genehmigen Sie Eingangsrechnungen oder versenden Sie Ausgangsrechnungen, um Buchungen zu erzeugen.'
            : 'No posted journal entries found. Approve vendor invoices or send sales invoices to generate entries.'}
        </Alert>
      )}
    </Box>
  );
}
