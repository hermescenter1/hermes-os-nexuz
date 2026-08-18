# High-Performance-HMI-Systeme entwerfen

## Zusammenfassung

Ein High-Performance-HMI ist kein attraktiveres Fließbild. Es ist eine Oberfläche, die um eine bestimmte ingenieurtechnische Behauptung herum entworfen ist: Die Aufmerksamkeit des Bedienpersonals ist eine feste, knappe Ressource, und jedes visuelle Element hilft entweder dabei, etwas zu bemerken, zu entscheiden und zu handeln — oder es konkurriert mit denen, die das tun.

Diese Behauptung hat Folgen, die die meisten Prozessbilder verletzen. Farbe wird zu etwas, das man ausgibt, statt zu etwas, mit dem man dekoriert. Zahlen werden weniger nützlich als Abweichungen. Fotorealismus wird zur Belastung. Und die Bildhierarchie hört auf, ein Menübaum zu sein, und wird zum Modell dafür, wie sich Bedienpersonal tatsächlich zwischen Detailebenen bewegt.

## Warum das relevant ist

Das klassische Anlagenfließbild wurde von der Warte geerbt, die es ersetzte: ein Schema des Prozesses, farbcodiert nach Betriebsmitteltyp, mit jedem Messwert als Zahl. Es ist intuitiv zu spezifizieren, leicht zu verkaufen — und es versagt in genau dem Moment, auf den es ankommt.

Das Versagen ist konkret. Im Normalbetrieb ist alles farbig, also hebt sich nichts ab; das Bedienpersonal lernt zu scannen statt zu bemerken. Bei einer Störung ist dasselbe Bild immer noch vollständig farbig — der abnormale Zustand hat keinen visuellen Kanal mehr zu beanspruchen, weil die Normalität sie bereits alle verbraucht hat.

Die ingenieurtechnische Formulierung: **Ein Bild, in dem der Normalbetrieb visuell laut ist, hat keine Reserve, um Abnormalität zu signalisieren.** Alles Weitere im High-Performance-HMI-Entwurf folgt daraus, diese Reserve freizuhalten.

## Farbdisziplin

Farbe ist der Kanal mit der höchsten präattentiven Bandbreite, den Menschen haben. Sie für Identität auszugeben — dieses Rohr führt Wasser, jener Behälter ist ein Reaktor — verbraucht sie dauerhaft, denn Identität ändert sich nie und braucht deshalb nie Aufmerksamkeit.

Die Disziplin, die sie zurückgewinnt:

| Visueller Kanal | Reservieren für | Nicht verwenden für |
| --- | --- | --- |
| Gesättigte Farbe | Ausschließlich abnormale Zustände und Alarme | Betriebsmitteltyp, Produkt, Branding |
| Graustufenform und Linienstärke | Prozessstruktur, Betriebsmittelidentität | — |
| Position und Anordnung | Beziehung, Flussrichtung | — |
| Text | Werte, die exakt gelesen werden müssen | Werte, die nur verglichen werden |

Zwei Folgerungen, denen routinemäßig widersprochen wird und die routinemäßig richtig sind:

**Laufende Betriebsmittel sollen visuell leise sein.** Die Intuition sagt, eine laufende Pumpe grün zu färben. Eine Anlage mit zweihundert laufenden Pumpen hat dann zweihundert grüne Objekte, und die stehengebliebene unterscheidet sich nur durch die *Abwesenheit* von Grün — ein weit schwächeres Signal als Anwesenheit es gewesen wäre. „Leise wenn normal, deutlich wenn nicht" ist die stärkere Anordnung.

**Farbe darf niemals der einzige Bedeutungsträger sein.** Ein nennenswerter Anteil der männlichen Bevölkerung hat eine Form der Farbfehlsichtigkeit. Jeder Zustand, der sich nur im Farbton unterscheidet, ist für diese Personen unsichtbar. Farbe mit Form, Position oder einem Textkürzel koppeln.

## Abweichung statt Wert

Wer einen Druck überwacht, muss nicht wissen, dass er 4,72 bar beträgt. Nötig ist zu wissen, ob er dort liegt, wo er liegen soll, und wenn nicht: in welche Richtung und wie weit relativ zu den maßgeblichen Grenzen.

