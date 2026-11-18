import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Card, CardContent, Alert, CircularProgress,
  Table, TableHead, TableBody, TableRow, TableCell, Chip, Divider, TextField,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useTranslation } from 'react-i18next';
import apiClient from '../../../api/client';

// ── Types ──────────────────────────────────────────────────────────────────────
interface ParsedLine {
  date:        string;
  description: string;
  reference:   string;
  amountCents: number;
  type:        'receipt' | 'payment';
}

interface ImportResult {
  imported: number;
  skipped:  number;
  entries:  { entryNumber: string; description: string; amountCents: number; type: string }[];
}

// ── CSV Parser ─────────────────────────────────────────────────────────────────
function parseMt940Line(line: string, sep: string): ParsedLine | null {
  const cols = line.split(sep).map(c => c.replace(/^"|"$/g, '').trim());
  if (cols.length < 4) return null;
  const dateStr    = cols[0];
  const desc       = cols[1] || '';
  const ref        = cols[2] || '';
  const amountRaw  = cols[3].replace(',', '.').replace(/[^\d.\-]/g, '');
  const amount     = parseFloat(amountRaw);
  if (!dateStr || isNaN(amount)) return null;
  const parts = dateStr.split(/[.\/\-]/);
  let iso = dateStr;
  if (parts.length === 3) {
    if (parts[0].length === 2) iso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    else iso = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  }
  return {
    date:        iso,
    description: desc,
    reference:   ref,
    amountCents: Math.round(Math.abs(amount) * 100),
    type:        amount >= 0 ? 'receipt' : 'payment',
  };
}

