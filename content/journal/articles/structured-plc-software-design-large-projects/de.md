# Strukturierter SPS-Softwareentwurf für Großprojekte

## Zusammenfassung

Große Steuerungsprogramme scheitern selten daran, dass ein Netzwerk schlecht geschrieben wurde. Sie scheitern daran, dass niemand entschieden hat, welche Struktur das Programm hat — also hat es sich durch Anlagerung eine zugelegt. Diese Struktur kennt keine Regel dafür, wohin ein bestimmtes Stück Logik gehört, keine Regel dafür, wer auf einen Ausgang schreiben darf, und keine Grenze, auf die sich eine Änderung eingrenzen ließe.

Dieser Beitrag behandelt die kleine Menge struktureller Entscheidungen, die darüber bestimmen, ob eine Anwendung änderbar bleibt, nachdem die Bearbeiter, die sie geschrieben haben, weitergezogen sind.

## Warum das relevant ist

Das Symptom unstrukturierter Steuerungssoftware ist konkret und wiedererkennbar: Eine Änderung, die lokal sein sollte, ist es nicht. Eine Verriegelung an einer Maschine zu ergänzen erfordert das Lesen von vier fremden Bausteinen, um herauszufinden, was sonst noch auf denselben Ausgang schreibt. Die Inbetriebnahme einer neuen Linie bedeutet das Nachtesten einer bestehenden, weil sich beide einen undokumentierten Datenbaustein teilen. Über einen Fehler in einem Bereich lässt sich nicht nachdenken, ohne das ganze Programm zu verstehen.

Nichts davon ist ein Problem der Programmierfertigkeit. Jede einzelne Routine mag klar sein. Der Mangel ist architektonisch, und er entsteht früh — meist in der ersten Projektwoche, durch jemanden, der ein akutes Problem ohne Regel löst.

## Schichtung nach Verantwortung

Die brauchbarste Struktur trennt das Programm danach, *wofür eine Schicht verantwortlich ist*, nicht danach, zu welcher Maschine sie gehört. Vier Schichten decken die meisten industriellen Anwendungen ab:

```text
Koordination / Ablaufsteuerung
    orchestriert Betriebsmittel zur Produkterzeugung
        |
Betriebsmittelsteuerung
    ein Modul je physischem Objekt: Motor, Ventil, Antrieb
        |
Sicherheits- und Verriegelungsauswertung
    Bedingungen, die einschraenken, was zulaessig ist
        |
E/A-Abstraktion
    Rohsignale auf benannte, skalierte, gueltige Werte abgebildet
```

Die Regel, die der Schichtung ihren Wert gibt: **Eine Schicht darf nach unten aufrufen und nach oben lesen, aber nicht nach oben schreiben.** Die Ablaufsteuerung sagt dem Betriebsmittel, was zu tun ist; das Betriebsmittel greift nicht in den Ablauf ein und verändert ihn. Wird diese Regel gebrochen — ein Gerätebaustein, der aus Bequemlichkeit eine Schrittnummer setzt —, wird das Verhalten des Ablaufs nicht mehr vom Ablauf bestimmt, und darüber nachzudenken erfordert, alles zu lesen.

### Die E/A-Abstraktionsschicht rechnet sich sofort

Rohsignale sollten einmal in benannte technische Werte mit Gültigkeitskennung umgesetzt werden, und nichts sonst darf die Rohadresse berühren. Diese eine Schicht liefert drei Dinge auf einmal:

- Ein Hardwaretausch wird zu einer Änderung an einer Stelle.
- Signalgültigkeit — Stationsstatus, Drahtbruch, Bereich — wird einmal und einheitlich bewertet.
- Simulation wird möglich, weil die Schicht unterhalb der Abstraktion ersetzbar ist.

Der dritte Punkt ist es, der ernsthaftes Testen vor Existenz der Anlage ermöglicht.

## Genau ein Eigentümer je Ausgang

Das ist die wertvollste einzelne Regel industrieller Software — und die am häufigsten verletzte.

**Jeder physische Ausgang wird von genau einem Baustein geschrieben.** Dieser Baustein ist der Eigentümer. Alles andere, das eine Änderung will, fordert sie über die Schnittstelle des Eigentümers an.

