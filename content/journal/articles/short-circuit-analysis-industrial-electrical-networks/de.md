# Kurzschlussstromberechnung in industriellen Netzen

## Zusammenfassung

Eine Kurzschlussstudie wird oft als Konformitätsdokument behandelt, einmal erstellt und abgelegt. Besser versteht man sie als Quelle zweier verschiedener Antworten, die die Anlage aus gegensätzlichen Gründen braucht.

**Der Maximalfall beantwortet: Kann das Betriebsmittel überstehen und abschalten, was das Netz liefern kann?** Er bemisst Ausschaltvermögen, Einschaltvermögen, Festigkeitswerte und mechanische Kräfte.

**Der Minimalfall beantwortet: Sieht der Schutz den Fehler überhaupt?** Er entscheidet, ob ein Gerät am Ende einer langen Stichleitung in der geforderten Zeit anspricht — oder ob es stehen bleibt, während ein Fehler brennt.

Entwürfe, die nur den ersten Fall betrachten, sind verbreitet, und ihr Versagen ist leise: ein korrekt bemessenes Betriebsmittel für einen Kurzschluss, den es nie abschalten wird, das einen Stromkreis schützt, dessen Kurzschlussstrom am Ende zu klein ist, um es rechtzeitig auszulösen.

**Sicherheitshinweis.** Kurzschlussstudien sind Grundlage für Arbeiten an Betriebsmitteln mit lebensgefährlichen Energien. Prüfungen, Einstellungsänderungen und Verifikationen erfordern Freischalten, Sichern gegen Wiedereinschalten (LOTO), Feststellen der Spannungsfreiheit und befähigtes Personal nach den Sicherheitsregeln des Standorts. Nichts hier ist eine Anleitung zum Arbeiten unter Spannung.

## Vier Größen, die regelmäßig vermengt werden

Dies ist der wichtigste Abschnitt des Beitrags, denn eine dieser Zahlen dort zu verwenden, wo eine andere verlangt ist, erzeugt einen Spezifikationsfehler, den keine nachgelagerte Sorgfalt korrigiert.

| Größe | Was sie beschreibt | Wessen Eigenschaft sie ist |
| --- | --- | --- |
| **Erwarteter Kurzschlussstrom** | Der Strom, der an einer Stelle flösse, wenn dort ein Kurzschluss vernachlässigbarer Impedanz aufträte | Eigenschaft des **Netzes** an dieser Stelle |
| **Ausschaltvermögen** | Der Strom, den ein Gerät unter definierten Prüfbedingungen sicher abschalten kann | Eigenschaft des **Geräts** |
| **Einschaltvermögen** | Der Stoßstrom, auf den ein Gerät ohne Schaden oder Verschweißen einschalten kann | Eigenschaft des **Geräts** |
| **Kurzzeitstromfestigkeit** | Der Strom, den Gerät oder Anlage für eine genannte kurze Zeit *führen* kann, ohne ihn abzuschalten | Eigenschaft des **Geräts oder der Anlage** |

**Der erwartete Kurzschlussstrom ist kein Bemessungswert.** Er ist das, was das Netz liefern kann, und alles andere wird dagegen geprüft.

**Ausschaltvermögen ist nicht eine Zahl.** Für Niederspannungs-Leistungsschalter unterscheiden die Gerätenormen ein Grenz-Ausschaltvermögen — nach dem das Gerät seine Sicherheitsfunktion erfüllt hat, aber nicht mehr betriebstauglich sein muss — von einem Betriebs-Ausschaltvermögen, nach dem es weiter verwendbar bleibt. Der Betriebswert ist der kleinere der beiden. **Eine Auswahl allein nach dem Grenzwert ist nur dann vertretbar, wenn die Anlage akzeptiert, das Gerät nach einem Kurzschluss zu ersetzen** — und das ist eine Instandhaltungsentscheidung, keine Voreinstellung.

**Das Einschaltvermögen zählt, weil das Einschalten auf einen bestehenden Kurzschluss ein anderes Ereignis ist als das Abschalten.** Der Stoßstrom in den ersten Augenblicken enthält eine abklingende Gleichstromkomponente, sodass der Momentanwert über dem symmetrischen Effektivwert liegt. Ein auf einen fehlerhaften Kreis geschaltetes Gerät erfährt diesen Stoßwert, und seine Kontakte dürfen nicht verschweißen. Das Einschaltvermögen steht daher über einen Faktor mit dem Ausschaltvermögen in Beziehung, der vom Leistungsfaktor des Kurzschlusskreises abhängt, und wird vom Hersteller angegeben statt vom Planer abgeleitet.