function parseCsv(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep    = lines[0].includes(';') ? ';' : ',';
  return lines.slice(1).map(l => parseMt940Line(l, sep)).filter(Boolean) as ParsedLine[];
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function BankStatementPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const qc       = useQueryClient();

  const fileRef  = useRef<HTMLInputElement>(null);
  const [preview,     setPreview]     = useState<ParsedLine[]>([]);
  const [fileName,    setFileName]    = useState('');
  const [parseError,  setParseError]  = useState('');
  const [cashAccount, setCashAccount] = useState('1200');
  const [result,      setResult]      = useState<ImportResult | null>(null);

  function handleFile(file: File) {
    if (!file) return;
    setFileName(file.name);
    setParseError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => {
      const text   = e.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError(de
          ? 'Keine gültigen Buchungszeilen gefunden. Erwartetes Format: Datum;Beschreibung;Referenz;Betrag'
          : 'No valid lines found. Expected format: Date;Description;Reference;Amount');
        setPreview([]);
      } else {
        setPreview(parsed);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  const importMut = useMutation({
    mutationFn: () =>
      apiClient.post<ImportResult>('/cashbook/import', {
        cashAccount,
        entries: preview.map(p => ({
          date:        p.date,
          description: p.description,
          reference:   p.reference,
          amountCents: p.amountCents,
          type:        p.type,
        })),
      }),
    onSuccess: res => {
      setResult(res.data);
      setPreview([]);
      setFileName('');
      qc.invalidateQueries({ queryKey: ['cashbook'] });
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setParseError(err?.response?.data?.message ?? (de ? 'Import fehlgeschlagen.' : 'Import failed.'));
    },
  });

  function fmtCents(cents: number) {
    return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  return (
    <Box maxWidth={900}>
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700}>{de ? 'Kontoauszug importieren' : 'Import Bank Statement'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {de
            ? 'CSV-Datei mit Bankbuchungen importieren und automatisch ins Kassenbuch übertragen'
            : 'Import a CSV bank statement and create cash book entries automatically'}
        </Typography>
      </Box>

      <Stack gap={3}>
        {/* Instructions */}
        <Card>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={1}>
              {de ? 'Erwartetes CSV-Format' : 'Expected CSV format'}
            </Typography>
            <Box sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>
              {de ? 'Datum;Beschreibung;Referenz;Betrag' : 'Date;Description;Reference;Amount'}<br />
              01.08.2025;Kundenüberweisung Max Müller;RE-001;1500,00<br />
              05.08.2025;Miete August 2025;DAU-08;-2200,00
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              {de
                ? 'Positive Beträge = Einnahmen, negative Beträge = Ausgaben. Trennzeichen: Semikolon (;) oder Komma (,).'
                : 'Positive amounts = receipts, negative = payments. Separator: semicolon (;) or comma (,).'}
            </Typography>
          </CardContent>
        </Card>

        {/* Upload area */}
        <Card>
          <CardContent>
            <Stack gap={2}>
              <Stack direction="row" gap={2} alignItems="flex-end" flexWrap="wrap">
                <TextField
                  label={de ? 'Kassenkonto' : 'Cash account'}
                  size="small" sx={{ width: 160 }}
                  value={cashAccount} onChange={e => setCashAccount(e.target.value)}
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                />
                <Button variant="outlined" startIcon={<UploadFileIcon />}
                  onClick={() => fileRef.current?.click()}>
                  {fileName ? fileName : (de ? 'CSV-Datei auswählen' : 'Select CSV file')}
                </Button>
                <input
                  ref={fileRef} type="file" accept=".csv,.txt" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                />
              </Stack>

              {parseError && <Alert severity="error">{parseError}</Alert>}

              {preview.length > 0 && (
                <>
                  <Alert severity="info">
                    {de
                      ? `${preview.length} Buchungen erkannt. Überprüfen Sie die Vorschau und klicken Sie auf „Importieren".`
                      : `${preview.length} entries detected. Review the preview and click "Import".`}
                  </Alert>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                          <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                          <TableCell>{de ? 'Referenz' : 'Reference'}</TableCell>
                          <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                          <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {preview.slice(0, 20).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(row.date).toLocaleDateString(locale)}</TableCell>
                            <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.description}
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{row.reference || '—'}</TableCell>
                            <TableCell>
                              <Chip size="small"
                                label={row.type === 'receipt' ? (de ? 'Einnahme' : 'Receipt') : (de ? 'Ausgabe' : 'Payment')}
                                color={row.type === 'receipt' ? 'success' : 'error'} />
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                              color: row.type === 'receipt' ? 'success.main' : 'error.main' }}>
                              {row.type === 'receipt' ? '+' : '−'} {fmtCents(row.amountCents)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {preview.length > 20 && (
                          <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ color: 'text.disabled', py: 1 }}>
                              {de ? `… und ${preview.length - 20} weitere Buchungen` : `… and ${preview.length - 20} more entries`}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Box>

                  <Divider />
                  <Stack direction="row" justifyContent="flex-end">
                    <Button variant="contained" color="primary" size="large"
                      disabled={importMut.isPending}
                      startIcon={importMut.isPending ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
                      onClick={() => importMut.mutate()}>
                      {de ? `${preview.length} Buchungen importieren` : `Import ${preview.length} entries`}
                    </Button>
                  </Stack>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Import result */}
        {result && (
          <Card>
            <CardContent>
              <Alert severity="success" sx={{ mb: 2 }}>
                {de
                  ? `${result.imported} Buchungen importiert, ${result.skipped} übersprungen.`
                  : `${result.imported} entries imported, ${result.skipped} skipped.`}
              </Alert>
              {result.entries.length > 0 && (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                        <TableCell>{de ? 'Beschreibung' : 'Description'}</TableCell>
                        <TableCell>{de ? 'Art' : 'Type'}</TableCell>
                        <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {result.entries.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{e.entryNumber}</TableCell>
                          <TableCell>{e.description}</TableCell>
                          <TableCell>
                            <Chip size="small"
                              label={e.type === 'receipt' ? (de ? 'Einnahme' : 'Receipt') : (de ? 'Ausgabe' : 'Payment')}
                              color={e.type === 'receipt' ? 'success' : 'error'} />
                          </TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                            {fmtCents(e.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </CardContent>
          </Card>
        )}
      </Stack>
    </Box>
  );
}
