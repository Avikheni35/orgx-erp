import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Box, Typography, Card, CardContent, TextField, Button, Alert,
  CircularProgress, Table, TableHead, TableBody, TableRow, TableCell,
  Chip, Stack, Divider,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useTranslation } from 'react-i18next';
import { accountsApi, type Account, type AccountType } from '../../../api/accounts';
import { openingBalancesApi } from '../../../api/openingBalances';

type BalanceMap = Record<string, { debit: string; credit: string }>;

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export default function OpeningBalancesPage() {
  const { t, i18n } = useTranslation();
  const de = i18n.language.startsWith('de');

  const [date, setDate]         = useState('');
  const [balances, setBalances] = useState<BalanceMap>({});
  const [success, setSuccess]   = useState('');
  const [errMsg,  setErrMsg]    = useState('');

  const { data: accountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts-all'],
    queryFn:  () => accountsApi.list({ active: 'true' }),
  });

  const { data: existingData, isLoading: loadingExisting } = useQuery({
    queryKey: ['opening-balances'],
    queryFn:  () => openingBalancesApi.get(),
  });

  const accounts = accountsData?.data?.accounts ?? [];

  // Pre-fill form from existing opening balance entry
  useEffect(() => {
    const entry = existingData?.data?.entry;
    if (!entry) return;

    setDate(entry.date.slice(0, 10));
    const map: BalanceMap = {};
    for (const line of entry.lines) {
      map[line.accountNumber] = {
        debit:  line.debit  > 0 ? line.debit.toFixed(2)  : '',
        credit: line.credit > 0 ? line.credit.toFixed(2) : '',
      };
    }
    setBalances(map);
  }, [existingData]);

  const getVal = (num: string, side: 'debit' | 'credit') =>
    parseFloat(balances[num]?.[side] ?? '') || 0;

  const totalDebit  = accounts.reduce((s, a) => s + getVal(a.number, 'debit'),  0);
  const totalCredit = accounts.reduce((s, a) => s + getVal(a.number, 'credit'), 0);
  const diff        = Math.abs(totalDebit - totalCredit);
  const balanced    = diff < 0.01;

  const setField = (num: string, side: 'debit' | 'credit', val: string) => {
    setBalances((prev) => ({
      ...prev,
      [num]: {
        debit:  side === 'debit'  ? val : '',
        credit: side === 'credit' ? val : '',
        ...( side === 'debit'  ? { credit: '' } : {} ),
        ...( side === 'credit' ? { debit:  '' } : {} ),
        [side]: val,
      },
    }));
  };

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => {
      const lines = accounts
        .map((a) => ({
          accountNumber: a.number,
          debit:  getVal(a.number, 'debit'),
          credit: getVal(a.number, 'credit'),
        }))
        .filter((l) => l.debit > 0 || l.credit > 0);
      return openingBalancesApi.save({ date, balances: lines });
    },
    onSuccess: (res) => {
      setSuccess(res.data.message);
      setErrMsg('');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setErrMsg(e.response?.data?.message ?? t('common.errorGeneric'));
      setSuccess('');
    },
  });

  const fmt = (n: number) => n.toLocaleString(de ? 'de-DE' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const typeLabel = (type: AccountType): string => ({
    asset:     de ? 'Aktiva (Vermögen)'      : 'Assets',
    liability: de ? 'Passiva (Verbindlichkeiten)' : 'Liabilities',
    equity:    de ? 'Eigenkapital'           : 'Equity',
    revenue:   de ? 'Erträge'               : 'Revenue',
    expense:   de ? 'Aufwendungen'          : 'Expenses',
  }[type]);

  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: typeLabel(type),
    items: accounts.filter((a) => a.type === type).sort((a, b) => a.number.localeCompare(b.number)),
  })).filter((g) => g.items.length > 0);

  if (loadingAccounts || loadingExisting) {
    return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;
  }

  return (
    <Box maxWidth={900}>
      <Typography variant="h5" fontWeight={700} mb={1}>
        {t('openingBalances.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        {t('openingBalances.subtitle')}
      </Typography>

      {errMsg   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setErrMsg('')}>{errMsg}</Alert>}
      {success  && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" gap={2} mb={3} flexWrap="wrap">
            <TextField
              type="date"
              label={t('openingBalances.date')}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ width: 200 }}
              required
            />
            <Box flex={1} />
            <Stack direction="row" gap={2} alignItems="center">
              <Typography variant="body2">
                {t('openingBalances.totalDebit')}: <strong>{fmt(totalDebit)} €</strong>
              </Typography>
              <Typography variant="body2">
                {t('openingBalances.totalCredit')}: <strong>{fmt(totalCredit)} €</strong>
              </Typography>
              {totalDebit > 0 || totalCredit > 0 ? (
                balanced
                  ? <Chip label={t('openingBalances.balanced')} color="success" size="small" />
                  : <Chip label={`${t('openingBalances.diff')}: ${fmt(diff)} €`} color="error" size="small" />
              ) : null}
            </Stack>
          </Stack>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 90 }}>{t('common.number')}</TableCell>
                  <TableCell>{t('accounts.accountName')}</TableCell>
                  <TableCell align="right" sx={{ width: 160 }}>Soll (€)</TableCell>
                  <TableCell align="right" sx={{ width: 160 }}>Haben (€)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grouped.map((group) => (
                  <>
                    <TableRow key={`group-${group.type}`} sx={{ bgcolor: 'action.hover' }}>
                      <TableCell colSpan={4}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {group.label}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {group.items.map((acct: Account) => (
                      <TableRow key={acct._id} hover>
                        <TableCell>
                          <Typography variant="caption" fontFamily="monospace">{acct.number}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">{acct.name}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right', width: 120 } }}
                            value={balances[acct.number]?.debit ?? ''}
                            onChange={(e) => setField(acct.number, 'debit', e.target.value)}
                            placeholder="0.00"
                            variant="standard"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right', width: 120 } }}
                            value={balances[acct.number]?.credit ?? ''}
                            onChange={(e) => setField(acct.number, 'credit', e.target.value)}
                            placeholder="0.00"
                            variant="standard"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ))}
              </TableBody>
            </Table>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={() => save()}
              disabled={saving || !date || !balanced || (totalDebit === 0 && totalCredit === 0)}
            >
              {t('openingBalances.save')}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
