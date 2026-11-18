import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Alert, LinearProgress,
  Table, TableHead, TableBody, TableRow, TableCell, Chip, TextField,
  FormControl, InputLabel, Select, MenuItem, Divider,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useTranslation } from 'react-i18next';
import { cashbookApi, type CashBookEntryCreate } from '../../../api/cashbook';

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsv(text: string): string[][] {
  const delim    = text.includes(';') ? ';' : ',';
  const lines    = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines
    .filter(l => l.trim().length > 0)
    .map(line => {
      const cells: string[] = [];
      let cur     = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQuote = !inQuote; continue; }
        if (c === delim && !inQuote) { cells.push(cur.trim()); cur = ''; continue; }
        cur += c;
      }
      cells.push(cur.trim());
      return cells;
    });
}

function normalizeAmount(raw: string): number {
  // Handle German decimal format: "1.234,56" → 1234.56
  let s = raw.replace(/[€$\s]/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d{2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ParsedRow {
  date:        string;
  description: string;
  amountRaw:   string;
  amountCents: number;
  type:        'receipt' | 'payment';
}

type ColKey = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'ignore';

// ── Main component ────────────────────────────────────────────────────────────
export default function BankStatementPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';

  const fileRef       = useRef<HTMLInputElement>(null);
  const [headers,     setHeaders]     = useState<string[]>([]);
  const [rows,        setRows]        = useState<string[][]>([]);
  const [mapping,     setMapping]     = useState<ColKey[]>([]);
  const [parsed,      setParsed]      = useState<ParsedRow[]>([]);
  const [cashAccount, setCashAccount] = useState('1200');
  const [contraAcct,  setContraAcct]  = useState('1800');
  const [vatRate,     setVatRate]     = useState(0);
  const [importDone,  setImportDone]  = useState(false);
  const [importStats, setImportStats] = useState({ ok: 0, fail: 0 });
  const [fileError,   setFileError]   = useState('');

  // Auto-detect column mapping from header names
  function autoMap(hdrs: string[]): ColKey[] {
    return hdrs.map(h => {
      const l = h.toLowerCase();
      if (l.includes('datum') || l.includes('date') || l.includes('buchungstag') || l.includes('valuta')) return 'date';
      if (l.includes('haben') || l.includes('credit') || l.includes('gutschrift') || l.includes('einnahm')) return 'credit';
      if (l.includes('soll') || l.includes('debit') || l.includes('lastschrift') || l.includes('ausgab')) return 'debit';
      if (l.includes('betrag') || l.includes('amount') || l.includes('umsatz') || l.includes('wert')) return 'amount';
      if (l.includes('text') || l.includes('verwendung') || l.includes('beschreibung') || l.includes('description') || l.includes('purpose') || l.includes('betreff')) return 'description';
      return 'ignore';
    });
  }

  function handleFile(file: File) {
    setFileError('');
    setImportDone(false);
    setParsed([]);
    setHeaders([]);
    setRows([]);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const all  = parseCsv(text);
      if (all.length < 2) { setFileError(de ? 'Datei enthält keine Daten.' : 'File contains no data.'); return; }
      const hdrs = all[0];
      const data = all.slice(1).filter(r => r.some(c => c.trim()));
      setHeaders(hdrs);
      setRows(data);
      setMapping(autoMap(hdrs));
    };
    reader.readAsText(file, 'utf-8');
  }

  function buildParsed(): ParsedRow[] {
    const dateIdx   = mapping.indexOf('date');
    const descIdx   = mapping.indexOf('description');
    const amtIdx    = mapping.indexOf('amount');
    const creditIdx = mapping.indexOf('credit');
    const debitIdx  = mapping.indexOf('debit');

    return rows.map(r => {
      const rawDate = dateIdx >= 0 ? r[dateIdx] : '';
      // Normalize German date dd.mm.yyyy → yyyy-mm-dd
      let date = rawDate;
      const dmY = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (dmY) date = `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`;

      const description = descIdx >= 0 ? r[descIdx] : r.join(' – ').slice(0, 120);

      let amountCents = 0;
      let type: 'receipt' | 'payment' = 'receipt';

      if (creditIdx >= 0 && debitIdx >= 0) {
        const creditAmt = normalizeAmount(r[creditIdx] || '0');
        const debitAmt  = normalizeAmount(r[debitIdx]  || '0');
        if (creditAmt > 0) { amountCents = Math.round(creditAmt * 100); type = 'receipt'; }
        else               { amountCents = Math.round(debitAmt  * 100); type = 'payment'; }
      } else if (amtIdx >= 0) {
        const n = normalizeAmount(r[amtIdx]);
        amountCents = Math.round(Math.abs(n) * 100);
        type = n >= 0 ? 'receipt' : 'payment';
      }

      return { date, description: description || '—', amountRaw: amtIdx >= 0 ? r[amtIdx] : '', amountCents, type };
    }).filter(p => p.amountCents > 0);
  }

  function handlePreview() { setParsed(buildParsed()); }

  const importMut = useMutation({
    mutationFn: async () => {
      const rows = buildParsed();
      let ok = 0; let fail = 0;
      for (const p of rows) {
        try {
          const body: CashBookEntryCreate = {
            date:          p.date,
            type:          p.type,
            description:   p.description,
            cashAccount,
            contraAccount: contraAcct,
            amountCents:   p.amountCents,
            vatRate,
          };
          await cashbookApi.create(body);
          ok++;
        } catch { fail++; }
      }
      return { ok, fail };
    },
    onSuccess: stats => { setImportStats(stats); setImportDone(true); },
  });

  function fmtCents(cents: number) {
    return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  const COL_OPTIONS: { value: ColKey; label: { de: string; en: string } }[] = [
    { value: 'date',        label: { de: 'Datum',        en: 'Date' } },
    { value: 'description', label: { de: 'Beschreibung', en: 'Description' } },
    { value: 'amount',      label: { de: 'Betrag (±)',   en: 'Amount (±)' } },
    { value: 'credit',      label: { de: 'Haben (+)',    en: 'Credit (+)' } },
    { value: 'debit',       label: { de: 'Soll (−)',     en: 'Debit (−)' } },
    { value: 'ignore',      label: { de: 'Ignorieren',   en: 'Ignore' } },
  ];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'Kontoauszug importieren' : 'Import Bank Statement'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'CSV-Datei der Bank hochladen und als Kassenbuchbuchungen importieren' : 'Upload bank CSV and import as cash book entries'}
          </Typography>
        </Box>
      </Stack>

      {/* Upload zone */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box
            sx={{
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
          >
            <UploadFileIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body1" fontWeight={600}>
              {de ? 'CSV-Datei hier ablegen oder klicken zum Auswählen' : 'Drop CSV file here or click to select'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {de ? 'Unterstützt: Sparkasse, Volksbank, ING, DKB, Postbank, etc.' : 'Supports: Sparkasse, Volksbank, ING, DKB, Postbank, etc.'}
            </Typography>
          </Box>
          <input ref={fileRef} type="file" accept=".csv" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </CardContent>
      </Card>

      {fileError && <Alert severity="error" sx={{ mb: 2 }}>{fileError}</Alert>}

      {/* Column mapping */}
      {headers.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>
              {de ? 'Spalten-Zuordnung' : 'Column mapping'} &mdash; {rows.length} {de ? 'Zeilen erkannt' : 'rows detected'}
            </Typography>
            <Stack direction="row" gap={2} flexWrap="wrap">
              {headers.map((h, i) => (
                <Box key={i} sx={{ minWidth: 160 }}>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5} noWrap title={h}>
                    {h || `Col ${i + 1}`}
                  </Typography>
                  <FormControl size="small" fullWidth>
                    <Select value={mapping[i] ?? 'ignore'} onChange={e => {
                      const m = [...mapping];
                      m[i] = e.target.value as ColKey;
                      setMapping(m);
                    }}>
                      {COL_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{de ? o.label.de : o.label.en}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* Account config */}
            <Typography variant="subtitle2" color="text.secondary" mb={2}>{de ? 'Buchungskonten' : 'Posting accounts'}</Typography>
            <Stack direction="row" gap={2} flexWrap="wrap">
              <TextField label={de ? 'Kassenkonto' : 'Cash account'} size="small" sx={{ width: 140 }}
                value={cashAccount} onChange={e => setCashAccount(e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace' } }} />
              <TextField label={de ? 'Gegenkonto (Standard)' : 'Contra account (default)'} size="small" sx={{ width: 200 }}
                value={contraAcct} onChange={e => setContraAcct(e.target.value)}
                inputProps={{ style: { fontFamily: 'monospace' } }} />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>{de ? 'MwSt. (Standard)' : 'VAT (default)'}</InputLabel>
                <Select value={vatRate} label={de ? 'MwSt. (Standard)' : 'VAT (default)'}
                  onChange={e => setVatRate(Number(e.target.value))}>
                  <MenuItem value={0}>0%</MenuItem>
                  <MenuItem value={7}>7%</MenuItem>
                  <MenuItem value={19}>19%</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            <Button variant="outlined" sx={{ mt: 2 }} onClick={handlePreview}>
              {de ? 'Vorschau anzeigen' : 'Preview'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview table */}
      {parsed.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle2" color="text.secondary">
                {de ? `Vorschau (erste 10 von ${parsed.length})` : `Preview (first 10 of ${parsed.length})`}
              </Typography>
              <Button
                variant="contained"
                startIcon={importMut.isPending ? undefined : <CloudUploadIcon />}
                disabled={importMut.isPending}
                onClick={() => importMut.mutate()}
              >
                {importMut.isPending
                  ? (de ? 'Importiere...' : 'Importing...')
                  : (de ? `${parsed.length} Buchungen importieren` : `Import ${parsed.length} entries`)}
              </Button>
            </Stack>

            {importMut.isPending && <LinearProgress sx={{ mb: 2 }} />}

            {importDone && (
              <Alert severity={importStats.fail === 0 ? 'success' : 'warning'} sx={{ mb: 2 }}>
                {de
                  ? `Import abgeschlossen: ${importStats.ok} erfolgreich, ${importStats.fail} fehlgeschlagen.`
                  : `Import done: ${importStats.ok} succeeded, ${importStats.fail} failed.`}
              </Alert>
            )}

            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                    <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                    <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                    <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                    <TableCell>{de ? 'Kasse' : 'Cash'}</TableCell>
                    <TableCell>{de ? 'Gegenkonto' : 'Contra'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {parsed.slice(0, 10).map((p, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 12 }}>{p.date}</TableCell>
                      <TableCell>
                        <Chip size="small"
                          label={p.type === 'receipt' ? (de ? 'Einnahme' : 'Receipt') : (de ? 'Ausgabe' : 'Payment')}
                          color={p.type === 'receipt' ? 'success' : 'error'}
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description}
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                        color: p.type === 'receipt' ? 'success.main' : 'error.main' }}>
                        {p.type === 'receipt' ? '+' : '−'} {fmtCents(p.amountCents)}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{cashAccount}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{contraAcct}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            {parsed.length > 10 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {de ? `… und ${parsed.length - 10} weitere Zeilen` : `… and ${parsed.length - 10} more rows`}
              </Typography>
            )}
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
