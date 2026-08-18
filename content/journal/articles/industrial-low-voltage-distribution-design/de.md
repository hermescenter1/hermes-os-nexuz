# Entwurf industrieller Niederspannungsverteilungen

## Zusammenfassung

Eine industrielle NS-Anlage wird meist entworfen, indem eine Lastliste summiert, ein Transformator gewählt und nach außen verteilt wird. Diese Reihenfolge erzeugt ein funktionierendes Netz und legt still mehrere Entscheidungen fest, die niemand bewusst getroffen hat: den Kurzschlussstrom, den jedes nachgelagerte Betriebsmittel aushalten muss, die Spannung, die die Anlage beim Anlauf ihres größten Motors sieht, und wie viel Produktion stillsteht, wenn eine Verteilung zur Wartung freigeschaltet wird.

**Die Architektur ist ein Satz von Abwägungen, und die nützliche Disziplin besteht darin, jede davon ausdrücklich zu treffen.** Die folgenreichste wird selten diskutiert: Ein Transformator mit geringerer Impedanz liefert bessere Spannungshaltung und einen höheren Kurzschlussstrom — beides lässt sich nicht unabhängig optimieren.

**Sicherheitshinweis.** NS-Schaltanlagen bergen erhebliche Störlichtbogen- und Berührungsgefahr. Freischalten, Sichern, Feststellen der Spannungsfreiheit und die Sicherheitsregeln des Standorts gelten für alle hier beschriebenen Arbeiten; nichts in diesem Beitrag ist eine Anleitung zum Arbeiten unter Spannung.

## Die Architektur vor den Betriebsmitteln

```text
Utility / MV network
        |
   MV switchgear
        |
  MV/LV transformer(s)
        |
+---------------------------------------------+
|          Main LV switchboard                |
|   incomer A  ──[bus section]──  incomer B   |
+---------------------------------------------+
     |            |            |          |
   MCC-A        MCC-B     Distribution  Essential
     |            |          boards      board
   motors       motors      lighting,     |
                            small power  standby
                                         generator
```

Vier Fragen bestimmen die Form, und sie sind Prozessfragen, bevor sie elektrische sind:

- **Was muss weiterlaufen, wenn eine Einspeisung nicht verfügbar ist?** Das entscheidet über zwei Einspeisungen und eine Kupplung — und darüber, was auf welcher Seite liegt.
- **Was muss weiterlaufen, wenn das Netz vollständig ausfällt?** Das definiert die Ersatzstromschiene und die Schnittstelle zum Notstromaggregat.
- **Was muss ohne Produktionsstopp instand gehalten werden können?** Das ist meist das stärkere Argument für eine Kupplung — Wartung tritt weit häufiger ein als ein Einspeiseausfall.
- **Was wird in zehn Jahren hier stehen?** Reservefelder, Reserveleistung und Aufstellfläche sind die drei Posten, die bei Kostenreduktionen zuerst gestrichen und später am dringendsten gebraucht werden.

**Eine Kupplung verlangt ein Verriegelungskonzept.** Üblich ist, dass zwei der drei Geräte — Einspeisung A, Einspeisung B, Kupplung — geschlossen sein dürfen, niemals aber alle drei, sofern die Einspeisungen nicht für Parallelbetrieb ausgelegt sind. Fehlt diese Verriegelung oder lässt sie sich umgehen, kann eine Schalthandlung zwei Quellen parallelschalten, die nie dafür vorgesehen waren.

## Bedarfsermittlung und Gleichzeitigkeit

**Angeschlossene Leistung ist nicht Höchstbedarf**, und beides gleichzusetzen erzeugt einen überdimensionierten Transformator, der schlecht ausgelastet läuft, einen höheren Kurzschlussstrom als nötig aufweist und mehr gekostet hat als erforderlich.

Die ehrliche Methode:

- Die Lastliste aus realen Betriebsmitteln aufbauen und Dauer-, Aussetz- und Reservelasten trennen.
- Gleichzeitigkeit ansetzen, die den tatsächlichen Betrieb abbildet — welche Maschinen wirklich zusammen laufen, welche Haupt/Reserve sind, welche saisonal.
- **Die Gleichzeitigkeitsannahmen mit dem Entwurf dokumentieren.** Ein Faktor, der nur in einer Tabellenzelle steht, ist eine Zahl, die niemand nachvollziehen kann und der niemand vertrauen wird.
- Eine Wachstumsreserve als ausgewiesene Größe ergänzen, nicht als versteckten Sicherheitszuschlag innerhalb der Gleichzeitigkeit.

