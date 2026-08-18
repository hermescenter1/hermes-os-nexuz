# Selektivität und Schutzkoordination

## Zusammenfassung

Die Schutzkoordination hat ein Ziel, das sich leicht formulieren und schwer erreichen lässt: **Tritt ein Fehler auf, soll nur das unmittelbar vorgelagerte Gerät auslösen.** Alles Übrige in der Anlage soll weiterlaufen.

Die Schwierigkeit liegt darin, dass die drei Eigenschaften, die von einem Schutzkonzept verlangt werden, gegeneinander wirken. Schnelles Abschalten begrenzt Schäden. Kleine Fehler zu erkennen verlangt niedrige Ansprechwerte. Dem nachgelagerten Gerät den Vortritt zu lassen verlangt, dass das vorgelagerte wartet. **Schnelligkeit, Empfindlichkeit und Selektivität lassen sich an derselben Stelle im Netz nicht gemeinsam maximieren**, und eine Selektivitätsbetrachtung ist im Kern die Dokumentation darüber, wo welcher Kompromiss geschlossen wurde und warum.

> Dieser Beitrag verwendet das Ergebnis des Begleitbeitrags zur Kurzschlussstromberechnung. Er setzt voraus, dass Maximal- und Minimalfall vorliegen und dass die Unterscheidung zwischen erwartetem Kurzschlussstrom, Ausschaltvermögen, Einschaltvermögen und Kurzzeitstromfestigkeit bereits geklärt ist.

**Sicherheitshinweis.** Einstellungsänderungen, Prüfungen mit Einspeisung und Verriegelungsnachweise erfolgen an Betriebsmitteln mit lebensgefährlichen Energien. Freischalten, Sichern gegen Wiedereinschalten, Feststellen der Spannungsfreiheit, ein vorbereiteter Prüfplan und befähigtes Personal gelten durchgängig. Nichts hier ist eine Anleitung zum Arbeiten unter Spannung.

## Selektivität und Backup-Schutz sind verschiedene Ziele

Beide werden häufig behandelt, als wären sie dasselbe Thema. In der Absicht sind sie gegensätzlich, und ihre Vermengung erzeugt Konzepte, die keines von beiden erfüllen.

**Selektivität** bedeutet, dass das nachgelagerte Gerät den Fehler abschaltet und das vorgelagerte gar nicht auslöst. Damit bleibt die Versorgung alles Übrigen an der vorgelagerten Schiene erhalten.

**Backup-Schutz** bedeutet, dass das vorgelagerte Gerät *handeln soll* — entweder weil das nachgelagerte nicht abgeschaltet hat oder weil der Kurzschlussstrom über dem liegt, was es allein beherrschen kann.

**Backup durch Kaskadierung ist ein bewusster Tausch von Selektivität gegen Wirtschaftlichkeit.** Übersteigt der erwartete Strom an einer Stelle das Ausschaltvermögen des nachgelagerten Geräts, kann eine herstellerseitig verifizierte Kombination dessen Einsatz dennoch erlauben, weil das vorgelagerte strombegrenzende Gerät beim Abschalten mitwirkt. Die Folge gehört klar benannt: **In dem Strombereich, in dem das vorgelagerte Gerät mitwirkt, lösen beide aus, und die Selektivität ist dort konstruktionsbedingt aufgegeben.**

Das ist eine legitime Entscheidung mit dokumentiertem Preis. Zum Mangel wird sie erst, wenn der Selektivitätsverlust während eines Ausfalls entdeckt statt im Entwurf festgehalten wird.

**Eine wesentliche Randbedingung der Kaskadierung: Sie gilt nur für die konkrete Gerätepaarung, die der Hersteller geprüft und veröffentlicht hat.** Sie lässt sich nicht aus veröffentlichten Kennlinien ableiten, nicht zwischen Herstellern übertragen und nicht für ein später als „gleichwertig“ ersetztes Gerät unterstellen.

## Stromselektivität

Der einfachste Mechanismus — und der mit der klarsten Grenze.

