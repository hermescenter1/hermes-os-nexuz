# Alarmperformance-Management für komplexe Industrieanlagen

## Zusammenfassung

Einen Alarmbestand zu rationalisieren ist ein Projekt mit Enddatum. Ihn rationalisiert zu halten ist keines. Der Bestand driftet in eine Richtung, solange ihn nichts misst — weshalb die Anzahl selbst neben die Rate in den Führungsbericht gehört: Eine Summe, die nur steigt, ist ein Governance-Signal und kein Alarmsignal.

Dieser Beitrag behandelt die dauerhafte Hälfte dieses Problems: die Master-Alarmdatenbank als maßgebliche Aufzeichnung, die Messgrößen, die Verfall sichtbar machen, bevor das Bedienpersonal pauschal quittiert, und die Governance, die eine Änderung am Alarmsystem zu einer Entscheidung statt zu einer Bearbeitung macht.

> Ein begleitender Beitrag behandelt das Rationalisierungsprojekt selbst — die Kriterien dafür, was ein Alarm sein darf, die aus Konsequenz und verfügbarer Zeit abgeleitete Priorität und die Ursache-Folge-Unterdrückung. Dieser hier beginnt, wenn jene Arbeit getan ist, und fragt, wie das Ergebnis fünf Jahre Anlagenänderungen übersteht.

## Die Master-Alarmdatenbank

Das folgenreichste Artefakt im Alarmmanagement ist eine Aufzeichnung, die die meisten Anlagen nicht haben: eine maßgebliche Liste jedes projektierten Alarms samt der Begründung dahinter.

Was jeder Eintrag tragen muss, um nützlich zu sein:

| Feld | Warum es existiert |
| --- | --- |
| Messstelle und Beschreibung | Identität |
| Priorität samt Konsequenz + Zeit, die sie ergab | Damit eine spätere Prüfung nachvollziehen statt neu raten kann |
| Die erforderliche Bedienhandlung | Ist dies leer, sollte der Alarm nicht existieren |
| Schwelle, Hysterese, Einschaltverzögerung | Das projektierte Verhalten wie entworfen |
| Einstufung (sicherheitsangerechnet / umweltrelevant / betrieblich) | Bestimmt, welcher Änderungsprozess gilt |
| Unterdrückungs- und Shelving-Regeln | Sonst wird Unterdrückung zu unsichtbarem Erfahrungswissen |
| Freigabevermerk und Datum | Verantwortlichkeit |

Die Datenbank rechtfertigt sich in genau zwei Momenten. Erstens, wenn jemand eine Änderung vorschlägt: Die bestehende Begründung ist sichtbar, also dreht sich die Diskussion darum, ob sie noch gilt, statt bei null zu beginnen. Zweitens, bei einer Ereignisuntersuchung: Die Frage „sollte dieser Alarm das tun, was er getan hat?" hat eine Antwort.

**Die Datenbank muss die Autorität sein, keine Kopie.** Können die Leitsystemprojektierung und die Datenbank voneinander abweichen, tun sie es irgendwann, und die Datenbank wird zu Dokumentation, der niemand traut. Die praktische Disziplin ist periodischer maschineller Abgleich: die laufende Projektierung auslesen, gegen die Datenbank vergleichen und jede Abweichung als entweder undokumentierte Änderung oder veralteten Eintrag behandeln. Beides sind Befunde.

## Kennzahlen ehrlich lesen

Alarmkennzahlen werden breit veröffentlicht und breit fehlgedeutet. Der Fehler liegt nicht in den Kennzahlen, sondern darin, jede einzeln zu lesen.

**Die mittlere Alarmrate** beschreibt die Dauerlast. Ihre Schwäche: Sie mittelt genau die Zeiträume weg, auf die es ankommt. Eine Anlage mit hervorragendem Mittelwert kann bei jeder Störung unbrauchbar sein.

**Spitzenrate und Zeit in der Flut** beschreiben das Verhalten, wenn Aufmerksamkeit am knappsten ist. Das sind die Zahlen, die vorhersagen, ob das System im Ereignis hilft oder behindert — und sie fehlen am häufigsten im Berichtspaket.