**Die beiden Fehlrichtungen sind symmetrisch.** Nach der Summe der Typenschilder ausgelegt ergibt einen Transformator, der nie richtig belastet wird. Nach optimistischer Gleichzeitigkeit ausgelegt ergibt einen ohne Reserve — und die erste Erweiterung wird zum Transformatortausch.

## Spannungsfall: die meist maßgebende Randbedingung

Zwei verschiedene Grenzen gelten, und sie werden häufig verwechselt.

**Der stationäre Spannungsfall** entscheidet, ob Betriebsmittel im Normalbetrieb eine zulässige Spannung sehen. **Der transiente Einbruch beim Motoranlauf** entscheidet, ob die Anlage einen Anlauf übersteht, ohne dass Schütze abfallen, Umrichter gestört werden oder die Beleuchtung einbricht.

Für einen Drehstromkreis gilt die Arbeitsbeziehung:

```text
ΔU ≈ √3 × I × L × (R·cosφ + X·sinφ)

  ΔU   = line-to-line voltage drop (V)
  I    = load current (A)
  L    = one-way circuit length (km, matching the units of R and X)
  R    = conductor resistance per unit length (Ω/km)
  X    = conductor reactance per unit length (Ω/km)
  cosφ = load power factor, sinφ its corresponding sine

Assumptions and limits:
  - balanced three-phase load
  - R and X taken at the conductor's operating temperature, not at 20 °C;
    resistance rises appreciably when the cable is hot
  - reactance matters on larger conductors and can dominate over resistance;
    ignoring X on large cross-sections understates the drop
  - this is the drop in the cable only; source and transformer impedance
    must be added for the voltage actually seen at the load
```

**Beim Direktanlauf ist der Strom ein Mehrfaches des Betriebsstroms und der Leistungsfaktor niedrig.** Beide Terme verändern sich ungünstig — deshalb kann eine thermisch reichlich bemessene Leitung dennoch einen unzulässigen Einbruch erzeugen. Bei langen Motorabgängen bemisst in der Regel der Anlaufeinbruch den Querschnitt, nicht der Dauerstrom.

**Der Einbruch ist nicht örtlich.** Er erscheint an der ganzen Schiene, weil der Strom auch durch Transformator und Sammelschiene fließt. Deshalb kann ein Motoranlauf an einem MCC Betriebsmittel an einem anderen stören — und deshalb gehört die Untersuchung zur Quellenimpedanz und nicht zum Motor.

## Kurzschlussleistung ist eine Folge der Einspeisung

Die Transformatorimpedanz bestimmt Spannungshaltung und Kurzschlussstrom — und zwar gegenläufig:

| Transformatorimpedanz | Spannungshaltung | Zu erwartender Kurzschlussstrom | Folge |
| --- | --- | --- | --- |
| Geringer | Besser — weniger Fall unter Last und beim Anlauf | Höher | Nachgelagerte Betriebsmittel brauchen höhere Bemessungen |
| Höher | Schlechter — größerer Fall, tiefere Anlaufeinbrüche | Niedriger | Günstigere Betriebsmittel, mehr Anlaufprobleme |

**Diese Abwägung ist der Kern der NS-Einspeisewahl** und muss gegen beide Randbedingungen zugleich getroffen werden: Ein allein nach Anlaufverhalten gewählter Transformator kann Bemessungen erzwingen, die über Hunderte nachgelagerter Geräte teuer werden; ein allein zur Begrenzung des Kurzschlussstroms gewählter kann große Motoren unanfahrbar machen.

**Zwei weitere Beiträge werden häufig ausgelassen:**

- **Laufende Motoren speisen einen Kurzschluss.** In den ersten Perioden nach einem Fehler wirken sie kurzzeitig als Generatoren. An einer motorlastigen Industrieschiene ist dieser Beitrag erheblich und gehört in die Studie.
- **Parallelbetrieb erhöht den Kurzschlussstrom.** Zwei parallel über eine geschlossene Kupplung arbeitende Transformatoren erzeugen mehr als jeder für sich — einer der Hauptgründe für die Verriegelung.

