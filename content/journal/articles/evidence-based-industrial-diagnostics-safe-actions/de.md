# Nachweisgestützte Diagnostik und sichere Handlungsplanung

## Zusammenfassung

Industrielle Diagnostik wird üblicherweise als Suche nach der Ursache beschrieben. Diese Beschreibung erzeugt schlechte Praxis, denn sie setzt ein Ziel, das in der verfügbaren Zeit häufig nicht erreichbar ist, und gibt keine Auskunft darüber, was in der Zwischenzeit zu tun ist.

**Besser: Diagnostik ist die disziplinierte Verwaltung einer Nachweismenge unter Zeitdruck, die in einer Handlung mit begrenzten Folgen endet.** Ihr Ergebnis ist keine Ursache. Ihr Ergebnis sind drei Dinge — **eine gereihte Kandidatenmenge, der Test, der zwischen ihnen unterscheidet, und eine sichere nächste Handlung** — und eine Diagnose, die diese drei unter eingestandener Unsicherheit liefert, ist ein gutes technisches Produkt, während eine, die eine zuversichtliche Ursache ohne tragende Nachweise liefert, es nicht ist.

Drei Aussagen ordnen die Methode.

**Das Symptom, das man Ihnen nennt, ist nicht das Symptom.** „Der Antrieb löst dauernd aus“ ist bereits eine Hypothese, und sie als Ausgangspunkt zu übernehmen legt die Untersuchung fest, bevor irgendein Nachweis existiert.

**Die Zuversicht muss durch die Nachweise begrenzt sein, nicht durch die Plausibilität der Erzählung.** Es gelten zwei getrennte Stufen: Gibt es überhaupt genug gültige Nachweise für einen Schluss, und unterscheiden die Nachweise diesen Kandidaten von den übrigen? Eine überzeugende Erzählung erfüllt keine von beiden.

**Und die Aussage, die die Methode sicher macht: Die Handlung ist eine von der Diagnose getrennte Entscheidung und richtet sich nach Folgen und Umkehrbarkeit, nicht nach Zuversicht.** Eine Diagnose mit hoher Zuversicht rechtfertigt womöglich nur eine kleine Handlung, wenn die Folge eines Irrtums schwer wäre. Eine mit geringer Zuversicht rechtfertigt womöglich vollständig eine Handlung, die billig, umkehrbar und nachweiserzeugend ist. **Handlungen danach zu reihen, was sie kosten, wenn sie falsch sind — statt danach, wie sicher sich die untersuchende Person fühlt — ist die Disziplin, die Diagnostik davon abhält, Glücksspiel zu werden.**

Dieser Beitrag legt die Methode stufenweise dar, mit dem Arbeitsergebnis jeder Stufe. Sie blickt nach vorn: Es gibt eine Auffälligkeit, und zu klären ist der nächste Schritt. Das rückblickende Gegenstück — ein Ausfall ist eingetreten, und die Frage lautet, wie Wiederholung zu verhindern ist — behandelt der Begleitbeitrag zur Ursachenanalyse, und beide übergeben an einer definierten Stelle aneinander.

## Stufe 0 — Das Symptom formulieren

**Die gemeldete Beschreibung ist eine Deutung, meist von jemandem, der beschäftigt war.** Sie in Beobachtungen zu überführen ist der erste und fehleranfälligste Schritt der ganzen Methode.

**Die Meldung in Beobachtbares überführen**: Was wurde beobachtet, wo, wann, wie oft, wie lange, unter welchen Betriebsbedingungen und mit welchem Mittel. „Es löst aus“ wird zu „das Schutzrelais hat angesprochen, protokolliert zu diesen Zeitstempeln, bei dieser Last, nach dieser Abfolge“.

**Dann die beiden Fragen, die entscheiden, welche Untersuchung das ist:**

**Hat es jemals korrekt funktioniert?** Ein System, das nie funktionierte, und eines, das aufgehört hat zu funktionieren, teilen keine Methode. Das erste ist ein Inbetriebnahmeproblem — ein Auslegungs-, Konfigurations- oder Montagefehler, etwas, das immer falsch war und erst jetzt auffällt. Das zweite ist ein Degradations- oder Änderungsproblem, und seine stärkste Frage lautet, was anders ist. **Untersuchungen scheitern routinemäßig, weil ein Inbetriebnahmefehler mit Degradationsmethoden gejagt wird.**

**Wann funktionierte es zuletzt korrekt, und was hat sich seitdem geändert?** Die Antwort begrenzt die Suche zeitlich, und die Änderungsfrage — über Hardware, Software, Einstellungen, Verfahren, Personen, Lieferanten, Einsatzstoff, Rate und Umgebung hinweg gestellt — ist die ertragreichste Einzelfrage der Methode.

**Und fragen Sie, ob dies ein Problem ist oder mehrere.** Standorte untersuchen regelmäßig ein Bündel lose verwandter Beschwerden, als wäre es ein Fehler — was garantiert, dass keine Hypothese alle Nachweise erklärt und deshalb jede verworfen wird.

