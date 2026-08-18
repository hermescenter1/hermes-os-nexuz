# Moderne SCADA-Architektur für Industrieanlagen

## Zusammenfassung

„SCADA" bezeichnet eine Menge von Rollen, keine Anwendung. Datenerfassung, Alarm- und Ereignisverarbeitung, Historisierung, Bedienbilddarstellung, Engineering und Berichtswesen haben tatsächlich unterschiedliche Verfügbarkeitsanforderungen, unterschiedliche Ausfallfolgen und unterschiedliche Lebenszyklen — und ein Entwurf, der sie als ein installierbares Produkt behandelt, erbt die schlechteste Verfügbarkeitseigenschaft der gesamten Menge.

Dieser Beitrag handelt von den Grenzen zwischen diesen Rollen: wo sie hingehören, was sie überquert und wie sich die entstehende Architektur verhält, wenn ein Teil ausfällt.

## Warum das relevant ist

Die lohnende Frage an jeden SCADA-Entwurf lautet nicht „funktioniert es?", sondern „was steht still, wenn jeder einzelne Teil davon stillsteht?"

In einem System, in dem Erfassung, Historisierung und Engineering sich einen Rechner teilen, lautet die Antwort: alles — einschließlich der Aufzeichnung dessen, was während des Ausfalls geschah. In einem System mit getrennten Rollen kostet ein Ausfall der Engineering-Station betrieblich nichts, ein Historian-Ausfall kostet Datenkontinuität, aber keine Steuerung, und nur ein Erfassungsausfall kostet die Sicht auf die Anlage.

Das sind drei völlig verschiedene Ereignisse. Ein Entwurf, der sie nicht unterscheiden kann, wird so betrieben, als sei jedes SCADA-Problem ein Anlagennotfall — was ermüdend ist und auf Dauer abstumpft.

Der zweite Grund: **SCADA ist eine Leitebene, keine Steuerungsebene.** Die Anlagensteuerung lebt in den SPSen und RTUs. Eine korrekt architektierte Anlage läuft — sicher, in ihrem aktuellen Zustand — weiter, wenn SCADA vollständig fehlt. Stoppt der Verlust von SCADA die Produktion, wurde eine Steuerungsfunktion in der falschen Ebene realisiert, und das ist ein Architekturmangel, gleichgültig wie zuverlässig das SCADA ist.

## Die Rollentrennung

```text
Enterprise / IT network
        |
    Firewall
        |
Industrial DMZ  -- replicated historian, reporting, remote-access broker
        |
   OT firewall
        |
============ OT / supervisory zone =====================
   |            |              |               |
 SCADA       Historian     Engineering      Operator
 server      (primary)     station          stations
   |
Industrial Ethernet (process control network)
   |
PLC / RTU / remote I/O / intelligent devices
```

Jede Rolle und was sie überstehen muss:

| Rolle | Funktion | Verfügbarkeitsbedarf | Ausfallfolge |
| --- | --- | --- | --- |
| Erfassungs-/SCADA-Server | Geräte abfragen, Echtzeitabbild führen, Alarme bewerten | Höchster in der Leitebene | Anlagensicht verloren; Steuerung läuft in der SPS weiter |
| Historian | Zeitreihen und Ereignisse persistieren | Hoch, mit Pufferung aber lückentolerant | Lücke in der Datenkontinuität; keine unmittelbare Betriebsfolge |
| Bedienplätze | Prozess darstellen, Bedienhandlungen annehmen | Redundanz über Anzahl, nicht über Paarung | Ein Platz weg = eine Person wechselt den Platz |
| Engineering-Station | Projektierung, Laden, Versionsverwaltung | Niedrigster | Keine Betriebsfolge; Änderungsfähigkeit pausiert |
| Berichtswesen / Analytik | Aggregation für nicht echtzeitnahe Verbraucher | Niedrigster | Berichte verspätet |

Der ingenieurtechnische Punkt dieser Tabelle ist die letzte Spalte. **Rollen mit unterschiedlichen Ausfallfolgen dürfen keine gemeinsame Fehlerdomäne haben.** Die Engineering-Software auf dem SCADA-Server zu installieren bedeutet, dass eine Routinetätigkeit die Anlagensicht destabilisieren kann — und Engineering-Tätigkeiten sind naturgemäß jene mit ungetesteten Änderungen.