Deshalb ist das nützlichste Einzelelement im High-Performance-HMI keine Zifferanzeige, sondern **ein analoger Indikator, der den Wert gegen seinen normalen Betriebsbereich und seine Grenzen zeigt**. Er beantwortet „ist das in Ordnung?" präattentiv — quer durch den Raum, ohne Lesen — und „wie weit daneben?" bei genauerem Hinsehen.

Der Zahlenwert gehört weiterhin ins Bild, aber als sekundäres Detail für den Fall, dass eine exakte Zahl gebraucht wird, nicht als Primärsignal. Ein Bild mit zwanzig Zahlen verlangt zwanzig Lesevorgänge und zwanzig gedankliche Vergleiche gegen erinnerte Sollwerte. Ein Bild mit zwanzig Abweichungsindikatoren verlangt einen Blick.

## Bildhierarchie

Die Hierarchie ist das Navigationsmodell, und sie funktioniert, wenn jede Ebene eine andere Frage beantwortet:

```text
Level 1  Plant / area overview
         "Is anything wrong, and where?"
         KPIs, area status, aggregated deviation

Level 2  Process unit
         "What is happening in this unit?"
         The main operating display; most operator time is spent here

Level 3  Equipment detail / faceplate
         "What is this device doing and why?"
         Modes, permissives, interlocks, commands, local trend

Level 4  Diagnostic / support
         "Why is this behaving unexpectedly?"
         Device diagnostics, configuration, maintenance detail
```

Zwei Regeln machen die Hierarchie nutzbar:

**Jede Ebene muss von jeder anderen in wenigen, vorhersagbaren Schritten erreichbar sein.** Wer auf eine Anzeige der Ebene 1 reagiert, sollte das zugehörige Bild der Ebene 2 direkt von dort erreichen, nicht über einen Menübaum ab der Wurzel.

**Der Entwurfsaufwand gehört auf Ebene 2.** Dort verbringt das Bedienpersonal die meiste Zeit, und genau diese Ebene wird am häufigsten zugunsten einer eindrucksvollen, aber selten betrachteten Ebene-1-Übersicht vernachlässigt.

## Faceplates und Einheitlichkeit

Ein Faceplate ist die standardisierte Interaktionsfläche für eine Betriebsmittelklasse. Sein Wert entsteht vollständig aus Einheitlichkeit: Wer das Pumpen-Faceplate gelernt hat, hat alle vierhundert Pumpen gelernt.

Was ein Faceplate zeigen sollte, und warum jedes zählt:

- **Die aktuelle Betriebsart**, ausdrücklich — Automatik, Hand, Instandhaltung, außer Betrieb. Aus dem Kontext abgeleitete Betriebsart ist unter Druck falsch gelesene Betriebsart.
- **Warum das Betriebsmittel nicht anlaufen kann**, wenn es das nicht kann: welche Freigabe fehlt, welche Verriegelung ansteht, ob eine Auslösung gespeichert ist. Dieselbe Unterscheidung wie im Beitrag zur Bedingungsebene, sichtbar gemacht dort, wo entschieden wird.
- **Der Betriebsart angemessene Bedienmöglichkeiten**, wobei nicht verfügbare Befehle sichtbar nicht verfügbar sind statt zu fehlen. Man soll erkennen können, dass ein Befehl existiert und derzeit nicht zulässig ist.
- **Ein kurzer lokaler Trend**, denn „ist das stabil?" ist eine Frage an die jüngste Vergangenheit, nicht an den Augenblick.

Einheitlichkeit ist eine ingenieurtechnische Randbedingung, keine ästhetische Vorliebe: **ein zweites, leicht abweichendes Pumpen-Faceplate ist eine Schulungs- und Fehlerquote-Belastung**, und der Druck dazu entsteht aus dem Sonderfall eines einzelnen Projekts. Ihm ist ebenso zu widerstehen wie einem Betriebsarteneingang, der das Grundverhalten eines Funktionsbausteins ändert — mit der Frage, ob es wirklich eine andere Betriebsmittelklasse ist.

## Trends