**Arbeitsergebnis dieser Stufe:** eine Symptombeschreibung in Beobachtbarem, mit Bedingungen, Häufigkeit und einer Grenze zwischen letztem bekannt gutem und erstem auffälligem Zustand.

## Stufe 1 — Nachweise erheben und normalisieren

Die Haltbarkeit von Nachweisen ist sehr ungleich, und was zuerst verschwindet, wiegt oft am schwersten; das im Begleitbeitrag zur Ursachenanalyse beschriebene Sicherungsprotokoll gilt ab der ersten Minute.

**Normalisierung ist der Schritt, den niemand benennt und jede Untersuchung braucht.** Bringen Sie jeden Nachweis auf eine gemeinsame Grundlage:

- **Eine Zeitbasis.** Den Uhrenversatz zwischen allen Quellen feststellen, bevor irgendetwas verglichen wird. Zwei Systeme mit Minutenversatz erzeugen eine zuversichtliche und völlig falsche Reihenfolge.
- **Einheiten und Vorzeichenkonventionen.** Ein Wert in falscher Einheit oder mit vertauschtem Vorzeichen ist schlimmer als ein fehlender, denn er wird benutzt.
- **Gültigkeit, nicht nur Wert.** Ein Messwert hat neben der Zahl einen Zustand: in Betrieb, auf Hand, außerhalb des Bereichs, geforced, simuliert, veraltet. **Ein geforcter oder simulierter Wert, der als Messung gelesen wird, stützt Hypothesen, die er nicht stützen darf.**
- **Herkunft und Klasse.** Jeden Eintrag kennzeichnen als **gemessen**, **aufgezeichnet**, **berichtet**, **abgeleitet** oder **angenommen**. Diese haben völlig verschiedene Gewichte, und **der häufigste analytische Fehler ist eine Annahme, die durch zweimaliges Aufschreiben zur Tatsache wird.**

**Halten Sie fest, wonach Sie gesucht und was Sie nicht gefunden haben.** Eine erwartete Meldung, die nie kam, ein Schutz, der nicht ansprach, ein Verlauf, der zum Ereigniszeitpunkt nichts zeigt — Abwesenheiten sind Nachweise, und sie existieren nur, wenn jemand aufschreibt, dass danach gesucht wurde.

**Und unterscheiden Sie vier Zustände, nicht zwei.** Ein Nachweis kann vorhanden und stützend sein, vorhanden und widersprechend, **fehlend** (noch nicht erhoben, also eine Aufgabe) oder **nicht erhebbar** (überhaupt nicht zu bekommen — das Messgerät existiert nicht, der Speicher ist umgelaufen, das Teil wurde gereinigt). Fehlend definiert den nächsten Schritt. **Nicht erhebbar definiert eine dauerhafte Obergrenze der Zuversicht und gehört in den Abschlussbericht.**

**Arbeitsergebnis dieser Stufe:** ein Nachweisverzeichnis, dessen Einträge Quelle, Zeitstempel, Klasse, Gültigkeit und Unsicherheit tragen.

## Stufe 2 — Kontext und Randbedingungen vor der Hypothesenbildung

Diese Reihenfolge ist Absicht und das Sicherheitsrückgrat der Methode. Die meisten springen vom Nachweis zur Hypothese; dadurch werden die Handlungsgrenzen spät entdeckt, meist in dem Moment, in dem jemand einen undurchführbaren Test vorschlägt.

**Betriebskontext:** Zustand, Betriebsart, Rate, Produkt, Konfiguration, Normal- oder Ersatzversorgung, Umgebung, und wer was tat.

**Schutz- und Freigabestatus — die Fragen, die jede folgende Handlung begrenzen:**

- Was ist der sichere Zustand dieses Prozesses, und wie wird er erreicht?
- Welche Freigaben sind erfüllt, welche nicht?
- Welche Verriegelungen sind aktiv, und **ist derzeit etwas überbrückt, gesperrt oder geforced?**
- Welcher Schutz bewacht dieses Betriebsmittel gerade, und wovor?

**Das Überbrückungs- und Force-Verzeichnis verdient eine eigene Erwähnung**, weil es zwei Zwecken zugleich dient. Jeder derzeit gesperrte Schutz ist ein akutes Sicherheitsthema, das in der Untersuchung sichtbar sein muss. Und er ist häufig selbst ein diagnostischer Hinweis: ein vor Monaten gesetzter Force, um ein unverwandtes Problem zu umgehen, ist genau jene latente Bedingung, die aus einem kleinen Fehler ein Ereignis macht.

**Folgenabschätzung.** Drei Fragen, beantwortet bevor ein Test entworfen wird: Was geschieht, wenn dieses Betriebsmittel jetzt ausfällt; was, wenn wir es abstellen; was, wenn wir es prüfen.

**Zu wissen, was Sie aufhalten wird, ist Teil der Diagnose.** Eine Untersuchung, die in der sechsten Stunde entdeckt, dass ihr geplanter Test eine Freigabe, ein Stillstandsfenster, eine zweite Person oder eine Befugnis erfordert, die niemand der Anwesenden hat, hatte kein Pech — sie hat diese Stufe übersprungen.