**Das Prinzip:** Die Impedanz der Leitung zwischen vorgelagertem und nachgelagertem Gerät senkt den am nachgelagerten Ort auftretenden Kurzschlussstrom. Liegt der Strom für einen Fehler hinter dem nachgelagerten Gerät unter dem unverzögerten Ansprechwert des vorgelagerten, sieht dieses überhaupt keinen Anlass auszulösen, und Selektivität entsteht ohne jede Zeitverzögerung.

**Wo es funktioniert:** lange Abgänge, kleine nachgelagerte Stromkreise und jede Situation mit nennenswerter Impedanz zwischen beiden Geräten.

**Wo es scheitert:** eng gekoppelte Anordnungen. Ein Fehler unmittelbar hinter einem Gerät, das wenige Meter von der Hauptschiene entfernt sitzt, erzeugt fast denselben Strom wie ein Fehler an der Schiene selbst. Es gibt keine Stromdifferenz zu nutzen, und Stromselektivität lässt sich unabhängig von Einstellungen nicht herstellen.

**Die Prüfung ist ausdrücklich:** den maximalen Kurzschlussstrom an den lastseitigen Klemmen des nachgelagerten Geräts mit dem unverzögerten Ansprechwert des vorgelagerten vergleichen, einschließlich dessen Toleranzband. Kann der Kurzschlussstrom diesen Wert erreichen, existiert in diesem Bereich keine Stromselektivität.

## Zeitselektivität

Wo Stromselektivität nicht verfügbar ist, wird das vorgelagerte Gerät bewusst verzögert, damit das nachgelagerte zuerst auslöst.

**Was eine Staffelzeit abdecken muss** — und hier werden Konzepte häufig zu knapp gestaffelt:

- Die Eigenzeit des nachgelagerten Geräts beim relevanten Strom, einschließlich Toleranz.
- Öffnungs- und Lichtbogenzeit des nachgelagerten Leistungsschalters.
- Jeglichen Nachlauf der Messung oder des Relais — das vorgelagerte Gerät kann nach der Stromunterbrechung noch kurz weiterlaufen.
- Die eigene Zeittoleranz des vorgelagerten Geräts.
- Eine Sicherheitsreserve.

**Staffelzeiten werden abgeleitet, nicht aus Gewohnheit gewählt**, und moderne digitale Schutzgeräte erlauben in der Regel kürzere Intervalle als ältere elektromechanische, weil ihre Zeitreproduzierbarkeit besser ist. Die Reserve gehört zu den tatsächlich eingebauten Geräten.

**Die Kosten der Zeitselektivität sind real und ausdrücklich zu akzeptieren:**

- **Der Fehler brennt länger.** Die eingetragene Energie wächst mit der Dauer, der Schaden mit ihr.
- **Das vorgelagerte Gerät und alles zwischen ihm und dem Fehler muss den Strom für die Verzögerung führen.** Genau hier wird die Kurzzeitstromfestigkeit — Strom *und* Zeit — aus der Kurzschlussstudie verbraucht. Eine Verzögerung ohne Festigkeitsnachweis schützt die Selektivität und gefährdet die Sammelschiene.
- **Die Lichtbogenenergie steigt mit der Abschaltzeit**, was überall dort zählt, wo das Störlichtbogenrisiko bewertet wird.

**Die Folge: Die längsten Verzögerungen liegen oben in der Hierarchie — genau dort, wo die Kurzschlussströme am höchsten sind.** Diese Umkehrung — langsamstes Abschalten bei der größten Energie — ist das zentrale Unbehagen zeitgestaffelter Konzepte und der Grund für die Verfahren der beiden folgenden Abschnitte.

## Selektivität im strombegrenzenden Bereich

Hier sind selbstsicher klingende, aber unhaltbare Aussagen am häufigsten, weshalb die Grenzen präzise gehören.

**Unterhalb des strombegrenzenden Bereichs** lässt sich die Koordination aus Strom-Zeit-Kennlinien beurteilen: Ist die Gesamtausschaltzeit des nachgelagerten Geräts über den relevanten Strombereich mit ausreichender Reserve kleiner als die Eigenzeit des vorgelagerten, ist das Paar dort selektiv.