**Die Kurzzeitstromfestigkeit fällt aus der Reihe, weil sie ein Bemessungswert für das *Nicht*-Auslösen ist.** Ein Gerät, das aus Selektivitätsgründen bewusst verzögert wird, muss den Kurzschlussstrom für die Dauer dieser Verzögerung schadlos führen. Sie gilt für Geräte mit gewollter Kurzzeitverzögerung sowie für Anlagen und Sammelschienen — und sie ist ohne die zugehörige Dauer bedeutungslos: Eine Festigkeitsangabe ist stets ein Strom *und* eine Zeit.

**Wo diese Größen verwechselt werden, sind die typischen Fehler:**

- Ein Gerät allein nach dem erwarteten Strom ausgewählt, ohne zu prüfen, ob sein Ausschaltvermögen diesen abdeckt.
- Eine Sammelschiene auf Kurzzeitstromfestigkeit geprüft, aber nicht für die Zeit, die der vorgelagerte Schutz tatsächlich braucht.
- Ein Gerät mit ausreichendem Ausschaltvermögen dort eingesetzt, wo eine vorgelagerte Verzögerung von ihm verlangt, den Kurzschluss zu *halten*, ohne Festigkeitswert für diese Zeit.
- Der Einschaltfall auf einen bestehenden Kurzschluss gar nicht betrachtet, weil nur der Abschaltfall geprüft wurde.

## Was eine Studie berechnet — und mit welcher Strenge

Die begriffliche Beziehung, nach der zuerst gegriffen wird, lautet:

```text
I ≈ V / Z                        SIMPLIFIED CONCEPTUAL RELATIONSHIP ONLY

  I = fault current magnitude
  V = driving voltage at the fault location
  Z = total impedance of the path from the source to the fault

This is a teaching aid, not a study method. It ignores, among other things:
  - the decaying DC component and therefore the peak current
  - the difference between initial, breaking and steady-state values
  - separate positive-, negative- and zero-sequence networks, which is how
    unbalanced and earth faults are actually treated
  - the change in machine reactance over time after fault inception
  - the voltage factor applied to nominal voltage in a standardised study
Never present a result from this expression as a fault study.
```

**Ein standardisiertes Verfahren wie das der IEC 60909 ist strukturierter**, und seine Grundform zu kennen lohnt sich, auch wenn die Rechnung Software übernimmt.

- Es ersetzt das Netz durch eine **Ersatzspannungsquelle an der Fehlerstelle**, wodurch die Modellierung des Lastflusses vor dem Fehler entfällt.
- Es wendet einen **Spannungsfaktor** auf die Nennspannung an, mit unterschiedlichen Werten für Maximal- und Minimalrechnung, um Spannungsschwankung, Stufenstellung und Lastzustand zu berücksichtigen.
- Es bildet unsymmetrische Zustände über **symmetrische Komponenten** ab — Mit-, Gegen- und Nullsystem —, weshalb der Erdschlussstrom stark vom Nullsystempfad und damit von der Sternpunktbehandlung abhängt.
- Es unterscheidet **mehrere Ströme statt eines**: einen Anfangs-Kurzschlusswechselstrom im Fehleraugenblick, einen Stoßkurzschlussstrom einschließlich Gleichstromglied, einen symmetrischen Ausschaltstrom im Moment der Kontakttrennung und einen Dauerkurzschlussstrom. Jeder dient einer anderen Nachweisprüfung.

**Die ingenieurtechnische Folge des letzten Punktes: Die Frage „wie hoch ist der Kurzschlussstrom an dieser Schiene“ ist unvollständig.** Die brauchbare Frage benennt, welcher Strom, in welchem Augenblick, zu welchem Zweck.

## Maximal- und Minimalfall

Beide Fälle arbeiten mit bewusst gegensätzlichen Annahmen, und beide sind zu rechnen.

