# Verriegelungen, Freigaben und Auslösungen entwerfen

## Zusammenfassung

Drei unterschiedliche Mechanismen bekommen routinemäßig denselben Namen, und die Verwechslung hat betriebliche Folgen. Eine **Freigabe** ist eine Bedingung, die erfüllt sein muss, bevor ein Betriebsmittel anlaufen darf. Eine **Verriegelung** ist eine Bedingung, die, solange sie ansteht, einen sicheren Zustand erzwingt oder hält. Eine **Auslösung** ist eine Schutzhandlung als Reaktion auf eine bereits eingetretene Bedingung.

Sie unterscheiden sich darin, wann sie ausgewertet werden, was sie mit laufenden Betriebsmitteln tun und — vor allem — was zu ihrer Aufhebung nötig ist. Sie als einen undifferenzierten Haufen Bedingungen zu entwerfen erzeugt die vertrauteste Beschwerde der Automatisierungstechnik: Betriebsmittel, die nicht anlaufen, und niemand kann sagen warum.

## Warum die Unterscheidung betrieblich ist, nicht akademisch

Man betrachte eine Pumpe, die nicht anläuft. Das Bedienpersonal muss wissen, in welcher von drei Lagen es sich befindet:

- **Eine Freigabe fehlt.** Vor dem Anlauf ist etwas zu tun — ein Ventil öffnen, AUTOMATIK wählen, eine nachgelagerte Bedingung beseitigen. Die Anlage ist gesund; eine Voraussetzung ist nicht erfüllt.
- **Eine Verriegelung steht an.** Eine Bedingung verbietet derzeit den Betrieb. Der Anlauf ist nicht bloß blockiert; er wäre falsch.
- **Eine Auslösung ist erfolgt und nicht quittiert.** Etwas ist passiert, eine Schutzhandlung wurde ausgeführt, und das Betriebsmittel bleibt bis zur Untersuchung verriegelt.

Diese drei verlangen drei verschiedene Reaktionen von drei verschiedenen Personen. Eine einzelne Anzeige „kann nicht starten" zwingt das Bedienpersonal, jedes Mal eine Fachkraft anzurufen, um herauszufinden, welche der drei vorliegt. Die Unterscheidung kostet im Entwurf nichts und ist nachträglich kaum einzubauen.

## Die Klassifizierung

| Eigenschaft | Freigabe | Verriegelung | Auslösung |
| --- | --- | --- | --- |
| Ausgewertet | Vor dem Anlauf | Fortlaufend | Beim Ereignis |
| Wirkung auf stehendes Betriebsmittel | Verhindert Anlauf | Verhindert Anlauf | Verhindert Anlauf bis Quittierung |
| Wirkung auf laufendes Betriebsmittel | Keine | Erzwingt sicheren Zustand | Erzwingt sicheren Zustand |
| Aufgehoben, wenn | Bedingung erfüllt | Bedingung weg | Bedingung weg UND quittiert |
| Gespeichert | Nein | Nein | Ja |
| Typischer Ursprung | Prozessbereitschaft | Prozess- oder Anlagenschutz | Schutzgerät |

Am schwersten wiegt die dritte Zeile. **Eine Freigabe, die laufende Betriebsmittel stoppt, ist keine Freigabe, sondern eine falsch klassifizierte Verriegelung.** Diese Unterscheidung verschwimmt häufig, und das Ergebnis sind Betriebsmittel, die wegen einer Bedingung, die nur den Anlauf regeln sollte, mitten im Betrieb abschalten.

## Erstwerterfassung

Wenn mehrere Bedingungen gleichzeitig wegfallen — was bei einer kaskadierenden Auslösung geschieht —, ist die nützliche Information, welche die *erste* war. Alles danach ist Folge.

Ohne Erstwerterfassung sieht das Bedienpersonal eine Liste anstehender Bedingungen und muss raten. Mit ihr zeigt die Anzeige auslösende Ursache und Folgen getrennt, und die Untersuchung beginnt an der richtigen Stelle.

Das Umsetzungsprinzip ist schlicht: **den Zustand aller Bedingungen im Moment der Auslösung erfassen** und diese Momentaufnahme bis zur Quittierung speichern. „Welche steht jetzt an" im Nachhinein auszuwerten ist nicht dasselbe, denn dann stehen die Folgen ebenfalls an.

