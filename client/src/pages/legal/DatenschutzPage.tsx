import LegalPage from './LegalPage';

export default function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>
        Wir nehmen den Schutz Ihrer personenbezogenen Daten sehr ernst und behandeln diese
        vertraulich gemäß DSGVO und BDSG.
      </p>

      <h2>1. Verantwortlicher (Art. 13 DSGVO)</h2>
      <p>
        <strong>[UNTERNEHMENSNAME] [RECHTSFORM]</strong><br />
        [STRASSE HAUSNUMMER], [PLZ] [ORT]<br />
        E-Mail: <strong>[DATENSCHUTZ-EMAIL]</strong>
      </p>

      <h2>2. Erhobene Daten und Verarbeitungszwecke</h2>
      <ul>
        <li><strong>Stammdaten</strong> (Name, Kontakt) — Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)</li>
        <li><strong>Zugangsdaten</strong> (E-Mail, gehashtes Passwort) — Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO)</li>
        <li><strong>Buchhaltungs- und ERP-Daten</strong> (Rechnungen, Zahlungen, Lohn) — Vertragserfüllung und gesetzliche Pflicht (Art. 6 Abs. 1 lit. b, c DSGVO)</li>
        <li><strong>Mitarbeiterdaten</strong> (Gehalt, Bankverbindung, Steuer) — gesetzliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO)</li>
        <li><strong>Protokolldaten</strong> — IT-Sicherheit / berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO)</li>
      </ul>

      <h2>3. Speicherdauer</h2>
      <p>
        Buchhaltungsunterlagen werden 10 Jahre aufbewahrt (HGB § 257, AO § 147, GoBD).
        Journal- und Kasseneinträge erhalten einen GoBD-Hashwert gegen Manipulation.
        Benachrichtigungen werden nach 90 Tagen gelöscht.
      </p>

      <h2>4. Weitergabe an Dritte</h2>
      <p>
        Daten werden nur im Rahmen der Vertragserfüllung, bei gesetzlicher Verpflichtung
        (Finanzamt, Sozialversicherungsträger, DATEV-Export) oder mit Einwilligung weitergegeben.
      </p>

      <h2>5. Ihre Rechte (Art. 15–22 DSGVO)</h2>
      <ul>
        <li>Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17)</li>
        <li>Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20), Widerspruch (Art. 21)</li>
      </ul>
      <p>Kontakt: <strong>[DATENSCHUTZ-EMAIL]</strong></p>

      <h2>6. Beschwerderecht bei der Aufsichtsbehörde</h2>
      <p>Zuständige Behörde: <strong>[ZUSTÄNDIGE LANDESBEHÖRDE]</strong></p>

      <h2>7. Datensicherheit</h2>
      <p>
        Sensitive Felder werden AES-256-GCM verschlüsselt gespeichert.
        Passwörter werden als bcrypt-Hash gespeichert. Datenübertragung via TLS.
        Nur technisch notwendige Cookies (HttpOnly Refresh-Token).
      </p>

      <p><strong>Stand: [DATUM]</strong></p>
    </LegalPage>
  );
}
