import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, FormControl,
  InputLabel, Select, MenuItem, Alert, Divider, Chip, CircularProgress,
  List, ListItem, ListItemIcon, ListItemText,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslation } from 'react-i18next';
import { fiscalYearsApi } from '../../../api/fiscalYears';
import { reportsApi } from '../../../api/reports';
import apiClient from '../../../api/client';

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function buildPresets(de: boolean) {
  const now = new Date();
  const y   = now.getFullYear();
  return [
    {
      key: `year_${y}`,
      label: `${de ? 'Gesamtjahr' : 'Full year'} ${y}`,
      from: isoDate(new Date(y, 0, 1)),
      to:   isoDate(new Date(y, 11, 31)),
    },
    {
      key: `year_${y - 1}`,
      label: `${de ? 'Gesamtjahr' : 'Full year'} ${y - 1}`,
      from: isoDate(new Date(y - 1, 0, 1)),
      to:   isoDate(new Date(y - 1, 11, 31)),
    },
    { key: `q1_${y}`, label: `Q1 ${y}`, from: isoDate(new Date(y, 0, 1)),  to: isoDate(new Date(y, 2, 31)) },
    { key: `q2_${y}`, label: `Q2 ${y}`, from: isoDate(new Date(y, 3, 1)),  to: isoDate(new Date(y, 5, 30)) },
    { key: `q3_${y}`, label: `Q3 ${y}`, from: isoDate(new Date(y, 6, 1)),  to: isoDate(new Date(y, 8, 30)) },
    { key: `q4_${y}`, label: `Q4 ${y}`, from: isoDate(new Date(y, 9, 1)),  to: isoDate(new Date(y, 11, 31)) },
  ];
}

