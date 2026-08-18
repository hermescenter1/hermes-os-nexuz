# Alarmmanagement: Von der Alarmflut zum handlungsrelevanten Signal

## Zusammenfassung

Ein Alarm existiert aus genau einem Grund: um dem Bedienpersonal mitzuteilen, dass eine bestimmte Handlung innerhalb einer bestimmten Zeit erforderlich ist, um eine bestimmte Konsequenz zu vermeiden. Jeder projektierte Alarm, der diesen Test nicht besteht, entwertet diejenigen, die ihn bestehen — denn die Aufmerksamkeit des Bedienpersonals ist eine feste Größe, die auf eine wachsende Zahl von Ansprüchen aufgeteilt wird.

Dieser Beitrag behandelt Alarmrationalisierung als Ingenieuraufgabe mit definierten Eingangsgrößen und definiertem Ergebnis — nicht als periodische Bereinigung der Alarmdatenbank.

## Warum das relevant ist

Das charakteristische Versagen ist nicht der fehlende Alarm. Es ist der Alarm, der korrekt und rechtzeitig ausgelöst hat — in eine Anzeige hinein, die bereits zweihundert unquittierte Einträge trug, und in der er vom Rauschen nicht zu unterscheiden war.

Alarmsysteme verfallen in eine vorhersagbare Richtung. Jede Anlagenänderung fügt Alarme hinzu; kaum eine entfernt welche. Einen hinzuzufügen ist eine Fünf-Minuten-Projektierung, die niemand hinterfragt. Einen zu entfernen verlangt, dass jemand schriftlich erklärt, ein Zustand brauche keine Aufmerksamkeit des Bedienpersonals — und diese Aussage verantwortet. Diese Asymmetrie ist strukturell; Alarmzahlen steigen daher ausschließlich, solange kein bewusster Prozess dagegenhält.

Die Folge ist messbar, lange bevor sie gefährlich wird: Das Bedienpersonal quittiert pauschal, behandelt bestimmte Alarme als Hintergrund und baut private mentale Filter auf, die keine Anweisung erfasst und keine Schichtübergabe weitergibt.

## Ingenieurtechnischer Kontext

ISA-18.2 liefert den anerkannten Rahmen für den Alarmlebenszyklus — Philosophie, Identifikation, Rationalisierung, Entwurf, Umsetzung, Betrieb, Instandhaltung, Überwachung und Änderungsmanagement — und die zugehörigen Branchenleitfäden liefern Leistungskennwerte. Der eigentliche Beitrag der Norm ist keine bestimmte Zahl, sondern das Beharren darauf, dass ein Alarmsystem überhaupt einen Lebenszyklus hat: mit einer dokumentierten Philosophie am Anfang und Messung am Ende.

Der ingenieurtechnische Gehalt liegt an zwei Stellen, für die die Norm den Rahmen setzt, die Arbeit aber nicht abnimmt: der Entscheidung, was ein Alarm sein darf, und der Entscheidung über dessen Priorität.

## Ingenieurtechnische Grundprinzipien

### Ein Alarm verlangt eine Handlung, die nicht automatisch erfolgt

Das ist der primäre Filter, und wer ihn ehrlich anwendet, entfernt einen großen Teil der meisten Alarmbestände. Bewältigt die Leittechnik den Zustand bereits, hat das Bedienpersonal keine Handlung, und die Meldung teilt lediglich mit, dass etwas gerade erledigt wird. Das ist ein Ereignis oder eine Statusanzeige — legitime Information, die auf ein Prozessbild oder in ein Protokoll gehört, nicht in die Alarmliste.

Drei Kategorien scheitern regelmäßig an diesem Test:

- **Alarme sowohl auf einen Zustand als auch auf dessen automatische Reaktion.** Die Pumpe fällt aus, und es kommen ein Alarm für niedrigen Druck, ein Alarm für die Pumpenstörung und ein Alarm für den Anlauf der Reservepumpe. Ein Ereignis, drei Ansprüche auf Aufmerksamkeit — und das Bedienpersonal muss die Kausalkette aus drei unsortierten Einträgen rekonstruieren.
- **Alarme, die eine bereits sichtbare Messgröße wiederholen.** Steht die Füllstandsanzeige vor dem Bedienpersonal, ist ein Alarm „Füllstand hoch" unterhalb des Handlungspunkts eine Dopplung.
- **Alarme ohne mögliche Reaktion.** „Verbindung zum Remote-Historian verloren" ist ein Instandhaltungsauftrag, keine Bedienhandlung.

### Priorität leitet sich aus Konsequenz und verfügbarer Zeit ab