**Arbeitsergebnis dieser Stufe:** eine Randbedingungsbeschreibung mit sicherem Zustand, Freigaben, aktiven Überbrückungen und den Folgen von Ausfall, Abstellung und Prüfung.

## Stufe 3 — Hypothesen bewusst bilden

**Über Gewerke hinweg bilden, nicht innerhalb eines.** Der stärkste Prädiktor einer langen Untersuchung ist ein Team, das fünf Hypothesen innerhalb der eigenen Disziplin bildet. Decken Sie bewusst ab: Prozess, Mechanik, Elektrotechnik, Messtechnik, Steuerungslogik und Konfiguration, Kommunikation, Versorgung, betriebliche und menschliche Faktoren, Umgebung — und zwei weitere, die am häufigsten fehlen und am häufigsten stimmen:

**„Die Messung ist falsch.“** Das gehört als stehende Hypothese in jede Diagnose, denn ein erheblicher Teil industrieller Fehler sind getreue Meldungen einer unwahren Zahl: eine verstopfte Wirkdruckleitung, ein Wärmeableitfehler, ein zweiter Bezug, der einen Kreis anzapft, eine geänderte Dichte hinter einem abgeleiteten Füllstand, ein an der Bereichsgrenze begrenzender Eingang. **Eine Anlage ist nicht verpflichtet, defekt zu sein, nur weil ein Messgerät es sagt.**

**„Nichts ist defekt.“** Das System reagiert womöglich korrekt auf einen realen Zustand, den niemand erkannt hat — ein Schutz, der seine Arbeit tut, eine Verriegelung, die wie ausgelegt wirkt, ein Regelkreis, der vernünftig auf eine Störung anderswo reagiert. Diese Hypothese ist unbeliebt, weil sie nahelegt, die Beschwerde sei irrig gewesen, und sie trifft oft genug zu, um dieses Unbehagen zu rechtfertigen.

**Bilden Sie mindestens drei, und werten Sie Schwierigkeiten dabei als Befund über das Systemverständnis, nicht über den Fehler.**

## Stufe 4 — Nachweise gegen Hypothesen bewerten

Bauen Sie die Matrix ausdrücklich: Hypothesen oben, Nachweiseinträge seitlich, jede Zelle markiert als *stützt*, *widerspricht*, *neutral* oder *nicht verfügbar*.

Zwei Gedanken leisten hier die meiste Arbeit.

**Ein Nachweis, der jede Hypothese stützt, hat keinen diagnostischen Wert**, wie überzeugend er sich auch anfühlt und wie viel Mühe er gekostet hat. Der Wert eines Nachweises bemisst sich daran, was er *ausschließt*. Ein Verlauf, der mit sechs Kandidaten vereinbar ist, hat nichts eingegrenzt; eine Beobachtung, die vier davon streicht, hat die Arbeit der ganzen Untersuchung geleistet.

**Der überlebende Kandidat ist der, der die Widersprüche übersteht, nicht der mit den meisten Häkchen.** Eine Hypothese mit viel Zustimmung und einem soliden Widerspruch steht schlechter da als eine mit mäßiger Zustimmung und keinem — denn der Widerspruch muss mit Nachweisen aufgelöst werden, und ihn ohne Nachweis wegzuerklären ist der häufigste Weg zu einer zuversichtlich falschen Antwort.

**Die leeren Zellen definieren den nächsten Test, und der beste ist der, der die meisten Zellen auf einmal füllt.** Das ist die formale Fassung dessen, was erfahrene Fachleute intuitiv tun: nicht „was sagt mir mehr über meine Lieblingstheorie“, sondern „welche eine Beobachtung verändert die Gestalt dieser Matrix am stärksten“.

**Arbeitsergebnis dieser Stufe:** die Matrix samt einem benannten unterscheidenden Test mit dem erwarteten Ergebnis unter jeder verbliebenen Hypothese.

## Stufe 5 — Zwei Konfidenzstufen

Zuversicht ist keine einzelne Zahl, und sie als eine zu behandeln ist die Stelle, an der Diagnosen zu Erzählungen werden.

```text
Gate 1 — SUFFICIENCY
  Is there enough valid, independent evidence to support any conclusion?
  A property of the evidence set, independent of which hypothesis is favoured.
  Fails when: key signals unavailable, instruments of doubtful validity,
  the event never captured at adequate resolution, records lost.

Gate 2 — DISCRIMINATION
  Does the evidence distinguish this candidate from the others?
  A property of the matrix.
  Fails when: the evidence is consistent with several candidates, or the
  distinguishing observation was never made.

Both gates must pass before a cause is reported.

Notes and limits:
  - passing Gate 2 on a thin evidence set is a coincidence, not a diagnosis
  - passing Gate 1 without Gate 2 is a well-documented shrug: much evidence,
    no discrimination
  - evidence classed as UNAVAILABLE places a permanent ceiling on Gate 1 for
    this investigation, and that ceiling belongs in the report
  - you may ACT without passing both gates; you may not REPORT a conclusion
    you have not reached
```

