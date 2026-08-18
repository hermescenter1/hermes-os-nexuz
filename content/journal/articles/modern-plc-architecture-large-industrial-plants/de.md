# Moderne SPS-Architektur für große Industrieanlagen

## Zusammenfassung

In einem Automatisierungssystem im Werksmaßstab ist die SPS-Architektur keine Auslegungsübung. Die Anzahl der Steuerungen, die Lage der Schnittgrenzen, die Verteilung der Remote-E/A und die Netztopologie, die das Prozessabbild trägt, bestimmen gemeinsam vier betriebliche Eigenschaften, die auch das beste Anwenderprogramm nicht mehr korrigieren kann: wie weit sich ein Fehler ausbreitet, welcher Anlagenteil für die Instandhaltung einer einzigen Maschine stillstehen muss, wie lange ein Steuerungstausch dauert und wie viel Produktion ein einzelner Verbindungsausfall kostet.

Dieser Beitrag nimmt genau diese vier Eigenschaften als Entwurfsziel und arbeitet rückwärts zu der Architektur, die sie liefert.

## Warum das relevant ist

Ein verbreitetes Fehlermuster in Bestandsanlagen sieht so aus: Ein Produktionsbereich wurde ursprünglich mit einer Steuerung automatisiert. Über ein Jahrzehnt kamen eine zweite Linie, eine Verpackungszelle, ein Utility-Skid und eine Entstaubungsanlage hinzu — jedes Mal, weil zusätzliche E/A auf der vorhandenen CPU günstiger war als eine neue Steuerung. Das Ergebnis ist ein Prozessor, dessen Zyklus heute vier unabhängige Prozesse trägt.

Am Programm ist nichts falsch. Aber die Anlage hat eine Eigenschaft erworben, die niemand gewählt hat: Jedes Firmware-Update, jeder Hardwarefehler und jeder Inbetriebnahmefehler an der jüngsten Maschine legt nun alle vier Prozesse still. Die Kosten dieser Architektur werden nicht in Ingenieurstunden bezahlt, sondern in der Differenz zwischen einem zweistündigen Stillstand in einem Bereich und einem zweistündigen Stillstand in einem Viertel der Anlage.

Die Entscheidung, die dazu geführt hat, wurde nie überprüft — weil sie nie als Architekturentscheidung formuliert wurde.

## Ingenieurtechnischer Kontext

Man betrachte die typische Struktur einer großen kontinuierlichen oder diskreten Anlage: mehrere Prozessbereiche mit jeweils eigenem Betriebsrhythmus; gemeinsame Versorgungssysteme (Druckluft, Kühlwasser, Entstaubung), die allen dienen; ein Materialfluss-Rückgrat, das sie verbindet; und eine Reihe von Paketanlagen, die OEM-Lieferanten mit eigenen Steuerungen liefern.

Drei Kräfte ziehen die Architektur in unterschiedliche Richtungen:

- **Prozesskopplung.** Zwei Betriebsmittel, die im Millisekundenbereich verriegelt werden müssen — ein Antrieb und sein Lastausgleichspartner, eine Presse und ihr Transfer — gehören in eine Steuerung, in der die Verriegelung ein Speicherzugriff und keine Netzwerktransaktion ist.
- **Verfügbarkeitstrennung.** Zwei Bereiche, die unabhängig laufen können, gehören in *unterschiedliche* Steuerungen, damit ein Stillstand im einen kein Stillstand im anderen ist.
- **Lebenszyklus-Unabhängigkeit.** Eine Paketanlage, die der Lieferant in der Gewährleistung betreut, braucht ihre eigene Steuerung, damit der Firmware-Fahrplan des Lieferanten nicht der Firmware-Fahrplan der Anlage wird.

Architektur bedeutet, diese drei Kräfte bereichsweise ausdrücklich aufzulösen — statt sie vom günstigsten E/A-Angebot auflösen zu lassen.

## Systemarchitektur

Der Signalpfad in einem modernen Werkssystem ist geschichtet, und jede Schicht ist ein Ort, an dem ein Fehler entweder eingegrenzt oder durchgelassen wird:

