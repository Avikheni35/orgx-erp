import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, Alert, CircularProgress, Tabs, Tab, Tooltip, IconButton, Dialog,
  DialogTitle, DialogContent, DialogContentText, DialogActions,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SendIcon from '@mui/icons-material/Send';
import { useTranslation } from 'react-i18next';
import { dunningApi, type DunningCandidate, type DunningRecord } from '../../../api/dunning';

const LEVEL_COLOR: Record<number, 'warning' | 'error' | 'default'> = { 0: 'default', 1: 'warning', 2: 'error', 3: 'error' };
const LEVEL_LABEL_DE: Record<number, string> = { 0: '—', 1: '1. Mahnung', 2: '2. Mahnung', 3: 'Letzte Mahnung' };
const LEVEL_LABEL_EN: Record<number, string> = { 0: '—', 1: 'Reminder 1', 2: 'Reminder 2', 3: 'Final Notice' };

function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtDate(d: string, locale: string) {
  return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function DunningPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';
  const de = i18n.language === 'de';
  const LEVEL_LABEL = de ? LEVEL_LABEL_DE : LEVEL_LABEL_EN;

  const [tab, setTab] = useState(0);
  const [confirm, setConfirm] = useState<DunningCandidate | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: candData, isLoading: candLoading } = useQuery({
    queryKey: ['dunning-candidates'],
    queryFn: () => dunningApi.candidates(),
  });
  const { data: histData, isLoading: histLoading } = useQuery({
    queryKey: ['dunning-history'],
    queryFn: () => dunningApi.list({ limit: 100 }),
    enabled: tab === 1,
  });

  const issueMutation = useMutation({
    mutationFn: (invoiceId: string) => dunningApi.issue(invoiceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dunning-candidates'] });
      qc.invalidateQueries({ queryKey: ['dunning-history'] });
      setConfirm(null);
    },
  });

  const candidates = candData?.data?.candidates ?? [];
  const records    = histData?.data?.records    ?? [];

  const handleIssue = async () => {
    if (!confirm) return;
    setIssuing(true); setError('');
    try {
      await issueMutation.mutateAsync(confirm.invoiceId);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setError(err?.response?.data?.message ?? t('common.error'));
    } finally {
      setIssuing(false);
    }
  };

  const handlePdf = async (record: DunningRecord) => {
    setPdfLoadingId(record._id);
    try {
      const res = await dunningApi.pdf(record._id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Mahnung_${record.level}_${record.invoiceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoadingId(null);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('dunning.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('dunning.subtitle')}</Typography>
        </Box>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={de ? `Fällig (${candidates.length})` : `Due (${candidates.length})`} />
        <Tab label={de ? 'Mahnhistorie' : 'History'} />
      </Tabs>

      {/* TAB 0: Candidates */}
      {tab === 0 && (
        <>
          {candLoading ? (
            <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
          ) : candidates.length === 0 ? (
            <Card>
              <Box textAlign="center" py={8}>
                <Typography fontSize={40} mb={1}>✅</Typography>
                <Typography fontWeight={600}>{de ? 'Keine überfälligen Rechnungen' : 'No overdue invoices'}</Typography>
                <Typography variant="body2" color="text.secondary">{de ? 'Alle Debitoren sind auf dem neuesten Stand.' : 'All debtors are up to date.'}</Typography>
              </Box>
            </Card>
          ) : (
            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('dunning.invoiceNo')}</TableCell>
                    <TableCell>{t('dunning.customer')}</TableCell>
                    <TableCell>{t('dunning.dueDate')}</TableCell>
                    <TableCell align="right">{de ? 'Tage überfällig' : 'Days overdue'}</TableCell>
                    <TableCell align="right">{t('dunning.openAmount')}</TableCell>
                    <TableCell>{de ? 'Letzter Level' : 'Last level'}</TableCell>
                    <TableCell>{de ? 'Nächste Mahnung' : 'Next notice'}</TableCell>
                    {de ? <TableCell align="right">Mahngebühr</TableCell> : <TableCell align="right">Fee</TableCell>}
                    <TableCell align="right">{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {candidates.map(c => (
                    <TableRow key={c.invoiceId} hover>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{c.invoiceNumber}</Typography>
                      </TableCell>
                      <TableCell>{c.companyName}</TableCell>
                      <TableCell>
                        <Typography variant="body2" color="error.main" fontWeight={600}>{fmtDate(c.dueDate, locale)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={`${c.daysOverdue}d`} color={c.daysOverdue > 60 ? 'error' : 'warning'} />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600} color="error.main">
                          {money(c.openCents, locale)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {c.currentLevel > 0
                          ? <Chip size="small" label={LEVEL_LABEL[c.currentLevel]} color={LEVEL_COLOR[c.currentLevel]} />
                          : <Typography variant="caption" color="text.secondary">—</Typography>
                        }
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={LEVEL_LABEL[c.nextLevel]} color={LEVEL_COLOR[c.nextLevel]} />
                      </TableCell>
                      <TableCell align="right">
                        {c.feeCents > 0
                          ? <Typography variant="body2" fontFamily="monospace">{money(c.feeCents, locale)}</Typography>
                          : <Typography variant="caption" color="text.secondary">—</Typography>
                        }
                      </TableCell>
                      <TableCell align="right">
                        <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                          <Tooltip title={de ? 'Rechnung öffnen' : 'Open invoice'}>
                            <IconButton size="small" onClick={() => navigate(`/erp/verkauf/rechnungen/${c.invoiceId}`)}>
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Button
                            size="small"
                            variant="contained"
                            color={c.nextLevel === 3 ? 'error' : 'warning'}
                            startIcon={<SendIcon fontSize="small" />}
                            onClick={() => setConfirm(c)}
                          >
                            {LEVEL_LABEL[c.nextLevel]}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* TAB 1: History */}
      {tab === 1 && (
        <>
          {histLoading ? (
            <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
          ) : records.length === 0 ? (
            <Card><Box textAlign="center" py={8}><Typography color="text.secondary">{de ? 'Noch keine Mahnungen erstellt.' : 'No dunning letters issued yet.'}</Typography></Box></Card>
          ) : (
            <Card>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Ausgestellt am' : 'Issued'}</TableCell>
                    <TableCell>{t('dunning.invoiceNo')}</TableCell>
                    <TableCell>{t('dunning.customer')}</TableCell>
                    <TableCell>{de ? 'Mahnstufe' : 'Level'}</TableCell>
                    <TableCell>{de ? 'Neue Fälligkeit' : 'New due date'}</TableCell>
                    <TableCell align="right">{de ? 'Mahngebühr' : 'Fee'}</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {records.map(r => (
                    <TableRow key={r._id} hover>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">{fmtDate(r.issuedAt, locale)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2" fontFamily="monospace" fontWeight={600}
                          sx={{ cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                          onClick={() => navigate(`/erp/verkauf/rechnungen/${r.invoiceId}`)}
                        >
                          {r.invoiceNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>{r.companyName}</TableCell>
                      <TableCell>
                        <Chip size="small" label={LEVEL_LABEL[r.level]} color={LEVEL_COLOR[r.level]} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{fmtDate(r.dunningDueDate, locale)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        {r.feeCents > 0
                          ? <Typography variant="body2" fontFamily="monospace">{money(r.feeCents, locale)}</Typography>
                          : <Typography variant="caption" color="text.secondary">—</Typography>
                        }
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={de ? 'Mahnbrief PDF' : 'Dunning letter PDF'}>
                          <IconButton size="small" onClick={() => handlePdf(r)} disabled={pdfLoadingId === r._id}>
                            {pdfLoadingId === r._id ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Confirm dialog */}
      <Dialog open={!!confirm} onClose={() => { setConfirm(null); setError(''); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmberIcon color={confirm?.nextLevel === 3 ? 'error' : 'warning'} />
          {de ? `${LEVEL_LABEL[confirm?.nextLevel ?? 1]} ausstellen` : `Issue ${LEVEL_LABEL[confirm?.nextLevel ?? 1]}`}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <DialogContentText>
            {de
              ? `Mahnstufe ${confirm?.nextLevel} für Rechnung ${confirm?.invoiceNumber} (${confirm?.companyName}) erstellen?`
              : `Issue level ${confirm?.nextLevel} dunning for invoice ${confirm?.invoiceNumber} (${confirm?.companyName})?`}
          </DialogContentText>
          {(confirm?.feeCents ?? 0) > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              {de ? `Mahngebühr: ${money(confirm!.feeCents, locale)}` : `Dunning fee: ${money(confirm!.feeCents, locale)}`}
            </Alert>
          )}
          {confirm?.nextLevel === 3 && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {de ? 'Dies ist die letzte Mahnung vor Inkasso / Rechtsweg.' : 'This is the final notice before debt collection / legal action.'}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setConfirm(null); setError(''); }}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            color={confirm?.nextLevel === 3 ? 'error' : 'warning'}
            onClick={handleIssue}
            disabled={issuing}
            startIcon={issuing ? <CircularProgress size={16} /> : <SendIcon />}
          >
            {de ? 'Mahnung erstellen' : 'Issue notice'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
