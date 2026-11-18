import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, TextField, Select, MenuItem, FormControl,
  InputLabel, Stack, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, CircularProgress, ToggleButtonGroup, ToggleButton, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import EditIcon from '@mui/icons-material/Edit';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ListIcon from '@mui/icons-material/List';
import SummarizeIcon from '@mui/icons-material/Summarize';
import { useTranslation } from 'react-i18next';
import { accountsApi, type Account, type AccountType } from '../../../api/accounts';

const TYPE_COLORS: Record<AccountType, 'info' | 'error' | 'success' | 'warning' | 'default'> = {
  asset: 'info', liability: 'error', equity: 'success', revenue: 'warning', expense: 'default',
};

function TreeNode({ account, children, depth, typeLabel }: { account: Account; children: Account[]; depth: number; typeLabel: string }) {
  const navigate = useNavigate();
  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/accounts/${account._id}`)}>
        <TableCell sx={{ pl: 2 + depth * 3 }}>
          <Typography variant="body2" fontWeight={600} fontFamily="monospace">{account.number}</Typography>
        </TableCell>
        <TableCell>
          <Typography variant="body2" sx={{ pl: depth * 1 }}>{account.name}</Typography>
        </TableCell>
        <TableCell><Chip label={typeLabel} color={TYPE_COLORS[account.type]} size="small" /></TableCell>
        <TableCell><Typography variant="caption" color="text.secondary">{account.taxCode || '—'}</Typography></TableCell>
        <TableCell><Chip label={account.isActive ? '✓' : '✗'} size="small" color={account.isActive ? 'success' : 'default'} /></TableCell>
      </TableRow>
      {children.map((c) => (
        <TreeNode key={c._id} account={c} children={[]} depth={depth + 1} typeLabel={typeLabel} />
      ))}
    </>
  );
}

export default function AccountListPage() {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const { t, i18n } = useTranslation();

  const TYPE_LABELS: Record<AccountType, string> = {
    asset: t('accounts.types.asset'),
    liability: t('accounts.types.liability'),
    equity: t('accounts.types.equity'),
    revenue: t('accounts.types.revenue'),
    expense: t('accounts.types.expense'),
  };

  const [view, setView]         = useState<'list' | 'tree'>('list');
  const [search, setSearch]     = useState('');
  const [typeFilter, setType]   = useState('');
  const [importDlg, setImportDlg] = useState(false);
  const [importChart, setImportChart] = useState<'SKR03' | 'SKR04'>('SKR03');
  const [importMsg, setImportMsg] = useState('');
  const [ledgerDlg,     setLedgerDlg]     = useState(false);
  const [ledgerFrom,    setLedgerFrom]    = useState('');
  const [ledgerTo,      setLedgerTo]      = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['accounts', search, typeFilter],
    queryFn: () => accountsApi.list({ search: search || undefined, type: typeFilter || undefined }),
  });
  const accounts: Account[] = data?.data?.accounts ?? [];

  const { mutate: importAccounts, isPending: importing } = useMutation({
    mutationFn: () => accountsApi.importStandard(importChart),
    onSuccess: (res) => {
      setImportMsg(res.data.message);
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const { mutate: deactivate } = useMutation({
    mutationFn: (id: string) => accountsApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
  const { mutate: reactivate } = useMutation({
    mutationFn: (id: string) => accountsApi.reactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const handleCsvExport = async () => {
    const res = await accountsApi.exportCsv();
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kontenplan.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleLedgerExport = async () => {
    setLedgerLoading(true);
    try {
      const res = await accountsApi.exportLedgers({
        from: ledgerFrom || undefined,
        to:   ledgerTo   || undefined,
        lang: i18n.language.startsWith('en') ? 'en' : 'de',
      });
      const tag = ledgerFrom && ledgerTo ? `_${ledgerFrom}_${ledgerTo}` : `_${new Date().toISOString().slice(0, 10)}`;
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Kontenblätter${tag}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      setLedgerDlg(false);
    } finally {
      setLedgerLoading(false);
    }
  };

  const byNumber = Object.fromEntries(accounts.map((a) => [a.number, a]));
  const roots    = accounts.filter((a) => !a.parentNumber || !byNumber[a.parentNumber]);
  const childrenOf = (n: string) => accounts.filter((a) => a.parentNumber === n);
  const typeGroups: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700}>{t('accounts.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('accounts.count', { count: accounts.length })}</Typography>
        </Box>
        <Stack direction="row" gap={1}>
          <Button variant="outlined" startIcon={<DownloadIcon />} size="small" onClick={handleCsvExport}>{t('accounts.csvExport')}</Button>
          <Button variant="outlined" startIcon={<SummarizeIcon />} size="small" onClick={() => { setLedgerFrom(''); setLedgerTo(''); setLedgerDlg(true); }}>
            {i18n.language === 'de' ? 'Kontenbücher exportieren' : 'Export Ledgers'}
          </Button>
          <Button variant="outlined" startIcon={<UploadIcon />} size="small" onClick={() => { setImportMsg(''); setImportDlg(true); }}>
            {t('accounts.importSkr')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/erp/accounts/new')}>
            {t('accounts.createAccount')}
          </Button>
        </Stack>
      </Stack>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            placeholder={`${t('accounts.accountNumber')} / ${t('accounts.accountName')}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="small"
            sx={{ width: 240 }}
          />
          <FormControl size="small" sx={{ width: 180 }}>
            <InputLabel>{t('common.type')}</InputLabel>
            <Select value={typeFilter} onChange={(e) => setType(e.target.value)} label={t('common.type')}>
              <MenuItem value="">{t('common.all')}</MenuItem>
              {typeGroups.map((tp) => <MenuItem key={tp} value={tp}>{TYPE_LABELS[tp]}</MenuItem>)}
            </Select>
          </FormControl>
          <Box flex={1} />
          <ToggleButtonGroup value={view} exclusive onChange={(_, v) => v && setView(v)} size="small">
            <ToggleButton value="list"><ListIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="tree"><AccountTreeIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Card>

      {isLoading && <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>}

      {!isLoading && accounts.length === 0 && (
        <Card>
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <Typography color="text.secondary" mb={2}>{t('accounts.noAccounts')}</Typography>
            <Button variant="contained" onClick={() => { setImportMsg(''); setImportDlg(true); }}>
              {t('accounts.importNow')}
            </Button>
          </Box>
        </Card>
      )}

      {!isLoading && accounts.length > 0 && view === 'list' && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('accounts.accountNumber')}</TableCell>
                  <TableCell>{t('accounts.accountName')}</TableCell>
                  <TableCell>{t('common.type')}</TableCell>
                  <TableCell>{t('accounts.taxCode')}</TableCell>
                  <TableCell>{t('common.status')}</TableCell>
                  <TableCell align="right">{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/erp/accounts/${a._id}`)}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} fontFamily="monospace">{a.number}</Typography>
                    </TableCell>
                    <TableCell><Typography variant="body2">{a.name}</Typography></TableCell>
                    <TableCell><Chip label={TYPE_LABELS[a.type]} color={TYPE_COLORS[a.type]} size="small" /></TableCell>
                    <TableCell><Typography variant="caption" color="text.secondary">{a.taxCode || '—'}</Typography></TableCell>
                    <TableCell>
                      <Chip label={a.isActive ? t('common.active') : t('common.inactive')} size="small" color={a.isActive ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={t('common.edit')}>
                        <IconButton size="small" onClick={() => navigate(`/erp/accounts/${a._id}`)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {a.isActive ? (
                        <Tooltip title={t('common.deactivate')}>
                          <IconButton size="small" onClick={() => deactivate(a._id)}>
                            <PauseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title={t('common.reactivate')}>
                          <IconButton size="small" onClick={() => reactivate(a._id)}>
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {!isLoading && accounts.length > 0 && view === 'tree' && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('accounts.accountNumber')}</TableCell>
                  <TableCell>{t('accounts.accountName')}</TableCell>
                  <TableCell>{t('common.type')}</TableCell>
                  <TableCell>{t('accounts.taxCode')}</TableCell>
                  <TableCell>{t('common.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {typeGroups.map((type) => {
                  const group = roots.filter((a) => a.type === type);
                  if (group.length === 0) return null;
                  return (
                    <>
                      <TableRow key={type} sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell colSpan={5}>
                          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {TYPE_LABELS[type]}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      {group.map((a) => (
                        <TreeNode key={a._id} account={a} children={childrenOf(a.number)} depth={0} typeLabel={TYPE_LABELS[a.type]} />
                      ))}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Export All Ledgers Dialog */}
      <Dialog open={ledgerDlg} onClose={() => setLedgerDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{i18n.language === 'de' ? 'Kontenbücher exportieren' : 'Export All Ledgers'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <Typography variant="body2" color="text.secondary">
              {i18n.language === 'de'
                ? 'Exportiert alle Konten mit ihren Buchungen als Excel-Datei — jedes Konto erhält ein eigenes Tabellenblatt (für Wirtschaftsprüfer / Steuerberater).'
                : 'Exports all accounts with their transactions as an Excel file — each account gets its own sheet (for auditors / tax advisors).'}
            </Typography>
            <Divider />
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              {i18n.language === 'de' ? 'Zeitraum (optional)' : 'Date range (optional)'}
            </Typography>
            <Stack direction="row" gap={1.5}>
              <TextField
                label={i18n.language === 'de' ? 'Von' : 'From'}
                type="date" size="small" fullWidth
                value={ledgerFrom} onChange={e => setLedgerFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={i18n.language === 'de' ? 'Bis' : 'To'}
                type="date" size="small" fullWidth
                value={ledgerTo} onChange={e => setLedgerTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            {(!ledgerFrom && !ledgerTo) && (
              <Typography variant="caption" color="text.secondary">
                {i18n.language === 'de'
                  ? 'Kein Zeitraum = alle Buchungen werden exportiert.'
                  : 'No date range = all transactions will be exported.'}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLedgerDlg(false)} disabled={ledgerLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleLedgerExport}
            disabled={ledgerLoading}
            startIcon={ledgerLoading ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
          >
            {i18n.language === 'de' ? 'Excel herunterladen' : 'Download Excel'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDlg} onClose={() => setImportDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('accounts.importDialog.title')}</DialogTitle>
        <DialogContent>
          {importMsg && <Alert severity="success" sx={{ mb: 2 }}>{importMsg}</Alert>}
          <Typography variant="body2" color="text.secondary" mb={2}>
            {t('accounts.importDialog.description')}
          </Typography>
          <FormControl fullWidth size="small">
            <InputLabel>{t('accounts.importDialog.selectChart')}</InputLabel>
            <Select value={importChart} onChange={(e) => setImportChart(e.target.value as 'SKR03' | 'SKR04')} label={t('accounts.importDialog.selectChart')}>
              <MenuItem value="SKR03">{t('accounts.importDialog.skr03Label')}</MenuItem>
              <MenuItem value="SKR04">{t('accounts.importDialog.skr04Label')}</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDlg(false)}>{t('common.close')}</Button>
          <Button variant="contained" onClick={() => importAccounts()} disabled={importing}>
            {importing ? <CircularProgress size={18} color="inherit" /> : t('accounts.importDialog.importButton', { chart: importChart })}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