```text
Feldgerät (Sensor / Aktor)
    |
Remote-E/A-Station  ── lokale Absicherung, Kanaldiagnose
    |
Feldbus- / Industrial-Ethernet-Segment  ── Ring oder Stern, je Bereich
    |
Bereichssteuerung (SPS)  ── die Fehlereingrenzungsgrenze
    |
Anlagennetz (physisch getrennte oder VLAN-getrennte Ebene)
    |
SCADA / HMI  ── Betriebssicht
    |
Historian / Analytik  ── keine Steuerungshoheit
```

Zwei Eigenschaften dieses Bildes wiegen schwerer als die Kästen selbst.

Erstens: **Die Bereichssteuerung ist die Fehlereingrenzungsgrenze.** Ein Fehler unterhalb — ein defektes E/A-Modul, ein unterbrochenes Segment — soll diesen Bereich beeinträchtigen. Ein Fehler an ihr legt diesen Bereich still. Kein Fehler in einem Bereich darf jedoch einen anderen erreichen, und das heißt: Bereichssteuerungen dürfen für ihren eigenen sicheren Betrieb nicht voneinander abhängen. Bereichsübergreifender Datenaustausch trägt *Information* — niemals Freigaben, die ein Bereich zum sicheren Weiterbetrieb braucht.

Zweitens: **Der Historian hat keine Steuerungshoheit, und das muss strukturell sein, nicht organisatorisch.** Kann die Analytikebene in das Prozessabbild schreiben, wird ein Analytikausfall zu einem Prozessereignis. Architektonisch lesend ist weit mehr wert als konfigurativ lesend.

### Aufteilung der Steuerungen

Eine belastbare Aufteilungsregel, in dieser Reihenfolge:

1. **Zuerst der Sicherheitsumfang.** Sensoren, Logik und Endglieder einer Sicherheitsfunktion gehören in eine Sicherheitssteuerung beziehungsweise eine F-CPU-Domäne. Eine Sicherheitsfunktion über ein Netz zu verteilen, das man anschließend qualifizieren muss, ist ein hoher Preis für eine kleine architektonische Bequemlichkeit.
2. **Dann die Verriegelungslatenz.** Betriebsmittel, die schneller verriegelt werden müssen als eine Netzwerkumlaufzeit plus zwei Zyklen, bleiben zusammen.
3. **Dann die Verfügbarkeitsgrenzen.** Bereiche, die der Betriebsplan als unabhängig abschaltbar behandelt, erhalten eigene Steuerungen.
4. **Dann die Lebenszyklus-Zuständigkeit.** OEM-Pakete behalten ihre eigene Steuerung mit einer definierten Datenschnittstelle.
5. **Und erst dann die Last.** Erst hier kommt die CPU-Kapazität ins Spiel — als Randbedingung der Aufteilung, nicht als deren Treiber.

Die meisten schlechten Architekturen entstehen dadurch, dass diese Liste rückwärts abgearbeitet wird.

### Platzierung der Remote-E/A

Remote-E/A hat die alte Debatte um zentrale Rangierung weitgehend entschieden, bringt aber eine eigene Entscheidung mit: wie viele Stationen, und wo.

Die brauchbare Faustregel lautet: **Eine E/A-Station soll einer instandhaltbaren Einheit entsprechen.** Lässt sich eine Antriebsgruppe eines Förderers als Einheit freischalten, bearbeiten und wieder in Betrieb nehmen, dann gehört ihre E/A in eine Station, an eine abgesicherte Versorgung, mit einer Diagnoseidentität. Schneiden Stationsgrenzen quer durch Instandhaltungsgrenzen, wird jeder Eingriff zu einer Verhandlung darüber, was sonst noch stillstehen muss.

| Entscheidung | Treiber | Typischer Fehler bei Missachtung |
| --- | --- | --- |
| Stationsanzahl | Instandhaltungsfreischaltung | Eine Freischaltung legt Fremdanlagen still |
| Stationsort | Kabellänge, EMV-Exposition | Lange Analogleitungen neben Motorleitungen |
| Versorgungstrennung | Fehlereingrenzung | Eine Sicherung legt den halben Bereich lahm |
| Diagnosegranularität | Mittlere Reparaturzeit | „Irgendetwas in Bereich 3 ist gestört" |