**Darüber — im Bereich, in dem ein strombegrenzendes Gerät so schnell arbeitet, dass es abschaltet, bevor der Strom seinen erwarteten Scheitelwert erreicht — genügen Strom-Zeit-Kennlinien nicht mehr.** Dort wirken die Geräte innerhalb einer Halbwelle dynamisch zusammen, und maßgeblich ist die vom nachgelagerten Gerät durchgelassene Energie im Verhältnis zu dem, was das vorgelagerte zum Abschluss seiner eigenen Funktion benötigt.

**Die ehrliche Aussage lautet: Selektivität im strombegrenzenden Bereich lässt sich nicht zuverlässig durch Vergleich veröffentlichter Kennlinien oder durch ein allgemeines Durchlassenergie-Argument nachweisen.** Sie wird durch Prüfung der konkreten Gerätepaarung ermittelt, und das Ergebnis veröffentlicht der Hersteller als Selektivitätstabelle oder -grenze — üblicherweise als Strom, bis zu dem das Paar selektiv ist.

**Was daraus praktisch folgt:**

- **Für Paarungen in diesem Bereich die Selektivitätstabellen des Herstellers verwenden.** Sie sind der Nachweis; die Kennlinien sind es nicht.
- **Selektivitätstabellen gelten paarbezogen.** Der Austausch eines der beiden Geräte gegen ein nominell gleichwertiges entwertet den Eintrag.
- **Die Sicherung-Sicherung-Koordination ist der eine Fall mit einer verbreiteten kennlinienbasierten Methode:** Die Selektivität wird üblicherweise beurteilt, indem die Gesamtausschaltenergie der nachgelagerten Sicherung gegen die Schmelzenergie der vorgelagerten gestellt wird, mit einem vom Hersteller empfohlenen Verhältnis. Auch hier ist die Herstellerempfehlung maßgebend.
- **Gemischte Paarungen — Sicherung vor Schalter oder umgekehrt — verlangen Herstellerdaten**, weil das Zusammenwirken vom dynamischen Verhalten beider Geräte abhängt.

**Teilselektivität ist ein legitimes, dokumentierbares Ergebnis.** Eine Paarung kann bis zu einem genannten Strom selektiv und darüber nicht selektiv sein. Die richtige Reaktion ist, diese Grenze festzuhalten, sie mit dem maximalen Kurzschlussstrom an dieser Stelle zu vergleichen und die Lücke zu akzeptieren oder zu schließen — nicht, das Konzept ohne Einschränkung als „selektiv“ zu bezeichnen.

## Zonenverriegelung und Sammelschienenfehler

**Ein Fehler auf der Sammelschiene ist der Fall, den die Zeitstaffelung am schlechtesten beherrscht.** Kein nachgelagertes Gerät sieht ihn, also muss die Einspeisung abschalten — das Gerät mit der längsten Verzögerung, an der Stelle mit dem höchsten Kurzschlussstrom.

Zwei etablierte Antworten:

**Zonenselektive Verriegelung.** Nachgelagerte Geräte melden dem vorgelagerten, dass sie einen Fehler erkennen. Empfängt das vorgelagerte Gerät dieses Signal, wendet es seine Verzögerung an und lässt das nachgelagerte abschalten. Erkennt es einen Fehler ohne Signal, muss dieser in seiner eigenen Zone liegen, und es löst unverzögert aus. Ergebnis: schnelles Abschalten von Schienenfehlern bei erhaltener Selektivität für nachgelagerte Fehler.

Ihre Fehlermodi liegen in Verdrahtung und Inbetriebnahme, und ihre Folgen sind unsymmetrisch:

- **Verriegelungssignal fehlt oder Verdrahtung unvollständig** — das vorgelagerte Gerät löst bei einem nachgelagerten Fehler unverzögert aus, die Selektivität ist verloren.
- **Verriegelung dauerhaft anstehend** — das vorgelagerte Gerät wartet immer, und ein Schienenfehler wird mit voller Verzögerung abgeschaltet, also genau in dem Zustand, den das Konzept verhindern sollte.