| | Maximalfall | Minimalfall |
| --- | --- | --- |
| **Dient dem Nachweis von** | Ausschalt-, Einschalt- und Festigkeitswerten; mechanischen Kräften | Schutzempfindlichkeit und Auslösezeit |
| Quellenstärke | Stärkste plausible: höchste Netzkurzschlussleistung | Schwächste plausible: niedrigste Netzleistung oder Generatorbetrieb |
| Netzkonfiguration | Meiste Quellen — Transformatoren parallel, Kupplung geschlossen | Wenigste Quellen — ein Transformator, Kupplung offen |
| Motorbeitrag | Enthalten | Konservativ ausgeschlossen |
| Leiterwiderstand | Bei niedrigerer Temperatur, also geringerer Impedanz | Bei maximaler Betriebstemperatur, also höherem Widerstand |
| Leitungslänge | Kürzeste plausible | Längste plausible, Fehler am fernen Ende |
| Fehlerimpedanz | Vernachlässigbar | Lichtbogen- und Übergangsimpedanz können berücksichtigt werden |
| Spannungsfaktor | Der höhere Wert | Der niedrigere Wert |

**Beide Fälle müssen die realen Betriebszustände der Anlage abdecken.** Ein Industrienetz hat üblicherweise mehrere: Normalbetrieb mit offener Kupplung, Wartungsbetrieb mit einem Transformator, Notstrombetrieb und jede vorübergehende Konfiguration während Stillständen. Der Maximalfall ist häufig die Parallelkonfiguration, der Minimalfall häufig der Generatorbetrieb, in dem der Kurzschlussstrom sehr viel kleiner sein kann als am Netz.

**Der Minimalfall ist der Fall, der übersprungen wird**, und seine Folgen sind die gefährlicheren. Liegt der Strom am Ende eines Kreises unter dem, was das Schutzorgan zum Ansprechen in der geforderten Zeit braucht, wird der Fehler nicht zügig abgeschaltet. Das Kabel erwärmt sich, der Fehler kann eskalieren, und die Dauer der Berührungsspannung bei einem Erdschluss kann das überschreiten, was die Erdungsauslegung unterstellt hat.

## Quellen des Kurzschlussstroms

**Die Netzeinspeisung** wird durch eine Kurzschlussleistung oder eine Ersatzimpedanz beschrieben, die der Netzbetreiber angibt. Zwei Punkte folgen daraus: Hinter dieser Angabe steht eine unterstellte Konfiguration, und **sie ändert sich**, wenn das vorgelagerte Netz verstärkt wird. Eine Studie gegen einen zehn Jahre alten Wert kann das heutige Maximum unterschätzen.

**Transformatoren** dominieren die Kurzschlussleistung in Niederspannungsnetzen, und ihre Impedanz ist das wesentliche begrenzende Element. Zwei Vorbehalte: Die Typenschildimpedanz trägt eine Fertigungstoleranz, und deren unteres Ende ist die konservative Wahl für den Maximalfall. Wo Werte aus dem Prüfprotokoll vorliegen, sind sie die bessere Datengrundlage.

**Synchrongeneratoren** speisen zeitabhängig ein, weil ihre wirksame Reaktanz von einem subtransienten über einen transienten Wert zum Dauerwert ansteigt. Praktische Folge: Der Anfangsstrom ist hoch, und der *dauernd* lieferbare Strom kann nur ein bescheidenes Vielfaches des Bemessungsstroms betragen — genau deshalb kann ein Schutz, der am Netz selektiv ist, es im Generatorbetrieb nicht sein.

**Asynchronmotoren** speisen den Anfangsstrom und den Stoßstrom mit, weil ein drehender Motor kurzzeitig als Generator wirkt, getrieben von seiner Trägheit und seinem Restfluss. **Dieser Beitrag klingt rasch ab und ist nicht dauerhaft**, da nichts das Feld aufrechterhält. Daher gilt:

- Er **muss** im Maximalfall für Einschaltvermögen, Stoßstromfestigkeit und Anfangsstrom enthalten sein.
- Für den Ausschaltstrom bei längeren Verzögerungen verliert er an Bedeutung und für den Dauerwert ganz.
- Im Minimalfall wird er **ausgeschlossen**, denn Hilfe zu unterstellen, die womöglich fehlt, ist nicht konservativ.

