# Modbus-TCP-Architektur, Grenzen und Engineering-Praxis

## Zusammenfassung

Modbus TCP ist das am weitesten verbreitete Industrieprotokoll im Einsatz, und der Grund dafür ist nicht technische Exzellenz. Der Grund ist, dass das Protokoll klein genug ist, um es an einem Wochenende korrekt zu implementieren — und klein genug, dass praktisch jedes Gerät es unterstützt. Diese Kombination hat es jahrzehntelang relevant gehalten und wird es weitere Jahrzehnte relevant halten.

Das ingenieurtechnische Problem ist das, was das Protokoll *nicht* leistet. Es bewegt 16-Bit-Register zwischen Client und Server und hängt ihnen weder Typ noch Einheit, Skalierung, Zeitstempel, Qualitätskennung oder Identität an. All das muss dennoch irgendwo existieren — und es existiert in einem Dokument, einer Tabellenkalkulation oder im Kopf einer Person. Diese Verlagerung, vom Protokoll in die Papierform, ist die Quelle nahezu jedes gescheiterten Modbus-Integrationsprojekts.

## Was das Protokoll festlegt — und was es Ihnen überlässt

Der festgelegte Teil ist kurz und verdient eine genaue Formulierung, weil Modbus regelmäßig Verhalten zugeschrieben wird, das es nie beansprucht hat.

**Festgelegt:** ein Client/Server-Transaktionsmodell über TCP, vier Datenbereiche (nur lesbare Bits, les- und schreibbare Bits, nur lesbare 16-Bit-Register, les- und schreibbare 16-Bit-Register), ein Satz Funktionscodes zum Lesen und Schreiben in diesen Bereichen sowie ein Ausnahmeantwort-Mechanismus für Ablehnungen.

**Nicht festgelegt und vollständig dem Engineering überlassen:**

| Aspekt | Position von Modbus | Wo es tatsächlich lebt |
| --- | --- | --- |
| Datentyp | Alles ist ein 16-Bit-Register | Ein Registerkarten-Dokument |
| Technische Einheit | Keine | Ein Registerkarten-Dokument |
| Skalierung | Keine | Ein Registerkarten-Dokument |
| Wortreihenfolge bei 32-Bit-Werten | Über Register hinweg nicht definiert | Konvention, je Gerät |
| Zeitstempel | Keiner; ein Wert ist „jetzt“ oder unbekannt | Die Uhr des Clients |
| Qualität | Keine; ein Lesevorgang gelingt oder scheitert | Vom Client abgeleitet |
| Auffindbarkeit | Keine; dem Client muss es gesagt werden | Ein Dokument, außerhalb des Protokolls |
| Identität / Authentifizierung | Keine | Das Netz — oder nichts |

Das Muster ist durchgängig: **Modbus ist ein Transport für Zahlen, und die Bedeutung dieser Zahlen ist ein separates Artefakt, das das Protokoll nicht prüfen kann.**

> Der Begleitbeitrag zu OPC UA behandelt die gegenteilige Entwurfsentscheidung — ein Informationsmodell, in dem Typ, Einheit und Struktur mit dem Wert reisen. Keiner der beiden Ansätze ist allgemein richtig; entscheidend ist zu wissen, welchen man hat.

## Die Registerkarte ist der Schnittstellenvertrag

Weil die Bedeutung außerhalb des Protokolls lebt, ist die Registerkarte keine Dokumentation *über* die Schnittstelle. Sie **ist** die Schnittstelle. Eine veraltete Registerkarte ist keine Unannehmlichkeit; sie ist ein gebrochener Vertrag, den das Protokoll bereitwillig weiter mit falschen Zahlen erfüllt.

Eine Registerkarte, die die üblichen Fehler verhindert, nennt je Eintrag:

- Adresse — und **ausdrücklich, in welcher Adressierungsbasis** sie notiert ist.
- Datenbereich (Input Register, Holding Register, Coil, Discrete Input).
- Datentyp und, bei mehrregistrigen Werten, die **Wortreihenfolge**.
- Skalierungsfaktor und technische Einheit.
- Nur lesbar oder les-/schreibbar — und bei schreibbaren Einträgen, was der Schreibvorgang bewirkt.
- Gültigen Bereich und den Wert, der „ungültig“ bedeutet, sofern es einen gibt.
- Eine Version und ein Datum.

**Das wertvollste einzelne Feld dieser Liste ist die Adressierungsbasis**, aus Gründen, die der nächste Abschnitt erklärt.

## Adressierung, Typen und Wortreihenfolge