Trends verdienen bewussten Entwurf, weil das Bedienpersonal mit ihnen über Kausalität nachdenkt.

**Zusammengehörige Größen gehören in einen Trend.** Istwert, Sollwert und Stellgröße eines Reglers in einem Diagramm zeigen das Kreisverhalten; dieselben drei in drei Diagrammen zeigen drei unzusammenhängende Linien.

**Der voreingestellte Zeitbereich muss zur Prozesszeitkonstante passen.** Ein Zehn-Minuten-Fenster auf einem trägen thermischen Prozess zeigt eine flache Linie; ein Zwölf-Stunden-Fenster auf einem schnellen Durchflussregelkreis zeigt Rauschen. Keines stützt eine Schlussfolgerung.

**Skalen sollen stabil sein, nicht selbstskalierend.** Ein selbstskalierendes Diagramm zeichnet seine Achse mit den Daten neu, wodurch eine kleine Abweichung genauso aussieht wie eine große. Eine feste, sinnvolle Skala erhält die visuelle Größenordnung der Abweichung — und genau darum geht es.

## ISA-101 und was Urteilssache bleibt

ISA-101 liefert den anerkannten Rahmen für den HMI-Lebenszyklus — Philosophie, Styleguide, Entwurf, Umsetzung, Betrieb und Änderungsmanagement. Sein wertvollster Beitrag ist struktureller Art: Er etabliert, dass ein HMI eine dokumentierte Philosophie und einen Styleguide hat, dem einzelne Bilder entsprechen müssen, statt dass jedes Bild eine eigenständige Entwurfsentscheidung seines Erstellers ist.

Was die Norm rahmt, aber nicht für einen entscheidet, ist der Inhalt: welche Größen auf Ebene 2 gehören, was der normale Betriebsbereich jedes Indikators ist, welche Zustände eine Farbe rechtfertigen und was das Bedienpersonal jeweils tun soll. Das sind Verfahrens- und Betriebsentscheidungen und verlangen die Anwesenheit derer, die die Anlage fahren.

Das praktische Versagen, das zu vermeiden ist: den visuellen Stil zu übernehmen — graue Hintergründe, gedämpfte Palette — ohne die Philosophie und die dahinterliegende Rationalisierung. Das Ergebnis sieht aus wie ein High-Performance-HMI und arbeitet wie das Fließbild, das es ersetzt hat, weil die zugrundeliegenden Entscheidungen darüber, was Aufmerksamkeit verdient, nie getroffen wurden.

## Arbeitsbelastung

Zwei Belastungsfragen lohnen den ausdrücklichen Entwurf.

**Wie viele Bilder muss man im Arbeitsgedächtnis halten, um den Anlagenzustand zu verstehen?** Lautet die Antwort mehr als eine kleine Zahl, erfüllt die Ebene-1-Übersicht ihre Aufgabe nicht.

**Wie viele Navigationsschritte liegen zwischen dem Bemerken eines Problems und dem Handeln?** Jeder ist eine Gelegenheit, den Faden zu verlieren, und unter Alarmflutbedingungen konkurriert jeder mit der Alarmliste um Aufmerksamkeit.

Eine verwandte Disziplin: **Das Bild darf nicht zum Rechnen zwingen.** Wer routinemäßig zwei Werte subtrahiert, gegen eine erinnerte Grenze vergleicht oder eine Rate gedanklich integriert, erledigt Arbeit, die ins System gehört. Die knappe Ressource ist Urteilsvermögen, nicht Rechenleistung.

## Fehlerbilder

**Regenbogen-Normalität.** Alles farbig, also hat Abnormalität keinen Kanal. Der häufigste Mangel und der am schwersten nachzurüstende, weil er die Neuentscheidung jedes Bildes verlangt.

**Fotorealistische Grafiken.** 3D-Behälter, Verläufe und Schatten fügen visuelles Detail ohne Prozessinformation hinzu und verbrauchen das Aufmerksamkeitsbudget. Realismus ist kein Verständnis.

**Alarmfarbe für Identität zweckentfremdet.** Rot für eine Produktlinie, einen Ventiltyp oder einen Markenakzent. Die präattentive Reaktion auf Rot ist nun unzuverlässig.