### Netztopologie

Für Industrial Ethernet auf Bereichsebene steht praktisch die Wahl zwischen einem Stern auf einen Bereichsswitch und einem Ring mit Redundanzprotokoll an.

Ein Ring erkauft die Toleranz gegenüber genau einer Leitungsunterbrechung — zum Preis einer Rekonfigurationszeit, die der Prozess überstehen muss. Genau dieser letzte Halbsatz wird regelmäßig übersprungen. Eine Ringumschaltung in der Größenordnung einiger zehn Millisekunden ist für einen Füllstandsregelkreis unsichtbar und für eine Druckregisterregelung möglicherweise fatal. **Die zulässige Unterbrechung ist eine Prozesseigenschaft und muss vor der Topologiewahl feststehen** — nicht danach behauptet werden.

MRP, RSTP, PRP und HSR belegen tatsächlich verschiedene Punkte auf dieser Kurve: PRP und HSR liefern stoßfreie Redundanz durch Frame-Verdopplung statt durch Rekonfiguration, zum Preis doppelter Infrastruktur und entsprechend ausgestatteter Endgeräte. Ein Ringprotokoll, das gewählt wurde, weil „die Switches es können", und nicht, weil seine Umschaltzeit gegen eine gemessene Prozesstoleranz geprüft wurde, ist eine Vermutung im Kostüm eines Entwurfs.

## Ingenieurtechnische Grundprinzipien

### Determinismus ist ein Budget, keine Eigenschaft

Eine Steuerung *hat* keinen Determinismus; sie hat eine Verteilung der Zykluszeit. Die brauchbare ingenieurtechnische Aussage ist ein Budget:

- E/A-Aktualisierungszeit auf dem Segment
- plus Netzübertragung und Jitter
- plus Steuerungszyklus
- plus Ansprechzeit des Endglieds

Eine Sequenz, die in einem definierten Fenster abgeschlossen sein muss, hat in diese gesamte Kette zu passen — nicht nur in den Zyklus. Regelmäßig wird der Teil optimiert, den man im Engineering-Werkzeug sieht — der Zyklus —, während der dominierende Term in der Aktualisierungsrate einer Remote-Station oder in der mechanischen Ansprechzeit eines Ventils sitzt.

### Fehlereingrenzung muss entworfen werden

Für jede Grenze in der Architektur ist zu fragen: *Was passiert auf der anderen Seite, wenn dies ausfällt?* Die ehrliche Antwort lautet oft „wissen wir nicht" — und der Weg dorthin ist nicht Argumentation, sondern Prüfung: Leitung ziehen, Versorgung abschalten, Switch neu starten und beobachten. Eine nie geprüfte Eingrenzungsgrenze ist eine Eingrenzungsannahme.

### Steuerungsübergreifende Daten sind ein Vertrag

Braucht Bereich A einen Wert aus Bereich B, ist dieser Austausch mit der Disziplin einer Schnittstelle zu behandeln: definierte Datenstruktur, definierte Aktualisierungsrate, ausdrückliche Alterskennzeichnung und definiertes Verhalten bei Nichtverfügbarkeit. Wegzuentwerfen ist genau der Fall, in dem B nicht mehr sendet und A unbegrenzt mit dem zuletzt empfangenen Wert weiterarbeitet — ohne jeden Hinweis darauf, dass es nun auf einer veralteten Zahl regelt.

## Kenngrößen

| Kenngröße | Was sie bestimmt | Warum sie wehtut |
| --- | --- | --- |
| Zykluszeit der Steuerung | Ausführungsintervall der Logik | Setzt die Untergrenze der Sequenzauflösung |
| Zyklus-Jitter | Schwankung zwischen Zyklen | Bricht zeitkritische Abläufe weit früher als der Mittelwert |
| E/A-Aktualisierungszeit | Aktualität der Felddaten | Dominiert oft die gesamte Kreisverzögerung |
| CPU-Auslastung | Reserve für künftige Logik | Eine CPU bei 85 % hat keine Inbetriebnahmereserve |
| Netz-Umschaltzeit | Überbrückung bei Unterbrechung | Muss unter der Prozesstoleranz liegen, nicht unter einem Datenblattwert |
| Kommunikationslast | Zyklischer + azyklischer Verkehr | Azyklische Diagnose stört ungeplant das zyklische Timing |

