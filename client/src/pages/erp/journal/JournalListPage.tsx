import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, TextField, Select, MenuItem, FormControl, InputLabel, Pagination,
  Tooltip, IconButton, CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import { useTranslation } from 'react-i18next';
import { journalApi, type JournalStatus } from '../../../api/journal';

const STATUS_COLOR: Record<JournalStatus, 'default' | 'info' | 'success' | 'error'> = {
  draft:    'default',
  posted:   'success',
  reversed: 'error',
};

function fmt(d: string, locale: string) {
  return new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function money(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function JournalListPage() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';

  const STATUS_LABEL: Record<JournalStatus, string> = {
    draft:    t('journal.statusDraft'),
    posted:   t('journal.statusPosted'),
    reversed: t('journal.statusReversed'),
  };

  const [status, setStatus]   = useState('');
  const [account, setAccount] = useState('');
  const [from, setFrom]       = useState('');
  const [to, setTo]           = useState('');
  const [page, setPage]       = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['journal', status, account, from, to, page],
    queryFn:  () => journalApi.list({
      status:  status  || undefined,
      account: account || undefined,
      from:    from    || undefined,
      to:      to      || undefined,
      page,
      limit: 50,
    }),
  });

  const entries    = data?.data?.entries    ?? [];
  const total      = data?.data?.total      ?? 0;
  const totalPages = data?.data?.totalPages ?? 1;

  const handleDatevExport = async () => {
    const res = await journalApi.exportDatev({ from: from || undefined, to: to || undefined });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'DATEV_Buchungsstapel.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('journal.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('journal.count', { count: total })}</Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<DownloadIcon />} size="small" onClick={handleDatevExport}>
            {t('journal.datevExport')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/buchfuehrung/new')}>
            {t('journal.createEntry')}
          </Button>
        </Stack>
      </Stack>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ width: 150 }}>
            <InputLabel>{t('common.status')}</InputLabel>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} label={t('common.status')}>
              <MenuItem value="">{t('common.all')}</MenuItem>
              <MenuItem value="draft">{t('journal.statusDraft')}</MenuItem>
              <MenuItem value="posted">{t('journal.statusPosted')}</MenuItem>
              <MenuItem value="reversed">{t('journal.statusReversed')}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            placeholder={`${t('journal.accountNumber')}...`}
            value={account}
            onChange={(e) => { setAccount(e.target.value); setPage(1); }}
            size="small"
            sx={{ width: 160 }}
          />
          <TextField
            label={t('common.from')}
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <TextField
            label={t('common.to')}
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
        </Box>
      </Card>

      {isLoading && <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>}

      {!isLoading && entries.length === 0 && (
        <Card>
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <Typography color="text.secondary" mb={2}>{t('journal.noEntries')}</Typography>
            <Button variant="contained" onClick={() => navigate('/erp/buchfuehrung/new')}>
              {t('journal.createFirst')}
            </Button>
          </Box>
        </Card>
      )}

      {!isLoading && entries.length > 0 && (
        <>
          <Card>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('journal.entryNumber')}</TableCell>
                  <TableCell>{t('journal.postingDate')}</TableCell>
                  <TableCell>{t('journal.postingText')}</TableCell>
                  <TableCell>{t('journal.referenceNo')}</TableCell>
                  <TableCell align="right">{t('common.debit')}</TableCell>
                  <TableCell align="right">{t('common.credit')}</TableCell>
                  <TableCell>{t('common.status')}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/buchfuehrung/${e._id}`)}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} fontFamily="monospace">{e.entryNumber}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">{fmt(e.date, locale)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>{e.description}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{e.reference || '—'}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontFamily="monospace" fontWeight={500}>{money(e.totalDebit)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontFamily="monospace" fontWeight={500}>{money(e.totalCredit)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={STATUS_LABEL[e.status]} color={STATUS_COLOR[e.status]} size="small" />
                    </TableCell>
                    <TableCell align="right" onClick={(ev) => ev.stopPropagation()}>
                      <Tooltip title={t('common.details')}>
                        <IconButton size="small" onClick={() => navigate(`/erp/buchfuehrung/${e._id}`)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" />
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