Der Zyklus-Vorbehalt zählt hier: Bedingungen, die sich innerhalb desselben Zyklus ändern, sind für zyklische Logik nicht unterscheidbar. Wo echte Auflösung unterhalb der Zykluszeit nötig ist — kaskadierender elektrischer Schutz ist der übliche Fall —, muss die Reihenfolge aus zeitgestempelten Ereignissen der Geräte selbst kommen und nicht aus dem Zyklus der Steuerung.

## Quittierlogik

Bei der Quittierung verstecken sich gefährliche Entwürfe, und es gelten drei Regeln.

**Eine Auslösung verlangt eine ausdrückliche Quittierung, und die Bedingung muss zuvor weg sein.** Automatisches Rücksetzen beim Wegfall der Bedingung bedeutet, dass eine Anlage nach einer Schutzhandlung wieder anlaufen kann, die niemand untersucht hat. Auch die Reihenfolge zählt: Eine Quittierung bei noch anstehender Bedingung darf das Betriebsmittel nicht scharfschalten, sodass es beim Wegfall sofort anläuft.

**Quittieren ist nicht Starten.** Das sind getrennte Handlungen und getrennte Absichten. Sie zu verbinden bedeutet, dass die Bestätigung einer Störung zugleich den Betrieb kommandiert — das Verhalten, das bei der Fehlersuche niemand will und das am Ende doch jeder versehentlich umsetzt.

**Quittieren ist flankengesteuert, niemals zustandsgesteuert.** Eine gehaltene Quittierung — ein klemmender Taster, ein hängender HMI-Befehl, ein gesetzt gebliebenes Bit — wird zur dauerhaften Selbstquittierung, und die Speicherung der Auslösung existiert faktisch nicht mehr. Der Fehler ist still: Alles funktioniert, und der Schutz ist schlicht weg.

## Entwurf von Freigaben

Zwei Eigenschaften machen Freigaben nutzbar.

**Jede Bedingung ist einzeln sichtbar.** „Anlauf freigegeben" als einzelnes Bit genügt nicht. Die Bedienoberfläche muss zeigen, welche Bedingung nicht erfüllt ist. In KOP ist das unmittelbar; in Text erfordert es, jede Bedingung einer benannten Variablen zuzuweisen — deshalb existiert diese Konvention.

**Freigaben sind nach Zuständigkeit gruppiert.** Ein durch eine Prozessbedingung blockierter Anlauf ist eine Betriebsangelegenheit; ein durch eine Anlagenbedingung blockierter ist eine Instandhaltungsangelegenheit. Die Gruppierung erlaubt der Oberfläche mitzuteilen, wen man rufen muss — oft die einzige Entscheidung, die tatsächlich ansteht.

## Entwurf von Verriegelungen

**Verriegelungen werden fortlaufend ausgewertet und wirken auf laufende Betriebsmittel.** Das unterscheidet sie und erlegt eine Pflicht auf: Eine Verriegelung, die einen Stopp erzwingt, muss eine entsprechende Anzeige erzeugen. Ein Betriebsmittel, das ohne Erklärung stehenbleibt, ist von einer Störung nicht unterscheidbar, und die nächste Handlung des Bedienpersonals wird ein erneuter Startversuch sein.

**Der sichere Zustand ist je Betriebsmittel zu definieren, nicht anzunehmen.** „Sicher" ist nicht allgemein „aus". Der sichere Zustand einer Kühlpumpe bei Übertemperatur ist Laufen, nicht Stillstand. Ein Förderer, der in eine verstopfte Schurre fördert, sollte stoppen; der Förderer, der Material daraus *abtransportiert*, wahrscheinlich nicht. Den sicheren Zustand je Betriebsmittel aufzuschreiben gehört zum Verriegelungsentwurf — und ihn zu überspringen ist der Weg, auf dem eine Verriegelung eine Lage verschlimmert.

**Verriegelungs- und Freigabebedingungen überschneiden sich, sind aber nicht identisch**, und die Überschneidung gehört ausdrücklich benannt. Eine Bedingung, die sowohl den Anlauf verhindert als auch laufende Betriebsmittel stoppt, ist berechtigt beides — sie wird aber als Verriegelung klassifiziert, weil das stärkere Verhalten maßgebt.