**Die letzte Zeile ist die operative Regel.** Handlung und Schlussfolgerung sind entkoppelt: Die nächste Stufe existiert genau dafür, dass Nützliches und Sicheres getan werden kann, während die Nachweise noch nicht reichen. Unzulässig ist, einen ungestützten Kandidaten in eine benannte Ursache zu verwandeln, weil ein Bericht fällig war.

## Stufe 6 — Kandidaten reihen, dann die Handlung getrennt planen

**Zuerst die Kandidatenliste**, deren Einträge jeweils die Nachweise dafür, die dagegen und die Beobachtung tragen, die sie bestätigen oder widerlegen würde. Diese Liste ist ein eigenständiges Arbeitsergebnis und das, was bei einem Schichtwechsel oder einer Eskalation zu übergeben ist.

**Dann die Wendung, die diese Methode ausmacht: Die Handlung wird nach Folgen und Umkehrbarkeit gewählt, nicht nach Rang.**

| Stufe | Handlung | Prozessrisiko | Typischer Aufwand |
| --- | --- | --- | --- |
| **1** | **Beobachten** — Aufzeichnung ergänzen, Auflösung erhöhen, getriggerte Aufzeichnung scharfschalten, auf Wiederholung warten | Keines | Zeit |
| **2** | **Nicht eingreifende Prüfung** — messen, ohne den Zustand zu ändern | Sehr gering | Zeit, Zugang |
| **3** | **Umkehrbare Änderung im Betriebsbereich** — Sollwertänderung, Betriebsartwechsel, Umschalten auf Reserve | Begrenzt und rücknehmbar | Kleine Prozessstörung |
| **4** | **Eingreifende Prüfung mit Freischaltung** — Freigabe, Freischaltung, Anlagenteil steht | Real; erfordert Planung | Stillstand, Personal |
| **5** | **Nicht umkehrbarer Eingriff** — Austausch, Änderung | Festgelegt; nicht durch Beobachtung rückholbar | Teile, Stillstand, Risiko neuer Fehler |
| **6** | **Handlung, die eine Schutzüberbrückung erfordert** | Eine eigene Kategorie | Freigabe, kompensierende Maßnahmen, Befristung, Nachweis der Rücknahme |

**Drei Regeln bestimmen die Wahl.**

**Nehmen Sie die billigste Handlung der Liste, die unterscheidet.** Nicht die billigste und nicht die informativste — die billigste, die die Matrix verändert. Stufe 1 wird massiv unterschätzt: Eine getriggerte Aufzeichnung mit hoher Auflösung scharfzuschalten kostet nichts, riskiert nichts und verwandelt die nächste Wiederholung von einer Anekdote in einen Signalverlauf.

**Lassen Sie sich nie vom Wunsch, eine Lieblingshypothese zu bestätigen, die Stufen hinaufziehen.** Ein Eingriff der Stufe 5, gewählt weil er die Theorie belegen würde, ist ein Bauteiltausch im Gewand eines Tests und kann eine Behebung nicht von einem Zufall unterscheiden.

**Und die Regel, die den anderen vorgeht: Keine diagnostische Handlung darf die Anlage in einen Zustand versetzen, dessen sicherer Ausgang davon abhängt, dass die Diagnose stimmt.** Dieser Satz trennt sichere Praxis von zuversichtlicher. Er bedeutet: Eine Überbrückung, eine ausgehebelte Verriegelung oder ein abgeschalteter Schutz wird nie durch Zuversicht in eine Diagnose gerechtfertigt — nur durch eine ausdrückliche Risikobewertung, eine Freigabe auf der richtigen Ebene, kompensierende Maßnahmen, eine benannte Befristung und eine nachgewiesene Rücknahme.

**Freigaben und Verriegelungen sind Randbedingungen des Plans, keine Hindernisse darin.** Ein Diagnoseschritt, der eine davon aushebelt, ist eine andere Art Schritt und durchläuft eine andere Genehmigung, wie ungelegen der Zeitpunkt auch sei.

## Stufe 7 — Verifikation und Abschluss

**Vorhersagen, bevor gehandelt wird.** Sagen Sie zu jedem Test, was Sie erwarten, wenn die Hypothese stimmt, und was, wenn sie nicht stimmt. **Ein Test, dessen Ergebnis Sie in keinem der beiden Fälle vorhersagen können, ist kein Test** — er ist eine Tätigkeit und liefert Nachweise, die sich zur bereits bevorzugten Antwort passend lesen lassen.

**Über den Mechanismus verifizieren, nicht über das Ausbleiben des Symptoms.** Das zählt dort am meisten, wo es am schwersten fällt: Bei einem sporadischen Fehler ist zwei Wochen ohne Wiederholung kein Beleg für eine Behebung, denn er hatte auch vorher zwei Wochen ausgesetzt. Verifikation heißt zeigen, dass der Mechanismus beseitigt ist — die gefundene und neu hergestellte lose Klemmstelle, die nachweislich freie Wirkdruckleitung, der korrigierte Parameter und seine beobachtete Wirkung unter der auslösenden Bedingung.