> Die Berechnung selbst, der Unterschied zwischen maximalem und minimalem Kurzschlussstrom und wofür beide gebraucht werden, behandelt der Begleitbeitrag zur Kurzschlussstromberechnung in industriellen Netzen. Auf Architekturebene zählt: Der Kurzschlussstrom wird mit der Einspeisung gewählt, und jede nachgelagerte Bemessung folgt daraus.

## Kabelbemessung: drei unabhängige Kriterien

Ein Leiter muss alle drei erfüllen, und das größte Ergebnis ist maßgebend. Eines zu prüfen und die anderen anzunehmen ist eine wiederkehrende Quelle latenter Mängel.

1. **Thermische Strombelastbarkeit**, reduziert für die tatsächliche Verlegung: Umgebungstemperatur, Häufung mit anderen Kreisen, Verlegeart, Kontakt mit Wärmedämmung und Bodenverhältnisse bei erdverlegten Trassen. Ein nach Tabelle ohne Reduktionsfaktoren bemessenes Kabel ist für ein Labor bemessen.
2. **Spannungsfall**, geprüft für den stationären Fall und den Anlauftransienten wie oben beschrieben.
3. **Kurzschlussfestigkeit** — der Leiter muss den Kurzschlussstrom für die Abschaltzeit des Schutzes überstehen, geprüft durch Vergleich der vom Schutzorgan durchgelassenen Energie mit dem, was der Leiter ohne Überschreiten seiner zulässigen Temperatur aufnehmen kann.

**Das dritte Kriterium hängt von den Schutzeinstellungen ab** — deshalb lassen sich Kabelbemessung und Schutzentwurf nicht unabhängig abschließen, und deshalb kann eine spätere Einstellungsänderung ein seinerzeit korrekt bemessenes Kabel entwerten.

**Der Schutzleiter verdient dieselben drei Prüfungen** und wird stattdessen häufig nach Konvention bemessen. Seine Kurzschlussfestigkeit ist eine Sicherheitsfunktion, keine Sparposition.

## Trennung, Ersatzstrom und Notstromversorgung

**Die Trennung in wesentliche und nicht wesentliche Verbraucher** sollte der Konsequenz folgen, nicht der Bequemlichkeit. Die Ersatzstromschiene trägt, was einen Netzausfall überstehen muss — Sicherheitsbeleuchtung, Systeme für das sichere Abfahren, Messkreisversorgung, kritische Kühlung und alles, was der Prozess braucht, um einen sicheren Zustand zu erreichen.

Zwei häufig vertagte Entwurfspunkte:

- **Die Aggregatschnittstelle.** Umschaltkonzept, offene oder geschlossene Umschaltung, Verhalten der Anlage während der Umschaltlücke und welche Lasten selbsttätig wieder zugeschaltet werden dürfen. Der unerwartete Wiederanlauf drehender Maschinen ist eine Gefährdung, und das Wiederanlaufverhalten gehört in den Entwurf, nicht in die Inbetriebnahme.
- **Kurzschlussleistung des Aggregats und Motoranlauf.** Ein Generator ist eine weit weichere Quelle als das Netz. Motoren, die am Netz anlaufen, laufen am Aggregat womöglich nicht an, und ein Schutz, der bei Netzkurzschlussströmen selektiv ist, ist es beim wesentlich kleineren Generatorstrom womöglich nicht. Das ist ein Studienfall, keine Annahme.

**Physische Trennung zählt, wo Redundanz behauptet wird.** Zwei Einspeisungen durch denselben Kanal, dieselbe Pritsche oder denselben Brandabschnitt sind zwei Einspeisungen mit gemeinsamem Fehlermodus. Redundanz, die im Übersichtsschaltplan besteht und im Gebäude nicht, ist eine Dokumentationsübung.

## Messung, Erweiterung und Wartbarkeit

**Die Platzierung der Messstellen entscheidet, welche Fragen sich später beantworten lassen.** Energie an den Einspeisungen nennt die Rechnung des Standorts; Energie und Leistung je MCC nennt den Ort des Verbrauchs; ein aufgezeichnetes Lastprofil ist die Eingangsgröße jeder künftigen Kapazitäts-, Tarif- und Drehzahlentscheidung. Messtechnik im Neubau ist günstig; die Nachrüstung in eine laufende Anlage nicht.

