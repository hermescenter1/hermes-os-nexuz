# 4–20-mA-Stromschleifen: Diagnose und Fehlerbilder

## Zusammenfassung

Die 4–20-mA-Stromschleife hat mehrere Generationen von Ablösetechnologien aus einem Grund überdauert: Sie ist diagnosefähig. In einer Reihenschleife ist der Strom überall gleich, also ist eine einzige Messung an beliebiger Stelle eine Aussage über die gesamte Schleife. Der Lebendnullpunkt bei 4 mA unterscheidet „der Prozess ist am Minimum" von „die Schleife ist unterbrochen". Und weil die Schleife ihre eigene Versorgung trägt, beweisen dieselben zwei Adern, die den Messwert liefern, zugleich, dass der Messumformer lebt.

Dieser Beitrag behandelt, wie sich dieser diagnostische Wert systematisch statt durch Ausprobieren heben lässt — und welche zwei Fehlerbilder die Schleife von sich aus nicht zeigen kann.

## Warum die Schleife so aufgebaut ist

Drei Eigenschaften, jede eine bewusste Entwurfsentscheidung:

**Strom statt Spannung.** Spannung fällt entlang einer Leitung ab, Strom nicht. Ein 4–20-mA-Signal ist gegenüber Leiterwiderstand unempfindlich, bis die Schleifenversorgung die erforderliche Spannung nicht mehr aufbringt. Auf einer mehrere hundert Meter langen Strecke im Werk ist genau diese Unempfindlichkeit der ganze Punkt.

**Lebendnullpunkt.** Der Bereichsanfang liegt bei 4 mA, nicht bei 0 mA. Null Strom ist damit kein gültiger Messwert, sondern eindeutig ein Fehler. Ein 0–20-mA-Schema kann Drahtbruch und echten Minimalwert nicht unterscheiden — dieser eine Unterschied hat 4–20 mA zum Standard gemacht.

**Zweileiter-Schleifenspeisung.** Der Messumformer bezieht seine Versorgung aus derselben Schleife, die er moduliert; deshalb muss sein Ruhestrom unter 4 mA bleiben. Das schränkt den Geräteentwurf ein, erspart aber eine separate Versorgungsleitung zu jedem Feldgerät.

## Das Schleifenbudget

Jede Schleife hat ein Spannungsbudget, und die Mehrzahl der Beanstandungen „der Messumformer zeigt am Bereichsende zu wenig" sind Budgetfehler, keine Gerätefehler.

Die Versorgung muss beim Maximalstrom von 20 mA abdecken:

- die Mindestbetriebsspannung des Messumformers
- zuzüglich der Spannung über jeder Reihenlast — Bürdewiderstand des Empfängers, Anzeiger, Barriere oder Trennverstärker
- zuzüglich des Spannungsabfalls über den Leitungswiderstand beider Adern

Der Leitungsabfall ist trivial zu berechnen und wird regelmäßig vergessen:

```text
V_Leitung = I × R_Schleife
          = 0,020 A × (2 × Länge × Widerstand je Meter)
```

Die Folge eines zu knappen Budgets ist charakteristisch und wird leicht fehlgedeutet: Die Schleife folgt über den größten Teil des Bereichs korrekt und flacht dann zum oberen Ende hin ab, weil der Messumformer 20 mA bei der verfügbaren Spannung nicht mehr halten kann. Das sieht exakt wie ein Spannenfehler aus — und ist keiner.

Jedes später eingefügte Reihenelement — ein Schaltschrankanzeiger, ein Signalverteiler, ein wegen eines Erdungsproblems nachgerüsteter Trennverstärker — verbraucht Budget, das zur Entwurfszeit vergeben wurde. Eines davon ohne Neuberechnung hinzuzufügen ist ein verbreiteter Weg, eine jahrelang funktionierende Schleife zu zerstören.

## Diagnosevorgehen

Das produktive Vorgehen behandelt die Schleife als Reihenschaltung mit bekannten Eigenschaften und grenzt durch Messung ein, nicht durch Austausch.

### Symptom: Messwert falsch oder nicht vorhanden

**Schritt 1 — den Schleifenstrom messen.** Nicht den Wert auf dem HMI, sondern den Strom selbst — in Reihe gemessen oder mit einer für Milliampere-Gleichstrom geeigneten Zange. Der Messwert teilt das Problem sofort auf:

| Gemessener Strom | Deutung |
| --- | --- |
| 0 mA | Unterbrechung, tote Versorgung oder defekter Messumformer |
| Unter 3,6 mA | Ausschlag nach unten — viele Geräte melden so einen internen Fehler |
| 3,6–4 mA | Am oder unter dem Bereichsanfang — Prozess gegen den Nullpunkt prüfen |
| 4–20 mA, stabil | Schleife ist in Ordnung; das Problem liegt bei Skalierung, Parametrierung oder Prozess |
| Über 21 mA | Ausschlag nach oben oder Kurzschluss über einen Schleifenteil |
| Schwankend | Rauschen, Wackelkontakt — oder ein tatsächlich instabiler Prozess |