**Das Ergebnis gegen die Vorhersage dokumentieren**, auch wenn die Vorhersage falsch war. Diese Aufzeichnung lässt die Methode besser werden, und es ist dieselbe Rückkopplung, die Zustandsüberwachungsprogramme und gelernte Modelle beide brauchen und selten bekommen.

**Dann bewusst übergeben.** Eine Diagnose, die in einer Reparatur endet, hat eine Maschine wiederhergestellt. Sie hat nicht gefragt, warum die Anlage den Zustand zuließ, ob dieselbe Schwäche anderswo besteht oder welche latente Bedingung einen kleinen Fehler folgenreich machte. **Diese Fragen gehören dem rückblickenden Verfahren**, und die Übergabe soll ausdrücklich erfolgen: Dieses Ereignis rechtfertigt eine Untersuchung, oder es tut es nicht — und in beiden Fällen hat jemand entschieden.

## Erklärbarkeit, Nachvollziehbarkeit und Eskalation

**Die Diagnoseakte ist ein Arbeitsergebnis, kein Nebenprodukt.** Eine Akte dieser Form lässt sich von jemandem prüfen, der nicht dabei war, aus benannten Gründen bestreiten, bei Wiederkehr des Fehlers wiederverwenden und verteidigen, falls die Entscheidung später hinterfragt wird:

- Die Symptombeschreibung in Beobachtbarem.
- Das Nachweisverzeichnis mit Herkunft, Gültigkeit und den als nicht erhebbar vermerkten Punkten.
- Die Hypothesen-Nachweis-Matrix.
- Die beiden Stufen und ihr Stand.
- Die gereihten Kandidaten mit stützenden und widersprechenden Nachweisen.
- Die getroffene Handlung, ihre Stufe und die Begründung dieser Stufe.
- Die Vorhersage, das beobachtete Ergebnis und die Abweichung, falls vorhanden.

**Eskalation ist ein entworfener Zustand, kein Eingeständnis des Scheiterns**, und ihre Auslöser gehören vor Beginn festgelegt:

- Die Hinlänglichkeitsstufe ist mit den vorhandenen Mitteln nicht erreichbar.
- Die sicheren Handlungen sind ausgeschöpft, und der nächste unterscheidende Schritt liegt auf Stufe 4 oder höher.
- Der nächste Schritt erfordert eine Befugnis, die die untersuchende Person nicht hat.
- Die Folgen eines Irrtums übersteigen deren Mandat.
- Eine Zeitgrenze läuft ab.

**Setzen Sie die Zeitgrenze zu Beginn.** Untersuchungen ohne sie driften, und eine, die still drei Schichten ohne Entscheidungspunkt verbraucht hat, hat meist aufgehört, Nachweise zu erzeugen, und angefangen, Meinungen zu erzeugen.

**Und eskalieren Sie mit den Arbeitsergebnissen, nicht mit der Schlussfolgerung.** „Wir vermuten den Messumformer“ zu übergeben verschwendet die Eskalation; Matrix, Verzeichnis und den benannten unterscheidenden Test zu übergeben lässt die nächste Person dort beginnen, wo Sie aufgehört haben.

## Wo Werkzeuge und Modelle hingehören

Jedes Werkzeug, das einer Fachkraft zur Verfügung steht — eine Historian-Abfrage, ein physikalisches Modell, ein gelernter Anomaliedetektor, eine durchsuchbare Fallhistorie, eine Wissensbasis —, tritt an genau einer von zwei Stellen in diese Methode ein.

**Auf Stufe 1 als Nachweisquelle**, dann trägt es Herkunft, Gültigkeit und Unsicherheit wie jeder andere Nachweis und wird als *aufgezeichnet* oder *abgeleitet* gekennzeichnet, nicht als *gemessen*.

**Auf den Stufen 3 und 4 als Hypothesengenerator oder Unterscheider** — Kandidaten vorschlagend, die ein Mensch nicht bedacht hätte, oder Zellen der Matrix füllend.

**Kein Werkzeug tritt auf Stufe 6 ein.** Die Handlungsentscheidung richtet sich nach Folgen, Umkehrbarkeit, Befugnis und dem Sicherheitsnachweis der Anlage, und das sind menschliche und organisatorische Urteile. Es ist dieselbe Grenze, die der Begleitbeitrag zur industriellen KI aus demselben Grund zieht, und sie verschiebt sich nicht, wenn Werkzeuge besser werden.

Gutes Werkzeug macht die Arbeitsergebnisse dieser Methode billig herstellbar und billig auffindbar — Nachweise mit angehängter Herkunft, frühere Fälle mit ihrem Ausgang, die Matrix, die Akte. Das ist ein echter und erheblicher Beitrag und eine Eigenschaft guten Werkzeugs überhaupt: **nichts an der Methode hängt an einer bestimmten Plattform, und ein Whiteboard und ein Notizbuch führen sie korrekt aus.**

## Fehlermodi der Methode