Der so verhinderte Fehler kostet die meiste Inbetriebnahmezeit: zwei Logikteile, die im selben Zyklus denselben Ausgang schreiben. Der letzte Schreiber gewinnt, das Verhalten hängt von der Bearbeitungsreihenfolge ab, und das Symptom ist ein Gerät, das unter nicht reproduzierbaren Bedingungen „flackert" oder einen Befehl „ignoriert". Weil beide Schreiber für sich korrekt sind, findet ein Code-Review das nicht — nur die Eigentumsregel findet es, und zwar zur Entwurfszeit.

Die Regel hat eine Folgerung, die ausdrücklich genannt gehört: **Ein Anlagenmodul besitzt seine eigenen Ausgänge, und kein Ablauf schreibt sie direkt.** Ein Ablauf setzt eine Anforderung; das Anlagenmodul entscheidet unter Berücksichtigung eigener Verriegelungen und Betriebsart, ob es darauf reagiert.

## Anlagenmodule

Ein Anlagenmodul ist das Softwareobjekt für ein physisches Betriebsmittel. Es hat eine Schnittstelle, internen Zustand und keine Abhängigkeit davon, welcher Ablauf es gerade nutzt.

Eine tragfähige Schnittstellenform:

| Schnittstellenelement | Zweck |
| --- | --- |
| Befehlsanforderung | Was der Aufrufer will (Start, Stopp, Auf, Zu) |
| Betriebsart | Automatik, Hand, Instandhaltung, außer Betrieb |
| Freigabeeingang | Bedingungen, die zum Handeln erfüllt sein müssen |
| Verriegelungseingang | Bedingungen, die einen sicheren Zustand erzwingen |
| Statusausgang | Läuft, steht, im Übergang, gestört |
| Störungsdetail | Genug zur Ursachenunterscheidung, kein einzelnes Bit |
| Bereitschaftsausgang | Ob der Aufrufer sich jetzt darauf verlassen kann |

Zwei Eigenschaften wiegen schwerer als die Feldliste.

**Das Modul besitzt sein eigenes Timing.** Rückmeldeüberwachung beim Anlauf, Befehlsimpulsdauer, Wiederholungslogik und die Störbedingung „befohlen, aber nie bestätigt" gehören ins Modul. Implementiert jeder Aufrufer seine eigene Überwachung, hat die Anlage so viele Definitionen von „Anlauf fehlgeschlagen" wie sie Abläufe hat.

**Das Modul ist instanziierbar.** Vierzig Motoren sollten vierzig Instanzen eines Moduls sein, nicht vierzig Kopien ähnlichen Codes. Der Unterschied ist nicht ästhetisch: Mit Instanzen wird ein Mangel einmal behoben; mit Kopien neununddreißigmal — realistischer: in den Kopien, an die sich jemand erinnert hat.

## Zustandsautomaten statt angesammelter Bedingungen

Sequenzielles Verhalten, das als wachsende Menge unabhängiger Bedingungen geschrieben wird, ist irgendwann nicht mehr analysierbar. Dasselbe Verhalten als expliziter Zustandsautomat bleibt unabhängig von der Größe analysierbar, weil das Betriebsmittel zu jedem Zeitpunkt in genau einem definierten Zustand ist und die zulässigen Übergänge daraus aufgezählt sind.

Ein minimaler, ehrlicher Zustandssatz für die meisten Betriebsmittel:

```text
AUSSER_BETRIEB  -> BEREIT           (wieder in Betrieb genommen)
BEREIT          -> ANLAUFEND        (Befehl angenommen)
ANLAUFEND       -> LAEUFT           (Rueckmeldung bestaetigt)
ANLAUFEND       -> GESTOERT         (Rueckmeldung zeitueberschritten)
LAEUFT          -> STOPPEND         (Befehl oder Verriegelung)
LAEUFT          -> GESTOERT         (Rueckmeldung verloren, Ausloesung)
STOPPEND        -> BEREIT           (Stillstand bestaetigt)
GESTOERT        -> BEREIT           (Ursache weg UND Quittierung)
```

Drei Details darin leisten echte Arbeit.

**`ANLAUFEND` ist ein Zustand, kein Augenblick.** Dort wohnt die Rückmeldeüberwachung, und ihn explizit zu führen macht „befohlen, aber nie angelaufen" zu einer diagnostizierbaren statt einer unsichtbaren Bedingung.