Drei Mehrdeutigkeiten verbrauchen mehr Modbus-Inbetriebnahmezeit als alles Übrige zusammen.

**Die Adressierungsbasis.** Die historische Dokumentationskonvention nummeriert Holding Register ab 40001, während das Telegrammformat sie ab null zählt. Ein als „40001“ dokumentiertes Gerät wird auf Protokoll-Offset 0 gelesen. Hersteller dokumentieren uneinheitlich — manche veröffentlichen den Telegramm-Offset, manche die Altnummer, manche beides, manche nichts davon eindeutig. Das Ergebnis ist der klassische Off-by-One: Alles liest, nichts bedeutet das Richtige, und die Werte wirken plausibel genug, dass der Fehler den Test übersteht.

Die ingenieurtechnische Abwehr ist keine Raffinesse. Sie besteht darin, **die Basis in der Registerkarte ausdrücklich zu nennen und bei der Inbetriebnahme einen bekannten physikalischen Wert zu verifizieren** — den Strom eines laufenden Motors, einen Füllstand, den jemand sehen kann — bevor dem Rest vertraut wird.

**Datentypen.** Ein 32-Bit-Float, ein 32-Bit-Integer und ein Zeitstempel sind allesamt Konventionen auf Registerpaaren. Das Protokoll definiert die Bytereihenfolge innerhalb eines Registers, aber **die Reihenfolge der Register innerhalb eines mehrregistrigen Wertes definiert es nicht** — zwei normkonforme Implementierungen können also uneins sein. Daher stammen die „Byte-Swap“-Einstellungen in jedem Modbus-Client und die Werte, die als absurde Zahlen oder als Beinahe-Null gelesen werden, wenn die Hälften vertauscht sind.

Eine praktische Diagnose: **Liest ein 32-Bit-Float mit völlig falscher Größenordnung, während die 16-Bit-Ganzzahlen desselben Geräts korrekt sind, ist es ein Wortreihenfolgeproblem und kein Skalierungsproblem.** Skalierungsfehler erzeugen Werte, die um einen sauberen Faktor falsch sind; Wortreihenfolgefehler erzeugen Werte, die um Größenordnungen daneben oder unsinnig sind.

**Vorzeichen und Skalierung** bilden die dritte Schicht. Ein Register, das eine Temperatur in Zehntelgrad und vorzeichenbehaftet führt, liest sich als 65.xxx, wenn es vorzeichenlos interpretiert wird, obwohl es in Wirklichkeit negativ ist. Jeder dieser Fälle ist für das Protokoll unsichtbar und nur gegen einen bekannten physikalischen Wert erkennbar.

## Abfragestrategie und Last

Modbus kennt keinen Abonnementmechanismus. Der Client fragt, der Server antwortet, unaufgefordert kommt nichts. Alles zur Last folgt daraus.

**Register so gruppieren, dass eine Anfrage viele Werte abdeckt.** Das Lesen eines zusammenhängenden Blocks kostet eine Transaktion; dieselben Werte einzeln zu lesen kostet je eine. Deshalb sollte die Registerkarte mit Blick auf Zusammenhang *entworfen* werden — Werte, die gemeinsam und mit derselben Rate gelesen werden, auf benachbarte Adressen. Zur Entwurfszeit kostet das nichts und lässt sich später nicht nachrüsten, ohne jeden bestehenden Client zu brechen.

**Die Abfragerate gehört zum Prozess, nicht zur Hardware.** Ein Füllstand, der sich über Minuten bewegt, profitiert nicht von einer Sekundenabfrage, und deren Preis wird auf jedem Gerät, in jedem Client und im Netz dauerhaft bezahlt.

**Die Karte nach Rate trennen.** Werte, die schnell sein müssen, und Werte, die minutenaktuell genügen, gehören nicht in dieselbe Abfragegruppe; sonst bestimmen die langsamen den Preis der schnellen oder umgekehrt.

Eine brauchbare Denkweise für die Gesamtlast: Sie ist *(Transaktionen je Durchlauf) × (Durchlaufrate) × (Anzahl Clients)* — und üblicherweise setzt jeden dieser drei Faktoren eine andere Person, ohne die beiden anderen zu kennen.

## Timeouts, Wiederholungen und was Schweigen bedeutet

Hier bietet Modbus echten diagnostischen Wert, und genau der wird routinemäßig verschenkt.

**Eine Ausnahmeantwort und ein Timeout sind verschiedene Ereignisse mit verschiedenen Ursachen.**