**Beide Fehler sind im Normalbetrieb still und zeigen sich erst im Fehlerfall**, weshalb die Verriegelung durch Prüfung und nicht durch Plandurchsicht nachzuweisen ist.

**Der Sammelschienendifferentialschutz** ist die andere Antwort: Er definiert über die Messung ein- und ausgehender Ströme eine Schutzzone und schaltet alles darin schnell ab, ohne von der Staffelung abzuhängen. Er kostet mehr und wird eingesetzt, wo die Konsequenz es rechtfertigt.

## Abgangsarten mit eigenen Randbedingungen

**Motorabgänge.** Der Kurzschlussauslöser muss über dem Anlaufstrom liegen, sonst löst der Motor bei jedem Anlauf aus; für dauerhaften Überstrom ist der thermische Überlastschutz zuständig. Zwei Disziplinen folgen:

- Den unverzögerten Ansprechwert aus dem Anlaufverhalten und der Kurzschlussstudie festlegen, nicht durch Anheben, bis die Auslösungen aufhören.
- Die Selektivität zum vorgelagerten Gerät entsteht meist über Stromselektivität, weil die Motorleitung Impedanz beisteuert. Steht der Motor nahe der Schiene, ist damit zu rechnen, dass dies scheitert, und stattdessen in der Zeit zu staffeln.

**Transformatorabgänge.** Der Einschaltstrom ist ein großer, abklingender, mit Gleichanteil behafteter Strom, den der primärseitige Schutz überstehen muss, ohne auszulösen, und dabei den Transformator dennoch zu schützen. Die Kurzschlussfestigkeitskennlinie des Transformators begrenzt, wie lange ein Durchgangsfehler bestehen darf. Die Koordination zwischen Primärgerät und Sekundär-Hauptschalter ist die klassische Schwierigkeit, weil die Impedanz dazwischen der Transformator selbst ist.

**Lange Abgänge.** Hier ist der Minimalfall maßgebend. Ein aus Selektivitätsgründen gewählter Ansprechwert kann über dem am Leitungsende verfügbaren Strom liegen; dann spricht der schnelle Auslöser dort nie an. **Selektivität und Empfindlichkeit werden gegeneinander getauscht, und dieser Tausch gehört an beiden Enden des Kreises geprüft.**

## Der Zielkonflikt, ausdrücklich benannt

| Ziel | Was es verbessert | Was es kostet |
| --- | --- | --- |
| **Schnelligkeit** | Niedrigere Ansprechwerte, kürzere Verzögerungen, Strombegrenzung | Selektivitätsreserve; Risiko unnötiger Auslösung |
| **Empfindlichkeit** | Niedrigerer Ansprechwert, eigener Erdschlussschutz | Selektivitätsreserve; Ansprechen auf Lasttransienten |
| **Selektivität** | Staffelzeiten, höhere vorgelagerte Ansprechwerte | Längeres Abschalten bei hohen Strömen: Schaden, Lichtbogenenergie, Festigkeitsbeanspruchung |

**Keine Einstellung maximiert alle drei, und ein Konzept, das den Anschein erweckt, wurde meist nicht beim minimalen Kurzschlussstrom geprüft.** Die Entwurfsdokumentation sollte je Ebene nennen, welches Ziel Vorrang hatte und was dafür in Kauf genommen wurde.

## Inbetriebnahme und Prüfung

Koordination existiert nur, wenn die Einstellungen in den Geräten der Studie entsprechen und das Konzept sich wie entworfen verhält.