## Fehlerbilder

**Stiller Teilausfall der E/A.** Eine Remote-Station fällt aus. Ihre Eingänge frieren je nach Parametrierung im letzten Zustand ein oder fallen auf null. Logik, die den Stationsstatus nie prüft, rechnet mit Werten weiter, die keine Messwerte mehr sind. Das ist das gefährlichste verbreitete Fehlerbild verteilter E/A — und zugleich das am leichtesten zu verhindernde: Der Diagnosestatus jeder Station gehört als ausgewerteter Eingang in die Logik, die ihre Werte nutzt.

**Schleichende Zykluszeit.** Aufeinanderfolgende Projekte fügen Logik hinzu. Niemand misst nach. Die Zykluszeit driftet, bis eine bei der Inbetriebnahme zuverlässige Sequenz bei einer bestimmten Produktionsrate sporadisch falsch wird — der klassische Fehler „tritt nur in der Nachtschicht auf, wenn wir schnell fahren".

**Der Ring, der nicht geschlossen ist.** Ein Ring wird installiert, dann lässt ihn ein Provisorium während eines Stillstands offen. Er funktioniert einwandfrei, denn ein offener Ring ist schlicht ein linearer Bus. Er funktioniert einwandfrei bis zu dem Tag, an dem jemand eine Leitung bewegt — und dann fällt er aus wie ein linearer Bus ganz ohne Redundanz. Deshalb muss die Ringintegrität ein überwachter, alarmierter Zustand sein und kein Häkchen im Inbetriebnahmeprotokoll.

**Bereichsübergreifende Abhängigkeit, im Fehlerfall entdeckt.** Bereich A steht. Bereich B, für unabhängig gehalten, steht ebenfalls, weil vor Jahren behelfsweise eine Freigabe aus A abgegriffen wurde. Die Abhängigkeit bestand jahrelang und wurde erst unter Fehlerbedingungen sichtbar.

## Diagnose und Fehlersuche

Verhält sich ein verteiltes System sporadisch fehlerhaft, ist die produktive Frage nicht „was ist defekt?", sondern „welche Schicht widerspricht welcher?". Zu erfassen, jeweils mit Zeitstempel:

1. Diagnosepuffer der Steuerung — ihre eigene Darstellung des Geschehens.
2. Portstatistik der Netzkomponenten — Fehler, Discards, Link-Flapping je Port.
3. Diagnosestatus der Remote-Stationen — je Station, je Kanal.
4. Zykluszeitstatistik — Minimum, Maximum und aktueller Wert, nicht nur der aktuelle.
5. Das zeitlich korrelierende Prozessereignis.

Die Korrelation zählt mehr als jeder Einzelwert. Ein Diagnoseeintrag ohne zugehörigen Portfehler deutet auf ein Problem der Steuerung oder ihrer Versorgung; Portfehler bei sauberem Diagnosepuffer deuten auf ein Problem der Bitübertragungsschicht, das die Steuerung bisher überbrückt hat. Steigende Discard-Zähler an einem Port, die dem Ereignis in drei Fällen stets vorausgehen, sind keine These mehr — sie sind Beleg.

Die Disziplin, auf der zu bestehen ist: **Zwischen zwei Beobachtungen niemals zwei Dinge ändern.** Sporadische verteilte Fehler werden durch Eingrenzung der Belege gefunden, und gleichzeitige Änderungen zerstören die Zurechenbarkeit des Ergebnisses.

## Industrielles Beispiel

*Das Folgende ist ein illustratives ingenieurtechnisches Szenario, keine Darstellung eines konkreten Projekts.*

Ein Schüttgutterminal betreibt drei unabhängige Schiffsbeladelinien, die sich ein gemeinsames Förderrückgrat und eine gemeinsame Entstaubungsanlage teilen. Der ursprüngliche Entwurf legte alle drei Linien und die gemeinsamen Versorgungen auf zwei Steuerungen — aufgeteilt nach Schaltschrankstandort statt nach Prozess.