## Überbrückung

Überbrückung existiert, weil Anlagen manchmal mit einem defekten Sensor weiterlaufen müssen, während die Reparatur organisiert wird. Das Gegenteil zu behaupten erzeugt unautorisierte Überbrückungen durch Abklemmen von Feldverdrahtung — in jeder Hinsicht schlechter.

Disziplinierte Überbrückung hat vier Eigenschaften:

1. **Autorisiert.** Der Zugriff ist geregelt, und wer was überbrücken darf, ist vorab festgelegt statt im Ereignis ausgehandelt.
2. **Sichtbar.** Jede aktive Überbrückung erscheint auf einer Bedienanzeige. Eine unsichtbare Überbrückung ist von einer funktionierenden Verriegelung nicht unterscheidbar — genau der gefährliche Fall.
3. **Zeitlich begrenzt.** Überbrückungen verfallen oder werden erneut bestätigt. Die Alternative ist die Überbrückung, die die Erinnerung aller überdauert.
4. **Dokumentiert.** Wer, was, wann, warum — denn danach wird immer gefragt.

Sicherheitsgerichtete Funktionen sind eine gänzlich eigene Angelegenheit: Ihre Überbrückung unterliegt den Normen zur funktionalen Sicherheit der Branche und dem Änderungsmanagement der Anlage und ist nie eine in der Steuerungsebene umgesetzte Bedienbequemlichkeit.

## Fehlerbilder

**Falsch klassifizierte Freigabe.** Eine Anlaufbedingung, als fortlaufende Verriegelung verdrahtet, stoppt laufende Betriebsmittel bei einem kurzen Aussetzer. Die Anlage erlebt unerklärte Abschaltungen, und die Logik ist technisch korrekt.

**Selbstquittierende Auslösung.** Der Schutz greift, die Bedingung fällt weg, die Anlage läuft wieder an, niemand untersucht. Der zugrundeliegende Fehler besteht fort, bis er Schaden anrichtet.

**Gehaltene Quittierung.** Die Speicherung ist dauerhaft und still ausgehebelt. Der Schutz wirkt vorhanden und ist es nicht.

**Keine Erstwerterfassung.** Jede Auslösung erscheint als Folgenliste, und jede Untersuchung beginnt damit, eine Reihenfolge aus einer ungeordneten Liste zu rekonstruieren.

**Unsichtbare Überbrückung.** In einer Nachtschicht gesetzt und vergessen. Die Verriegelung wirkt monatelang intakt.

**Undefinierter sicherer Zustand.** Eine Verriegelung stoppt bei Übertemperatur die Kühlpumpe, weil „Stopp" als sicher angenommen wurde.

**Verriegelung in der falschen Ebene.** Eine in einer Risikobetrachtung als Schutz angerechnete Bedingung, umgesetzt im Standardleitsystem, wo sie die vorausgesetzte Unabhängigkeit nicht besitzt.

## Ein durchgerechnetes Beispiel

*Das Folgende ist ein illustratives ingenieurtechnisches Szenario.*

Ein Förderer wirft in einen Brecher ab. Die Entwurfsbedingungen:

- **Freigabe:** Brecher auf Drehzahl. Der Förderer darf einen stehenden Brecher nicht beschicken. Steht der Brecher, soll auch der Förderer stoppen — das ist also nicht rein eine Freigabe, und die Klassifizierung muss entschieden statt vorausgesetzt werden.
- **Verriegelung:** Schurrenverstopfung erkannt. Solange sie ansteht, darf der Förderer nicht laufen — er würde die Verstopfung verschlimmern. Sicherer Zustand: Stillstand.
- **Verriegelung:** Brecher steht, während der Förderer läuft. Sicherer Zustand: Förderer stoppt, denn einen stehenden Brecher weiter zu beschicken ist genau der Fehlerfall.
- **Auslösung:** Überlast des Förderantriebs. Gespeichert. Verlangt Wegfall der Bedingung und eine bewusste Quittierung, denn eine Überlast weist auf etwas hin, das vor dem Wiederanlauf betrachtet werden muss.
- **Freigabe (keine Verriegelung):** Vor-Ort-Trennschalter in Fernstellung. Wird er bei laufendem Förderer auf Ort geschaltet, verliert der Antrieb ohnehin die Kommandohoheit — die Logik muss das aber erkennen und melden, statt einen Antrieb weiter zu kommandieren, den sie nicht mehr steuert.