## Auslegung der Erfassungsebene

**Polling versus Report-by-Exception.** Zyklisches Polling ist vorhersagbar und leicht zu durchdenken; sein Preis sind Bandbreite und Kommunikationslast der Steuerung proportional zur Tag-Anzahl statt zur Änderungsrate. Report-by-Exception kehrt das um: Ein ruhiger Prozess kostet fast nichts, doch eine anlagenweite Störung erzeugt einen Datenstoß genau dann, wenn das Netz ihn am wenigsten aufnehmen kann. Keines ist allgemein richtig. Entscheidend ist, dass die Wahl gegen ein gemessenes Änderungsprofil getroffen wird und nicht aus einer Vorlage übernommen.

**Kommunikationslast ist eine Eigenschaft der Steuerung, nicht nur des Netzes.** Jede Leitebenenverbindung verbraucht Steuerungsressourcen — Sitzungen, Verbindungsressourcen, azyklisches Kommunikationsbudget. Ein Entwurf, der einen zweiten SCADA-Server, einen Historian-Collector und drei Engineering-Clients ergänzt, hat jeder Steuerung vier Verbraucher hinzugefügt, und die Kommunikationskapazität ist je Typ spezifiziert. Das ist die häufigste Ursache für „die Zykluszeit ist nach dem SCADA-Upgrade gestiegen".

**Datenqualität gehört modelliert, nicht angenommen.** Ein Leitebenenwert hat mindestens drei Zustände: gut, veraltet, nicht verfügbar. Fasst die Architektur diese in einer Zahl zusammen, erscheint ein Kommunikationsausfall als eingefrorener, aber plausibler Messwert — dasselbe Fehlerbild, das verteilte Peripherie gefährlich macht, hochgereicht in die Ebene, in der Menschen entscheiden. Jeder Wert, der nach SCADA gelangt, sollte eine Qualitätskennung tragen, und jede Anzeige und Berechnung sollte diese respektieren.

## Zeitsynchronisation

Zeitdisziplin ist die leiseste Architekturentscheidung — und diejenige, die eine Ereignisanalyse am häufigsten unmöglich macht.

Bei einer Anlagenabschaltung lautet die nützliche Frage nach der Reihenfolge der Ereignisse. Sie zu beantworten setzt vergleichbare Zeitstempel verschiedener Geräte voraus, und das verlangt dreierlei:

1. **Eine einzige Zeitquellen-Hierarchie.** Eine maßgebliche Quelle, nach unten verteilt. Zwei unabhängige Quellen in einer Anlage erzeugen zwei einander widersprechende Ereignisaufzeichnungen.
2. **Zeitstempel so nah am Ereignis wie möglich.** Ein beim SCADA-Poll gestempelter Wert trägt die Abfragezeit, nicht die Ereigniszeit — eine Differenz in Höhe des Abfrageintervalls, das meist größer ist als die zu klärende Ereignisreihenfolge. Geräte, die quellseitig stempeln können, sollten es tun, und die Architektur sollte diesen Stempel weiterreichen statt ihn zu überschreiben.
3. **Eine ausdrückliche Entscheidung zu Zeitzone und Sommerzeit.** Die Zeitbasis ist eine Architekturfestlegung der Erfassungsschicht und keine Einstellung des Archivs. UTC speichern und lokal darstellen ist die einzige eindeutige Anordnung.

Die praktische Prüfung: Lässt sich nach einem Anlagenereignis die Reihenfolge über SPS-Diagnose, SCADA-Ereignisse und Historian hinweg ohne manuelle Uhrenkorrektur rekonstruieren? Wenn nein, ist die Zeitarchitektur nicht fertig.

## Zonengrenzen und DMZ

Das Zonenmodell — aus dem Zone-and-Conduit-Denken der IEC 62443 — bildet sich natürlich auf SCADA ab, und seine wichtigste praktische Folge lautet: **Unternehmensverbraucher dürfen nicht in die OT-Zone hineingreifen.**

Das Muster dafür ist eine DMZ mit repliziertem Historian und Berichtsdiensten. Fachbereiche fragen die Replik ab; der Replikationsfluss ist einseitig und läuft über einen kontrollierten Conduit. Die OT-Zone hat damit überhaupt keinen eingehenden Geschäftsverkehr.