**Das Verlassen von `GESTOERT` verlangt zweierlei** — dass die Ursache weg ist *und* eine bewusste Quittierung. Automatische Rückkehr beim Wegfall der Ursache bedeutet, dass eine Anlage nach einer Störung wieder anlaufen kann, die niemand untersucht hat.

**`AUSSER_BETRIEB` wird ausdrücklich modelliert.** Für die Instandhaltung freigeschaltetes Betriebsmittel ist nicht „gestoppt"; es darf auf keinen Automatikstart reagieren, und der Ablauf muss den Unterschied kennen, um melden zu können, warum er nicht weiterkommt.

## Betriebsartenlogik

Bei den Betriebsarten verfällt die Struktur am häufigsten, weil sich Betriebsarten ansammeln: Automatik, Hand, Halbautomatik, Instandhaltung, Simulation, Inbetriebnahme. Jede kam aus einem realen Grund hinzu und wird selten entfernt.

Drei Regeln halten das beherrschbar:

- **Die Betriebsart gehört dem Anlagenmodul**, und es gibt genau eine Betriebsartenvariable je Objekt. Zwei Stellen, die unabhängig Betriebsarten führen, sind eine garantierte Inkonsistenz.
- **Die Übergangsregeln sind explizit**, besonders die gefährlichen. Was geschieht mit einem laufenden Motor, wenn sein Modul von Automatik auf Hand wechselt? Weiterlaufen oder stoppen? Beides ist vertretbar; nur eines ist für eine konkrete Anlage richtig, und es muss entschieden werden statt aus dem zufälligen Codeverhalten hervorzugehen.
- **Simulationsbetrieb ist eine erstklassige Entwurfsentscheidung — oder er existiert nicht.** „Tu so, als wäre die Rückmeldung da" nachträglich in ein Programm einzubauen, das dafür nicht entworfen wurde, erzeugt genau den Fehler, dass Simulation im Produktivbetrieb versehentlich aktiv bleibt.

## Namens- und Strukturkonventionen

Benennung ist in einem Programm, das Fremde unter Zeitdruck lesen, nicht kosmetisch. Eine tragfähige Konvention kodiert Bereich, Betriebsmittel und Funktion so, dass ein in einer Störmeldung gefundener Name genügt, um die Logik zu lokalisieren:

```text
Bereich_Betriebsmittel_Funktion
CDU_P101_StartBef
CDU_P101_LaufRueck
CDU_P101_Stoerung
```

Die entscheidende Eigenschaft: Wer um drei Uhr morgens eine Meldung liest, findet den zuständigen Baustein allein aus dem Namen — ohne Querverweiswerkzeug und ohne Projektkenntnis.

## Versionsverwaltung und Bibliothekspflege

Zwei Praktiken trennen wartbare von unwartbaren Projekten, und keine davon ist exotisch:

**Wiederverwendbare Module leben in einer versionierten Bibliothek**, mit definierter Version je Projekt. Wird ein Mangel im Motorbaustein gefunden, geht die Korrektur in die Bibliothek, und jedes Projekt entscheidet, wann es die neue Version übernimmt. Ohne das ist „der Standard-Motorbaustein" eine Fiktion — es gibt so viele Varianten wie Projekte.

**Das Projekt steht unter echter Versionsverwaltung**, mit sinnvoller Commit-Granularität. Der konkrete Wert bei der Inbetriebnahme liegt darin, die Frage beantworten zu können: „Was hat sich zwischen dem Lauf, der funktionierte, und dem, der nicht funktionierte, geändert?" — eine sonst unbeantwortbare Frage, die ganze Schichten verschlingt.

## Fehlerbilder

**Zwei Schreiber auf einem Ausgang.** Verhalten hängt von der Bearbeitungsreihenfolge ab und wirkt sporadisch. Durch die Eigentumsregel vollständig verhindert; im Nachhinein kaum auffindbar.

**Geteilter Zustand ohne Eigentümer.** Ein von mehreren Bereichen beschriebener Datenbaustein wird zu einer undokumentierten Kopplung, entdeckt, wenn eine Änderung im einen Bereich den anderen bricht.

**Kopierte Betriebsmittellogik.** Ein in einer Instanz gefundener Mangel existiert in den anderen neununddreißig, und kein Mechanismus garantiert, dass alle korrigiert werden.