Man beachte die Unterscheidung in der letzten Zeile: Ein schwankender Strom ist nicht automatisch ein Fehler. Zu klären, ob der Prozess selbst instabil ist, ist Schritt null — und wird erstaunlich oft übersprungen.

**Schritt 2 — stimmt der Strom, ist aber der angezeigte Wert falsch, liegt der Fehler oberhalb der Schleife.** Skalierung in der Eingabebaugruppe, Umrechnung in technische Einheiten oder die Anzeigenparametrierung. Zuerst den Strom zu messen macht daraus eine Zwei-Minuten-Feststellung statt einer Fahrt ins Feld.

**Schritt 3 — ist der Strom falsch, die Schleife halbieren.** In einem ungefähr mittig gelegenen Verteiler auftrennen und von beiden Seiten messen. Eine Schleife ist eine Reihenschaltung; jede Messung eliminiert die Hälfte der verbleibenden Kandidaten. Das ist schneller als sich von einem Ende vorzuarbeiten — und weit schneller als Bauteile der Reihe nach zu tauschen.

**Schritt 4 — die Versorgung unter Last prüfen.** Ein Schleifennetzteil, das ohne Last korrekt anzeigt und bei 20 mA einbricht, ist defekt. Eine Messung ohne Last beweist nichts.

### Symptom: der Messwert driftet über Wochen

Drift hat wenige Ursachen, und diese sind unterscheidbar:

- **Feuchtigkeitseintritt.** Die klassische Signatur ist eine mit dem Wetter korrelierende Drift und ein Ableitpfad gegen Erde, der sich als Widerstand zwischen Ader und Erde deutlich unterhalb des Megohm-Bereichs zeigt. Zu suchen ist in Verteilern und Kabelverschraubungen.
- **Prozessbedingte Sensoreffekte** — Belagbildung, verstopfte Wirkdruckleitungen, Ablagerungen an der Sonde. Das Kennzeichen: Die elektrischen Prüfungen sind sauber, während der Messwert einer unabhängigen Messung derselben Prozessgröße widerspricht.
- **Echte elektronische Drift** im Messumformer — real, aber langsamer und seltener als beide vorgenannten Ursachen, und genau das, wofür Kalibrierintervalle existieren.

Die diagnostische Disziplin: Erst die Sauberkeit des elektrischen Pfades nachweisen, dann an die Kalibrierung gehen. Einen Messumformer nachzukalibrieren, um einen Feuchtepfad zu kompensieren, erzeugt eine Schleife, die nun auf zwei Arten falsch ist und beim nächsten Wetterwechsel erneut driftet.

### Symptom: sporadisch, korreliert mit Anlagenbetrieb

Sporadische Fehler, die beim Anlauf eines nahen Motors, bei der Überfahrt eines Krans oder beim Schweißen auftreten, sind fast immer Installations- und keine Gerätefehler. Die Kandidaten:

- **Messleitung gemeinsam mit Energieleitung verlegt**, mit kapazitiver oder induktiver Einkopplung. Trennabstand und rechtwinklige Kreuzung sind die Abhilfen — beide vor dem Einziehen der Leitung günstiger.
- **Schirm beidseitig geerdet**, wodurch eine Erdschleife entsteht, in der ein Ausgleichsstrom Rauschen ins Signal einträgt. Die Konvention, die das vermeidet: Schirm nur an einem Ende erden — üblicherweise leitsystemseitig — mit durchgehendem Beidraht und ohne zufällige zweite Erdung an Verschraubung oder Verteiler.
- **Ein mechanischer Wackelkontakt** — eine nicht nach Vorgabe angezogene Klemme, eine korrodierte Crimpung, eine an einer beweglichen Maschine biegebeanspruchte Leitung. Diese findet man, indem man die verdächtige Verbindung bewegt und dabei den Strom beobachtet — nicht, indem man sie ansieht.

Vor jedem Eingriff zu erheben: Was lief sonst, als der Fehler auftrat, wiederholt er sich beim selben Auslöser, und tritt die Störung auch auf benachbarten Schleifen auf? Eine Störung auf einer Schleife ist ein Schleifenproblem; dieselbe Störung auf jeder Schleife eines Rangierschranks ist ein Erdungs- oder Versorgungsproblem.

## Fehlerbilder, die die Schleife nicht zeigen kann

Zwei Fehler sind der Schleifenstromdiagnose unzugänglich, und beide sind bedeutsam.

