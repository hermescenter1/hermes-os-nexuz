# Wiederverwendbare Funktionsbausteine richtig entwerfen

## Zusammenfassung

Die meisten als wiederverwendbar bezeichneten Bausteine sind es nicht. Sie sind der Baustein des ersten Projekts, dem jedes Mal ein Parameter angefügt wurde, wenn ein zweites Projekt etwas leicht anderes brauchte. Das Ergebnis sammelt Eingänge an, die niemand erklären kann, ein Verhalten, das von der gesetzten Kombination abhängt, und eine wachsende Scheu, den Baustein anzufassen — das Gegenteil von Wiederverwendung.

Ein wirklich wiederverwendbarer Baustein ist durch seinen Schnittstellenvertrag definiert: was er zusichert, was er verlangt und was er niemals tut. Dieser Beitrag handelt davon, diesen Vertrag bewusst zu schreiben.

## Warum das relevant ist

Die Wirtschaftlichkeit ist das ganze Argument. Ein vierhundertmal instanziierter Motorbaustein bietet vierhundert Gelegenheiten für einen einzigen Mangel und eine Gelegenheit, ihn zu beheben. Dieselbe Logik vierhundertmal kopiert ergibt vierhundert unabhängige Mängel, von denen eine Teilmenge behoben wird und niemand weiß, welche.

Diese Rechnung gilt aber nur, wenn der Baustein tatsächlich instanziierbar ist. Ein Baustein, der vom Aufrufer Kenntnis seiner Interna verlangt oder sich je nach undokumentierter Eingangskombination anders verhält, hat die Instandhaltungskosten kopierten Codes und die Fehlersuchschwierigkeit geteilten Codes — das Schlechteste aus beidem.

## Der Schnittstellenvertrag

Die Schnittstelle eines Bausteins ist ein Versprechen. Es aufzuschreiben verändert, was gebaut wird.

**Was der Aufrufer bereitstellen muss.** Welche Eingänge zwingend sind, welche Wertebereiche gültig sind und was geschieht, wenn Werte außerhalb liegen. Ein Baustein, der bei ungültigem Eingang stillschweigend etwas Plausibles tut, ist schwerer zu debuggen als einer, der das Problem meldet.

**Was der Baustein zusichert.** Unter welchen Bedingungen die Ausgänge aussagekräftig sind. Das ist der am häufigsten weggelassene Teil des Vertrags — und der Grund, warum `Bereit` zählt.

**Was der Baustein niemals tut.** Üblicherweise: Er schreibt nie außerhalb seiner eigenen Instanzdaten und seiner deklarierten Ausgänge. Ein Baustein, der in einen globalen Datenbereich greift, hat den Vertrag gebrochen, auch wenn er funktioniert — denn der Aufrufer kann nicht mehr isoliert über ihn nachdenken.

### Jeder Baustein braucht einen Bereitschaftsausgang

`Bereit` — oder `Gültig`, wie das Projekt es auch nennt — beantwortet: „Kann der Aufrufer sich jetzt auf meine Ausgänge verlassen?" Er ist FALSE während der Initialisierung, nach einer Störung und immer dann, wenn der Baustein kein sinnvolles Ergebnis berechnen kann.

Ohne ihn kann der Aufrufer „der Wert ist 0,0, weil der Prozess bei null steht" nicht von „der Wert ist 0,0, weil ich noch nichts berechnet habe" unterscheiden. Das sind völlig verschiedene Situationen, und ein einzelner Ausgang kann nicht beides ausdrücken. Das Fehlen eines Bereitschaftsausgangs ist der häufigste Schnittstellenmangel industrieller Bibliotheken und erzeugt genau die Fehlerklasse, bei der ein Ablauf beim Anlauf auf einen Vorbesetzungswert reagiert.

### Störungsdetail statt Störungsbit

Ein einzelnes `Störung`-Bit teilt dem Aufrufer mit, dass etwas nicht stimmt — mehr nicht. Die Fachkraft vor dem Betriebsmittel muss wissen, *was* nicht stimmt, und der Baustein ist das Einzige, das es weiß.

Das tragfähige Muster ist ein `Störung`-Bit, auf das die Logik reagiert, plus ein Störcode oder Bitfeld für Menschen und Diagnose. Die Codes müssen definiert und dokumentiert sein — ein Code, dessen Bedeutung nur im Kopf des Autors existiert, ist keine Diagnose.

## Instanzdaten