Die Folge: Die Entstaubung, genehmigungsrechtlich Voraussetzung für den Betrieb jeder Linie, liegt in derselben Steuerung wie die Linien 1 und 2. Ein Firmware-Update dieser Steuerung — nötig für eine Änderung an Linie 1 — legt die Entstaubung und damit auch Linie 3 still, obwohl Linie 3 mit dieser Arbeit funktional nichts zu tun hat.

Die architektonische Abhilfe ist nicht mehr Hardware, sondern eine neu gezogene Grenze. Gemeinsame Versorgungen, die Voraussetzung für jede Linie sind, gehören in eine eigene Steuerung mit eigenem Lebenszyklus, damit kein Instandhaltungsfenster einer Linie zu einem anlagenweiten Fenster wird. Jede Beladelinie erhält dann ihre eigene Steuerung und konsumiert den Entstaubungsstatus als Schnittstelle mit ausdrücklich definiertem Verhalten bei veralteten Daten.

Der ingenieurtechnische Aufwand dieser Änderung ist klein. Ihr Verfügbarkeitseffekt ist groß — und er wird vollständig davon bestimmt, wo die Grenze gezogen wurde.

## Abwägungen

| Wahl | Gewinn | Preis |
| --- | --- | --- |
| Mehr, kleinere Steuerungen | Fehlereingrenzung, unabhängige Instandhaltung | Mehr zu spezifizierende und prüfende Schnittstellen |
| Weniger, größere Steuerungen | Einfache Verriegelung, weniger Integration | Größerer Wirkradius je Ausfall |
| Ringtopologie | Übersteht eine Unterbrechung | Umschaltzeit muss zum Prozess passen |
| PRP/HSR | Stoßfrei im Fehlerfall | Doppelte Infrastruktur, Geräteunterstützung nötig |
| Dichte Remote-E/A | Weniger Kabel, lokale Diagnose | Stationsgrenze muss zur Instandhaltungsgrenze passen |

Es gibt keinen allgemeingültig richtigen Punkt auf diesen Achsen. Es gibt nur einen für die konkrete Anlage begründbaren — und Begründbarkeit setzt voraus, dass die Überlegung dokumentiert wurde.

## Häufige Entwurfsfehler

- **Die CPU auslegen, bevor die Grenzen gezogen sind.** Die Aufteilung soll die Steuerung bestimmen; zu oft bestimmt die Steuerung die Aufteilung.
- **Das OEM-Paket als Blackbox ohne Schnittstellenspezifikation behandeln.** Es hat eine Schnittstelle, ob spezifiziert oder nicht; die einzige Frage ist, ob sie entworfen oder später entdeckt wird.
- **Annehmen, das Netz sei in Ordnung, weil der Prozess läuft.** Ein Netz an der Fehlerschwelle und ein einwandfreies Netz sehen beide wie ein laufender Prozess aus — genau bis sie es nicht mehr tun.
- **Keine CPU- und Speicherreserve lassen.** Eine mit 85 % Last übergebene Steuerung hat keinen Platz für die Diagnose und die Behelfslogik, die die Inbetriebnahme selbst braucht.
- **Gelegenheitsfreigaben über Bereichsgrenzen hinweg.** Jede einzelne ist eine undokumentierte Kopplung, die im Fehlerfall entdeckt wird.

## Hinweise zur Inbetriebnahme

Architektur wird bei der Inbetriebnahme nachgewiesen — oder gar nicht. Drei Prüfungen lohnen den Aufwand:

- **Jedes Netzsegment gezielt unterbrechen**, unter kontrollierten Bedingungen, und protokollieren, was der Prozess tatsächlich tut. Das mit der Entwurfsaussage vergleichen.
- **Die Versorgung jeder Remote-E/A-Station abschalten** und bestätigen, dass die Logik dies erkennt und entwurfsgemäß reagiert, statt mit eingefrorenen Eingängen weiterzurechnen.
- **Die Zykluszeit unter realistischer Last messen**, mit verbundenen HMI-Clients und aktiver Diagnose — nicht auf einem ruhigen Prüfstand ohne azyklischen Verkehr.

Ergebnisse dokumentieren. Erst die gemessene Basislinie erlaubt es drei Jahre später, überhaupt zu sagen, ob sich etwas verändert hat.

