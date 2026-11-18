import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Chip, Table, TableHead, TableBody,
  TableRow, TableCell, CircularProgress, Alert, Select, MenuItem,
  FormControl, InputLabel, LinearProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { assetsApi } from '../../../api/assets';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STATUS_COLOR: Record<string, 'success' | 'default' | 'error'> = {
  active:            'success',
  fully_depreciated: 'default',
  disposed:          'error',
};

export default function AssetListPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState('active');
  const [pdfLoading, setPdfLoading]     = useState(false);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const blob = await assetsApi.downloadPdf({ status: statusFilter || undefined });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Anlagenregister_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['assets', statusFilter],
    queryFn:  () => assetsApi.list({ status: statusFilter || undefined }),
  });
  const assets = data?.data?.assets ?? [];

  const totalCost   = assets.reduce((s, a) => s + a.acquisitionCostCents, 0);
  const totalAccDep = assets.reduce((s, a) => s + a.accumulatedDepreciationCents, 0);
  const totalBook   = totalCost - totalAccDep;

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Anlagevermögen' : 'Fixed Assets'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Anlageregister mit linearer Abschreibung (AfA)' : 'Asset register with straight-line depreciation'}
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadPdf} disabled={pdfLoading}>
            {pdfLoading ? (de ? 'Wird erstellt…' : 'Generating…') : (de ? 'PDF exportieren' : 'Export PDF')}
          </Button>
          <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => navigate('/erp/anlagen/abschreibungslauf')}>
            {de ? 'AfA-Lauf' : 'Dep. run'}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/anlagen/new')}>
            {de ? 'Neue Anlage' : 'New asset'}
          </Button>
        </Stack>
      </Stack>

      {/* Summary chips */}
      {assets.length > 0 && (
        <Stack direction="row" gap={2} mb={2} flexWrap="wrap">
          <Chip label={`${de ? 'AHK' : 'Cost'}: ${fmtCents(totalCost, locale)}`} variant="outlined" />
          <Chip label={`${de ? 'Kum. AfA' : 'Acc. dep.'}: ${fmtCents(totalAccDep, locale)}`} variant="outlined" />
          <Chip label={`${de ? 'Buchwert' : 'Book value'}: ${fmtCents(totalBook, locale)}`} color="primary" />
        </Stack>
      )}

      {/* Filter */}
      <Stack direction="row" gap={2} mb={2}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{de ? 'Status' : 'Status'}</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)}>
            <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
            <MenuItem value="active">{de ? 'Aktiv' : 'Active'}</MenuItem>
            <MenuItem value="fully_depreciated">{de ? 'Vollständig abgeschrieben' : 'Fully depreciated'}</MenuItem>
            <MenuItem value="disposed">{de ? 'Abgegangen' : 'Disposed'}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {isLoading && <Box display="flex" justifyContent="center" mt={6}><CircularProgress /></Box>}
      {isError   && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}

      {!isLoading && !isError && (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                <TableCell>{de ? 'Bezeichnung' : 'Name'}</TableCell>
                <TableCell>{de ? 'Kategorie' : 'Category'}</TableCell>
                <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                <TableCell align="right">{de ? 'AHK' : 'Cost'}</TableCell>
                <TableCell align="right">{de ? 'Kum. AfA' : 'Acc. dep.'}</TableCell>
                <TableCell align="right">{de ? 'Buchwert' : 'Book value'}</TableCell>
                <TableCell>{de ? 'Abschreibung' : 'Depreciation'}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                    {de ? 'Keine Anlagen vorhanden.' : 'No assets found.'}
                  </TableCell>
                </TableRow>
              )}
              {assets.map(a => {
                const bookValue  = a.acquisitionCostCents - a.accumulatedDepreciationCents;
                const depBase    = a.acquisitionCostCents - a.residualValueCents;
                const pct        = depBase > 0 ? Math.round((a.accumulatedDepreciationCents / depBase) * 100) : 100;
                return (
                  <TableRow key={a._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/anlagen/${a._id}`)}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{a.assetNumber}</TableCell>
                    <TableCell><Typography variant="body2" fontWeight={500}>{a.name}</Typography></TableCell>
                    <TableCell>{a.category || '—'}</TableCell>
                    <TableCell>
                      <Chip size="small"
                        label={a.status === 'active' ? (de ? 'Aktiv' : 'Active') : a.status === 'fully_depreciated' ? (de ? 'Abgeschrieben' : 'Depreciated') : (de ? 'Abgegangen' : 'Disposed')}
                        color={STATUS_COLOR[a.status]}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtCents(a.acquisitionCostCents, locale)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>{fmtCents(a.accumulatedDepreciationCents, locale)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtCents(bookValue, locale)}</TableCell>
                    <TableCell sx={{ minWidth: 120 }}>
                      <Stack gap={0.5}>
                        <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 1 }} color={pct === 100 ? 'inherit' : 'primary'} />
                        <Typography variant="caption" color="text.secondary">{pct}%</Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

    </Box>
  );
}