Ein Funktionsbaustein hat Gedächtnis, und genau das macht ihn zum richtigen Konstrukt für Betriebsmittel. Drei Eigenschaften dieses Gedächtnisses verlangen bewusste Entscheidungen.

**Instanzdaten gehören der Instanz.** Der Baustein legt instanzbezogenen Zustand niemals global ab. Das klingt selbstverständlich und wird ständig verletzt — meist durch einen Timer oder Zähler, den „ohnehin nur eine Instanz braucht", bis eine zweite existiert.

**Die Initialisierung ist definiert.** In welchem Zustand ist die Instanz bei erster Bearbeitung und nach einem Wiederanlauf? Ein Baustein, dessen Verhalten nach Wiederanlauf davon abhängt, was der remanente Speicher zufällig enthielt, ist nicht deterministisch, und der resultierende Fehler zeigt sich alle paar Monate, wenn die Anlage nach einem Spannungsereignis wieder anläuft.

**Remanenz ist eine Entscheidung, keine Voreinstellung.** Die meisten Instanzdaten sollten einen Spannungsausfall nicht überstehen: Eine Laufzustandsvariable, die einen Wiederanlauf überdauert, glaubt, Betriebsmittel liefen, die stillstehen. Die kleine Teilmenge, die wirklich bestehen bleiben muss — kumulierte Betriebsstunden, Chargenzähler —, gehört ausdrücklich deklariert und begründet.

## Wiederanlauf- und Initialisierungsverhalten

Das Wiederanlaufverhalten ist die am häufigsten undefinierte Eigenschaft und die mit der größten Wahrscheinlichkeit einer gefährlichen Überraschung.

Drei Fragen, die der Vertrag beantworten muss:

1. **Welchen Zustand nimmt der Baustein bei erster Bearbeitung an?** Die sichere Antwort ist fast immer ein definierter Ruhezustand mit `Bereit` FALSE, bis die Eingänge mindestens einmal ausgewertet wurden.
2. **Setzt der Baustein nach Wiederanlauf fort oder initialisiert er neu?** Beides kann richtig sein; nur eines ist für einen konkreten Baustein korrekt, und die Wahl muss dokumentiert werden.
3. **Kommandiert der Baustein jemals im ersten Zyklus einen Ausgang?** Er sollte es nicht. Ein Kommando im ersten Zyklus bedeutet, dass das Anlagenverhalten beim Wiederanlauf von der Bearbeitungsreihenfolge und den zufälligen Eingangswerten in diesem Moment abhängt.

Der so verhinderte Fehler ist gravierend: ein Baustein, der nach einem Spannungsausfall den Zustand `LÄUFT` aus dem remanenten Speicher fortsetzt und deshalb nicht erneut prüft, ob das Betriebsmittel tatsächlich läuft, bevor ein Ablauf weitergeht.

## Komposition und Schichtung

Wiederverwendbare Bausteine werden zusammengesetzt, und die Kompositionsregeln wiegen so schwer wie die Bausteine selbst.

**Ein Baustein ruft nur nach unten.** Ein Ventilbaustein darf einen generischen Digitalausgangsbaustein aufrufen. Er darf nicht den Ablauf aufrufen, der ihn nutzt. Aufrufe nach oben erzeugen einen Zyklus, und eine zyklische Abhängigkeit bedeutet, dass keiner der beiden Bausteine unabhängig verstanden, geprüft oder wiederverwendet werden kann.

**Generische Schichten bleiben generisch.** Sobald ein „generischer Motorbaustein" Logik enthält, die ein bestimmtes Produkt, eine Linie oder eine Anlage nennt, ist er nicht mehr generisch. Der übliche Druck kommt aus einer einmaligen Projektanforderung; die richtige Antwort ist ein Eingang an der Schnittstelle, kein Sonderfall im Baustein.

**Die Schnittstelle ist schmaler als die Implementierung.** Ein Baustein legt das Minimum offen, das seine Aufrufer brauchen. Jedes zusätzlich offengelegte Element ist etwas, das eine künftige Version kompatibel halten muss.

## Parametrierung ohne Parameterwucherung

Der häufigste Verfallspfad ist ein Baustein, der für jede angetroffene Variante einen Eingang anbaut. Nach mehreren Projekten hat er dreißig Eingänge, die meisten auf Voreinstellung, und die Kombinationen sind ungeprüft.

Drei Techniken halten das im Griff:

| Technik | Einsatz, wenn | Wirkung |
| --- | --- | --- |
| Strukturierter Parametereingang | Viele zusammengehörige Einstellungen | Ein Eingang trägt eine typisierte Struktur |
| Sinnvolle Vorbesetzungen | Die meisten Aufrufer wollen denselben Wert | Aufrufer setzen nur Abweichungen |
| Eigene Bausteinvariante | Verhalten unterscheidet sich grundlegend | Zwei klare Bausteine schlagen einen mit Umschalter |

Die dritte Zeile verlangt die Urteilsentscheidung, der am häufigsten ausgewichen wird. Ein Baustein mit einem Betriebsarteneingang, der sein Grundverhalten ändert, sind zwei Bausteine unter einem Namen; sie zu trennen macht beide prüfbar, und die Entscheidung des Aufrufers wird im Code sichtbar statt in einem Parameter vergraben.

## Testbarkeit

Ein Baustein, der sich nicht unabhängig prüfen lässt, wird nicht vertraut — und Bausteinen, denen nicht vertraut wird, wird kopiert und geändert statt wiederverwendet.

Zwei Eigenschaften machen einen Baustein prüfbar:

**Alle Eingänge kommen über die Schnittstelle.** Ein Baustein, der eine globale Variable liest — eine anlagenweite Freigabe, ein gemeinsames Betriebsartenwort —, lässt sich ohne Aufbau dieses globalen Zustands nicht prüfen. Sie gehört übergeben.

**Das Verhalten ist ausschließlich Funktion von Eingängen und Instanzdaten.** Keine Abhängigkeit von der Bearbeitungsreihenfolge gegenüber anderen Bausteinen und keine davon, von einer bestimmten Stelle aufgerufen zu werden.

Mit diesen beiden Eigenschaften lässt sich ein Baustein am Prüfplatz oder gegen eine simulierte E/A-Schicht betreiben, bevor die Anlage existiert. Der Wert zeigt sich bei der Inbetriebnahme, wo der Unterschied zwischen „wir haben den Baustein geprüft" und „wir sehen es vor Ort" in Schichten gemessen wird.

## Versionierung

Eine Bibliothek ohne Versionen ist keine Bibliothek, sondern ein Ordner.

**Jeder Baustein trägt eine Version.** Kein Kommentar — ein Wert, den das Projekt lesen kann, damit das laufende Programm melden kann, welche Bausteinversion es enthält. Bei einer Störungsuntersuchung lautet die erste nützliche Frage oft „welche Version läuft in dieser Anlage", und sie muss ohne Öffnen des Projekts beantwortbar sein.

**Kompatibilitätsregeln sind explizit.** Einen optionalen Eingang mit sicherer Vorbesetzung zu ergänzen ist kompatibel. Die Bedeutung eines bestehenden Eingangs zu ändern, die Einheit eines Ausgangs zu ändern oder das Wiederanlaufverhalten zu ändern ist es nicht — das verlangt eine neue Hauptversion, und die Projekte mit der alten entscheiden, wann sie wechseln.

**Projekte legen eine Version fest.** Eine Anlage erhält nicht stillschweigend einen neuen Baustein, weil jemand die Bibliothek aktualisiert hat. Sie übernimmt die neue Version bewusst und mit Prüfung.

Ohne all das ist „wir haben es im Standardbaustein behoben" eine Aussage über eine Datei auf einem Laptop, nicht über die Anlagen mit dem Mangel.

## Fehlerbilder

**Fehlender Bereitschaftsausgang.** Der Aufrufer reagiert auf einen noch nicht berechneten Ausgang. Tritt beim Anlauf sporadisch auf und wird häufig als Feldproblem fehldiagnostiziert.

**Zustand in einer globalen Variablen.** Funktioniert mit einer Instanz, versagt stillschweigend mit zweien, weil beide sich Timer oder Zähler teilen.

**Fortgesetzter Laufzustand nach Wiederanlauf.** Der Baustein glaubt, ein Betriebsmittel laufe, das stillsteht, und ein Ablauf geht auf dieser Annahme weiter.

**Parameterwucherung.** Dreißig Eingänge und ungeprüfte Kombinationen. Niemand kann ohne Lesen sagen, was der Baustein tut — also verwendet ihn niemand wieder.

**Stilles Begrenzen von Eingängen.** Ein Wert außerhalb des Bereichs wird leise begrenzt statt gemeldet. Der Baustein verhält sich plausibel, und der Projektierungsfehler wird nie gefunden.

**Versionsdrift.** Vier Projekte haben vier Varianten „des Standardbausteins", und eine an einer angebrachte Korrektur erreicht die anderen nie.