**Die Zahl stehender Alarme** — dauerhaft anstehende Alarme — misst, wie viel der Anzeige zur Tapete geworden ist. Ein stehender Alarm teilt nichts mit; er ist entweder ein realer Zustand, den niemand behebt, oder eine falsche Schwelle.

**Die Zahl flatternder Alarme** misst Messrauschen und fehlende Hysterese. Sie konzentriert sich meist auf wenige Messstellen, was sie zur günstigsten handlungsfähigen Kennzahl macht.

**Die Prioritätsverteilung** ist die Integritätsprüfung des gesamten Schemas. Tragen die meisten Alarme die höchste Stufe, hat das Prioritätsfeld aufgehört, Information zu übermitteln, und das System ist stillschweigend auf eine einzige Priorität zurückgefallen.

**Das Quittierverhalten** ist die Kennzahl, die niemand projektiert und jeder projektieren sollte. Pauschales Quittieren — viele Alarme in einer Handlung, wiederholt — ist der direkte Beleg dafür, dass das Bedienpersonal das Unterscheiden aufgegeben hat. Sie misst das Ergebnis, das die anderen Kennzahlen nur vorhersagen.

Die maßgebliche Interpretationsdisziplin:

| Muster | Wahrscheinliche Bedeutung | Falsche Reaktion |
| --- | --- | --- |
| Guter Mittelwert, schlechte Spitze | Flutverhalten unbearbeitet | Den Mittelwert feiern |
| Sinkende Rate, steigende Zahl stehender Alarme | Alarme werden dauerhaft statt behoben | Die Ratenverbesserung berichten |
| Wenig Flattern, viele Fluten unterschiedlicher Messstellen | Folgeausbreitung, kein Rauschen | Hysterese ergänzen |
| Bessere Kennzahlen, mehr Pauschalquittierungen | Menschen kommen zurecht, System nicht besser | Schließen, das Programm habe gewirkt |

Die letzte Zeile ist die wichtige. **Eine Kennzahl kann sich verbessern, weil das Verhalten sich angepasst hat, nicht weil das System besser wurde** — und nur das Querlesen deckt das auf.

## Bad Actors

In nahezu jedem ungepflegten System erzeugen wenige Messstellen einen großen Anteil aller Meldungen. Diese Liste von oben abzuarbeiten ist die ertragreichste verfügbare Tätigkeit, und sie besteht überwiegend aus Mess- und Projektierungsarbeit, nicht aus Philosophie.

Ein tragfähiger Bad-Actor-Zyklus:

1. **Nach Anzahl ranken** über ein definiertes Fenster — lang genug für Repräsentativität, kurz genug für Aktualität.
2. **Jeden einordnen** als Flattern, stehend, Folge von etwas anderem oder tatsächlich häufiger realer Zustand.
3. **Verantwortliche und Abhilfeart zuordnen.** Flattern geht an Messtechnik oder Hysterese; Folgen an die Ursache-Folge-Unterdrückung; ein wirklich häufiger realer Zustand ist ein Verfahrens- oder Instandhaltungsproblem im Alarmkostüm.
4. **Bis zum Abschluss verfolgen** und erneut messen.

Der Governance-Punkt: **Eine Bad-Actor-Liste ohne Verantwortliche und Termine ist ein Bericht, kein Prozess.** Sie wird monatlich neu erzeugt, enthält dieselben Messstellen und verändert nichts.

## Shelving-Governance

Shelving existiert, weil Anlagen zeitweise mit einem bekannt defekten Messgerät weiterlaufen müssen, während die Reparatur organisiert wird. Das Gegenteil zu behaupten führt zu Schlimmerem — auf Projektierungsebene deaktivierten Alarmen oder abgeklemmter Feldverdrahtung, beides unsichtbar.

Shelving ist sicher, wenn vier Eigenschaften gelten:

- **Befristet.** Jede Ausblendung verfällt und kehrt selbsttätig zurück. Die Alternative ist die Ausblendung, die die Erinnerung aller überdauert.
- **Sichtbar.** Eine aktuelle Liste alles derzeit Ausgeblendeten, geprüft bei der Schichtübergabe. Eine unsichtbare Ausblendung ist von einem funktionierenden Alarm nicht unterscheidbar — genau der gefährliche Fall.
- **Autorisiert und dokumentiert.** Wer, was, warum, bis wann.
- **In der Anzahl begrenzt.** Eine steigende Zahl ausgeblendeter Alarme ist selbst eine Kennzahl. Sind zwanzig ausgeblendet, läuft die Anlage mit zwanzig bekannten blinden Flecken — eine Tatsache, die die Leitung sehen sollte.

**Sicherheitsangerechnete Alarme liegen vollständig außerhalb dieses Mechanismus.** Ihre Überbrückung unterliegt dem Änderungsmanagement der Betrachtung, die sie angerechnet hat, nicht einer Bedienfunktion.

## Änderungsmanagement

Der Verfallsmechanismus ist nicht dramatisch. Es ist eine Anlagenänderung, die zwölf Alarme mitbringt, weil das Lieferantenpaket sie enthielt, freigegeben von jemandem ohne Einblick in die Alarmphilosophie.

Drei Kontrollen verhindern das:

**Alarmänderungen sind Teil des Anlagen-MOC, nicht davon getrennt.** Jede Änderung, die einen Alarm ergänzt, entfernt oder umpriorisiert, durchläuft dieselbe Freigabe wie die physische Arbeit.

**Neue Alarme werden vor der Inbetriebnahme rationalisiert, nicht danach.** Am Ende zu rationalisieren bedeutet, dass die Anlage mit einem unrationalisierten Bestand anläuft und der Rückstand am ersten Tag entsteht.

**Lieferantenpakete werden bei Übernahme rationalisiert.** Ein Skid mit zweihundert vorprojektierten Alarmen sind zweihundert Entscheidungen, die jemand anders gegen eine fremde Philosophie getroffen hat. Sie pauschal zu übernehmen ist die größte Einzelquelle der Alarminflation in projektgetriebenen Anlagen.

## Ereignisnachbereitung

Nach jedem bedeutenden Anlagenereignis ist das Verhalten des Alarmsystems während dieses Ereignisses ein Beleg über das Alarmsystem — und wird meist verworfen.

Die wertschöpfende Nachbereitung stellt vier Fragen:

1. **Was war die Erstursache, und hat das System sie klar dargestellt?** War der auslösende Alarm von seinen zweihundert Folgen visuell nicht zu unterscheiden, ist das ein Entwurfsbefund, unabhängig vom Ausgang.
2. **Wie hoch war die Alarmrate während des Ereignisses, und war sie handhabbar?** Gegen die Flutschwelle vergleichen, nicht gegen den Tagesmittelwert.
3. **Welche Alarme meldeten, ohne eine Handlung zu erfordern?** Jeder ist ein Rationalisierungskandidat mit starkem Beleg.
4. **Blieb ein Alarm aus, der hätte melden müssen?** Ausgeblendet, durch eine falsche Bedingung unterdrückt oder nie projektiert.

Diese Befunde in die Master-Alarmdatenbank zurückzuführen verwandelt ein Ereignis in eine Verbesserung. Ohne diese Rückkopplung erzeugt jedes Ereignis einen Bericht und keine Änderung.

## Fehlerbilder

**Die abgedriftete Datenbank.** Projektierung und Aufzeichnung widersprechen sich; niemand weiß, was maßgeblich ist; die Datenbank wird still aufgegeben.

**Kennzahlentheater.** Monatlich berichtete, günstig verlaufende Kennzahlen, während bei jeder Störung pauschal quittiert wird. Die Zahlen wurden besser, weil die Menschen sich angepasst haben.

**Die dauerhafte Ausblendung.** Während einer Instandhaltungskampagne ausgeblendet und nie zurückgesetzt, achtzehn Monate stumm — bis der Zustand eintritt, den sie erfassen sollte.

**Paket-Inflation.** Jedes Projekt bringt einen vorprojektierten Alarmsatz mit, den niemand rationalisiert hat; die anlagenweite Zahl wächst sprunghaft statt schleichend.

**Bad-Actor-Liste ohne Verantwortliche.** Monatlich neu erzeugt, jedes Mal identisch.