Man beachte, was die Klassifizierung für die Bedienoberfläche entscheidet: Drei dieser fünf erzeugen eine andere Meldung und eine andere nächste Handlung. Sie zu „Förderer nicht verfügbar" zusammenzufassen verwirft all das.

## Hinweise zur Inbetriebnahme

- **Jede Verriegelung durch Herstellen ihrer Bedingung prüfen**, nicht durch Steuern des Bits. Steuern beweist die Logik; das Herstellen der Bedingung beweist die ganze Kette einschließlich Sensor und Verdrahtung.
- **Die Erstwerterfassung mit einer echten Kaskade prüfen**, nicht mit einer einzelnen simulierten Bedingung. Der Mechanismus bewährt sich erst, wenn mehrere Bedingungen gemeinsam eintreffen.
- **Das Quittierverhalten ausdrücklich bestätigen**: Eine Quittierung bei anstehender Bedingung darf nicht scharfschalten.
- **Den sicheren Zustand jeder Verriegelung gegen den Prozess prüfen**, nicht gegen die Annahme, Stillstand sei immer sicher.
- **Bei der Übergabe keine Überbrückung aktiv lassen** und im Test bestätigen, dass die Überbrückungsanzeige korrekt arbeitet.

## Sicherheitstechnische Hinweise

Verriegelungen, die in einer Risikobetrachtung als Schutzebene angerechnet sind, gehören in die Ebene, die die Betrachtung vorausgesetzt hat, und werden nach den Normen zur funktionalen Sicherheit der Branche projektiert — IEC 61508 als generische Grundlage, IEC 61511 für die Prozessindustrie und die Maschinensicherheitsnormen im Maschinenbau. Ihre Unabhängigkeit vom Basisprozessleitsystem ist normalerweise Teil des Angerechneten, und sie in derselben Steuerung, auf derselben Peripherie und an derselben Versorgung umzusetzen hebt diese Unabhängigkeit auf — unabhängig davon, ob die Logik korrekt ist.

Zwei praktische Folgen: Die Einstufung jeder Verriegelung als sicherheitsangerechnet oder betrieblich gehört dokumentiert und in den Entwurfsunterlagen sichtbar; und jede Änderung an einer sicherheitsangerechneten Verriegelung — einschließlich ihrer Überbrückungsregelung und ihres Quittierverhaltens — läuft über das Änderungsmanagement der Betrachtung, nicht über eine gewöhnliche Softwareänderung.

## Empfohlene Vorgehensweise

- Jede Bedingung als Freigabe, Verriegelung oder Auslösung klassifizieren und die Einstufung dokumentieren.
- Jede Bedingung einzeln sichtbar machen, nicht nur das verknüpfte Ergebnis.
- Den Erstwert im Moment der Auslösung erfassen und bis zur Quittierung speichern.
- Für das Verlassen einer Auslösung Wegfall der Bedingung plus bewusste, flankengesteuerte Quittierung verlangen.
- Quittieren und Starten als getrennte Bedienhandlungen führen.
- Den sicheren Zustand je Betriebsmittel definieren; nie annehmen, „aus" sei sicher.
- Jede Überbrückung autorisiert, sichtbar, befristet und dokumentiert ausführen.
- Sicherheitsangerechnete Verriegelungen in der Ebene belassen, auf deren Unabhängigkeit sie angerechnet wurden.
- Verriegelungen durch Herstellen ihrer Bedingungen prüfen, nicht durch Steuern von Bits.

## Fazit

Die Bedingungsebene ist der Ort, an dem ein Steuerungssystem sein eigenes Urteil an die Menschen weitergibt, die es betreiben. Als drei getrennte Mechanismen entworfen — mit einzeln sichtbaren Bedingungen, Erstwerterfassung und disziplinierter Quittierung — beantwortet sie „warum kann ich das nicht starten" in Sekunden, an der Bedienoberfläche, ohne Telefonat.

Als ein undifferenzierter Bedingungssatz entworfen erzeugt sie das genaue Gegenteil — und der Unterschied entscheidet sich zur Entwurfszeit, in einer Klassifizierung, die nichts kostet und nachträglich kaum zu ergänzen ist.