**Erweiterungsreserve besteht aus drei Dingen**, die alle bewusst vorzusehen sind:

- **Reservefelder** in Verteilungen und MCCs.
- **Reserveleistung** in Transformator, Sammelschiene und Kabeltrassen.
- **Aufstellfläche** für die Verlängerung der Anlage, samt Tür und Transportweg.

**Wartbarkeit** läuft darauf hinaus, ob ein Abschnitt bei laufender Anlage freigeschaltet und bearbeitet werden kann — was die Kupplung ermöglicht — und ob jemand erkennen kann, was was ist: Beschriftung, die zu den Plänen passt, ein Bestands-Übersichtsschaltplan und ein Protokoll der Schutzeinstellungen.

## Inbetriebnahme

- **Drehfeld durchgängig prüfen**, bevor drehende Maschinen gekuppelt werden.
- **Das Verriegelungskonzept nachweisen**, indem die unzulässigen Kombinationen unter sicheren Bedingungen versucht werden — der Plan ist kein Nachweis.
- **Schutzeinstellungen gegen die Studie prüfen und dokumentieren.** Eine nie angewandte Studie ist ein Dokument.
- **Die tatsächliche Spannung am Ende langer Abgänge messen**, unter Last und während des größten Motoranlaufs, und mit der Rechnung vergleichen.
- **Wiederanlaufverhalten** bei Spannungswiederkehr und die Aggregat-Umschaltsequenz bestätigen.
- **Eine thermografische Basisaufnahme der Anlage unter Spannung**, sobald ein repräsentativer Lastzustand erreicht ist. Ihr Wert liegt nicht nur in den heute gefundenen Mängeln, sondern in der Referenz, die sie für die nächste Aufnahme hinterlässt.
- **Das Netz im Bestand dokumentieren** — Transformatorimpedanz, Kabeltypen und -längen, Schutzeinstellungen. Sie sind die Eingangsgrößen jeder künftigen Kurzschlussstudie, und ihre spätere Rekonstruktion ist teuer und ungenau.

## Fehlermodi

**Transformator allein nach Leistung gewählt.** Kurzschlussstrom oder Anlaufverhalten zeigt sich danach.

**Gleichzeitigkeit angenommen statt dokumentiert.** Niemand kann den Entwurf prüfen, und die nächste Erweiterung hat keine Basis.

**Abgang allein nach Dauerstrom bemessen.** Der Motor läuft an, und die Schiene bricht ein.

**Kurzschlussfestigkeit nicht gegen die realen Schutzeinstellungen geprüft.** Eine spätere Änderung entwertet sie still.

**Schutzleiter nach Konvention bemessen.** Eine Sicherheitsfunktion per Gewohnheit entschieden.

**Redundante Einspeisungen auf gemeinsamer Trasse.** Redundanz besteht nur auf dem Papier.

**Kupplungsverriegelung fehlt oder ist umgehbar.** Eine Schalthandlung schaltet zwei Quellen parallel.

**Aggregatfall nicht untersucht.** Motoren laufen nicht an, oder der Schutz ist im Ersatzbetrieb nicht selektiv.

**Keine Reserveleistung oder Fläche.** Die erste Erweiterung wird zum Anlagentausch.

**Bestandsdaten nicht dokumentiert.** Die nächste Studie beginnt mit einer Begehung.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Fertigungsbetrieb ergänzt in einem bestehenden Produktionsbereich einen großen Ventilator, gespeist von derselben NS-Schiene wie die übrige Linie. Der Abgang ist nach Dauerstrom mit Reserve bemessen, und die Installation besteht die Prüfung. Beim ersten Produktionsanlauf verhalten sich andere Betriebsmittel auffällig: An zwei kleineren Maschinen fallen Schütze ab, und ein Umrichter der Nachbarlinie meldet ein Unterspannungsereignis.

```text
Symptom:
Main LV bus voltage dips during motor start.

Evidence:
- source transformer loading normal before start
- dip begins with motor acceleration
- current peak corresponds to start event
- adjacent feeders show same voltage disturbance
- no upstream protection operation

Reasoning:
This is a system-voltage-drop event driven by starting current, not a local
motor-terminal defect. The disturbance appearing on adjacent feeders shows
the drop is occurring upstream of the feeder — in the transformer and busbar
impedance — rather than in the new cable alone.

Next investigations:
- source impedance
- transformer impedance
- cable impedance
- motor starting method
- acceleration time
```