**Faceplate-Drift.** Mehrere Varianten derselben Betriebsmittelklasse, jede leicht anders, jede einzeln zu lernen.

**Selbstskalierende Trends.** Jede Abweichung sieht gleich groß aus.

**Ebene 1 für Besucher gebaut.** Eine eindrucksvolle Übersicht für Vorführungen und eine vernachlässigte Ebene 2, auf der tatsächlich gearbeitet wird.

## Ein repräsentatives Szenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Die Filtrationsübersicht eines Wasserwerks zeigt zwölf Filter, jeden als farbigen Behälter mit Zifferanzeigen für Durchfluss, Differenzdruck und Füllstand. Im Normalbetrieb ist das Bild vollständig gesättigt. Wer es scannt, muss sechsunddreißig Zahlen lesen und jede gegen einen erinnerten Normalbereich vergleichen.

Der High-Performance-Neuentwurf zeichnet dieselben zwölf Filter als graue Formen, jede mit einem Differenzdruck-Abweichungsindikator gegen ihr Normalband. Ein Filter kurz vor der Rückspülung liest sich als sichtbar ausgelenkter Indikator; ein Filter, dessen Rückspülung fehlgeschlagen ist, trägt die einzige Farbe im Bild.

Der Informationsgehalt ist unverändert — dieselben Messwerte sind vorhanden, und die exakten Zahlen bleiben einen Klick entfernt im Faceplate. Verändert hat sich die Zahl der Lesevorgänge für die Frage „ist etwas nicht in Ordnung?": von sechsunddreißig auf null.

## Wartbarkeit

Grafiken sind Software und altern wie solche. Zwei Praktiken zählen:

**Aus einer Bibliothek von Standardobjekten bauen**, nicht durch Kopieren und Bearbeiten von Bildern. Eine Änderung am Pumpensymbol muss sich fortpflanzen; erfordert sie das Bearbeiten von zweihundert Bildern, unterbleibt sie, und die Uneinheitlichkeit wird dauerhaft.

**Den Styleguide als durchgesetztes Artefakt führen**, nicht als einmalig zu Projektbeginn geschriebenes Dokument. Wo das Werkzeug Konformität prüfen kann — Palette, Symbolverwendung, Schriftgrößen —, ist diese Prüfung mehr wert als ein Review, das stattfindet, wenn jemand daran denkt.

## Empfohlene Vorgehensweise

- HMI-Philosophie und Styleguide vor dem Bildentwurf schreiben und als Entscheidungsmaßstab nutzen.
- Gesättigte Farbe für abnormale Zustände reservieren; Struktur und Identität in Graustufen zeichnen.
- Bedeutung nie allein im Farbton kodieren.
- Abweichung gegen den Normalbereich als Primäranzeige; exakte Werte sekundär.
- Eine vierstufige Hierarchie entwerfen und den größten Aufwand in Ebene 2 stecken.
- Faceplates je Betriebsmittelklasse standardisieren und projektspezifischen Varianten widerstehen.
- Zusammengehörige Größen in einem Trend gruppieren, mit stabilen Skalen und prozessgerechten Zeitbereichen.
- Rechenarbeit vom Menschen ins System verlagern.
- Bilder aus einer gemeinsamen Objektbibliothek bauen, damit Änderungen sich fortpflanzen.

## Fazit

Der Maßstab eines HMI ist nicht, wie viel von der Anlage es zeigt. Es ist, wie schnell drei Fragen beantwortet werden können: Ist etwas nicht in Ordnung, wo, und was soll ich tun. Ein Bild, das alle drei ohne Lesen beantwortet, hat seine Aufgabe erfüllt; eines, das Scannen und Kopfrechnen verlangt, hat Arbeit vom System zu der Person verschoben, die sie am wenigsten erübrigen kann.

Die Mittel sind unspektakulär — graue Hintergründe, weniger Zahlen, einheitliche Faceplates, ehrliche Skalen. Wirksam werden sie durch die zugrundeliegende Entscheidung, Aufmerksamkeit als die begrenzende Ressource des Entwurfs zu behandeln und sie bewusst auszugeben.
