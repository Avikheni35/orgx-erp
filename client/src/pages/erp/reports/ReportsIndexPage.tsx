import { useNavigate } from 'react-router-dom';
import { Box, Typography, Stack, Card, CardActionArea, CardContent, Grid } from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ListAltIcon from '@mui/icons-material/ListAlt';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import PeopleIcon from '@mui/icons-material/People';
import BusinessIcon from '@mui/icons-material/Business';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useTranslation } from 'react-i18next';

interface ReportCard {
  route:       string;
  icon:        React.ReactNode;
  titleDe:     string;
  titleEn:     string;
  descDe:      string;
  descEn:      string;
}

const SECTIONS: { labelDe: string; labelEn: string; cards: ReportCard[] }[] = [
  {
    labelDe: 'Abschlussberichte',
    labelEn: 'Financial Statements',
    cards: [
      {
        route:   '/erp/berichte/bilanz',
        icon:    <AccountBalanceIcon fontSize="large" color="primary" />,
        titleDe: 'Bilanz',
        titleEn: 'Balance Sheet',
        descDe:  'Aktiva und Passiva zum Stichtag',
        descEn:  'Assets and liabilities at reporting date',
      },
      {
        route:   '/erp/berichte/guv',
        icon:    <TrendingUpIcon fontSize="large" color="success" />,
        titleDe: 'Gewinn- und Verlustrechnung',
        titleEn: 'Profit & Loss',
        descDe:  'Erträge und Aufwendungen im Zeitraum',
        descEn:  'Revenue and expenses for the period',
      },
      {
        route:   '/erp/berichte/bwa',
        icon:    <AssessmentIcon fontSize="large" color="secondary" />,
        titleDe: 'BWA',
        titleEn: 'Management Report (BWA)',
        descDe:  'Betriebswirtschaftliche Auswertung',
        descEn:  'Betriebswirtschaftliche Auswertung',
      },
    ],
  },
  {
    labelDe: 'Buchführung',
    labelEn: 'Accounting',
    cards: [
      {
        route:   '/erp/berichte/susa',
        icon:    <ListAltIcon fontSize="large" color="info" />,
        titleDe: 'Summen- und Saldenliste',
        titleEn: 'Trial Balance (SuSa)',
        descDe:  'Soll/Haben-Summen und Salden aller Konten',
        descEn:  'Debit/credit totals and balances for all accounts',
      },
      {
        route:   '/erp/berichte/datev-export',
        icon:    <FileDownloadIcon fontSize="large" color="warning" />,
        titleDe: 'DATEV-Export',
        titleEn: 'DATEV Export',
        descDe:  'Buchungen im DATEV-ASCII-Format exportieren',
        descEn:  'Export journal entries in DATEV ASCII format',
      },
    ],
  },
  {
    labelDe: 'Offene Posten',
    labelEn: 'Open Items',
    cards: [
      {
        route:   '/erp/berichte/offene-posten-debitoren',
        icon:    <PeopleIcon fontSize="large" color="primary" />,
        titleDe: 'OP Debitoren',
        titleEn: 'Open Items (AR)',
        descDe:  'Offene Forderungen gegenüber Kunden',
        descEn:  'Outstanding receivables from customers',
      },
      {
        route:   '/erp/berichte/offene-posten-kreditoren',
        icon:    <BusinessIcon fontSize="large" color="error" />,
        titleDe: 'OP Kreditoren',
        titleEn: 'Open Items (AP)',
        descDe:  'Offene Verbindlichkeiten gegenüber Lieferanten',
        descEn:  'Outstanding payables to suppliers',
      },
    ],
  },
];

export default function ReportsIndexPage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const de       = i18n.language === 'de';

  return (
    <Box>
      <Box mb={4}>
        <Typography variant="h5" fontWeight={700}>{de ? 'Berichte' : 'Reports'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {de ? 'Auswertungen, Abschlüsse und Exporte' : 'Analysis, financial statements, and exports'}
        </Typography>
      </Box>

      <Stack gap={4}>
        {SECTIONS.map(section => (
          <Box key={section.labelDe}>
            <Typography
              variant="overline"
              color="text.secondary"
              fontWeight={700}
              letterSpacing={1}
              display="block"
              mb={1.5}
            >
              {de ? section.labelDe : section.labelEn}
            </Typography>
            <Grid container spacing={2}>
              {section.cards.map(card => (
                <Grid item key={card.route} xs={12} sm={6} md={4} lg={3}>
                  <Card
                    variant="outlined"
                    sx={{
                      height: '100%',
                      transition: 'box-shadow 0.15s, border-color 0.15s',
                      '&:hover': { boxShadow: 3, borderColor: 'primary.main' },
                    }}
                  >
                    <CardActionArea
                      onClick={() => navigate(card.route)}
                      sx={{ height: '100%', p: 0.5 }}
                    >
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Box>{card.icon}</Box>
                          <ChevronRightIcon sx={{ color: 'text.disabled', mt: 0.5 }} />
                        </Stack>
                        <Typography variant="subtitle1" fontWeight={600} mt={1.5} mb={0.5}>
                          {de ? card.titleDe : card.titleEn}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {de ? card.descDe : card.descEn}
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