**Normalisierte stehende Alarme.** Zwölf dauerhaft anstehende Alarme; das Bedienpersonal liest darüber hinweg; ein dreizehnter fiele nicht auf.

## Ein repräsentatives Szenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel.*

Ein Zementwerk berichtet über zwei Quartale stetig bessere Alarmkennzahlen: mittlere Rate gesunken, Flatteranzahl gesunken. Das Programm gilt als erfolgreich.

Zwei Zahlen fehlten im Paket. Die Zahl stehender Alarme stieg im selben Zeitraum von vier auf neunzehn, und pauschales Quittieren — drei oder mehr Alarme in einer Handlung — nahm während Störungen deutlich zu.

Zusammen gelesen kehrt sich das Bild um. Die mittlere Rate sank teilweise, weil früher flatternde Alarme nun dauerhaft anstehen und deshalb einmal gezählt werden. Die Flatterreduktion war real, konzentrierte sich aber auf Messstellen, die lediglich ausgeblendet statt repariert wurden. Und das Bedienpersonal passte sich an ein unverändertes Flutprofil an, indem es die Liste pauschal leerte.

Das Programm verbesserte die berichteten Kennzahlen, ohne die Lage des Bedienpersonals zu verbessern. Die Diagnose erforderte keine neue Messtechnik — nur das Lesen der Kennzahlen gegeneinander statt einzeln.

## Governance-Struktur

Dauerhafte Alarmperformance braucht eine benannte Verantwortung und ein festes Gremium, und der Grund ist struktureller Art: Alarmentscheidungen queren Betrieb, Verfahrenstechnik, Leittechnik und Instandhaltung — und was vier Funktionen quert, ohne einen Eigentümer zu haben, wird niemandes Sache.

Was das Gremium braucht, um nützlich zu sein:

- Eine **regelmäßige Taktung** — häufig genug, dass Verfall klein bemerkt wird.
- **Die Kennzahlen gemeinsam gelesen**, nicht eine Schlagzeilenzahl.
- **Die Bad-Actor-Liste mit Verantwortlichen und Terminen**, auf Abschluss geprüft statt neu erzeugt.
- **Die Liste ausgeblendeter Alarme**, auf Verfall geprüft.
- **Alle Nachbereitungsbefunde** der Periode.
- **Die Befugnis, vorgeschlagene Alarme abzulehnen** — die Macht, die das Wachstum tatsächlich steuert.

## Empfohlene Vorgehensweise

- Eine maßgebliche Master-Alarmdatenbank führen und maschinell gegen die laufende Projektierung abgleichen.
- Konsequenz, verfügbare Zeit und erforderliche Handlung hinter jeder Priorität dokumentieren.
- Kennzahlen als Satz lesen; nie einen Mittelwert ohne Spitze und stehende Anzahl berichten.
- Das Quittierverhalten als Ergebnisgröße verfolgen.
- Der Bad-Actor-Liste Verantwortliche, Termine und eine Abschlussprüfung geben.
- Shelving befristen, anzeigen und deckeln; sicherheitsangerechnete Alarme davon ausnehmen.
- Alarmänderungen über das Anlagen-MOC führen und Lieferantenpakete bei Übernahme rationalisieren.
- Neue Alarme vor der Inbetriebnahme rationalisieren, nicht danach.
- Nach jedem bedeutenden Ereignis das Alarmverhalten nachbereiten und die Befunde zurückführen.

## Fazit

Ein Alarmsystem verfällt nicht, weil jemand beschließt, es zu verschlechtern. Es verfällt, weil jede einzelne Ergänzung vernünftig ist, jede einzelne Ausblendung vorübergehend und keine einzelne Änderung groß genug, um darüber zu streiten. Das Ergebnis stellt sich allmählich ein und ist nur in der Summe sichtbar.

Genau deshalb ist Performance-Management ein Mess- und Governance-Problem und kein ingenieurtechnisches. Das Engineering geschah bei der Rationalisierung. Was es erhält, sind eine maßgebliche Aufzeichnung, ehrlich gelesene Kennzahlen und jemand mit der Befugnis, zum nächsten Alarm Nein zu sagen.