- **Jede Einstellung anwenden und dokumentieren** und die angewandten Werte gegen die Studie prüfen — nicht gegen die Einstellungen des Vorgängergeräts.
- **Schutzfunktionen mit Einspeisung prüfen**, um Ansprechwerte und Zeiten zu bestätigen, durch befähigtes Personal nach vorbereitetem Prüfplan.
- **Die zonenselektive Verriegelung durch Prüfung nachweisen**, beide Fälle — Signal vorhanden und Signal fehlend. Pläne sind kein Nachweis.
- **Nachweisen, dass jedes verzögert arbeitende Gerät die Kurzzeitstromfestigkeit für diese Verzögerung besitzt** — ebenso Sammelschienen und Kabel dazwischen.
- **Teilselektivitätsgrenzen dokumentieren**, mit dem Strom, bis zu dem das Paar selektiv ist.
- **Die Koordination nach jeder Änderung** von Quellen, Netzkonfiguration, Gerätetausch oder Einstellung erneut prüfen. Ein durch ein nominell gleichwertiges Modell ersetztes Gerät entwertet jeden Hersteller-Selektivitäts- oder Kaskadierungseintrag, der das ursprüngliche nannte.

## Fehlermodi

**Selektivität aus Kennlinienabstand im strombegrenzenden Bereich unterstellt.** Das Paar ist gerade dort nicht selektiv, wo es am meisten zählt.

**Kaskadierung ohne herstellerseitig verifizierte Kombination angewandt.** Ein Gerät wird über seinem Ausschaltvermögen eingesetzt, gestützt auf ein Argument statt eine Prüfung.

**Staffelzeit aus Gewohnheit übernommen.** Zu knapp gestaffelt; beide Geräte lösen aus.

**Verzögerung ohne Prüfung der Kurzzeitstromfestigkeit.** Die Selektivität ist geschützt, die Sammelschiene nicht.

**Unverzögerter Auslöser angehoben, um Auslösungen abzustellen.** Der Kurzschlussschutz wird still unempfindlicher; die eigentliche Ursache bleibt unentdeckt.

**Einstellungen gegen das Vorgängergerät statt gegen die Studie geprüft.** Alte Fehler werden fortgeschrieben.

**Zonenverriegelung nie geprüft.** Entweder fehlt die Selektivität oder das schnelle Abschalten der Schiene — und niemand weiß, was davon.

**Minimaler Kurzschlussstrom am Leitungsende nicht geprüft.** Das Konzept ist selektiv und unempfindlich.

**Gerät als „gleichwertig“ ersetzt.** Jeder Hersteller-Eintrag zu Selektivität oder Backup, der das ursprüngliche Gerät nannte, gilt nicht mehr.

**Teilselektivität als Selektivität bezeichnet.** Die Lücke wird durch einen Ausfall entdeckt.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Der Versorgungsbereich eines petrochemischen Standorts hat eine NS-Hauptverteilung, die mehrere Unterverteilungen speist. Ein Fehler in einem Feld einer Unterverteilung löst sowohl deren Einspeisung als auch die Einspeisung der Hauptverteilung aus; der gesamte Bereich fällt aus. Die Geräte sind korrekt bemessen, die Studie existiert, und die Einstellungen entsprechen ihr.

```text
Symptom:
Downstream fault cleared, but the upstream incomer tripped as well.

Evidence:
- both devices operated for a single fault in a sub-board cubicle
- the sub-board is close-coupled to the main board by a short, large busduct
- computed fault current at the sub-board is only slightly below the
  value at the main board
- the main incomer's instantaneous element is set above its own board's
  load requirement but below the sub-board fault current
- no time delay is configured on the main incomer
- the coordination record shows the pair assessed on current selectivity

Reasoning:
Current selectivity depends on impedance between the two devices producing
a meaningful reduction in fault current. Here there is almost none, so both
devices see essentially the same fault and both instantaneous elements pick
up. This is not a settings error within the chosen method; it is the chosen
method being applied where its precondition does not hold.

Next investigations:
- confirm fault currents at both locations from the study, maximum case
- establish whether a short-time delay on the main incomer is viable, and
  whether the main busbar's short-time withstand covers that delay
- check the manufacturer's selectivity table for this specific device pair,
  which may establish selectivity in the current-limiting range
- verify that any delay introduced still clears within the transformer and
  cable withstand limits, and reassess arc energy at the main board
```