**Ein korrektes Signal, das den Prozess nicht mehr abbildet.** Ein Füllstandsmessumformer mit verstopfter Wirkdruckleitung meldet einen stabilen, plausiblen, vollkommen ruhigen Wert. Elektrisch ist die Schleife einwandfrei. Nichts am Strom sagt, dass die Messung der Realität nicht mehr folgt. Die einzigen Abwehrmittel sind der Abgleich mit einer unabhängigen Messung, Plausibilitätsgrenzen für die Änderungsrate — und die Beobachtung, die Bedienpersonal anstellt und Geräte nicht: dass ein Wert *zu* ruhig ist.

**Ein korrekt kalibrierter Messumformer mit falscher Referenz.** Wurde der Nullpunkt auf Basis einer falschen Annahme über Einbauhöhe, Mediendichte oder Montage gesetzt, ist die Schleife in sich stimmig und nach außen falsch. Das ist ein Inbetriebnahmefehler und wird ausschließlich durch Validierung gegen einen bekannten Prozesszustand gefunden, nicht durch elektrische Prüfungen.

Digitale Protokolle auf derselben Verdrahtung — HART oder vollständig digitale Feldbusse — adressieren einen Teil davon, indem sie Selbstdiagnosen neben dem Primärwert übertragen. Diese Information hilft tatsächlich, schließt aber keine der beiden Lücken: Ein Messumformer kann nicht melden, dass seine Wirkdruckleitung verstopft ist, und er kann nicht wissen, dass seine Referenz falsch ist.

## Hinweise zur Inbetriebnahme

- **Schleifenwiderstand und Versorgungsspannung im Übergabezustand dokumentieren.** Drei Jahre später ist diese Basislinie die Grundlage jeder Aussage über Veränderung.
- **An den Bereichsenden prüfen, nicht nur in der Mitte.** Ein Budgetfehler zeigt sich erst nahe 20 mA.
- **Die Schirmerdung physisch prüfen**, an beiden Enden, statt der Zeichnung zu vertrauen. Zweite Erdungen entstehen bei der Montage, nicht im Entwurf.
- **Mindestens einmal gegen einen bekannten Prozesszustand validieren**, damit die Schleife durchgängig und nicht nur elektrisch nachgewiesen ist.

## Sicherheitstechnische Hinweise

Schleifen, die Teil einer sicherheitstechnischen Funktion sind, unterliegen den Normen zur funktionalen Sicherheit der jeweiligen Branche, und ihr Fehlerverhalten gehört zum Bewerteten — einschließlich der Frage, ob der Messumformer bei internem Fehler nach oben oder unten ausschlägt und ob die auswertende Logik Werte außerhalb des Bereichs als Fehler behandelt oder auf den Bereich begrenzt. Ein Signal außerhalb des Bereichs in der Eingangsparametrierung auf 4 mA zu begrenzen verwirft stillschweigend genau die Diagnose, für die der Lebendnullpunkt existiert.

Alle Arbeiten an Schleifen im Umfeld unter Spannung stehender Betriebsmittel folgen den elektrotechnischen Sicherheitsregeln und Freischaltverfahren der Anlage. Eigensichere Stromkreise in explosionsgefährdeten Bereichen unterliegen zusätzlichen Randbedingungen: Die bescheinigten Kenngrößen von Barriere, Leitung und Feldgerät sind Teil des Sicherheitsnachweises, und der Austausch eines dieser Elemente — auch das Einfügen eines elektrisch harmlos wirkenden Reihenelements — setzt ihn außer Kraft.

## Empfohlene Vorgehensweise

- Das Spannungsbudget bei 20 mA einschließlich Leitung berechnen und bei jedem zusätzlichen Reihenelement neu rechnen.
- Vor jeder Hypothese den Strom messen; eine Messung teilt das Problem auf.
- Die Schleife halbieren, statt Bauteile der Reihe nach zu tauschen.
- Vor dem Nachkalibrieren die Sauberkeit des elektrischen Pfades nachweisen.
- Den Schirm nur einseitig erden und dies physisch prüfen.
- Den Eingang so parametrieren, dass Werte außerhalb des Bereichs als Fehler gelten statt begrenzt zu werden.
- Kritische Messungen gegen eine unabhängige Quelle prüfen — eine verstopfte Wirkdruckleitung erkennt die Schleife nicht.

## Fazit

Die Stromschleife ist ebenso ein Diagnosewerkzeug wie ein Übertragungsverfahren. Ihre Eigenschaften — konstanter Strom, Lebendnullpunkt, schleifengespeister Messumformer — wurden so gewählt, dass eine fachkundige Person mit einem Messgerät einen Fehler in einer Messung aufteilen und in wenigen weiteren lokalisieren kann.

Was diesen Entwurf scheitern lässt, ist nicht sein Alter, sondern die Methode: Bauteile der Reihe nach tauschen statt durch Messung einzugrenzen, nachkalibrieren, bevor der elektrische Pfad nachgewiesen ist, und einem stabilen Messwert vertrauen, der aufgehört hat, eine Messung zu sein. Die Schleife sagt einem fast alles. Es lohnt sich, genau zu wissen, welche zwei Dinge sie nicht sagt.