**Die gemeldete Beschreibung als Symptom übernommen.** Die Untersuchung ist festgelegt, bevor Nachweise existieren.

**„Hat es je funktioniert?“ nie gefragt.** Ein Inbetriebnahmefehler mit Degradationsmethoden gejagt.

**Mehrere lose verwandte Beschwerden als ein Fehler untersucht.** Keine Hypothese erklärt alles, also wird jede verworfen.

**Nachweise über unsynchronisierte Uhren verglichen.** Eine zuversichtliche, falsche Reihenfolge.

**Geforcte, simulierte oder außer Betrieb befindliche Werte als Messungen gelesen.** Hypothesen, gestützt von bedeutungslosen Zahlen.

**Annahmen durch Wiederholung zu Tatsachen erhoben.** Der häufigste analytische Fehler der Methode.

**Gesuchte, nicht gefundene Nachweise nicht dokumentiert.** Die ausgebliebene Meldung bleibt unsichtbar.

**Fehlende und nicht erhebbare Nachweise vermengt.** Das eine definiert eine Aufgabe, das andere eine dauerhafte Grenze.

**Hypothesen nur innerhalb eines Gewerks gebildet.** Der Fehler liegt in einem anderen.

**„Die Messung ist falsch“ fehlt auf der Liste.** Eine getreue Meldung einer unwahren Zahl, quer durch den Prozess verfolgt.

**„Nichts ist defekt“ fehlt auf der Liste.** Ein Schutz, der seine Arbeit tut, als Fehler untersucht.

**Nachweise nach Menge statt nach Unterscheidungskraft bewertet.** Viel erhoben, nichts ausgeschlossen.

**Ein Widerspruch ohne Nachweis wegerklärt.** Der häufigste Weg zu einer zuversichtlich falschen Antwort.

**Eine Konfidenzzahl statt zweier Stufen.** Unterscheidung auf dünner Basis oder Hinlänglichkeit ohne Unterscheidung.

**Eine Ursache berichtet, weil ein Bericht fällig war.** Die Nachweise änderten sich nicht, die Frist schon.

**Handlung nach Rang statt nach Folgen gewählt.** Ein Spiel mit der Anlage auf Basis eines Gefühls.

**Ein Stufe-5-Eingriff als Test verwendet.** Ein Austausch im Gewand eines Experiments; eine Behebung, die von einem Zufall nicht zu trennen ist.

**Eine Überbrückung mit Zuversicht in die Diagnose begründet.** Der sichere Ausgang hängt nun davon ab, recht zu haben.

**Randbedingungen in der sechsten Stunde entdeckt.** Der geplante Test ist undurchführbar und war es immer.

**Ein Test ohne Vorhersage durchgeführt.** Nachweise, die zur bevorzugten Antwort passend gelesen werden.

**Ein sporadischer Fehler für behoben erklärt, weil er ausblieb.** Er war auch vorher ausgeblieben.

**Mit einer Schlussfolgerung statt mit Arbeitsergebnissen eskaliert.** Die nächste Person beginnt von vorn.

**Keine Zeitgrenze.** Drei Schichten Meinungsproduktion.

**Reparatur als Untersuchung behandelt.** Die Maschine läuft; die latente Bedingung und ihr Geltungsumfang bleiben ungeprüft.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein kritischer Verdichter löst etwa einmal im Monat aus. Jedes Mal läuft er problemlos wieder an und arbeitet danach normal. In drei früheren Untersuchungsversuchen wurde nichts gefunden. Die Produktion verliert jedes Mal eine Schicht und hat beantragt, den auslösenden Schutz zu überbrücken, damit die Einheit bis zur Klärung weiterlaufen kann.