An einer motorlastigen Industrieschiene ist der summierte Motorbeitrag erheblich, und ihn wegzulassen gehört zu den häufigeren Studienmängeln.

**Kabel und Sammelschienen** fügen Impedanz hinzu und senken den Kurzschlussstrom mit der Entfernung von der Quelle. Deshalb liegt der höchste Strom an der Schiene und der niedrigste am Ende des längsten Kreises — und deshalb sind beide Enden aus verschiedenen Gründen zu prüfen.

## Fehlerarten und die Sternpunktbehandlung

**Der dreipolige Kurzschluss** ist im industriellen Niederspannungsnetz üblicherweise der Fall mit dem höchsten Strom und Grundlage der meisten Gerätebemessungen.

**Der zweipolige Kurzschluss** ist kleiner. Liegt der Fehler elektrisch fern von der Erzeugung, sodass Mit- und Gegenimpedanz als gleich angenommen werden dürfen, beträgt der zweipolige Strom etwa √3/2 — rund 87 % — des dreipoligen Werts. Diese Näherung wird nahe der Erzeugung schwächer, wo sich die Impedanzen unterscheiden.

**Der Erdschluss ist der Fall, der sich nicht verallgemeinern lässt**, weil seine Höhe vom Nullsystempfad bestimmt wird — und dieser Pfad ist eine Entwurfsentscheidung:

- In einem **niederohmig/starr geerdeten** System kann der Erdschlussstrom die Größenordnung eines Phasenfehlers erreichen, und der Schutz stützt sich in der Regel auf diese Höhe.
- In einem **widerstandsgeerdeten** System begrenzt der Sternpunktwiderstand den Erdschlussstrom bewusst auf einen gewählten Wert. Der Strom ist dann viel zu klein für den Überstromschutz, sodass eigenständiger Erdschlussschutz konstruktiv erforderlich ist und nicht als Ergänzung.
- In einer **isolierten oder impedanzgeerdeten (IT-)Anordnung** erzeugt der erste Erdschluss sehr wenig Strom, und das System ist darauf ausgelegt, während der Fehlersuche weiterzulaufen — was die Schutzphilosophie vollständig verändert und den Doppelfehler zum gefährlichen Fall macht.

**Die Entwurfsfolge: Der Erdschlussstrom ist weniger ein Ergebnis der Studie als eine Eingangsentscheidung, die mit der Erdungsphilosophie getroffen wurde.** Der Zusammenhang von Erdungskonzept, Schutzstrategie und Berührungsspannung behandelt der Begleitbeitrag zur Erdung und zum Potentialausgleich.

## Annahmen und Datenqualität

Eine Kurzschlussstudie ist ein Modell, und ihr Ergebnis kann nicht besser sein als ihre Eingangsdaten. Was Studien am häufigsten entwertet:

- **Netzkurzschlussleistung** aus einem alten Schreiben oder ohne die unterstellte Konfiguration.
- **Transformatorimpedanz** aus dem Katalog statt aus dem Prüfprotokoll und ohne konservative Anwendung der Toleranz.
- **Kabeldaten** — geschätzte Längen, im Bau geänderte Trassen, ersetztes Leitermaterial oder abweichender Querschnitt.
- **Motorbestand** unvollständig oder nach Anlagenänderungen nicht fortgeschrieben.
- **Betriebszustände** nur für die Entwurfsabsicht modelliert, ohne die tatsächlich vorkommenden Wartungs- und Notstromkonfigurationen.
- **Abweichung vom Bestand** — die größte Fehlerquelle in älteren Anlagen, wo Plan und Wirklichkeit auseinandergelaufen sind.

**Jede Studie sollte ihre Annahmen ausdrücklich nennen und bei deren Änderung neu gerechnet werden.** Eine Netzerweiterung, ein Transformatortausch, eine vorgelagerte Netzverstärkung oder eine geänderte Betriebsphilosophie entwerten jeweils einen Teil des früheren Ergebnisses.

## Was die Studie speist