**Implizite Betriebsart.** Eine aus Bedingungskombinationen abgeleitete statt explizit gespeicherte Betriebsart erzeugt Zustände, die niemand entworfen hat — etwa Betriebsmittel, das nach einer bestimmten Störungsfolge weder Automatik noch Hand ist.

**Ablauflogik im Gerätebaustein.** Ein Gerätebaustein, der weiß, welches Produkt gefertigt wird, ist nicht wiederverwendbar, und die Kopplung wird erst sichtbar, wenn jemand es versucht.

## Hinweise zur Inbetriebnahme

Struktur zahlt sich bei der Inbetriebnahme stärker aus als zu jedem anderen Zeitpunkt:

- **Anlagenmodule lassen sich einzeln in Betrieb nehmen**, im Handbetrieb, bevor irgendein Ablauf existiert. Das ist der größte Terminvorteil dieser Architektur.
- **Die E/A-Abstraktionsschicht erlaubt Schleifenprüfungen gegen benannte Werte** statt gegen Rohadressen — schneller und weniger fehleranfällig.
- **Explizite Zustände machen Teilinbetriebnahmen sicher** — auf `AUSSER_BETRIEB` belassene Betriebsmittel sind eindeutig ausgeschlossen und nicht bloß „noch nicht gestartet".

Zykluszeit und CPU-Auslastung bei der Übergabe messen und dokumentieren. Ohne diese Basislinie ist keine spätere Frage nach Leistungsverlust beantwortbar.

## Sicherheitstechnische Hinweise

Sicherheitsfunktionen werden nach den für die Anlage geltenden Normen zur funktionalen Sicherheit projektiert und sind nicht Teil dieser Anwendungsschichtung: Die Integrität einer Sicherheitsfunktion ist eine Eigenschaft ihrer gesamten Kette und gehört ins Sicherheitssystem mit der Unabhängigkeit, auf der ihre Risikominderung beruht.

Der strukturelle Punkt, der hierher gehört, ist die Unterscheidung zwischen einer Verriegelung als Teil einer Sicherheitsfunktion und einer betrieblichen Verriegelung, die Betriebsmittel oder Produkt schützt. Beide schränken ein, was die Anlage tun darf; nur eine ist als Risikominderung angerechnet. Sie in der Anwendung zu vermischen — sodass niemand mehr erkennt, welche Bedingungen sicherheitsangerechnet sind — ist ein Dokumentationsmangel mit realen Folgen in der Sicherheitsprüfung. Sie gehören sichtbar getrennt.

## Empfohlene Vorgehensweise

- Nach Verantwortung schichten und „nach unten aufrufen, nach oben lesen, niemals nach oben schreiben" durchsetzen.
- Jedem physischen Ausgang genau einen besitzenden Baustein geben.
- Anlagenmodule mit expliziten Schnittstellen bauen und instanziieren statt kopieren.
- Sequenzielles Verhalten als expliziten Zustandsautomaten modellieren, einschließlich `ANLAUFEND` und `AUSSER_BETRIEB`.
- Für das Verlassen des Störzustands eine bewusste Quittierung verlangen.
- Genau eine Betriebsartenvariable je Objekt führen und Übergangsverhalten explizit festlegen.
- E/A einmal abstrahieren und die Gültigkeit in der Abstraktion bewerten.
- Wiederverwendbare Module in einer Bibliothek versionieren; die Version je Projekt festschreiben.
- So benennen, dass ein Tag in einer Meldung die zuständige Logik auffindbar macht.

## Fazit

Die Struktur eines Steuerungsprogramms wird in seiner ersten Woche entschieden und ein Jahrzehnt lang ertragen. Die maßgeblichen Entscheidungen sind wenige und am Anfang billig: welche Schichten es gibt, wem welcher Ausgang gehört, wie die Schnittstelle eines Anlagenmoduls aussieht und wie Zustände und Betriebsarten dargestellt werden.

Programme, die diese Entscheidungen ausdrücklich getroffen haben, nehmen eine neue Linie, einen getauschten Antrieb oder eine zusätzliche Verriegelung als lokale Änderung auf. Programme, die es nicht getan haben, nehmen dieselbe Arbeit als projektweites Risiko auf — und der Unterschied hat fast nichts damit zu tun, wie gut die einzelnen Routinen geschrieben wurden.