Priorität misst nicht abstrakte Wichtigkeit. Sie ist eine Reihenfolgeanweisung: Sie sagt, was zuerst zu tun ist, wenn zwei Dinge gleichzeitig eintreffen. Damit ist sie eine Funktion zweier Größen — der Schwere der Konsequenz bei Untätigkeit und der bis dahin verfügbaren Zeit.

| Zeit bis zur Konsequenz | Schwere Konsequenz | Mittlere Konsequenz | Geringe Konsequenz |
| --- | --- | --- | --- |
| Minuten | Höchste | Hoch | Mittel |
| Zehn Minuten und mehr | Hoch | Mittel | Niedrig |
| Stunden | Mittel | Niedrig | Kein Alarm — protokollieren |

Ein Prioritätsschema ohne Zeitachse fällt auf eine reine Schwereeinstufung zusammen, und eine Schwereeinstufung kann nicht sagen, welcher von zwei gleich schweren Alarmen zuerst zu bearbeiten ist. Genau bei dieser Entscheidung braucht das Bedienpersonal aber Unterstützung.

Die Verteilung wiegt so schwer wie die Einzelzuordnung. Sind die meisten Alarme auf die höchste Stufe gesetzt, trägt das Prioritätsfeld keine Information mehr, und das System ist stillschweigend auf eine einzige Priorität zurückgefallen.

### Unterdrückung muss bedingt und sichtbar sein

Unterdrückung ist nicht das Gegenteil von Alarmmanagement; richtig gemacht ist sie eines seiner wirksamsten Werkzeuge. Der Alarm „Druck niedrig" auf der Druckseite einer Pumpe ist bei laufender Pumpe sinnvoll und bei stehender Pumpe sinnlos. Ihn im Stillstand zu unterdrücken beseitigt eine garantierte Störmeldung, ohne Information zu beseitigen.

Zwei Bedingungen machen Unterdrückung sicher:

- **Sie ist zustandsbasiert, nicht manuell.** Die unterdrückende Bedingung leitet sich aus dem Anlagenzustand ab, greift also selbsttätig und gibt selbsttätig wieder frei. Ein manuell ausgeblendeter Alarm, den niemand zurückholt, ist der Weg, auf dem ein realer Alarm monatelang verschwindet.
- **Der unterdrückte Zustand ist sichtbar.** Das Bedienpersonal muss erkennen können, welcher Alarm derzeit unterdrückt ist und warum. Unsichtbare Unterdrückung ist von einem defekten Alarm nicht zu unterscheiden.

## Vorgehensweise

Die Rationalisierung eines bestehenden Alarmbestands ist ein abgegrenztes, wiederholbares Verfahren:

1. **Zuerst den Ist-Zustand messen.** Mehrere Wochen Alarmhistorie auswerten und ermitteln: mittlere Alarmrate je Bedienplatz, Spitzenrate bei Störungen, Rangliste der häufigsten Alarme, Anzahl flatternder Alarme und Anzahl stehender Alarme — solcher, die seit Tagen ununterbrochen anstehen.
2. **Die Spitze der Häufigkeitsliste angehen.** In fast jedem nicht rationalisierten System erzeugen wenige Messstellen die Mehrzahl aller Meldungen. Die ersten zehn zu beheben ist meist die größte verfügbare Einzelverbesserung — und überwiegend Messtechnik- und Hysteresearbeit, keine Philosophie.
3. **Flattern mit Hysterese und Verzögerung beseitigen.** Ein Alarm, der seine Schwelle wiederholt überschreitet, misst Rauschen und keinen Prozesszustand. Hysterese adressiert Amplitudenrauschen; eine Einschaltverzögerung adressiert kurze, echte Ausschläge ohne Handlungsbedarf.
4. **Stehende Alarme auflösen.** Ein seit einer Woche anstehender Alarm teilt nichts mehr mit. Entweder der Zustand ist real und muss behoben werden, oder die Schwelle ist falsch. Beides sind Handlungen; „stehen lassen" ist keine.
5. **Den Rest an den Kriterien rationalisieren** — Handlung, Konsequenz, Zeit — mit Betrieb, Verfahrenstechnik und Leittechnik am selben Tisch. Die Begründung je Alarm dokumentieren, denn erst dieses Protokoll macht die nächste Überprüfung zu einer Fortschreibung statt zu einer Wiederholung.
6. **Erneut messen.** Rationalisierung ohne Nachmessung ist eine Meinung.

## Kenngrößen