## Sicherheitstechnische Hinweise

Sicherheitsfunktionen folgen ihrer eigenen Architektur, geregelt durch die Normen zur funktionalen Sicherheit der jeweiligen Branche — IEC 61508 als generische Grundlage, IEC 61511 für die Prozessindustrie und die Maschinensicherheitsnormen für den Maschinenbau. Der hier relevante architektonische Punkt betrifft den Umfang: Die Integrität einer Sicherheitsfunktion ist eine Eigenschaft ihrer gesamten Kette; wird diese Kette über ein Netz verteilt, wird das Netz Teil der Sicherheitsfunktion und Teil dessen, was zu bewerten ist.

Der zweite Punkt ist Unabhängigkeit. Eine Sicherheitsebene, die von derselben Steuerung, derselben Versorgung und demselben Netz abhängt wie die Basisprozessleitebene, liefert nicht die Unabhängigkeit, auf deren Grundlage ihre Risikominderung angerechnet wurde.

Die Gefährdung einer verteilten Architektur liegt darin, dass das Betriebsmittel, das ein Signal bewegt, meist nicht in dem Raum steht, aus dem geprüft wird. Vor der ersten Zuschaltung einer Station muss geklärt sein, wer von dem erreicht werden kann, was sie ansteuert, und keine Entwurfsprüfung ersetzt eine Freischaltung.

## Hinweise zur Cybersicherheit

Architektonische Aufteilung und sicherheitstechnische Zonierung sind dieselbe Tätigkeit aus zwei Gründen und sollten einmal statt zweimal erfolgen. Das Zone-and-Conduit-Modell der IEC 62443 bildet sich natürlich auf Bereichssteuerungen ab: Ein Bereich ist eine Zone, der bereichsübergreifende Datenaustausch ist ein Conduit, und der Conduit ist der Ort, an dem eine Richtlinie durchgesetzt werden kann.

Zwei Konsequenzen gehören von Anfang an in den Entwurf: Anlagennetz und Bereichssegmente dürfen keine flache Broadcast-Domäne bilden, und der Engineering-Zugang — der Weg, über den jemand ein Programm lädt — muss ein bewusst gestalteter, kontrollierter Conduit sein und kein Zufallsprodukt der Topologie.

## Empfohlene Vorgehensweise

- Steuerungsgrenzen in dieser Reihenfolge ziehen: Sicherheitsumfang, Verriegelungslatenz, Verfügbarkeitstrennung, Lebenszyklus-Zuständigkeit — und die Begründung dokumentieren.
- E/A-Stationsgrenzen mit den Freischaltgrenzen der Instandhaltung zur Deckung bringen.
- Die zulässige Prozessunterbrechung festlegen, bevor ein Redundanzprotokoll gewählt wird.
- Den Diagnosestatus der Remote-Stationen in der Logik auswerten, die deren Eingänge nutzt.
- Steuerungsübergreifende Daten als Schnittstelle mit definiertem Verhalten bei Datenalterung spezifizieren.
- Die vollständige Latenzkette budgetieren, nicht nur den Zyklus.
- Eingrenzungsgrenzen bei der Inbetriebnahme physisch prüfen und die gemessene Basislinie dokumentieren.
- Echte Reserven bei CPU-Auslastung, Speicher und Kommunikationslast belassen.

## Fazit

Die Architektur eines SPS-Systems im Werksmaßstab wird lange vor dem ersten Baustein entschieden — und sie wird durch eine kleine Zahl von Grenzentscheidungen bestimmt: wo Steuerungen trennen, wo E/A-Stationen trennen, was das Netz übersteht und was zwischen Bereichen fließt. Genau diese Entscheidungen legen fest, ob ein Fehler eine Maschine oder eine Anlage kostet.

Sie sind in den meisten Projekten zugleich die am schlechtesten dokumentierten Entscheidungen des gesamten Entwurfs. Sie ausdrücklich zu treffen — mit dokumentierter Begründung und geprüfter Eingrenzung — ist die wirkungsvollste ingenieurtechnische Maßnahme in der industriellen Steuerungstechnik, und sie kostet fast nichts im Vergleich zu dem Stillstand, den sie verhindert.
