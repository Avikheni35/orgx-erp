import LegalPage from './LegalPage';

export default function AgbPage() {
  return (
    <LegalPage title="Allgemeine Geschäftsbedingungen (AGB)">
      <p>
        Diese AGB gelten für die Nutzung der OrgX ERP-Plattform (Modul M3) zwischen
        <strong> [UNTERNEHMENSNAME] [RECHTSFORM]</strong> (Anbieter) und dem nutzenden
        Unternehmen (Kunde). Ausschließlich B2B-Angebot.
      </p>

      <h2>§ 1 Vertragsgegenstand</h2>
      <p>
        Der Anbieter stellt eine cloudbasierte ERP-Lösung für doppelte Buchführung,
        Fakturierung, Lohnabrechnung und Berichtswesen für deutsche KMU bereit.
      </p>

      <h2>§ 2 Nutzungsrechte</h2>
      <p>
        Nicht übertragbares, nicht exklusives Nutzungsrecht für eigene betriebliche Zwecke.
        Keine Weitergabe von Zugangsdaten an externe Dritte.
      </p>

      <h2>§ 3 Pflichten des Kunden</h2>
      <ul>
        <li>Richtige und vollständige Buchführungsdaten einpflegen</li>
        <li>Zugangsdaten schützen; missbräuchliche Nutzung unterlassen</li>
        <li>Geltende handels- und steuerrechtliche Verpflichtungen eigenständig erfüllen</li>
        <li>Datenschutzpflichten gegenüber Mitarbeitern einhalten</li>
      </ul>

      <h2>§ 4 GoBD-Hinweis</h2>
      <p>
        Die Plattform unterstützt GoBD-konforme Buchführung (GoBD-Hashwerte, unveränderbare
        Journaleinträge). Die Einhaltung der GoBD liegt in der Verantwortung des Kunden.
        Der Anbieter übernimmt keine steuerliche oder rechtliche Beratung.
      </p>

      <h2>§ 5 Vergütung</h2>
      <p>
        Vergütung nach gültigem Preisblatt. Zahlung innerhalb von 14 Tagen.
        Bei Verzug Zugangssperre möglich.
      </p>

      <h2>§ 6 Datenschutz</h2>
      <p>
        Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO wird bei Bedarf geschlossen.
      </p>

      <h2>§ 7 Haftung</h2>
      <p>
        Unbeschränkte Haftung bei Vorsatz, grober Fahrlässigkeit, Personenschäden.
        Leichte Fahrlässigkeit: nur bei Kardinalpflichtverletzung, begrenzt auf vorhersehbaren
        Schaden. Haftung für steuerliche Fehler des Kunden ausgeschlossen.
      </p>

      <h2>§ 8 Laufzeit und Kündigung</h2>
      <p>
        Kündigung mit [X Wochen/Monaten] Frist zum Monatsende. Kundendaten werden nach
        [30 Tagen] gelöscht (soweit keine Aufbewahrungspflichten bestehen).
      </p>

      <h2>§ 9 Schlussbestimmungen</h2>
      <p>
        Deutsches Recht. Gerichtsstand: <strong>[GERICHTSSTAND]</strong>.
        Salvatorische Klausel gilt.
      </p>

      <p><strong>Stand: [DATUM]</strong></p>
    </LegalPage>
  );
}