| Kenngröße | Ingenieurtechnische Bedeutung | Was sie offenlegt |
| --- | --- | --- |
| Mittlere Alarmrate | Dauerlast des Bedienpersonals | Ob die Grundlast überhaupt handhabbar ist |
| Spitzenrate bei Störung | Last genau dann, wenn Aufmerksamkeit knapp ist | Ob das System im Ereignis hilft oder flutet |
| Anzahl flatternder Alarme | Wiederholt wechselnde Alarme | Messrauschen oder fehlende Hysterese |
| Anzahl stehender Alarme | Dauerhaft anstehende Alarme | Alarme, die zur Tapete geworden sind |
| Prioritätsverteilung | Streuung über die Stufen | Ob Priorität noch Information trägt |
| Dauer der Alarmflut | Zeit oberhalb einer handhabbaren Rate | Das Fenster geringster Nutzbarkeit |

## Fehlerbilder

**Die Alarmflut im entscheidenden Ereignis.** Eine Abschaltung kaskadiert, und mehrere hundert Alarme melden innerhalb einer Minute. Jeder ist technisch korrekt — sie sind die realen Folgen der Abschaltung. Gemeinsam verbergen sie die Erstursache, und genau die ist die einzige benötigte Information. Für dieses Fehlerbild existieren Erstwerterfassung und Ursache-Folge-Unterdrückung.

**Der Alarm, dem niemand glaubt.** Eine bei der Inbetriebnahme konservativ gesetzte Schwelle meldet mehrfach pro Schicht, ohne dass je etwas falsch wäre. Das Bedienpersonal lernt, dass er bedeutungslos ist. Er bleibt projektiert, zählt in der Statistik mit, genügt einem Audit — und teilt nichts mit.

**Die korrelierte Flut aus einer Wurzelursache.** Ein Ausfall der Instrumentenluft meldet jede Stellungsabweichung jedes Ventils der Anlage. Alles korrekt; nichts informativ. Die ingenieurtechnische Antwort ist, die gemeinsame Ursache zu alarmieren und deren bekannte Folgen zu unterdrücken.

**Unterdrückung, die ihre Bedingung überlebt.** Ein während einer Instandhaltung ausgeblendeter Alarm, nie zurückgesetzt, achtzehn Monate stumm — bis der Zustand, den er erfassen sollte, tatsächlich eintritt. Deshalb braucht Ausblenden ein Verfallsdatum und eine sichtbare Liste.

## Diagnose: eine Alarmhistorie lesen

Eine Alarmhistorie ist Beweismaterial und wird wie jeder andere Diagnosedatensatz gelesen.

**Symptom:** Das Bedienpersonal meldet, das System sei „bei Störungen unbrauchbar".

**Zu erhebende Belege:**

- Alarmrate pro Minute über das Störungsfenster
- Häufigkeitsrangliste innerhalb dieses Fensters
- der erste Alarm der Sequenz und sein Zeitstempel relativ zum Prozessereignis
- Anzahl unterschiedlicher Messstellen gegenüber Anzahl Wiederholungen derselben
- Quittierverhalten: einzeln oder pauschal

**Schlussfolgerung:** Wiederholen sich wenige Messstellen vielfach, liegt Flattern vor — behoben mit Hysterese und Verzögerung. Melden viele unterschiedliche Messstellen je einmal, liegt Folgeausbreitung vor — behoben mit Ursache-Folge-Unterdrückung. Trifft keines zu — viele unterschiedliche Messstellen ohne gemeinsame Ursache —, dann enthält der Alarmbestand tatsächlich zu viele Alarme, und nur Rationalisierung hilft. Pauschales Quittieren ist das Anzeichen dafür, dass das Bedienpersonal das Unterscheiden bereits aufgegeben hat.

Die Unterscheidung zählt, weil diese drei Befunde drei völlig verschiedene Abhilfen verlangen — und die falsche bringt keine Verbesserung, verbraucht aber das Budget für die richtige.

## Industrielles Beispiel

*Das Folgende ist ein illustratives ingenieurtechnisches Szenario, keine Darstellung eines konkreten Projekts.*

Ein Wasserwerk betreibt vier Filterstraßen mit jeweils eigener Rückspülsteuerung. Jede Straße meldet einen Alarm „Differenzdruck hoch", wenn sich ihr Filter zusetzt — die normale, erwartete Anzeige, dass eine Rückspülung ansteht.

Die Rückspülung läuft automatisch. Der Alarm verlangt im Normalbetrieb also keine Bedienhandlung und meldet sich auf jeder Straße mehrmals täglich. Über eine Schicht wird er zum Hintergrund.

Der rationalisierte Entwurf trennt zwei tatsächlich verschiedene Zustände. Das Erreichen des Rückspül-Sollwerts ist ein Status, kein Alarm: Die Sequenz erledigt das, und es gehört ins Prozessbild. Ein weiterhin hoher Differenzdruck *nach* abgeschlossener Rückspülung ist dagegen ein Alarm: Die automatische Reaktion ist fehlgeschlagen, eine Bedienhandlung ist erforderlich, und die Konsequenz — eine nicht verfügbare Straße, verringerte Aufbereitungskapazität — ist real.