Drei Abhilfen kommen infrage, und sie sind nicht gleichwertig. Eine Kurzzeitverzögerung an der Haupteinspeisung stellt die Selektivität wieder her — sofern die Kurzzeitstromfestigkeit der Hauptsammelschiene diese Verzögerung abdeckt und die längere Abschaltzeit hinsichtlich Schaden und Lichtbogenenergie vertretbar ist. Ein Blick in die Selektivitätstabelle des Herstellers für genau diese Paarung kann Selektivität im strombegrenzenden Bereich ganz ohne Verzögerung belegen. Die zonenselektive Verriegelung erreicht beides, zum Preis von Verdrahtung und einer Prüfung bei der Inbetriebnahme.

**Der übertragbare Punkt: Stromselektivität hat eine Voraussetzung, und das Konzept ist nicht gescheitert — es wurde dort angewandt, wo seine Voraussetzung fehlte. Die Dokumentation nannte „Stromselektivität“, ohne die Impedanzannahme festzuhalten, die sie gültig machte.**

## Empfohlene Praxis

- Die Koordination als Verbraucher der Kurzschlussstudie behandeln: Maximalfall für das Geräteverhalten, Minimalfall für die Empfindlichkeit.
- Selektivität und Backup-Schutz in der Dokumentation trennen und benennen, wo Selektivität bewusst aufgegeben wird.
- Stromselektivität gegen die reale Stromdifferenz zwischen beiden Geräten prüfen, einschließlich Toleranzen.
- Staffelzeiten aus dem Zeitverhalten der eingebauten Geräte ableiten, nicht aus Gewohnheit.
- Kurzzeitstromfestigkeit — Strom und Zeit — für jedes Gerät, jede Schiene und jedes Kabel prüfen, das eine Verzögerung durchhalten soll.
- Für Paarungen im strombegrenzenden Bereich Hersteller-Selektivitätstabellen verwenden; dort keine Selektivität aus Kennlinien ableiten.
- Für jede Kaskadierung oder Backup-Anordnung herstellerseitig verifizierte Kombinationen verwenden und den Strombereich dokumentieren, in dem die Selektivität entfällt.
- Sicherung-Sicherung-Koordination mit dem vom Hersteller empfohlenen Energieverhältnis beurteilen.
- Kurzschlussauslöser von Motorabgängen aus Anlaufstrom und Studie festlegen, nie durch Anheben bis zum Ausbleiben der Auslösungen.
- Transformator-Einschaltstrom und Durchgangsfehler-Festigkeit als ausdrückliche Randbedingungen der primärseitigen Einstellungen behandeln.
- Zonenselektive Verriegelung oder Schienendifferentialschutz erwägen, wo Schienenfehler sonst langsam und beim höchsten Strom abgeschaltet würden.
- Teilselektivitätsgrenzen ausdrücklich dokumentieren, statt ein Konzept ohne Einschränkung als selektiv zu bezeichnen.
- Einstellungen gegen die Studie anwenden, mit Einspeisung prüfen und dokumentieren; Verriegelungskonzepte durch Prüfung nachweisen.
- Die Koordination nach jeder Änderung von Quelle, Konfiguration, Gerät oder Einstellung erneut verifizieren.

## Fazit

Ein Selektivitätskonzept ist eine sichtbar gemachte Sammlung akzeptierter Kompromisse. Stromselektivität wirkt, wo Impedanz die Geräte trennt, und versagt, wo sie fehlt. Zeitselektivität wirkt überall und bezahlt dafür mit Abschaltzeit, Schaden und Festigkeitsbeanspruchung genau dort, wo die Fehlerenergie am größten ist. Selektivität im strombegrenzenden Bereich ist real, wertvoll — und nur aus der Prüfung der konkreten Gerätepaarung durch den Hersteller bekannt.

Konzepte, die sich im Betrieb bewähren, sind jene, deren Dokumentation je Ebene nennt, welcher Mechanismus verwendet wurde, welche Annahme ihn gültig macht, bis zu welchem Strom er trägt und was dafür akzeptiert wurde. Die scheiternden sehen auf einem Übersichtsschaltplan meist identisch aus — und unterscheiden sich nur darin, dass niemand die Annahme aufgeschrieben hat, die irgendwann nicht mehr zutraf.