## Ein durchgerechnetes Beispiel

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Man betrachte einen generischen Ventilbaustein, der sowohl für Auf/Zu- als auch für stetige Ventile genutzt wird. Auf Druck eines Projekts, das Stetigbetrieb braucht, kommt ein Eingang `Betriebsart` hinzu: 0 für Auf/Zu, 1 für stetig.

Der Baustein hat nun zwei Verhaltensweisen, zwei Mengen relevanter Eingänge, zwei Mengen aussagekräftiger Ausgänge und zwei Störungsdefinitionen. Jeder Aufrufer muss wissen, in welcher Betriebsart er ist, um die Ausgänge zu deuten. Die Prüfung muss beide Betriebsarten und deren Übergänge abdecken. Und die Auf/Zu-Aufrufer — die große Mehrheit — hängen nun an einem Baustein mit Stetiglogik, die sie nie nutzen.

Die Alternative sind zwei Bausteine mit gemeinsamem internem Kern für die Befehlsüberwachung. Jeder hat eine schmale Schnittstelle, jeder ist unabhängig prüfbar, und die Absicht des Aufrufers ist daran sichtbar, welchen Baustein er instanziiert hat. Die scheinbare Doppelung ist kleiner als sie wirkt, weil der wirklich gemeinsame Teil ausgelagert ist — und die diagnostische Klarheit ist deutlich besser.

## Hinweise zur Inbetriebnahme

- **Eine Instanz bauen und prüfen, bevor vierhundert ausgerollt werden.** Ein an Instanz eins gefundener Mangel ist eine Korrektur; an Instanz vierhundert ist er eine Kampagne.
- **Das Wiederanlaufverhalten gezielt prüfen.** Die Steuerung mit Betriebsmitteln in verschiedenen Zuständen spannungslos schalten und bestätigen, dass jeder Baustein den vertraglich zugesagten Zustand einnimmt. Das wird selten geprüft — und dort wohnen die gefährlichen Mängel.
- **Bestätigen, dass Störcodes im Feld unterscheidbar sind**, nicht nur im Code. Eine Fachkraft sollte den Code lesen und seine Bedeutung kennen, ohne eine Tabelle, die nur im Planungsbüro existiert.

## Sicherheitstechnische Hinweise

Ein wiederverwendbarer Baustein darf eine sicherheitsgerichtete Funktion nicht nachbilden: Solche Bausteine kommen aus zertifizierten Bibliotheken, und ihre Herkunft ist selbst Teil des Nachweises. Sie sind keine Allzweckbausteine mit erhöhter Sorgfalt, und ein Standardbaustein darf niemals in eine Sicherheitsfunktion gedrängt werden, weil er „dasselbe tut".

Die einschlägige Disziplin für Standardbausteine: Werden die Ausgänge eines Bausteins von etwas verarbeitet, das als Schutz angerechnet ist, wird sein Störungs- und Bereitschaftsverhalten Teil dessen, worauf dieser Schutz beruht — und jede Änderung daran ist eine Änderung dieser Abhängigkeit.

## Empfohlene Vorgehensweise

- Den Schnittstellenvertrag vor der Implementierung schreiben.
- Jedem Baustein einen Bereitschaftsausgang und Störungsdetail über ein einzelnes Bit hinaus geben.
- Allen Instanzzustand in der Instanz halten, niemals global.
- Verhalten bei erster Bearbeitung und Wiederanlauf explizit festlegen und im ersten Zyklus nie einen Ausgang kommandieren.
- Alles über die Schnittstelle übergeben, damit der Baustein isoliert prüfbar ist.
- Einen zweiten Baustein einem Betriebsarteneingang vorziehen, der das Grundverhalten ändert.
- Jeden Baustein versionieren, die Version zur Laufzeit lesbar machen und je Projekt festschreiben.
- Eine Instanz gründlich prüfen, bevor viele instanziiert werden.

## Fazit

Wiederverwendung entsteht nicht dadurch, einen Baustein in einen Bibliotheksordner zu legen. Sie entsteht dadurch, dass der Baustein einen Vertrag hat, der schmal genug ist, um verstanden zu werden, vollständig genug, um sich darauf zu verlassen, und stabil genug, dass ein zweites Projekt ihn nicht ändern muss.

Die Eigenschaften, die das leisten, sind unspektakulär — ein Bereitschaftsausgang, Zustand, der zur Instanz gehört, definiertes Wiederanlaufverhalten, eine lesbare Version und die Disziplin, einen Baustein zu teilen statt eine Betriebsart anzubauen. Jede ist beim Schreiben billig und über vierhundert Instanzen hinweg teuer nachzurüsten.