Die Alarmzahl sinkt deutlich, und der verbleibende Alarm trägt eine Information, die der ursprüngliche nie hatte: nicht „der Filter ist verschmutzt", was normal ist, sondern „die Reaktion der Anlage auf einen verschmutzten Filter hat nicht funktioniert", was es nicht ist.

## Abwägungen

| Wahl | Gewinn | Preis |
| --- | --- | --- |
| Konsequente Rationalisierung | Ein nutzbares, glaubwürdiges Alarmsystem | Verlangt dokumentierte, verantwortete Entscheidungen |
| Ursache-Folge-Unterdrückung | Trocknet die Flut an der Quelle aus | Erfordert ein gepflegtes Kausalmodell |
| Lange Einschaltverzögerung | Beseitigt transiente Störmeldungen | Verzögert ein echtes Ereignis um denselben Betrag |
| Breite Hysterese | Stoppt Flattern | Alarm geht später als der Zustand |
| Mehr Prioritätsstufen | Feinere Unterscheidung | Mehr als wenige Stufen sind nicht zuverlässig nutzbar |

## Häufige Entwurfsfehler

- **Einen Alarm projektieren, weil die Messstelle existiert.** Verfügbarkeit ist kein Grund.
- **Nur nach Schwere priorisieren** — und damit ein Schema erzeugen, das zwei gleichzeitige schwere Alarme nicht ordnen kann.
- **Einmal rationalisieren und nie wieder messen.** Alarmzahlen wachsen nur; ohne periodische Messung kehrt das System still in seinen alten Zustand zurück.
- **Unterdrückung als Unwort behandeln.** Die Alternative zu technischer Unterdrückung ist nicht mehr Information, sondern manuelles, unsichtbares und uneinheitliches Filtern durch das Bedienpersonal.
- **Das Bedienpersonal von der Rationalisierung ausschließen.** Es weiß bereits, welche Alarme bedeutungslos sind — die günstigste verfügbare Eingangsgröße.

## Sicherheitstechnische Hinweise

Alarme, die in einer Risikobetrachtung als Schutzebene angerechnet sind, bilden eine eigene Kategorie und dürfen nicht wie betriebliche Bequemlichkeiten rationalisiert werden. Wo ein Alarm als unabhängige Schutzebene beansprucht wird, gehören seine Unabhängigkeit, seine Reaktionszeit, die verlangte Bedienhandlung und deren Durchführbarkeit in der verfügbaren Zeit zu dem, was angerechnet wurde. Schwelle, Priorität oder Unterdrückungslogik zu ändern ändert diesen Anspruch.

Die praktische Regel: Jeder Alarm, der in einer Sicherheitsbetrachtung auftaucht, wird über denselben Änderungsprozess geändert, der für diese Betrachtung gilt — nicht allein über die Alarmdatenbank.

## Empfohlene Vorgehensweise

- Vor der Rationalisierung eine Alarmphilosophie schreiben und als Entscheidungsmaßstab verwenden, nicht als nachträglich erstelltes Dokument.
- Für jeden Alarm eine definierte Bedienhandlung, eine definierte Konsequenz und eine definierte verfügbare Zeit verlangen.
- Priorität aus Konsequenz und Zeit ableiten und die entstehende Verteilung prüfen.
- Zuerst die häufigsten Alarme beheben; der Effekt ist überproportional.
- Unterdrückung zustandsbasiert und sichtbar gestalten; manuelles Ausblenden mit Verfallsdatum versehen.
- Die gemeinsame Ursache alarmieren und deren bekannte Folgen unterdrücken.
- Alarmleistung fortlaufend messen, nicht nur nach einem Rationalisierungsprojekt.
- Alarme mit Anrechnung in einer Sicherheitsbetrachtung über deren Änderungsprozess führen.

## Fazit

Alarmmanagement wird häufig als Projektierungshygiene dargestellt. Treffender ist es die Auslegung eines Kommunikationskanals mit harter Bandbreitengrenze — der Aufmerksamkeit des Bedienpersonals —, in dem jeder zusätzliche Alarm Kapazität von den verbleibenden abzieht.

Diese Sichtweise macht die Disziplin offensichtlich: Ein Alarm verdient seinen Platz, indem er eine Handlung, eine Konsequenz und eine Frist benennt. Alles andere ist Information — und Information gehört dorthin, wo man sie bei Bedarf nachschlägt, nicht dorthin, wo sie mit dem konkurriert, worauf gehandelt werden muss.