Das bringt nicht nur Sicherheit. Es entkoppelt auch Lebenszyklen: Der Berichtsstack lässt sich nach Geschäftskalender patchen, aktualisieren und neu starten, ohne eine Änderungsdiskussion über das Prozessleitnetz.

Zwei verwandte Entscheidungen gehören hierher:

- **Der Fernzugriff fürs Engineering** ist ein Conduit und gehört auch so entworfen: vermittelt, authentifiziert, protokolliert, endend in der DMZ statt in der OT-Zone.
- **Lese- und Schreibpfade verdienen getrennte Behandlung.** Ein nur lesendes Leitsystem hat eine grundlegend kleinere Wirkungsfläche als eines, das Sollwerte schreibt. Wo Schreibzugriffe nötig sind, gehören sie aufgezählt und eingegrenzt statt implizit in einer Allzweckverbindung zu stecken.

## Redundanz — Umfang und Ehrlichkeit

Redundanz gehört zu bestimmten Rollen, nicht zu „dem SCADA".

Die Erfassungsrolle rechtfertigt üblicherweise ein redundantes Paar, weil ihr Verlust die Anlagensicht kostet. Historians werden häufiger durch Store-and-Forward-Pufferung im Collector geschützt als durch einen zweiten Server: Puffert der Collector während eines Historian-Ausfalls und sendet nach der Wiederherstellung nach, schließt sich die Datenlücke von selbst. Bedienplätze werden durch ihre Anzahl redundant, nicht durch Paarung.

Zwei ehrliche Einschränkungen, die ein eigener Beitrag zu redundanten SCADA-Architekturen vertieft:

- **Ein Paar ist ein anderes System, keine sicherere Kopie desselben.** Zwei Server bringen ein Schiedsproblem mit, das der Einzelserver nicht hatte, und genau dieses Schiedsverfahren fällt aus: Split-Brain, und eine Umschaltung, die ein kurzer Aussetzer auslöst statt eines echten Verlusts.
- **Paarbildung ist deshalb eine Umfangsentscheidung, keine Zuverlässigkeitsstufe.** Zu bestimmen, welche Rolle ein Paar erhält, heißt für diese Rolle Schiedskomplexität anzunehmen und sie für die übrigen abzulehnen — weshalb Pufferung im Kollektor dem Historian oft besser dient als ein zweiter Server.

## Fehlerbilder

**Stiller Erfassungsausfall.** Der SCADA-Server läuft weiter und zeigt die zuletzt empfangenen Werte. Nichts wirkt offensichtlich falsch; die Zahlen haben nur aufgehört sich zu ändern. Deshalb muss der Qualitätszustand „nicht verfügbar" bis zur Anzeige durchschlagen, statt geglättet zu werden.

**Historian-Lücke, entdeckt während einer Untersuchung.** Genau für den Ereigniszeitraum fehlen die Daten, weil die Störung, die das Ereignis auslöste, auch die Erfassung unterbrach. Store-and-Forward im Collector ist die Abhilfe, und seine Puffertiefe ist ein Auslegungsparameter, keine Voreinstellung.

**Engineering-Änderung destabilisiert den Betrieb.** Ein Projektierungsdownload, ein Treiberupdate oder ein Test auf gemeinsamem Rechner beeinflusst die laufende Erfassung. Durch Rollentrennung vollständig verhindert.

**Zeitdrift macht das Ereignisprotokoll unbrauchbar.** Geräte weichen um Sekunden ab; die Abschaltfolge ist nicht rekonstruierbar; die Untersuchung endet in einer Diskussion statt in einem Beleg.

**Sättigung der Steuerungskommunikation.** Jeder zusätzliche Leitebenenverbraucher ist einzeln unsichtbar und in Summe entscheidend. Symptom: steigende Zykluszeit und sporadische Kommunikationsfehler nach einer Leitebenenerweiterung, die niemand mit der Steuerung in Verbindung gebracht hat.

## Diagnose: veraltete Daten in einem Bereich

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

**Symptom:** Werte eines Prozessbereichs werden auf den Bedienbildern nicht mehr aktualisiert. Andere Bereiche sind normal. Die SPS dieses Bereichs läuft.

**Zu erhebende Belege:**