```text
Symptom (framed):
The machine's protection has operated on eleven occasions over ten months.
Trips occur at varying load and time of day, restart is always successful, and
the machine subsequently runs within normal parameters. The system has worked
correctly for years, so this is a change or degradation investigation, not a
commissioning one.

Evidence register (extract, with class):
- [recorded] protection relay event log: eleven operations, each with a
  timestamp and the initiating element identified
- [measured] the relay's own high-resolution disturbance record for the
  three most recent events shows a genuine, short excursion of the measured
  quantity beyond the protection setting
- [recorded] the plant historian shows nothing unusual at any of the eleven
  timestamps; its trend for these tags is stored with a deadband and a
  one-minute aggregation
- [recorded] the clock offset between the relay and the historian is small
  and has been established
- [measured] the protection setting matches the current setting sheet
- [reported] operators consistently describe no unusual process behaviour
  before the trips
- [measured] the relevant instrument loops have been checked and are within
  calibration
- [unavailable] no high-resolution record exists for the eight earlier
  events; the relay buffer holds only the most recent three
- [missing] no measurement exists of the quantity at a resolution and
  bandwidth capable of showing what happens in the moments before the
  excursion
- [recorded] the bypass and force register shows no active bypasses on this
  machine
- [recorded] the change record shows no modifications to the machine, its
  protection or its control in the past two years; the absence of a record is
  not treated as proof that nothing changed

Constraints:
- safe state is a controlled stop, which the protection already achieves
- the protection in question is the machine's principal defence against a
  condition that would cause major damage
- the consequence of the machine failing unprotected is severe and
  irreversible; the consequence of a trip is a lost shift

Hypotheses and discrimination:
  H1  Spurious operation of the protection (relay or wiring fault)
  H2  Instrument fault presenting a false excursion to the protection
  H3  A real, short-duration process excursion the protection is correctly
      detecting
  H4  A real excursion originating outside the machine (supply, upstream
      unit, another consumer)
  H5  Nothing is wrong: the setting is inappropriate for a legitimate
      transient that has always occurred

The relay's own high-resolution record is the discriminating evidence and it
was already available. It shows the measured quantity genuinely exceeding the
setting, which contradicts H1: the relay is not operating without an input to
operate on. It does not discriminate between H2, H3, H4 and H5, because all
four produce exactly that record.

The historian's silence is not evidence against a real excursion. Its deadband
and one-minute aggregation cannot represent an event of this duration, so a
flat trend is the expected appearance of a genuine short excursion in this
archive. Reading it as evidence of a spurious trip would be an error of the
kind this Journal has described repeatedly: an absence in a record that could
not have contained the thing.

Gates:
  Sufficiency  — NOT PASSED. The critical evidence is what happens in the
                 seconds before the excursion, and nothing on the plant
                 records at that resolution.
  Discrimination — NOT PASSED. Four candidates remain, all consistent with
                 every item of evidence held.

Action decision:
The bypass request is a Tier 6 action. It is refused, and the reasoning is
recorded: the only firm finding so far is that the protection is responding to
a real excursion, so a bypass would remove a functioning defence against a
condition that is demonstrably occurring, on the strength of a diagnosis that
has not been reached. The safe outcome would then depend on the diagnosis
being right, which is precisely the condition this method forbids.

The action taken instead is Tier 1. High-resolution triggered capture is armed
on the relevant electrical and process signals, triggered from the protection's
own start signal with adequate pre-trigger memory, together with a capture of
the upstream supply and of the adjacent unit's activity to address H4. Process
risk is nil, cost is a day of instrument work, and the next recurrence — which
the evidence says will arrive within about a month — will convert the
unavailable evidence into measured evidence and discriminate between the four
remaining candidates.

Two supporting measures are taken while waiting: the machine's restart
sequence is reviewed so that a trip costs less than a shift, and the operating
team is asked to record local conditions at the next event.

A time box is set at two recurrences. If the captures do not discriminate,
the investigation escalates with its artefacts rather than continuing.
```

**So sieht eine gute Diagnose aus, wenn die Antwort nicht verfügbar ist.** Es wurde keine Ursache benannt. Beide Stufen sind nicht erreicht und als nicht erreicht dokumentiert. Und das Ergebnis ist dennoch erheblich: ein Kandidat auf Nachweisbasis ausgeschlossen, eine sauber begründete Ablehnung eines unsicheren Antrags, eine risikofreie Handlung, die bei der nächsten Wiederholung den unterscheidenden Nachweis liefert, eine kompensierende Maßnahme und eine Zeitgrenze.

**Drei übertragbare Punkte.** Erstens: **Der unterscheidende Nachweis existierte bereits** — im Speicher des Relais selbst, den in drei früheren Anläufen niemand ausgelesen hatte. Zweitens: **Das Schweigen des Historians war kein Nachweis**, weil seine Speicherkonfiguration das Ereignis nicht hätte erfassen können; die Grenzen einer Aufzeichnung für einen Befund zu halten ist einer der ergiebigsten Fehler dieses Fachs. Drittens: **Die Ablehnung der Überbrückung war die wichtigste technische Entscheidung der gesamten Untersuchung**, und sie erfolgte auf Grundlage dessen, was die Nachweise belegten, nicht dessen, was sie offenließen.

## Empfohlene Praxis