export default function DatevExportPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const presets = useMemo(() => buildPresets(de), [de]);

  const [mode,      setMode]      = useState<'preset' | 'fy'>('preset');
  const [presetKey, setPresetKey] = useState(presets[0].key);
  const [fyId,      setFyId]      = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [lastExport, setLastExport] = useState<string | null>(null);

  const { data: fyData } = useQuery({ queryKey: ['fiscal-years'], queryFn: () => fiscalYearsApi.list() });
  const fys = fyData?.data?.fiscalYears ?? [];

  const preset = presets.find(p => p.key === presetKey) ?? presets[0];
  const params  = mode === 'fy' && fyId ? { fyId } : { from: preset.from, to: preset.to };

  // Preview: count posted entries in range
  const { data: susaData } = useQuery({
    queryKey: ['datev-preview', mode, presetKey, fyId],
    queryFn:  () => reportsApi.susa(params),
  });
  const rowCount = susaData?.data?.rows?.length ?? 0;

  async function handleDownload() {
    setError('');
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (mode === 'fy' && fyId) {
        queryParams.set('fyId', fyId);
      } else {
        queryParams.set('from', preset.from);
        queryParams.set('to',   preset.to);
      }

      // Use axios to get the file as a blob
      const response = await apiClient.get(`/reports/datev-export?${queryParams.toString()}`, {
        responseType: 'blob',
      });

      const contentDisposition = (response.headers as Record<string, string>)['content-disposition'] ?? '';
      const match = contentDisposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? 'datev_export.csv';

      const url = URL.createObjectURL(new Blob([response.data as BlobPart]));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(new Date().toLocaleString(locale));
    } catch (e: unknown) {
      const err = e as { response?: { data?: Blob } };
      if (err?.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const json = JSON.parse(text) as { message?: string };
          setError(json.message ?? (de ? 'Fehler beim Export.' : 'Export failed.'));
        } catch {
          setError(de ? 'Fehler beim Export.' : 'Export failed.');
        }
      } else {
        setError(de ? 'Fehler beim Export.' : 'Export failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box maxWidth={760}>
      <Stack direction="row" alignItems="center" gap={1} mb={1}>
        <Typography variant="h5" fontWeight={700}>
          {de ? 'DATEV-Export' : 'DATEV Export'}
        </Typography>
        <Chip size="small" label="EXTF Buchungsstapel" variant="outlined" sx={{ fontFamily: 'monospace' }} />
      </Stack>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {de
          ? 'Exportiert gebuchte Buchungssätze im DATEV EXTF-Format für den Steuerberater.'
          : 'Exports posted journal entries in DATEV EXTF format for your tax advisor.'}
      </Typography>

      <Stack gap={3}>
        {/* Filter card */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={2}>
              {de ? 'Zeitraum auswählen' : 'Select period'}
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems="flex-start">
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>{de ? 'Modus' : 'Mode'}</InputLabel>
                <Select value={mode} label={de ? 'Modus' : 'Mode'} onChange={e => setMode(e.target.value as 'preset' | 'fy')}>
                  <MenuItem value="preset">{de ? 'Zeitraum' : 'Date range'}</MenuItem>
                  <MenuItem value="fy">{de ? 'Geschäftsjahr' : 'Fiscal year'}</MenuItem>
                </Select>
              </FormControl>

              {mode === 'preset' ? (
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel>{de ? 'Zeitraum' : 'Period'}</InputLabel>
                  <Select value={presetKey} label={de ? 'Zeitraum' : 'Period'} onChange={e => setPresetKey(e.target.value)}>
                    {presets.map(p => <MenuItem key={p.key} value={p.key}>{p.label}</MenuItem>)}
                  </Select>
                </FormControl>
              ) : (
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel>{de ? 'Geschäftsjahr' : 'Fiscal year'}</InputLabel>
                  <Select value={fyId} label={de ? 'Geschäftsjahr' : 'Fiscal year'} onChange={e => setFyId(e.target.value)}>
                    <MenuItem value="">{de ? 'Bitte wählen…' : 'Please select…'}</MenuItem>
                    {fys.map(fy => <MenuItem key={fy._id} value={fy._id}>{fy.name}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </Stack>

            {/* Period badge */}
            {mode === 'preset' && (
              <Chip size="small" variant="outlined" sx={{ mt: 1.5 }}
                label={`${new Date(preset.from).toLocaleDateString(locale)} – ${new Date(preset.to).toLocaleDateString(locale)}`}
              />
            )}
          </CardContent>
        </Card>

        {/* Preview card */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} mb={1.5}>
              {de ? 'Vorschau' : 'Preview'}
            </Typography>
            <Stack direction="row" gap={3}>
              <Box>
                <Typography variant="caption" color="text.secondary">{de ? 'Konten mit Bewegungen' : 'Accounts with activity'}</Typography>
                <Typography variant="h5" fontWeight={700}>{rowCount}</Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* Format info */}
            <Typography variant="caption" color="text.secondary" display="block" mb={1} fontWeight={600} letterSpacing={0.5} textTransform="uppercase">
              {de ? 'Exportformat' : 'Export format'}
            </Typography>
            <List dense disablePadding>
              {[
                { icon: <CheckCircleOutlineIcon fontSize="small" color="success" />, text: de ? 'DATEV EXTF Buchungsstapel (Version 700)' : 'DATEV EXTF Buchungsstapel (version 700)' },
                { icon: <CheckCircleOutlineIcon fontSize="small" color="success" />, text: de ? 'Nur gebuchte (posted) Buchungssätze' : 'Posted journal entries only' },
                { icon: <CheckCircleOutlineIcon fontSize="small" color="success" />, text: de ? 'Soll/Haben-Kennzeichen automatisch gesetzt' : 'S/H indicator auto-set from debit/credit' },
                { icon: <CheckCircleOutlineIcon fontSize="small" color="success" />, text: de ? 'Beraternummer aus Unternehmenseinstellungen' : 'Advisor number from company settings' },
                { icon: <InfoOutlinedIcon fontSize="small" color="info" />,         text: de ? 'Encoding: UTF-8 mit BOM (kompatibel mit DATEV ≥ 2012)' : 'Encoding: UTF-8 with BOM (DATEV ≥ 2012)' },
                { icon: <WarningAmberIcon fontSize="small" color="warning" />,      text: de ? 'Keine Gewähr auf Vollständigkeit — vor Abgabe prüfen' : 'No warranty of completeness — verify before filing' },
              ].map((item, i) => (
                <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={<Typography variant="caption">{item.text}</Typography>} />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>

        {/* DATEV credentials reminder */}
        <Alert severity="info" icon={<InfoOutlinedIcon />}>
          {de
            ? 'Beraternummer und Mandantennummer werden aus den Unternehmenseinstellungen (Einstellungen → Unternehmen) übernommen. Bitte dort prüfen und ggf. eintragen.'
            : 'Advisor number (Beraternummer) and client number (Mandantennummer) are read from Company Settings → General. Please verify they are set correctly.'}
        </Alert>

        {error && <Alert severity="error">{error}</Alert>}

        {lastExport && (
          <Alert severity="success">
            {de ? `Zuletzt exportiert: ${lastExport}` : `Last exported: ${lastExport}`}
          </Alert>
        )}

        {/* Download button */}
        <Stack direction="row" justifyContent="flex-end">
          <Button
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
            disabled={loading || (mode === 'fy' && !fyId)}
            onClick={handleDownload}
            sx={{ minWidth: 220 }}
          >
            {loading
              ? (de ? 'Wird erstellt…' : 'Generating…')
              : (de ? 'DATEV-CSV herunterladen' : 'Download DATEV CSV')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