- **Gerätewahl** — Ausschaltvermögen gegen den maximalen erwarteten Strom, Einschaltvermögen gegen den Stoßwert, Kurzzeitstromfestigkeit *mit Zeit* für alles, was verzögern soll.
- **Anlagenbemessung** — Kurzzeit- und Stoßstromfestigkeit von Schaltanlage und Sammelschiene, geprüft gegen Strom *und* vorgelagerte Abschaltzeit.
- **Kabelbemessung** — das Kurzschlussfestigkeitskriterium, das von der Durchlassenergie des Schutzorgans und damit von seinen Einstellungen abhängt.
- **Schutzeinstellungen und Selektivität** — Gegenstand des Begleitbeitrags zur Selektivität, der sowohl Maximal- als auch Minimalergebnisse verwendet.
- **Störlichtbogenbewertung**, wo sie durchgeführt wird — eine Spezialstudie, die die Kurzschlussstudie als Eingangsgröße nutzt.

**Übersteigt der erwartete Strom das Ausschaltvermögen eines Geräts, kann eine herstellerseitig verifizierte Rückwärtsstaffelung (Backup-Schutz) zulässig sein.** Das ist keine Rechnung, die der Planer aus ersten Prinzipien führen kann: Sie hängt an der konkreten Gerätepaarung und gilt nur dort, wo der Hersteller diese Kombination geprüft und veröffentlicht hat.

## Folgen für Inbetriebnahme und Instandhaltung

- **Den Bestand gegen das Studienmodell verifizieren** — Typenschild und Prüfdaten des Transformators, Kabeltypen und tatsächliche Längen, die reale Motorliste und die möglichen Betriebskonfigurationen.
- **Die Netzkurzschlussleistung mit Datum und unterstellter Konfiguration dokumentieren** und periodisch neu anfragen.
- **Schutzeinstellungen aus der Studie anwenden und dokumentieren**; das Einstellungsprotokoll gehört zum Studienergebnis, nicht zur Inbetriebnahmeablage.
- **Die Studie nach jeder Änderung** an Quellen, Transformatoren, Netzkonfiguration oder nennenswertem Motorbestand neu rechnen.
- **Das Modell aufbewahren.** Eine nur als PDF gelieferte Studie lässt sich nicht günstig neu rechnen; der Wert steckt im Modell dahinter.

## Fehlermodi

**Nur der Maximalfall gerechnet.** Betriebsmittel sind korrekt bemessen, und der Schutz am Leitungsende spricht womöglich nicht an.

**Motorbeitrag weggelassen.** Einschalt- und Stoßbeanspruchung sind an motorlastigen Schienen unterschätzt.

**Festigkeitswert ohne Zeit zitiert.** Die Zahl ist bedeutungslos, und die Prüfung fand nicht statt.

**Grenz-Ausschaltvermögen wie ein Betriebswert verwendet.** Nach einem Kurzschluss sind Geräte zu ersetzen, und niemand hat es eingeplant.

**Generatorkonfiguration nicht untersucht.** Der Minimalfehlerfall wurde nie berechnet, also weiß niemand, ob der Schutz im Ersatzbetrieb empfindlich genug ist.

**Netzkurzschlussleistung veraltet.** Das vorgelagerte Netz wurde verstärkt, ohne dass die Anlage es erfuhr.

**Studie nach der Erweiterung nicht neu gerechnet.** Jede nachgelagerte Bemessung ruht auf einem überholten Ergebnis.

**Backup-Kombination angenommen statt herstellerseitig verifiziert.** Ein Gerät wird über seinem eigenen Vermögen eingesetzt, gestützt auf ein Argument statt auf eine Prüfung.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Zementwerk erweitert eine Verteilung, um einen neuen Packbereich am entfernten Ende des Geländes zu versorgen. Der Abgang ist nach Betriebsstrom und Spannungsfall bemessen, und das Schutzorgan ist mit einem Ausschaltvermögen deutlich über dem erwarteten Strom an der Schiene gewählt. Alles am Entwurf ist gegen den Maximalfall vertretbar.

Monate später wird ein Fehler in einem Verteilerkasten des neuen Bereichs abgeschaltet — aber langsam, mit sichtbaren Schäden entlang eines Teils des Kreises und einer weit längeren Störung als erwartet.