- Jede gemeldete Beschreibung vor allem anderen in Beobachtungen überführen und die Bedingungen ihres Auftretens dokumentieren.
- Fragen, ob das System je korrekt funktioniert hat, und die Untersuchungsart entsprechend wählen.
- Die Grenze des letzten bekannt guten Zustands feststellen und fragen, was sich in Hardware, Software, Einstellungen, Verfahren, Personal, Versorgung, Einsatzstoff, Rate und Umgebung geändert hat.
- Prüfen, ob ein Problem oder mehrere untersucht werden.
- Nachweise auf eine Zeitbasis, ein Einheitensystem und eine Vorzeichenkonvention normalisieren und vor jedem Vergleich die Uhrenversätze feststellen.
- Gültigkeit neben dem Wert dokumentieren; geforcte, simulierte, außer Betrieb befindliche und veraltete Werte als das behandeln, was sie sind.
- Jeden Eintrag als gemessen, aufgezeichnet, berichtet, abgeleitet oder angenommen klassifizieren und nie eine Annahme durch Wiederholung zur Tatsache werden lassen.
- Dokumentieren, wonach gesucht und was nicht gefunden wurde; Abwesenheiten sind Nachweise.
- Fehlende von nicht erhebbaren Nachweisen unterscheiden und Letztere als Konfidenzgrenze in den Bericht tragen.
- Sicheren Zustand, Freigaben, aktive Überbrückungen und Forces sowie die Folgen von Ausfall, Abstellung und Prüfung feststellen — vor der Hypothesenbildung.
- Hypothesen über Gewerke hinweg bilden und stets „die Messung ist falsch“ und „nichts ist defekt“ aufnehmen.
- Die Hypothesen-Nachweis-Matrix ausdrücklich bauen und jeden Nachweis nach seiner Ausschlusskraft bewerten.
- Einen soliden Widerspruch als entscheidend behandeln, sofern er nicht mit Nachweisen entkräftet werden kann.
- Den nächsten Test danach wählen, welche leeren Zellen er füllt, nicht danach, welchen Favoriten er bestätigt.
- Beide Stufen getrennt anwenden — Hinlänglichkeit und Unterscheidung — und eine Ursache nur berichten, wenn beide erreicht sind.
- Ohne Schlussfolgerung handeln, wenn die Handlung sicher ist; nie eine Schlussfolgerung berichten, die nicht erreicht wurde.
- Handlungen nach Stufen ordnen, die billigste unterscheidende Stufe wählen und die Begründung dokumentieren.
- Nie eine Überbrückung, eine ausgehebelte Verriegelung oder einen abgeschalteten Schutz mit Zuversicht in eine Diagnose begründen.
- Die Anlage nie in einem Zustand belassen, dessen sicherer Ausgang von der Richtigkeit der Diagnose abhängt.
- Das Ergebnis jedes Tests unter jeder Hypothese vor der Durchführung vorhersagen.
- Über den Mechanismus verifizieren und das Ausbleiben eines sporadischen Fehlers nie als Behebungsnachweis akzeptieren.
- Die Diagnoseakte als Arbeitsergebnis führen: Symptom, Verzeichnis, Matrix, Stufen, Kandidaten, Handlung, Vorhersage, Ergebnis.
- Eskalationsauslöser und eine Zeitgrenze zu Beginn festlegen und mit Arbeitsergebnissen statt mit einer Schlussfolgerung eskalieren.
- Ausdrücklich entscheiden, ob das Ereignis eine rückblickende Untersuchung verdient, und sie bewusst übergeben.

## Fazit

Fünfzig Beiträge in dieses Journal hinein treffen dieselben Grundsätze aus verschiedenen Richtungen immer wieder ein, und es lohnt, sie gemeinsam zu benennen, denn sie sind die Substanz der Methode und nicht ihr Schmuck.

**Messen, bevor getauscht wird.** Fast jeder Beitrag hier enthält einen Fall, in dem Bauteile der Reihe nach gewechselt wurden und der Fehler anderswo lag.

**Der unterscheidende Nachweis existiert meist bereits** — im Speicher eines Geräts, in einem Vergleich, den niemand angestellt hat, im Unterschied zwischen zwei Kanälen, die man für gleich hielt. Abrufen schlägt Erheben häufiger, als man erwartet.

**Abwesenheit ist ein Nachweis**, aber nur, wenn sie hätte aufgezeichnet werden können — und eine Aufzeichnung, die die Sache gar nicht hätte enthalten können, schweigt, sie entlastet nicht.

**Annahmen sind stille Abhängigkeiten.** Konfigurierte Konstanten, Kalibrierfaktoren, Modellparameter und Auslegungsabsichten versagen ohne Meldung und stecken hinter einem erstaunlichen Anteil zuversichtlich falscher Zahlen.

**Übereinstimmung zwischen identischen Dingen ist keine Bestätigung.** Identische Redundanz erzeugt identische Fehler, und die daraus folgende Übereinstimmung ist das erwartete Ergebnis, ob das Paar richtig oder falsch liegt.

**Die erste plausible Erklärung ist der gefährlichste Moment jeder Untersuchung**, und das Gegenmittel ist die bewusste Suche nach der Tatsache, die nicht passt.

**Und die Sicherheitsebenen bleiben deterministisch.** Schutz, Verriegelungen und Sicherheitsfunktionen sind vorab beweisbar, unabhängig von allem darüber, und nie einer Diagnose untergeordnet — wie zuversichtlich, wie gut belegt und wie dringend der Produktionsdruck auch sein mag.

Nichts davon verlangt ein bestimmtes Werkzeug, eine bestimmte Plattform oder eine bestimmte Technologie. Es verlangt, dass Nachweise ihre Herkunft mitführen, dass Zuversicht durch das Gestützte begrenzt ist, dass Handeln durch Folgen statt durch Überzeugung begrenzt ist, und dass die Akte gut genug ist, damit jemand anderes ihr widersprechen kann. Eine Anlage, die so arbeitet, ist keine, in der nichts schiefgeht. Sie ist eine, in der die nächste Stunde nach einem Vorfall mit Nachweisen statt mit Meinungen verbracht wird — und in der die Handlung, die getroffen wird, während die Antwort noch aussteht, eine ist, die sich zurücknehmen lässt.