- Eine **Ausnahmeantwort** bedeutet, dass die Anfrage einen lebenden Server erreichte, der sie verstand und ablehnte — ein nicht unterstützter Funktionscode, eine Adresse außerhalb seiner Karte, ein Wert außerhalb des Bereichs oder eine gerätseitige Störung. Der Pfad funktioniert; die Anfrage ist falsch.
- Ein **Timeout** bedeutet, dass nichts zurückkam — Pfad, Verbindung oder Gerät sind das Problem. Die Anfrage kann völlig korrekt sein.

Beides als „Kommunikationsfehler“ zu behandeln, verwirft die nützlichste Unterscheidung, die das Protokoll bietet. **Ein Client, der den Ausnahmecode getrennt vom Timeout protokolliert, hat aus einem Symptom eine Richtung gemacht.**

**Die Timeout-Wahl** muss die schlechteste Antwortzeit des Geräts übersteigen, nicht die typische. Kleine eingebettete Server priorisieren Modbus unter Last herunter, und ein auf einem ruhigen Prüfplatz eingestelltes Timeout läuft unter Produktionsbedingungen ab.

**Wiederholungen vervielfachen die Last genau dann, wenn das System sie am wenigsten tragen kann.** Ein kurzes Timeout mit aggressiven Wiederholungen macht aus einem ausgelasteten Gerät ein unerreichbares: Jedes Timeout erzeugt eine weitere Anfrage, die die Warteschlange verlängert, was das nächste Timeout auslöst. Wiederholungszähler gehören klein, und das Timeout lang genug, dass eine Wiederholung tatsächlich Versagen bedeutet.

**TCP verdeckt physikalische Probleme.** Die Neuübertragung auf Transportebene verbirgt eine degradierende Verbindung, bis sie schlecht genug ist, um die Anwendung zu brechen. Wo eine Verbindung verdächtig ist, liegen die Belege in den Portzählern des Switches und nicht im Modbus-Client.

## Verbindungsskalierung und Gateways

**Jeder Client öffnet seine eigene TCP-Verbindung**, und eingebettete Server tragen davon eine endliche Zahl. SCADA, ein Historian-Collector, ein Reporting-Konnektor und ein Engineering-Notebook sind vier Verbindungen zu jedem Gerät. Anders als bei manchen Protokollen veröffentlichen viele Modbus-Geräte gar keine unterstützte Verbindungszahl — die Grenze wird also durch Überschreiten entdeckt, typischerweise als abgewiesene Verbindung oder als Trennung eines bestehenden Clients, sobald ein neuer erscheint.

Die Abhilfe ist architektonisch: **ein Poller liest das Gerät; alles andere liest den Poller.** Ein einzelner Datenkonzentrator mit einer Verbindung je Gerät, der viele Konsumenten bedient, beseitigt das Skalierungsproblem und schafft einen Ort für Protokollierung und Ratenbegrenzung.

**Serielle Gateways verdienen eigene Betrachtung**, weil dort schnelle TCP-Erwartungen auf langsame serielle Wirklichkeit treffen.

```text
SCADA ──┐
        ├── TCP (fast, parallel) ── Gateway ── RTU serial (slow, strictly sequential)
Historian ┘                                        │
                                            device 1 … device n
```

Ein Gateway vervielfacht die Kapazität des seriellen Busses nicht; es serialisiert alles darauf. Drei TCP-Clients, die zehn serielle Geräte abfragen, erzeugen eine Warteschlange, und deren Länge — nicht das Netz — bestimmt die Antwortzeit. Ist ein Gateway im Spiel:

- Die serielle Seite bestimmt die erreichbare Abfragerate; die TCP-Seite ist danach zu konfigurieren und nicht danach, was TCP könnte.
- TCP-Timeouts müssen die Warteschlangenverzögerung aufnehmen, nicht nur die Antwortzeit des Geräts.
- Ein langsames oder abwesendes serielles Gerät verzögert jede Anfrage dahinter — weshalb ein nicht antwortendes Gerät auf einer gemeinsamen Leitung als anlagenweite Verlangsamung erscheint und nicht als ein defektes Gerät.

## Sicherheitslage

Klar gesagt: **Modbus TCP hat keine Authentifizierung, keine Autorisierung und keine Verschlüsselung.** Alles, was den Port des Servers erreicht, kann jedes Register der Karte lesen und, wo die Karte es zulässt, darauf schreiben. Das Protokoll lässt sich nicht dagegen konfigurieren, weil es nichts zu konfigurieren gibt.

Das ist keine Kritik — das Protokoll ist älter als dieses Bedrohungsmodell —, aber es ist eine Entwurfsvorgabe:

- Modbus auf ein Segment beschränken, dessen Teilnehmer sämtlich aufgezählt sind.
- An der Grenze filtern, sodass nur benannte Clients es erreichen.
- Für Konsumenten ohne Schreibbedarf einen Nur-Lese-Pfad an der Grenze vorsehen, nicht per Client-Konvention.
- Niemals einen Modbus-Server über eine nicht vertrauenswürdige Grenze exponieren in der Annahme, die Unbekanntheit der Registerkarte sei ein Schutz. Sie ist es nicht; die Karte ist klein und aufzählbar.

> Der Begleitbeitrag zur sicheren PLC-SCADA-Kommunikation behandelt die kompensierende Architektur vollständig. Der Punkt hier ist enger: Keine Modbus-Konfiguration trägt dazu bei.

## Diagnose

Eine kurze Belegtabelle, die Fehlerdomänen trennt, statt Ursachen aufzuzählen:

| Symptom | Beleg | Wahrscheinliche Domäne |
| --- | --- | --- |
| Ausnahmeantwort auf einer Adresse | Andere Adressen antworten normal | Registerkarte falsch, nicht das Netz |
| Timeout auf allen Adressen eines Geräts | Andere Geräte am selben Switch antworten | Gerät, sein Port oder sein Kabel |
| Timeouts an mehreren Geräten gleichzeitig | Sie teilen Switch, Gateway oder Uplink | Gemeinsame Infrastruktur, nicht die Geräte |
| Werte plausibel, aber um einen festen Faktor falsch | Skalierung von zwei Seiten unterschiedlich dokumentiert | Skalierungsspalte der Registerkarte |
| 32-Bit-Werte absurd, 16-Bit-Werte korrekt | Hälften einzeln gelesen wirken sinnvoll | Wortreihenfolge |
| Antwortzeiten wachsen mit der Clientzahl | Jeder Client fragt das Gerät direkt ab | Verbindungsskalierung; Konzentrator nötig |
| Sporadische Timeouts unter Anlagenlast | Korreliert mit Antrieb oder Kran, Portfehler steigen | Physikalische Ebene, nicht Modbus |

**Das Denkmuster, das sich lohnt: Das Protokoll sagt Ihnen, ob das Gerät geantwortet hat. Was gemeinsam antwortete und was gemeinsam ausfiel, sagt Ihnen, wo der Fehler wohnt.**

## Fehlermodi

**Adressierungsbasis angenommen statt benannt.** Alles ist um eins versetzt; die Werte wirken plausibel.

**Wortreihenfolge angenommen.** 32-Bit-Werte sind auf einem Gerät unsinnig und auf einem anderen mit derselben Karte korrekt.

**Skalierung nur im Kopf einer Person.** Der Wert ist falsch, sobald jemand anderes daran arbeitet.

**Alle Werte mit der höchsten verfügbaren Rate abgefragt.** Dauerlast ohne betrieblichen Nutzen.

**Kurzes Timeout mit vielen Wiederholungen.** Aus einem ausgelasteten wird ein unerreichbares Gerät.

**Jeder Konsument verbindet direkt.** Die undokumentierte Verbindungsgrenze wird im Produktivbetrieb entdeckt.

**Gateway nach TCP-Erwartungen konfiguriert.** Die Warteschlangenverzögerung wird dem Netz angelastet.

**Ausnahmeantworten als allgemeine Kommunikationsfehler protokolliert.** Das nützlichste Diagnosesignal wird verworfen.

**Registerkarte nicht versioniert.** Ein Firmware-Update verschiebt Adressen, und niemand weiß, welcher Client nun das falsche Register liest.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Wasserversorger bindet zwölf Brunnenpumpstationen über Modbus TCP an ein zentrales Leitsystem an. Jede Station hat eine Steuerung und ein Gateway zu zwei seriellen Durchflussmessern. Die Inbetriebnahme verläuft ereignislos. Sechs Wochen später melden die Bediener, dass Durchflusswerte an mehreren Stationen sporadisch veralten und Pumpenbefehle manchmal spürbar verzögert wirksam werden.

Der Befund: Die veralteten Werte sind stets die Messwerte, nie die Werte der Steuerung. Steuerung und Messgeräte werden von demselben SCADA-Server gelesen, aber über verschiedene Pfade — die Steuerung direkt über TCP, die Messgeräte über das Gateway auf die serielle Leitung. Timeouts treten ausschließlich in der Abfragegruppe der Messgeräte auf.