```text
Symptom:
Fault at the far end of a long feeder cleared far more slowly than intended.

Evidence:
- device breaking capacity is well above the prospective current at the board
- the fault occurred at the far end of the longest circuit on that board
- the circuit is long, and the fault was not a bolted three-phase fault
- the protective device's instantaneous element did not operate; clearing
  came from a much slower part of its characteristic
- upstream devices did not operate at all
- the study on file contains a maximum-fault case only

Reasoning:
This is a protection sensitivity problem, not an equipment rating problem.
Breaking capacity describes what the device can interrupt, and it was never
in question. What was never established is the MINIMUM fault current at the
far end of this circuit — reduced by the cable impedance over its length,
by conductor resistance at operating temperature, and by any arc impedance
at the fault. If that current falls below the threshold of the fast element,
clearing is left to a slower part of the curve.

Next investigations:
- compute minimum fault current at the far end, conductors at operating
  temperature, weakest credible source configuration, motor contribution excluded
- compare that current against the device's instantaneous threshold
- check the disconnection time actually achieved against the requirement
- verify the cable's fault-withstand check was performed for that clearing time,
  not for the fast-clearing assumption
```

Die Abhilfemöglichkeiten sind gewöhnlich und stehen im Zielkonflikt: die Ansprechschwelle des schnellen Auslösers senken, sofern die Selektivität zu den vorgelagerten Geräten erhalten bleibt; den Querschnitt vergrößern, um den Strom am Leitungsende anzuheben; oder ein Schutzorgan näher an der Last ergänzen, damit die geschützte Länge kürzer wird. Welche richtig ist, entscheidet die Selektivitätsbetrachtung, nicht dieser Kreis allein.

**Der übertragbare Punkt ist genau das, was die Studie ausließ: Der Maximalfall schützt das Betriebsmittel, der Minimalfall schützt den Stromkreis. Ein Entwurf, der nur den ersten rechnet, ist auf dem Papier vollständig und dort ungeprüft, wo es am meisten zählt.**

## Empfohlene Praxis

- Maximal- *und* Minimalfall rechnen und angeben, welche Betriebszustände sie jeweils abbilden.
- Die vier Größen in jeder Spezifikation getrennt halten: erwarteter Strom, Ausschaltvermögen, Einschaltvermögen und Kurzzeitstromfestigkeit mit ihrer Zeit.
- Ausdrücklich festlegen, ob Betriebs- oder Grenz-Ausschaltvermögen spezifiziert wird, und die Instandhaltungsfolge dokumentieren.
- Den Motorbeitrag im Maximalfall einschließen und im Minimalfall ausschließen.
- Die Generatorkonfiguration eigens modellieren, für Motoranlauf und für Schutzempfindlichkeit.
- Prüfprotokollwerte des Transformators verwenden, wo vorhanden, und die Impedanztoleranz konservativ ansetzen.
- Die Sternpunktbehandlung als bestimmend für den Erdschlussstrom behandeln und den Erdschlussschutz entsprechend wählen.
- Annahmen, Datum und verwendete Netzkurzschlussleistung der Studie ausweisen.
- Niemals ein Ergebnis aus einem einfachen V/Z-Ansatz als Kurzschlussstudie ausgeben.
- Für jede Backup-Anordnung herstellerseitig verifizierte Kombinationen verwenden statt eigener Ableitungen.
- Das Studienmodell aufbewahren, nicht nur den Bericht, und es nach jeder Änderung von Quellen, Transformatoren, Konfiguration oder Motorbestand neu rechnen.
- Den Bestand bei der Inbetriebnahme gegen das Modell prüfen und die angewandten Schutzeinstellungen als Teil des Studienergebnisses dokumentieren.

## Fazit

Der Wert einer Kurzschlussstudie liegt nicht in ihrer größten Zahl. Er liegt in der Disziplin, für jede Stelle des Netzes beide Fragen zu stellen: ob das Betriebsmittel das Schlimmste übersteht, was das Netz liefern kann — und ob der Schutz das Geringste erkennt, was es liefern wird.

Beide Fragen werden mit gegensätzlichen Annahmen beantwortet und schützen Verschiedenes: die eine die Schaltanlage, die andere das Kabel und die Menschen daneben. Kommt dazu die Disziplin, erwarteten Strom, Ausschaltvermögen, Einschaltvermögen und Kurzzeitstromfestigkeit als vier getrennte Begriffe zu führen, verschwinden die meisten Spezifikationsfehler dieses Feldes, bevor irgendein Betriebsmittel bestellt wird.
