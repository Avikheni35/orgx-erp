import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Stack, Button, Alert, LinearProgress,
  Table, TableHead, TableBody, TableRow, TableCell, Chip,
  TextField, Stepper, Step, StepLabel, Paper, IconButton,
  Tooltip, Divider, CircularProgress,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import SendIcon from '@mui/icons-material/Send';
import { useTranslation } from 'react-i18next';
import { reconciliationApi, type BankRow, type MatchResult, type ApplyItem } from '../../../api/reconciliation';

// ── CSV parser (same as BankStatementPage) ────────────────────────────────────
function parseCsv(text: string): string[][] {
  const delim = text.includes(';') ? ';' : ',';
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.filter(l => l.trim()).map(line => {
    const cells: string[] = [];
    let cur = '', inQuote = false;
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
  let s = raw.replace(/[€$\s]/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d{2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

type ColKey = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'ignore';

function autoMap(hdrs: string[]): ColKey[] {
  return hdrs.map(h => {
    const l = h.toLowerCase();
    if (l.includes('datum') || l.includes('date') || l.includes('buchungstag')) return 'date';
    if (l.includes('haben') || l.includes('credit') || l.includes('gutschrift')) return 'credit';
    if (l.includes('soll') || l.includes('debit') || l.includes('lastschrift')) return 'debit';
    if (l.includes('betrag') || l.includes('amount') || l.includes('umsatz')) return 'amount';
    if (l.includes('text') || l.includes('verwendung') || l.includes('beschreibung') || l.includes('description')) return 'description';
    return 'ignore';
  });
}

function buildRows(hdrs: string[], data: string[][], mapping: ColKey[]): BankRow[] {
  const dateIdx   = mapping.indexOf('date');
  const descIdx   = mapping.indexOf('description');
  const amtIdx    = mapping.indexOf('amount');
  const creditIdx = mapping.indexOf('credit');
  const debitIdx  = mapping.indexOf('debit');

  return data.map(r => {
    const rawDate = dateIdx >= 0 ? r[dateIdx] : '';
    let date = rawDate;
    const dmY = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmY) date = `${dmY[3]}-${dmY[2].padStart(2,'0')}-${dmY[1].padStart(2,'0')}`;
    const description = descIdx >= 0 ? r[descIdx] : r.join(' ').slice(0, 120);
    let amountCents = 0, type: 'receipt' | 'payment' = 'receipt';
    if (creditIdx >= 0 && debitIdx >= 0) {
      const cr = normalizeAmount(r[creditIdx] || '0');
      const db = normalizeAmount(r[debitIdx]  || '0');
      if (cr > 0) { amountCents = Math.round(cr * 100); type = 'receipt'; }
      else        { amountCents = Math.round(db * 100); type = 'payment'; }
    } else if (amtIdx >= 0) {
      const n = normalizeAmount(r[amtIdx]);
      amountCents = Math.round(Math.abs(n) * 100);
      type = n >= 0 ? 'receipt' : 'payment';
    }
    return { date, description: description || '—', amountCents, type };
  }).filter(r => r.amountCents > 0 && r.type === 'receipt');
}

function fmtCents(n: number) {
  return (n / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function confidenceChip(c: string) {
  const map: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'error' }> = {
    high:   { label: 'Hoch',   color: 'success' },
    medium: { label: 'Mittel', color: 'warning' },
    low:    { label: 'Niedrig', color: 'default' },
    none:   { label: 'Kein',  color: 'error' },
  };
  const m = map[c] ?? map['none'];
  return <Chip label={m.label} size="small" color={m.color} />;
}

const STEPS = ['CSV hochladen', 'Zuordnung prüfen', 'Buchen'];

export default function BankReconciliationPage() {
  const { t, i18n } = useTranslation();
  const de = i18n.language === 'de';
  const fileRef = useRef<HTMLInputElement>(null);

  const [step,         setStep]         = useState(0);
  const [fileErr,      setFileErr]      = useState('');
  const [rows,         setRows]         = useState<BankRow[]>([]);
  const [results,      setResults]      = useState<MatchResult[]>([]);
  const [confirmed,    setConfirmed]    = useState<Set<number>>(new Set());
  const [bankAccount,  setBankAccount]  = useState('1200');
  const [ctrAccount,   setCtrAccount]   = useState('1400');
  const [applyResult,  setApplyResult]  = useState<{ created: number; failed: number; failedNumbers: string[] } | null>(null);

  const matchMut = useMutation({
    mutationFn: (r: BankRow[]) => reconciliationApi.match(r).then(d => d.data),
    onSuccess: (data) => {
      setResults(data.results);
      // Auto-confirm all high/medium confidence matches
      const autoConfirm = new Set(
        data.results.filter(r => r.match && (r.match.confidence === 'high' || r.match.confidence === 'medium')).map(r => r.idx)
      );
      setConfirmed(autoConfirm);
      setStep(1);
    },
  });

  const applyMut = useMutation({
    mutationFn: (items: ApplyItem[]) => reconciliationApi.apply(bankAccount, ctrAccount, items).then(d => d.data),
    onSuccess: (data) => {
      setApplyResult(data);
      setStep(2);
    },
  });

  function handleFile(file: File) {
    setFileErr('');
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const all  = parseCsv(text);
      if (all.length < 2) { setFileErr(de ? 'Datei enthält keine Daten.' : 'File contains no data.'); return; }
      const hdrs    = all[0];
      const data    = all.slice(1).filter(r => r.some(c => c.trim()));
      const mapping = autoMap(hdrs);
      const parsed  = buildRows(hdrs, data, mapping);
      if (parsed.length === 0) { setFileErr(de ? 'Keine Eingänge erkannt.' : 'No incoming transactions detected.'); return; }
      setRows(parsed);
    };
    reader.readAsText(file, 'utf-8');
  }

  function handleApply() {
    const items: ApplyItem[] = results
      .filter(r => confirmed.has(r.idx) && r.match)
      .map(r => ({
        date:          r.row.date,
        description:   r.row.description,
        amountCents:   r.row.amountCents,
        invoiceId:     r.match!.invoiceId,
        invoiceNumber: r.match!.invoiceNumber,
      }));
    applyMut.mutate(items);
  }

  const confirmedCount = results.filter(r => confirmed.has(r.idx) && r.match).length;

  return (
    <Box sx={{ p: 3, maxWidth: 1100 }}>
      <Typography variant="h5" fontWeight={700} mb={1}>
        {de ? 'Kontoauszug-Abstimmung' : 'Bank Reconciliation'}
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {de ? 'Bankumsätze automatisch offenen Rechnungen zuordnen und buchen.' : 'Auto-match bank transactions to open invoices and post payments.'}
      </Typography>

      <Stepper activeStep={step} sx={{ mb: 4 }}>
        {STEPS.map(label => (
          <Step key={label}><StepLabel>{label}</StepLabel></Step>
        ))}
      </Stepper>

      {/* ── Step 0: Upload ── */}
      {step === 0 && (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>
            {de ? 'CSV-Datei hochladen' : 'Upload CSV file'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {de ? 'Unterstützte Formate: Sparkasse, Volksbank, DKB, ING, DATEV-Buchungsexport. Trennzeichen: Semikolon oder Komma.' : 'Supported: Sparkasse, Volksbank, DKB, ING, DATEV export. Delimiter: semicolon or comma.'}
          </Typography>
          {fileErr && <Alert severity="error" sx={{ mb: 2 }}>{fileErr}</Alert>}

          <Stack spacing={2}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField label={de ? 'Bankkonto (SKR03)' : 'Bank account (SKR03)'} size="small" value={bankAccount}
                onChange={e => setBankAccount(e.target.value)} sx={{ width: 180 }} />
              <TextField label={de ? 'Debitorenkonto' : 'Debtor account'} size="small" value={ctrAccount}
                onChange={e => setCtrAccount(e.target.value)} sx={{ width: 180 }}
                helperText="z.B. 1400 (SKR03)" />
            </Stack>

            <Box
              sx={{ border: '2px dashed', borderColor: 'divider', borderRadius: 2, p: 4, textAlign: 'center', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <UploadFileIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography>{de ? 'CSV hier ablegen oder klicken' : 'Drop CSV here or click'}</Typography>
              <input ref={fileRef} type="file" accept=".csv,.txt" hidden onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </Box>

            {rows.length > 0 && (
              <Alert severity="success">
                {rows.length} {de ? 'Eingänge erkannt' : 'incoming transactions detected'}
              </Alert>
            )}

            <Button
              variant="contained" startIcon={<AutoFixHighIcon />}
              disabled={rows.length === 0 || matchMut.isPending}
              onClick={() => matchMut.mutate(rows)}
            >
              {matchMut.isPending ? <CircularProgress size={20} /> : (de ? 'Automatisch zuordnen' : 'Auto-match')}
            </Button>
          </Stack>
        </Paper>
      )}

      {/* ── Step 1: Review matches ── */}
      {step === 1 && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {de ? `${results.length} Transaktionen — ${confirmedCount} bestätigt` : `${results.length} transactions — ${confirmedCount} confirmed`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {de ? 'Häkchen = wird gebucht. Kreuz = wird übersprungen.' : 'Check = will be posted. Cross = skip.'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => setStep(0)}>{de ? 'Zurück' : 'Back'}</Button>
              <Button
                variant="contained" startIcon={<SendIcon />}
                disabled={confirmedCount === 0 || applyMut.isPending}
                onClick={handleApply}
              >
                {applyMut.isPending
                  ? <CircularProgress size={20} />
                  : (de ? `${confirmedCount} Zahlungen buchen` : `Post ${confirmedCount} payments`)}
              </Button>
            </Stack>
          </Stack>

          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 40 }} />
                  <TableCell>{de ? 'Datum' : 'Date'}</TableCell>
                  <TableCell>{de ? 'Verwendungszweck' : 'Reference'}</TableCell>
                  <TableCell align="right">{de ? 'Betrag' : 'Amount'}</TableCell>
                  <TableCell>{de ? 'Rechnungsnr.' : 'Invoice no.'}</TableCell>
                  <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                  <TableCell align="right">{de ? 'Offen' : 'Open'}</TableCell>
                  <TableCell>{de ? 'Konfidenz' : 'Confidence'}</TableCell>
                  <TableCell align="center">{de ? 'Buchen?' : 'Post?'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map(r => {
                  const isConfirmed = confirmed.has(r.idx);
                  const hasMatch    = !!r.match;
                  return (
                    <TableRow key={r.idx} sx={{ bgcolor: isConfirmed && hasMatch ? 'action.selected' : undefined, opacity: !hasMatch ? 0.5 : 1 }}>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{r.idx + 1}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.row.date}</TableCell>
                      <TableCell sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Tooltip title={r.row.description}><span>{r.row.description}</span></Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtCents(r.row.amountCents)}</TableCell>
                      <TableCell>{r.match?.invoiceNumber ?? '—'}</TableCell>
                      <TableCell>{r.match?.companyName ?? '—'}</TableCell>
                      <TableCell align="right">{r.match ? fmtCents(r.match.openCents) : '—'}</TableCell>
                      <TableCell>{r.match ? confidenceChip(r.match.confidence) : <Chip label="—" size="small" />}</TableCell>
                      <TableCell align="center">
                        {hasMatch ? (
                          <IconButton size="small"
                            onClick={() => {
                              setConfirmed(prev => {
                                const next = new Set(prev);
                                next.has(r.idx) ? next.delete(r.idx) : next.add(r.idx);
                                return next;
                              });
                            }}>
                            {isConfirmed
                              ? <CheckCircleIcon color="success" />
                              : <CancelIcon color="disabled" />}
                          </IconButton>
                        ) : (
                          <CancelIcon color="disabled" fontSize="small" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      )}

      {/* ── Step 2: Done ── */}
      {step === 2 && applyResult && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h5" fontWeight={700} mb={1}>
            {de ? 'Abstimmung abgeschlossen' : 'Reconciliation complete'}
          </Typography>
          <Typography variant="body1" mb={1}>
            <strong>{applyResult.created}</strong> {de ? 'Zahlungen gebucht.' : 'payments posted.'}
            {applyResult.failed > 0 && ` ${applyResult.failed} ${de ? 'fehlgeschlagen' : 'failed'}: ${applyResult.failedNumbers.join(', ')}`}
          </Typography>
          <Divider sx={{ my: 2 }} />
          <Button variant="contained" onClick={() => { setStep(0); setRows([]); setResults([]); setConfirmed(new Set()); setApplyResult(null); }}>
            {de ? 'Neue Abstimmung' : 'New reconciliation'}
          </Button>
        </Paper>
      )}
    </Box>
  );
}
