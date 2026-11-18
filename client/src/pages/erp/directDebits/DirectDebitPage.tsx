import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Stack, Button, Tabs, Tab, Table, TableHead, TableBody,
  TableRow, TableCell, CircularProgress, Alert, Chip, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useTranslation } from 'react-i18next';
import { directDebitsApi, type MandateStatus, type RunStatus } from '../../../api/directDebits';

function fmtCents(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const RUN_COLOR: Record<RunStatus, 'default' | 'info' | 'success' | 'error'> = {
  draft:     'default',
  submitted: 'info',
  settled:   'success',
  returned:  'error',
};

const MANDATE_COLOR: Record<MandateStatus, 'success' | 'default' | 'error'> = {
  active:    'success',
  inactive:  'default',
  cancelled: 'error',
};

export default function DirectDebitPage() {
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';
  const locale   = de ? 'de-DE' : 'en-GB';
  const navigate = useNavigate();

  const [tab,          setTab]    = useState(0);
  const [runStatus,    setRunSt]  = useState('');
  const [mandateSt,    setMandSt] = useState('');

  const RUN_LABEL: Record<RunStatus, string> = {
    draft:     de ? 'Entwurf'     : 'Draft',
    submitted: de ? 'Eingereicht' : 'Submitted',
    settled:   de ? 'Abgerechnet' : 'Settled',
    returned:  de ? 'Rückläufer'  : 'Returned',
  };

  const MANDATE_LABEL: Record<MandateStatus, string> = {
    active:    de ? 'Aktiv'        : 'Active',
    inactive:  de ? 'Inaktiv'      : 'Inactive',
    cancelled: de ? 'Gekündigt'    : 'Cancelled',
  };

  const SEQ_LABEL: Record<string, string> = {
    FRST: de ? 'Erstlastschrift' : 'First',
    RCUR: de ? 'Folgelastschrift': 'Recurring',
    OOFF: de ? 'Einmalig'        : 'One-off',
    FNAL: de ? 'Letzte'          : 'Final',
  };

  const { data: runData, isLoading: runLoad, isError: runErr } = useQuery({
    queryKey: ['direct-debit-runs', runStatus],
    queryFn:  () => directDebitsApi.listRuns({ status: runStatus || undefined }),
    enabled:  tab === 0,
  });

  const { data: mandateData, isLoading: mandateLoad, isError: mandateErr } = useQuery({
    queryKey: ['sepa-mandates', mandateSt],
    queryFn:  () => directDebitsApi.listMandates({ status: mandateSt || undefined }),
    enabled:  tab === 1,
  });

  const runs     = runData?.data?.runs     ?? [];
  const mandates = mandateData?.data?.mandates ?? [];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{de ? 'SEPA-Lastschrift' : 'SEPA Direct Debit'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {de ? 'Mandate verwalten und Lastschriftläufe erstellen' : 'Manage mandates and create collection runs'}
          </Typography>
        </Box>
        <Stack direction="row" gap={1}>
          {tab === 0 && (
            <Button variant="contained" startIcon={<AddIcon />}
              onClick={() => navigate('/erp/zahlungen/lastschrift/runs/new')}>
              {de ? 'Neuer Lauf' : 'New run'}
            </Button>
          )}
          {tab === 1 && (
            <Button variant="contained" startIcon={<AddIcon />}
              onClick={() => navigate('/erp/zahlungen/lastschrift/mandate/new')}>
              {de ? 'Neues Mandat' : 'New mandate'}
            </Button>
          )}
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={de ? 'Lastschriftläufe' : 'Collection runs'} />
        <Tab label={de ? 'SEPA-Mandate' : 'SEPA Mandates'} />
      </Tabs>

      {/* ── Runs tab ── */}
      {tab === 0 && (
        <>
          <Stack direction="row" gap={2} mb={2}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Status</InputLabel>
              <Select value={runStatus} label="Status" onChange={e => setRunSt(e.target.value)}>
                <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
                {(Object.keys(RUN_LABEL) as RunStatus[]).map(s => (
                  <MenuItem key={s} value={s}>{RUN_LABEL[s]}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          {runLoad && <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>}
          {runErr  && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}
          {!runLoad && !runErr && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Nr.' : 'No.'}</TableCell>
                    <TableCell>{de ? 'Einzugsdatum' : 'Collection date'}</TableCell>
                    <TableCell align="right">{de ? 'Positionen' : 'Entries'}</TableCell>
                    <TableCell>{de ? 'Konto' : 'Bank account'}</TableCell>
                    <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                    <TableCell align="right">{de ? 'Gesamt' : 'Total'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                        {de ? 'Keine Lastschriftläufe gefunden.' : 'No collection runs found.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {runs.map(r => (
                    <TableRow key={r._id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/erp/zahlungen/lastschrift/runs/${r._id}`)}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{r.runNumber}</TableCell>
                      <TableCell>{new Date(r.collectionDate).toLocaleDateString(locale)}</TableCell>
                      <TableCell align="right">{r.entries.length}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{r.bankAccount}</TableCell>
                      <TableCell><Chip size="small" label={RUN_LABEL[r.status]} color={RUN_COLOR[r.status]} /></TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {fmtCents(r.totalAmountCents, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </>
      )}

      {/* ── Mandates tab ── */}
      {tab === 1 && (
        <>
          <Stack direction="row" gap={2} mb={2}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Status</InputLabel>
              <Select value={mandateSt} label="Status" onChange={e => setMandSt(e.target.value)}>
                <MenuItem value="">{de ? 'Alle' : 'All'}</MenuItem>
                {(Object.keys(MANDATE_LABEL) as MandateStatus[]).map(s => (
                  <MenuItem key={s} value={s}>{MANDATE_LABEL[s]}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          {mandateLoad && <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>}
          {mandateErr  && <Alert severity="error">{de ? 'Fehler beim Laden.' : 'Failed to load.'}</Alert>}
          {!mandateLoad && !mandateErr && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{de ? 'Mandatsreferenz' : 'Mandate ref.'}</TableCell>
                    <TableCell>{de ? 'Kunde' : 'Customer'}</TableCell>
                    <TableCell>IBAN</TableCell>
                    <TableCell>{de ? 'Typ' : 'Type'}</TableCell>
                    <TableCell>{de ? 'Sequenz' : 'Sequence'}</TableCell>
                    <TableCell>{de ? 'Unterzeichnet' : 'Signed'}</TableCell>
                    <TableCell>{de ? 'Status' : 'Status'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mandates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                        {de ? 'Keine Mandate gefunden.' : 'No mandates found.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {mandates.map(m => (
                    <TableRow key={m._id} hover sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/erp/zahlungen/lastschrift/mandate/${m._id}`)}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{m.mandateReference}</TableCell>
                      <TableCell><Typography variant="body2" fontWeight={500}>{m.customerName}</Typography></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{m.iban}</TableCell>
                      <TableCell><Chip size="small" variant="outlined" label={m.type} /></TableCell>
                      <TableCell>{SEQ_LABEL[m.sequence] ?? m.sequence}</TableCell>
                      <TableCell>{new Date(m.signedAt).toLocaleDateString(locale)}</TableCell>
                      <TableCell><Chip size="small" label={MANDATE_LABEL[m.status]} color={MANDATE_COLOR[m.status]} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