Die Belege trennen drei Abhilfekandidaten, und sie sind nicht gleichwertig:

- **Den Abgangsquerschnitt vergrößern.** Reduziert nur den Kabelanteil des Falls. Dominiert der Transformator, ist das teuer und weitgehend wirkungslos.
- **Das Anlaufverfahren ändern** — Sanftanlasser oder Umrichter —, um den verursachenden Strom zu senken. Das adressiert die Ursache und wird im Begleitbeitrag zur Auswahl zwischen Sanftanlasser und Umrichter untersucht.
- **Die Einspeisung ändern** — geringere Transformatorimpedanz oder Versorgung der neuen Last aus einer anderen Schiene. Wirksam — und es erhöht den Kurzschlussstrom, den jedes Gerät dieser Schiene aushalten muss.

**Der übertragbare Punkt: Die richtige Antwort hängt davon ab, wo die Impedanz sitzt — und das ist eine Messung, keine Meinung.** Ein Entwurf, der die Quellenimpedanz dokumentiert und den Anlaufeinbruch bereits geprüft hätte, hätte zwischen diesen drei Optionen entschieden, bevor das Kabel gezogen wurde.

## Empfohlene Praxis

- Von dem ausgehen, was weiterlaufen muss — bei Wartung, bei Einspeiseausfall und bei Netzausfall — und die Architektur daraus ableiten.
- Eine Kupplung vorsehen, wo Wartung oder Einspeiseredundanz es rechtfertigt, und ihre Verriegelung bei der Inbetriebnahme nachweisen.
- Den Bedarf aus einer realen Lastliste mit dokumentierter Gleichzeitigkeit und ausgewiesener Wachstumsreserve bilden.
- Die Transformatorimpedanz gegen Spannungshaltung und Kurzschlussstrom zugleich wählen, im Wissen um deren Gegenläufigkeit.
- Motorbeitrag und Parallelbetrieb bei der Festlegung der Kurzschlussleistung berücksichtigen.
- Jeden Leiter gegen alle drei Kriterien bemessen — reduzierte Strombelastbarkeit, Spannungsfall und Kurzschlussfestigkeit bei den realen Schutzeinstellungen.
- Den Spannungsfall für den Anlauftransienten prüfen, nicht nur stationär, und erwarten, dass er lange Motorabgänge bemisst.
- Für Schutzleiter dieselbe Sorgfalt aufwenden wie für Außenleiter.
- Redundante Einspeisungen physisch getrennt führen, auch durch Brandabschnitte.
- Den Aggregatfall ausdrücklich untersuchen, für Motoranlauf und für Selektivität.
- Reservefelder, Reserveleistung und Aufstellfläche als drei getrennte, ausgewiesene Reserven vorsehen.
- An den Einspeisungen und je MCC messen und das Lastprofil aufbewahren.
- Drehfeld, Verriegelungen, Einstellungen, Wiederanlaufverhalten und Spannung am Leitungsende bei der Inbetriebnahme prüfen und eine thermografische Basisaufnahme bei repräsentativer Last erstellen.
- Bestandsimpedanzen, -längen und -einstellungen als Eingangsgrößen jeder künftigen Studie dokumentieren.

## Fazit

Der Entwurf einer Niederspannungsverteilung besteht überwiegend darin, implizite Entscheidungen explizit zu machen. Nicht die Lastliste wählt den Transformator, sondern das geforderte Spannungsverhalten und der zulässige Kurzschlussstrom — und beide ziehen in entgegengesetzte Richtungen. Nicht die thermische Belastbarkeit bemisst den Abgang, sondern dasjenige von drei unabhängigen Kriterien, das am meisten verlangt — und eines dieser Kriterien hängt an Schutzeinstellungen, die sich später ändern können.

Werden diese Zusammenhänge festgehalten — mit Gleichzeitigkeitsannahmen, Impedanzen, Einstellungen und Wachstumsreserve —, bleibt das Netz über Jahrzehnte verständlich und erweiterbar. Bleiben sie implizit, erbt die Anlage ein System, dessen Verhalten niemand vorhersagen kann und dessen nächste Erweiterung mit einer Begehung beginnt.