- die Qualitätskennung der betroffenen Tags (gut / veraltet / nicht verfügbar)
- ob Zykluszeit und Diagnosepuffer der SPS selbst sauber sind
- der Verbindungszustand des SCADA-Treibers zu dieser Steuerung
- Sitzungs-/Verbindungszahl der Steuerung gegen ihre spezifizierte Kapazität
- Portstatistik der Switches auf dem Pfad zu dieser Steuerung
- ob die betroffenen Tags einen Treiber, eine Verbindung oder einen Netzpfad teilen

**Schlussfolgerung:** Ist die SPS gesund und ihre Diagnose sauber, liegt der Fehler oberhalb der Steuerung. Teilen alle betroffenen Tags eine einzige Treiberverbindung, ist diese Verbindung die Ursache und nicht das Netz. Steht die Sitzungszahl der Steuerung an ihrer Grenze, wurde der neueste Verbraucher abgewiesen — was auf eine kürzliche Leitebenenerweiterung deutet und gar nicht auf einen Defekt. Zeigt die Portstatistik steigende Fehler auf einem Pfad, ist die Bitübertragungsschicht der Kandidat.

Die maßgebliche Unterscheidung: **Eine gesunde SPS bei veralteten SCADA-Daten ist ein Problem der Leitebene**, und es in der Steuerungsebene zu suchen verbraucht die Schicht.

## Lebenszyklus und Wartbarkeit

SCADA-Systeme überleben die Menschen, die sie bauen, und zwei Praktiken entscheiden, ob das tragbar ist.

**Projektierung unter Versionsverwaltung mit definierter Basislinie.** Die Frage „was hat sich zwischen der funktionierenden und der nicht funktionierenden Version geändert" muss beantwortbar sein. Das gilt für Bilder und Tag-Datenbanken ebenso wie für SPS-Code.

**Eine dokumentierte Tag- und Namenskonvention, die Bereich, Betriebsmittel und Funktion kodiert.** Ein in einer Meldung gefundener Tag sollte seine Quelle ohne Querverweiswerkzeug auffindbar machen. Dieselbe Disziplin, die SPS-Programme wartbar hält, angewandt auf die Ebene mit dem breiteren Publikum.

Die einplanenswerte Lebenszyklus-Asymmetrie: SPSen bleiben üblicherweise weit länger im Einsatz als Server-Betriebssystemgenerationen. Eine Architektur, die die Leitsoftware eng an eine bestimmte OS-Generation bindet, steht lange vor der Anlage vor einer erzwungenen Migration — ein Argument dafür, an den Grenzen Schnittstellen (OPC UA, dokumentierte Tag-Strukturen) statt proprietärer Kopplungen zu halten.

## Empfohlene Vorgehensweise

- Erfassung, Historisierung, Engineering und Berichtswesen in getrennte Fehlerdomänen legen.
- Steuerung in der SPS-/RTU-Ebene halten; prüfen, dass die Anlage ohne SCADA sicher ist.
- Datenqualität explizit modellieren und bis zur Bedienoberfläche durchreichen.
- Eine Zeitquellen-Hierarchie festlegen, quellseitig stempeln, UTC speichern.
- Unternehmensverbraucher hinter eine DMZ-Replik legen; die OT-Zone frei von eingehendem Geschäftsverkehr halten.
- Jeden Leitebenenverbraucher gegen die spezifizierte Kommunikationskapazität der Steuerung zählen.
- Im Historian-Collector puffern, damit ein Historian-Ausfall keine Datenlücke wird.
- Redundanz je Rolle anwenden und die Umschaltung planmäßig prüfen.
- SCADA-Projektierung mit definierter Basislinie unter Versionsverwaltung stellen.

## Fazit

Die Güte einer SCADA-Architektur bemisst sich daran, wie präzise sie ausfällt. Ein Entwurf, bei dem jeder Fehler als „SCADA ist weg" erscheint, hat dem Bedienpersonal nichts mitgeteilt und zwingt jedes Ereignis in die maximale Bewertung. Ein Entwurf mit getrennten Rollen, expliziter Datenqualität, disziplinierter Zeit und einer echten Zonengrenze erzeugt Ereignisse, die in Minuten diagnostizierbar sind und deren betriebliche Folge dem entspricht, was tatsächlich ausgefallen ist.

Nichts davon kommt aus dem gewählten Produkt. Es kommt aus Entscheidungen über Grenzen — einmal getroffen, früh, und teuer nachzurüsten.
