import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip, Stack, Divider,
  Table, TableHead, TableBody, TableRow, TableCell, CircularProgress, Alert,
  TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import { useTranslation } from 'react-i18next';
import { serviceItemsApi } from '../../../api/serviceItems';
import { inventoryApi, type InventoryMovement } from '../../../api/inventory';

function fmtMoney(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €';
}

function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale === 'de-DE' ? 'de-DE' : 'en-GB');
}

function MovTypeChip({ type, de }: { type: InventoryMovement['type']; de: boolean }) {
  if (type === 'purchase') return <Chip size="small" color="success" icon={<TrendingUpIcon />} label={de ? 'Einkauf' : 'Purchase'} />;
  if (type === 'sale')     return <Chip size="small" color="primary" icon={<TrendingDownIcon />} label={de ? 'Verkauf' : 'Sale'} />;
  return <Chip size="small" icon={<SwapHorizIcon />} label={de ? 'Korrektur' : 'Adjustment'} />;
}

export default function InventoryItemDetailPage() {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const { i18n } = useTranslation();
  const de     = i18n.language === 'de';
  const locale = de ? 'de-DE' : 'en-GB';

  const [searchParams, setSearchParams] = useSearchParams();
  const tab    = Number(searchParams.get('tab') ?? 0);
  const setTab = (v: number) => setSearchParams({ tab: String(v) }, { replace: true });

  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');

  const { data: itemData, isLoading: itemLoading } = useQuery({
    queryKey: ['service-item', id],
    queryFn:  () => serviceItemsApi.get(id!),
    enabled:  !!id,
  });

  const { data: movData, isLoading: movLoading } = useQuery({
    queryKey: ['inventory-movements-item', id],
    queryFn:  () => inventoryApi.listMovements({ serviceItemId: id!, limit: 500 }),
    enabled:  !!id,
  });

  const item = itemData?.data;
  const movs = movData?.data?.movements ?? [];

  if (itemLoading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!item)       return <Alert severity="error">{de ? 'Artikel nicht gefunden.' : 'Item not found.'}</Alert>;

  const filteredMovs = movs.filter(m => {
    const d = m.createdAt.slice(0, 10);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
  const hasFilter = !!(from || to);

  const totalIn    = filteredMovs.filter(m => m.quantity > 0).reduce((s, m) => s + m.quantity, 0);
  const totalOut   = filteredMovs.filter(m => m.quantity < 0).reduce((s, m) => s + Math.abs(m.quantity), 0);
  const stockValue = item.stockQuantity * item.costPriceCents;
  const low        = item.stockQuantity <= 5;

  const TABS = [
    de ? 'Stammdaten'      : 'Overview',
    de ? 'Lagerbewegungen' : 'Movements',
  ];

  return (
    <Box maxWidth={900}>
      {/* Back + title */}
      <Stack direction="row" alignItems="center" gap={1} mb={3}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} size="small">
          {de ? 'Zurück' : 'Back'}
        </Button>
        <Box flex={1}>
          <Typography variant="h5" fontWeight={700}>{item.name}</Typography>
          <Stack direction="row" gap={1} mt={0.5}>
            {item.category && <Chip label={item.category} size="small" variant="outlined" />}
            <Chip
              label={item.isActive ? (de ? 'Aktiv' : 'Active') : (de ? 'Inaktiv' : 'Inactive')}
              size="small"
              color={item.isActive ? 'success' : 'default'}
            />
            <Chip
              label={low ? (de ? 'Niedriger Bestand' : 'Low stock') : (de ? 'Auf Lager' : 'In stock')}
              size="small"
              color={low ? 'error' : 'success'}
              variant="outlined"
            />
          </Stack>
        </Box>
      </Stack>

      {/* Summary strip */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            {[
              [de ? 'Bestand'     : 'Stock',      `${item.stockQuantity} ${item.unit}`],
              [de ? 'Lagerwert'   : 'Stock value', stockValue > 0 ? fmtMoney(stockValue, locale) : '—'],
              [de ? 'EK-Preis'    : 'Cost price',  item.costPriceCents > 0 ? fmtMoney(item.costPriceCents, locale) : '—'],
              [de ? 'VK-Preis'    : 'Sale price',  item.defaultUnitPriceCents > 0 ? fmtMoney(item.defaultUnitPriceCents, locale) : '—'],
              [de ? 'Zugänge'     : 'Total in',    String(totalIn)],
              [de ? 'Abgänge'     : 'Total out',   String(totalOut)],
            ].map(([label, val]) => (
              <Grid item xs={6} sm={4} md={2} key={label}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h6" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{val}</Typography>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Stack direction="row" gap={0}>
            {TABS.map((label, i) => (
              <Button
                key={i}
                onClick={() => setTab(i)}
                sx={{
                  borderRadius: 0,
                  borderBottom: tab === i ? '2px solid' : '2px solid transparent',
                  borderColor: tab === i ? 'primary.main' : 'transparent',
                  color: tab === i ? 'primary.main' : 'text.secondary',
                  fontWeight: tab === i ? 700 : 400,
                  px: 2, py: 1.5,
                  minWidth: 0,
                }}
              >
                {label}
                {i === 1 && (
                  <Chip
                    label={movs.length}
                    size="small"
                    sx={{ ml: 1, height: 18, fontSize: 11, pointerEvents: 'none' }}
                  />
                )}
              </Button>
            ))}
          </Stack>
        </Box>

        {/* Tab 0: Overview */}
        {tab === 0 && (
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">{de ? 'Bezeichnung' : 'Name'}</Typography>
                <Typography fontWeight={600}>{item.name}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="caption" color="text.secondary">{de ? 'Kategorie' : 'Category'}</Typography>
                <Typography>{item.category || '—'}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'Einheit' : 'Unit'}</Typography>
                <Typography>{item.unit}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">{de ? 'MwSt.' : 'VAT rate'}</Typography>
                <Typography>{item.vatRate} %</Typography>
              </Grid>
              {item.description && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Beschreibung' : 'Description'}</Typography>
                  <Typography>{item.description}</Typography>
                </Grid>
              )}
              {item.notes && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary">{de ? 'Notizen' : 'Notes'}</Typography>
                  <Typography>{item.notes}</Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        )}

        {/* Tab 1: Movements */}
        {tab === 1 && (
          <>
            {/* Date filter */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <TextField
                  type="date" size="small" label={de ? 'Von' : 'From'}
                  value={from} onChange={e => setFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
                />
                <TextField
                  type="date" size="small" label={de ? 'Bis' : 'To'}
                  value={to} onChange={e => setTo(e.target.value)}
                  InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
                />
                {hasFilter && (
                  <Button size="small" onClick={() => { setFrom(''); setTo(''); }}>
                    {de ? 'Zurücksetzen' : 'Reset'}
                  </Button>
                )}
                {hasFilter && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {filteredMovs.length} / {movs.length} {de ? 'Bewegungen' : 'movements'}
                  </Typography>
                )}
              </Stack>
            </Box>

            {movLoading ? (
              <Box display="flex" justifyContent="center" py={6}><CircularProgress size={24} /></Box>
            ) : filteredMovs.length === 0 ? (
              <Box sx={{ py: 6, textAlign: 'center' }}>
                <Typography color="text.secondary">
                  {hasFilter
                    ? (de ? 'Keine Bewegungen im gewählten Zeitraum.' : 'No movements in the selected period.')
                    : (de ? 'Noch keine Lagerbewegungen für diesen Artikel.' : 'No movements yet for this item.')}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{de ? 'Datum'       : 'Date'}</TableCell>
                      <TableCell>{de ? 'Art'         : 'Type'}</TableCell>
                      <TableCell>{de ? 'Beleg'       : 'Source'}</TableCell>
                      <TableCell>{de ? 'Beschreibung': 'Description'}</TableCell>
                      <TableCell align="right">{de ? 'Menge'        : 'Qty'}</TableCell>
                      <TableCell align="right">{de ? 'Bestand'      : 'Stock after'}</TableCell>
                      <TableCell align="right">{de ? 'Wert (netto)' : 'Value (net)'}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMovs.map(m => (
                      <TableRow
                        key={m._id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(
                          m.sourceType === 'VendorInvoice'
                            ? `/erp/einkauf/eingangsrechnungen/${m.sourceId}`
                            : `/erp/verkauf/rechnungen/${m.sourceId}`
                        )}
                      >
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="caption">{fmtDate(m.createdAt, locale)}</Typography>
                        </TableCell>
                        <TableCell><MovTypeChip type={m.type} de={de} /></TableCell>
                        <TableCell>
                          <Typography variant="caption" fontFamily="monospace">{m.sourceNumber}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">{m.lineDescription}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            fontWeight={700}
                            color={m.quantity > 0 ? 'success.main' : 'error.main'}
                            sx={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {m.quantity > 0 ? '+' : ''}{m.quantity}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{m.stockAfter}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          <Typography variant="caption">{fmtMoney(m.totalCents, locale)}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row — inside same table so columns align */}
                    <TableRow sx={{ bgcolor: 'action.hover', borderTop: '2px solid', borderColor: 'divider' }}>
                      <TableCell colSpan={4} sx={{ fontWeight: 700 }}>{de ? 'Gesamt' : 'Total'}</TableCell>
                      <TableCell align="right">
                        <Stack alignItems="flex-end" gap={0.25}>
                          <Typography variant="caption" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: 'tabular-nums' }}>+{totalIn}</Typography>
                          <Typography variant="caption" fontWeight={700} color="error.main"   sx={{ fontVariantNumeric: 'tabular-nums' }}>−{totalOut}</Typography>
                        </Stack>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{item.stockQuantity}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtMoney(filteredMovs.reduce((s, m) => s + m.totalCents, 0), locale)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            )}
          </>
        )}
      </Card>
    </Box>
  );
}