Die Auslegungsprüfung findet die Ursache. Der Integrator hat sämtliche Abfragegruppen mit derselben Sekundenrate konfiguriert, auch die Messgeräte. Auf der seriellen Seite lassen zwei Messgeräte bei dieser Rate kaum Leerlauf, und als der Historian hinzukam — ein zweiter Client, ebenfalls im Sekundentakt — wuchs die Warteschlange des Gateways über das konfigurierte TCP-Timeout hinaus. Die Verzögerung der Pumpenbefehle ist dieselbe Warteschlange: Schreibvorgänge warten hinter den Lesevorgängen.

Nichts war defekt, und nichts war für sich genommen falsch parametriert. Der Fehler bestand darin, eine Annahme der TCP-Seite auf eine Ressource der seriellen Seite anzuwenden — und anschließend einen zweiten Konsumenten hinzuzufügen, ohne die Last neu zu zählen.

Die Abhilfe ist unspektakulär und strukturell: die Messgeräte mit der Rate abfragen, die der Prozess tatsächlich braucht; den Historian vom SCADA-Server statt vom Gateway lesen lassen; und das TCP-Timeout aus der gemessenen Warteschlangenverzögerung ableiten statt aus der Antwortzeit des Messgeräts.

## Wo Modbus TCP die richtige Wahl ist

Eine ehrliche Bewertung nennt auch die Fälle, in denen die Einfachheit der Vorzug ist.

- **Ein kleiner, stabiler Satz Werte aus einem Gerät, das sich nicht ändern wird.** Der Modellierungsaufwand eines reicheren Protokolls bringt hier nichts ein.
- **Heterogene Ausrüstung vieler Hersteller.** Modbus ist der Boden der Interoperabilität; nahezu alles spricht es.
- **Geräte mit begrenzten Prozessoren.** Ein vollständiges Informationsmodell steht womöglich gar nicht zur Verfügung.
- **Integrationen, deren Registerkarte wirklich stabil und gut dokumentiert ist.** Die meisten Schwächen des Protokolls sind Schwächen der umgebenden Dokumentationspraxis, nicht des Telegrammformats.

Und die Fälle, in denen es die falsche Wahl ist: wenn der Konsument *entdecken* muss, was ein Gerät anbietet; wenn Werte Qualität und Zeitstempel für einen Historian tragen müssen; wenn die Anbindung auf Protokollebene abzusichern ist; oder wenn der Datensatz eines Geräts groß ist und sich häufig ändert.

## Empfohlene Praxis

- Die Registerkarte als Schnittstellenvertrag behandeln: versioniert, datiert, mit Verantwortlichem.
- Die Adressierungsbasis ausdrücklich nennen und bei der Inbetriebnahme einen bekannten physikalischen Wert verifizieren, bevor dem Rest vertraut wird.
- Wortreihenfolge und Vorzeichen für jeden mehrregistrigen Wert dokumentieren.
- Die Karte auf Zusammenhang entwerfen, gruppiert nach Abfragerate.
- Abfrageraten aus dem Prozess ableiten, nicht aus dem Maximum der Hardware.
- Timeouts aus der schlechtesten Antwortzeit setzen; Wiederholungszähler klein halten.
- Ausnahmecodes getrennt von Timeouts protokollieren — sie zeigen in verschiedene Richtungen.
- Die Abfrage in einem Client bündeln und alles Weitere von dort bedienen.
- Wo ein serielles Gateway existiert, den gesamten Entwurf von der seriellen Seite her dimensionieren.
- Modbus auf ein aufgezähltes Segment beschränken und an der Grenze filtern; vom Protokoll selbst nichts erwarten.
- Die Karte nach jedem Firmware-Wechsel eines Geräts erneut verifizieren.

## Fazit

Modbus TCP ist ein gutes Protokoll für das, was es zu sein beansprucht, und ein schwaches Fundament für das, was ihm oft unterstellt wird. Es bewegt Register; es trägt keine Bedeutung, und es kann nicht erkennen, wenn die Bedeutung von den Zahlen abgedriftet ist.

Diese eine Eigenschaft erklärt die Disziplin, die dieser Beitrag empfiehlt. Registerkarte, Adressierungsbasis, Wortreihenfolge und Abfrageraten sind keine Verwaltungsdetails — sie sind die Teile der Schnittstelle, deren Festlegung das Protokoll abgelehnt hat, und damit genau die Teile, die versagen werden. Werden sie ausdrücklich ausgelegt, läuft Modbus TCP zwanzig Jahre. Bleiben sie implizit, arbeitet das Protokoll weiterhin einwandfrei — und liefert die falschen Zahlen.
