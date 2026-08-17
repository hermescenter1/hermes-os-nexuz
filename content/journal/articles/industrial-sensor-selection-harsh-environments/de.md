# Sensorauswahl für raue industrielle Umgebungen

## Zusammenfassung

Messfehlschläge in Industrieanlagen sind selten Genauigkeitsfehlschläge. Fast keiner davon lässt sich auf ein Gerät zurückführen, das nicht präzise genug war.

Sie führen stattdessen auf vier Dinge zurück. **Das Messprinzip passte nicht zum Medium** — ein Verfahren, das einen Wert aus einer Eigenschaft ableitet, die der Prozess still verändert hat. **Die Montage machte die Messung unrepräsentativ** — ein korrektes Gerät, das die falsche Stelle misst. **Die Umgebung griff etwas an, das niemand spezifiziert hatte** — eine Dichtung, eine Kabeleinführung, eine Belüftung, ein Stecker, eine Kapillare. Oder **die Spezifikation optimierte die falsche Eigenschaft** — eine teure Genauigkeitsangabe für einen Kreis, der Wiederholbarkeit und Langzeitstabilität gebraucht hätte.

Der letzte Punkt gehört an den Anfang, denn er prägt jede folgende Auswahlentscheidung. **Genauigkeit ist die Zahl, um die im Einkauf gestritten wird; Wiederholbarkeit ist meist das, was die Anwendung braucht.** Einem Regelkreis ist ein fester Offset gleichgültig — ihm ist wichtig, ob derselbe Zustand morgen denselben Messwert ergibt. Ein Gerät mit hervorragender Genauigkeit und schlechter Langzeitstabilität ist für die Regelung schlechter als der umgekehrte Fall.

Dieser Beitrag behandelt, wie man die Anforderung vor dem Gerät festlegt, was die industrielle Umgebung tatsächlich angreift, wofür jede Messfamilie blind ist, warum die Montage die Geräteleistung häufig dominiert, und warum ein verdoppelter Sensor keine redundante Messung ergibt.

Die Verdrahtungsarchitektur um diese Geräte behandeln die Begleitbeiträge zur messtechnischen Architektur und zur 4–20-mA-Kreisauslegung; die Nutzung der Daten in einem Zustandsüberwachungsprogramm der Begleitbeitrag zur vorausschauenden Instandhaltung. Hier geht es um Auswahl und Montage des Geräts selbst.

## Die Anforderung vor dem Gerät festlegen

Vier Eigenschaften werden routinemäßig vermischt, und die Unterscheidung entscheidet den Kauf.

| Eigenschaft | Bedeutung | Wer sie braucht |
| --- | --- | --- |
| **Genauigkeit** | Nähe zum wahren Wert | Eichpflichtige Messung, Emissionsberichte, Qualitätsfreigabe |
| **Wiederholbarkeit** | Gleicher Eingang, gleicher Messwert | Regelkreise, Abläufe, Vergleiche |
| **Auflösung** | Kleinste vom Gerät gemeldete Änderung | Feine Positionierung, Kleinsignalmessung |
| **Stabilität / Drift** | Änderung über Zeit und Temperatur | Trendführung, Zustandsüberwachung, lange Kalibrierintervalle |

**Ein Regelkreis braucht Wiederholbarkeit und Stabilität weit dringender als absolute Genauigkeit**, denn er wirkt auf Änderungen und bezieht sich auf einen Sollwert, der selbst aus derselben Messung stammt. Eine Messung für Berichte oder Handel braucht Genauigkeit und rückführbare Kalibrierung. **Die falsche Eigenschaft zu spezifizieren kauft das falsche Gerät**, und die daraus folgende Beschwerde — „der Messwert stimmt nicht“ — schickt alle in die falsche Richtung.

**Die Ansprechzeit ist eine Systemeigenschaft, keine Geräteeigenschaft.** Die Zahl im Datenblatt beschreibt das Messelement. Die eingebaute Ansprechzeit bestimmt alles zwischen Prozess und Element: Ein schnelles Thermoelement in einem schweren Schutzrohr hat die Ansprechzeit des Schutzrohrs; ein Druckmessumformer hinter einer langen Wirkdruckleitung deren Zeit; ein Fernübertragungssystem die der Kapillare. **Wenn ein Regelkreis zu langsam ist und der Sensor „schnell“, ist meist das Schutzrohr die Antwort.**

**Den gesamten Betriebsbereich spezifizieren, nicht den Normalzustand.** Die Zustände, die Messgeräte zerstören, sind selten der Normalbetrieb:

- Anfahr- und Abfahrtransienten, einschließlich Unterdruck beim Abkühlen.
- Reinigungs- und Sterilisationszyklen, deren Temperatur und Chemie den Prozess übertreffen können.
- Ausdampfen mit Dampf, das mehr Messgeräteleben beendet hat als jedes Prozessmedium.
- Störzustände und der maximale plausible Über- oder Übertemperaturfall.
- Messspanne nach unten: Ein für den maximalen Durchfluss ausgelegtes Gerät kann beim minimalen unterhalb seines nutzbaren Bereichs liegen, wo seine prozentuale Unsicherheit am größten ist.

**Und den Zweck der Messung benennen**, denn er ändert die Anforderungen: Regelung, Anzeige, Schutz, Abrechnung oder Zustandsüberwachung. Eine Schutzmessung hat Verfügbarkeits-, Fehlerrichtungs- und Prüfbarkeitsanforderungen, die eine Anzeige nicht hat.

## Was die Umgebung tatsächlich angreift

**Die Temperatur greift die Elektronik an, nicht das Messelement.** Das Messelement wird meist für den Prozess spezifiziert; das Umformergehäuse für die Umgebung, und die Umgebung wird regelmäßig unterschätzt. Wärmestrahlung benachbarter Anlagenteile, Sonneneinstrahlung auf ein unbeschattetes Gehäuse und der Einbau in einem unbelüfteten Schrank heben die Elektroniktemperatur weit über die genannte Lufttemperatur. **Die Elektronik abgesetzt außerhalb der heißen Zone zu montieren ist die übliche Antwort** und kostet weit weniger als die verhinderten Ausfälle.

**Schutzarten sind Prüfergebnisse, keine Zusagen.** Eine Schutzartklassifizierung beschreibt das Verhalten gegenüber definierten Fest- und Wasserprüfungen unter festgelegten Bedingungen. Sie beschreibt keine Beständigkeit gegen Dampf, gegen Hochdruck- oder Heißwasserreinigung (die eigene Kennzeichnungen haben), gegen Chemikalien oder gegen längeres Untertauchen. **Ein Gerät, das seine Schutzartprüfung besteht, kann von einem Reinigungsregime zerstört werden, das die Prüfung nicht abbildete.**

**Und das meiste Wasser in einem dichten Gerät gelangt nicht als Wasser hinein.** Der tägliche Temperaturwechsel lässt das Gehäuse atmen; feuchte Luft dringt auf dem kleinsten Weg ein und kondensiert innen. Daraus folgen zwei Gerätedetails, beide häufig übersehen:

- **Überdruckmessumformer brauchen einen Weg zur Atmosphäre.** Diese Belüftung ist eine konstruierte Öffnung, sie enthält meist einen Filter oder eine Membran, und wenn sie verstopft, benetzt oder verschmutzt, misst das Gerät gegen einen eingeschlossenen Bezug, der sich mit der Temperatur bewegt. **Das Ergebnis ist eine langsame Drift ohne jede Fehlermeldung** — das Gerät ist gesund und sein Bezug nicht.
- **Kabeleinführungen sind der andere Weg.** Eine auf den falschen Kabeldurchmesser angezogene Verschraubung, ein von oben eintretendes Kabel ohne Tropfschleife oder eine unbenutzte Einführung mit Transportstopfen ergeben alle ein nasses Gerät mit einwandfreier Schutzart.

**Chemischer Angriff findet meist das weichste Bauteil.** Die medienberührten Werkstoffe des Messelements werden üblicherweise sorgfältig gewählt; **Dichtung, O-Ring und Dichtwerkstoff** werden aus dem Schrank genommen. Die Elastomerverträglichkeit mit Prozess, Reinigungschemie und Betriebstemperatur ist eine von der Metallurgie getrennte Prüfung. **„Edelstahl“ ist eine Familie, kein Werkstoff** — die Sorte zählt, chloridhaltige Umgebungen unterscheiden besonders scharf, und die Familie statt der Sorte zu spezifizieren verschiebt die Entscheidung zum Anbietenden.

**Vibration greift Halterung, Kabel und Stecker an, bevor sie den Sensor angreift.** Ermüdung an der Kabeleinführung, Kaltverfestigung dünner Wirkdruckleitungen, Lockern eines Montagewinkels und Steckerfretting sind die üblichen Folgen. **Resonanz ist der Mechanismus, der erträgliche Vibration in Ausfall verwandelt**, und eine lange, ungestützte Wirkdruckleitung oder Kapillare ist ein ausgezeichneter Resonator.

**Die elektrische Umgebung** — Störfestigkeit, Kopplung, Gleichtakt — behandeln die Beiträge zur Messtechnikarchitektur und zur Antriebs-EMV. Auf Auswahlebene zählt nur, dass ein Gerät eine Störfestigkeitsangabe trägt, dass die Installation sie nicht überschreiten darf, und dass ein von Stromrichtern und Schaltlasten dichter Bereich eine Spezifikationsvorgabe ist und keine Überraschung.

**Explosionsgefährdete Bereiche** stellen Anforderungen, die gegen nichts davon verhandelbar sind: Das Gerät muss für die Zone und die Gas- oder Staubgruppe geeignet sein, die Temperaturklasse setzt die maximale Oberflächentemperatur des Geräts in Beziehung zu den Zündeigenschaften des vorhandenen Stoffs, und der Umgebungstemperaturbereich des Zertifikats gilt für den tatsächlichen Einbauort. Das gehört zur Ex-Dokumentation des Standorts und zu den Gerätezertifikaten, die über allem hier Geschriebenen stehen.

## Wofür jede Messfamilie blind ist

**Temperatur.** Thermoelemente sind robust, weitbereichig und selbsterzeugend, liefern aber ein kleines, auf eine Vergleichsstelle bezogenes Signal und driften mit der Degradation ihrer Messstelle. Widerstandsthermometer sind über industrielle Bereiche stabiler und wiederholbarer, werden aber vom Leitungswiderstand und von Eigenerwärmung beeinflusst. **Das Schutzrohr ist sowohl ein thermisches als auch ein mechanisches Bauteil**: Es dominiert die eingebaute Ansprechzeit und steht als stumpfer Körper in der Strömung — Wirbelablösung kann es anregen, und ein ermüdendes Schutzrohr kann in den Prozess hinein versagen. Seine Auslegung gegen die tatsächlichen Strömungsbedingungen ist eine Berechnung, keine Katalogauswahl. **Unzureichende Eintauchtiefe erzeugt einen Wärmeableitfehler**, bei dem das Rohr Wärme abführt und der Messwert zwischen Prozess und Umgebung liegt — stabil, plausibel und falsch. Berührungslose Infrarotmessung liest eine Oberfläche, hängt vom Emissionsgrad ab und sieht alles zwischen Sensor und Oberfläche, einschließlich Dampf, Staub und einem verschmutzten Fenster.

**Druck.** Der Bezug bestimmt die Messung: Überdruck (auf die Atmosphäre bezogen und damit von jener Belüftung abhängig), Absolutdruck oder Differenzdruck. Membranwerkstoff und Dichtungsverträglichkeit bestimmen die Lebensdauer. **Fernübertragungen lösen ein Montageproblem und erzeugen zwei weitere**: Die Ausdehnung der Füllflüssigkeit macht den Messwert temperaturabhängig, und die Kapillare erhöht die Ansprechzeit. **Wirkdruckleitungen sind die Stelle, an der Druckmessungen tatsächlich versagen** — verstopft, eingefroren, mit Gas im Flüssigkeitsschenkel oder Kondensat im Gasschenkel. Jeder dieser Fälle erzeugt einen stabilen, plausiblen, falschen Wert statt eines offensichtlichen Fehlers, weshalb „der Umformer wurde schon zweimal getauscht“ eine so häufige Vorgeschichte ist. Überdruckangaben unterscheiden den Druck, den das Gerät unbeschadet erträgt, vom Druck, bei dem es strukturell versagt, und der Betriebsbereich muss den ersten respektieren.

**Durchfluss.** Mehr als bei jeder anderen Familie lautet die Auswahlfrage: *Was verlangt das Messgerät von Medium und Rohrleitung?* Volles Rohr, eine Mindestleitfähigkeit, sauberes oder feststoffhaltiges Medium, eine einzige Phase, ein definiertes Strömungsregime und eine festgelegte ungestörte Ein- und Auslaufstrecke. **Wirkdruckverfahren messen eine Druckdifferenz und leiten den Durchfluss ab**, die Ableitung hängt also von der Dichte ab und verliert abseits des Auslegungspunkts an Güte. Und der entscheidende Praxispunkt: **Die angegebene Genauigkeit gilt unter Referenz-Einbaubedingungen, und die eingebaute Unsicherheit ist eine andere Zahl** — ein vorgelagerter Bogen, ein teilgeöffnetes Ventil oder eine zu kurze Einlaufstrecke können mehr Fehler beitragen als die Gerätespezifikation, sodass ein hochgenaues Messgerät in schlechtem Einbau ein teures Durchschnittsgerät ist.

**Füllstand.** Die Auswahl wird vom Verhalten des Mediums bestimmt: Schaum, Anbackungen, Rührwerksbewegung, Dampf, temperaturabhängige Dichte und Phasengrenzen. **Die meisten Füllstandsverfahren messen keinen Füllstand; sie messen etwas anderes und leiten ihn ab.** Hydrostatische Messung leitet aus dem Druck ab und unterstellt eine Dichte. Laufzeitverfahren leiten aus einer Reflexion ab und unterstellen eine erkennbare Oberfläche. Kapazitive Verfahren leiten aus einer Dielektrizitätseigenschaft ab. **Eine Änderung des Mediums ändert daher den Messwert, während der Füllstand bleibt, wo er war**, und es tritt kein Gerätefehler auf. Dieser eine Satz erklärt einen großen Teil aller Füllstandsstreitigkeiten.

**Näherung und Position.** Die Technik folgt Ziel und Verschmutzung: Induktive Geräte sehen Metall, kapazitive fast alles einschließlich Kühlmittel und Eis, magnetische brauchen einen Magneten, mechanische verschleißen. **Die Halterung ist Teil des Sensors** — der Schaltabstand ist gegen ein definiertes Ziel aus definiertem Werkstoff und definierter Größe angegeben, und eine Drift der Halterung ist von einer Drift des Geräts nicht zu unterscheiden. Wo das Gerät an einer Verriegelung mitwirkt, sind sein stromloser Zustand und seine Fehlerrichtung Auslegungsentscheidungen und keine Verdrahtungsbequemlichkeiten.

**Vibration.** Die Ankopplung *ist* die Messung. Ein aufgeschraubter Beschleunigungsaufnehmer, ein magnetisch angesetzter und eine Handsonde haben zunehmend niedrigere nutzbare Frequenzbereiche, weshalb **mit verschiedenen Methoden gewonnene Messwerte nicht vergleichbar sind** und ein Verlauf, der die Methode wechselt, kein Verlauf ist. Kabel- und Steckerausfälle dominieren die Zuverlässigkeit von Beschleunigungsaufnehmern im industriellen Einsatz, besonders ohne Zugentlastung am Sensor. Die Auswertung von Schwingungsdaten gehört zum Zustandsüberwachungsbeitrag; auf Auswahlebene zählt, dass die Ankopplungsart festgelegt und als Teil der Messdefinition dokumentiert wird.

## Die Montage dominiert häufig die Auswahl

- **Zuerst die Repräsentativität.** Eine Messung dort, wo die Leitung zugänglich war, statt dort, wo der Prozesszustand herrscht, ist um einen Betrag falsch, den niemand berechnen kann. Temperaturschichtung, unvollständig gemischte Ströme und Totstrecken erzeugen alle getreue Messungen der falschen Größe.
- **Ausrichtung und Eintauchtiefe.** Eintauchtiefe bei Temperatur, Ausrichtung bei Füllstand und bei Geräten, die ein volles Rohr voraussetzen, sowie die Richtung jedes Entwässerungs- oder Entlüftungswegs.
- **Selbstentleerende oder selbstentlüftende Wirkdruckleitungen.** Eine falsch geneigte Flüssigkeitsleitung fängt Gas; eine falsch geneigte Gasleitung fängt Kondensat. Das ist eine einmal getroffene Verlegeentscheidung, die zwanzig Jahre über die Vertrauenswürdigkeit der Messung entscheidet.
- **Wartbarkeit durch Auslegung.** Lässt sich das Gerät ohne Prozessstillstand freischalten, kalibrieren und tauschen? Absperr-und-Entlüftungsanordnungen, Absperrventile und zugängliche Montage sind im Bau billig und später kaum bequem nachrüstbar.
- **Die Halterung als Struktur.** Sie trägt das Gerät durch Vibration und Wärmedehnung und gehört als mechanisches Bauteil geprüft, nicht angenommen.
- **Die Kabeleinführung.** Zur Leitung passende Verschraubung, Tropfschleife unterhalb der Einführung, Zugentlastung am Gerät, ordentlich verschlossene unbenutzte Einführungen.

## Diagnose, Ausfallverhalten und echte Redundanz

**Die wertvollste Zuverlässigkeitseigenschaft einer Messung ist, ob sie erkennbar ausfällt.**

| Ausfallart | Beispiel | Folge |
| --- | --- | --- |
| **Offensichtlicher Ausfall** | Offenes Thermoelement, unterbrochener Kreis, Signal außerhalb des Bereichs | System und Bedienpersonal wissen es sofort |
| **Plausibler Ausfall** | Verstopfte Wirkdruckleitung, Wärmeableitfehler, Dichteänderung, driftender Bezug | Eine stabile, glaubwürdige, falsche Zahl, nach der alle handeln |

**Wo die Folge einer falschen Messung groß ist, ein erkennbar ausfallendes Prinzip bevorzugen** oder ein Mittel zur Erkennung des plausiblen Ausfalls ergänzen. Dieses Auswahlkriterium erscheint selten in einem Datenblattvergleich und zählt mehr als die meisten, die dort erscheinen.

**Gerätediagnose hilft nur, wenn sie jemanden erreicht.** Moderne Umformer erkennen Sensorfehler, Bereichsüberschreitungen und interne Ausfälle und melden sie, indem sie den Ausgang aus dem Messbereich heraus treiben — eine Konvention, die der Kreisbeitrag behandelt. Diese Information geht verloren, wenn der Eingang begrenzt, die Fehlerrichtung nicht konfiguriert ist oder die Meldung auf dieselbe Kennzeichnung wie eine Prozessmeldung abgebildet wird.

**Verdopplung ist keine Redundanz.** Zwei identische Geräte, gleiches Prinzip, gleicher Prozessanschluss, gleiche Umgebung, teilen ihre Ausfallursachen:

- Beide Wirkdruckleitungen verstopfen gemeinsam, weil derselbe Prozess sie zusetzt.
- Beide Sensoren backen gemeinsam an, weil sie dasselbe Medium sehen.
- Beide Messwerte verschieben sich gemeinsam, weil die von beiden genutzte Annahme sich geändert hat.
- Beide fallen im Störfall gemeinsam aus, weil der Störfall die gemeinsame Ursache ist.

**Diversitäre Redundanz adressiert das**: verschiedene Messprinzipien, verschiedene Prozessanschlüsse oder beides. Eine hydrostatische und eine Laufzeit-Füllstandsmessung fallen aus völlig verschiedenen Gründen aus, sodass eine Abweichung zwischen ihnen informativ ist, während eine Abweichung zwischen zwei identischen Geräten es nicht ist.

**Der praktische Mechanismus ist die Abweichungsüberwachung**: laufender Vergleich redundanter Messungen mit Meldung bei Unterschied. **Ein Messpaar, das perfekt übereinstimmt und beidseitig falsch ist, ist genau das, was identische Redundanz erzeugt** — weshalb Diversität die zählende Eigenschaft ist und Verdopplung die gekaufte.

Abstimmungsanordnungen, Prüfintervalle und die Architektur sicherheitsgerichteter Messungen gehören zur funktionalen Sicherheitsauslegung und zum Begleitbeitrag über Verriegelungen und Abschaltlogik; auf Auswahlebene besteht die Pflicht darin, vor der Gerätewahl zu wissen, in welcher Kategorie eine Messung liegt.

## Wartbarkeit und Lebenszyklus

- **Die Konfiguration ist Teil des Geräts.** Ein moderner Umformer trägt Messspanne, Dämpfung, Einheiten, Fehlerrichtung, Linearisierung und Diagnoseeinstellungen. Ein mit Werkseinstellungen eingebautes Ersatzgerät ist kein Ersatz, und ein Betrieb ohne Aufzeichnung der Gerätekonfigurationen kann unter Druck nicht korrekt tauschen.
- **Kalibrierung vor Ort oder auf dem Prüfplatz?** Die Antwort entscheidet, ob überhaupt kalibriert wird.
- **Ersatzteilstrategie.** Ein Gerät mit langer Lieferzeit und ohne Ersatzteil ist eine Verfügbarkeitsentscheidung, ob absichtlich getroffen oder nicht.
- **Obsoleszenz.** Sensoren überleben ihre Produktfamilien. Eine Standardschnittstelle — ein analoges Stromsignal, ein verbreitetes digitales Protokoll — erhält die Fähigkeit, ein Gerät ohne Systemwechsel zu ersetzen.
- **Dokumentieren, was wo, warum und mit welchen Einstellungen eingebaut wurde**, denn die nächste Person hat nichts von dem Kontext, der die Auswahl richtig machte.

## Fehlermodi

**Genauigkeit spezifiziert, wo Wiederholbarkeit nötig war.** Ein teures Gerät, das das Problem nicht löst.

**Ansprechzeit aus dem Datenblatt übernommen.** Schutzrohr, Wirkdruckleitung oder Kapillare bestimmen den echten Wert.

**Umgebungstemperatur an der Elektronik unterschätzt.** Strahlungs- und Sonnenwärme töten Umformer, die der Prozess nie berührt hat.

**Schutzart als Zusage behandelt.** Dampf, Reinigung und Chemikalien bildete die Prüfung nicht ab.

**Verstopfte oder benetzte Belüftung an einem Überdruckumformer.** Eine langsame Drift ohne Fehlermeldung.

**Dichtungswerkstoff aus dem Lager gewählt.** Die Metallurgie wurde spezifiziert, das weichste Bauteil nicht.

**Edelstahl ohne Sorte spezifiziert.** Die Wahl an den Anbietenden delegiert.

**Lange ungestützte Wirkdruckleitung oder Kapillare.** Ein Resonator in einer vibrierenden Anlage.

**Unzureichende Schutzrohr-Eintauchtiefe.** Ein Wärmeableitfehler: stabil, plausibel und falsch.

**Schutzrohr nicht gegen die tatsächliche Strömung beurteilt.** Ein mechanisches Bauteil als Katalogposition behandelt.

**Durchflussmessgerät ohne die geforderte Einlaufstrecke eingebaut.** Eingebaute Unsicherheit größer als die erkaufte Gerätespezifikation.

**Füllstand aus einer geänderten Eigenschaft abgeleitet.** Kein Gerät ist ausgefallen und der Messwert ist falsch.

**Wirkdruckleitung verstopft, eingefroren oder mit der falschen Phase gefüllt.** Eine glaubwürdige Zahl und ein zweimal getauschter Umformer.

**Schwingungsverlauf aus gemischten Ankopplungsarten.** Kein Verlauf.

**Zwei identische Geräte an einem Prozessanschluss Redundanz genannt.** Eine Ausfallursache, zwei ausgefallene Messungen, perfekte Übereinstimmung.

**Keine Abweichungsüberwachung zwischen redundanten Geräten.** Genau der eine Mechanismus, der den Unterschied erkannt hätte.

**Fehlerrichtung nicht konfiguriert oder Eingang begrenzt an den Bereichsgrenzen.** Gerätediagnose verworfen, bevor sie jemanden erreicht.

**Ersatzgerät mit Werkskonfiguration eingebaut.** Das Bauteil passte, die Messung nicht.

**Keine Absperr- und Entlüftungsmöglichkeit.** Kalibrierung erfordert Stillstand, also findet Kalibrierung nicht statt.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein kritischer Behälter hat zwei unabhängige Füllstandsmessumformer, die beide ins Leitsystem melden, mit konfigurierter Abweichungsmeldung zwischen ihnen. Während einer Charge steigt der tatsächliche Flüssigkeitsstand ohne jede Meldung über das vorgesehene Maximum. Beide Umformer liegen durchgehend innerhalb weniger Prozent voneinander, und beide melden unterhalb des wahren Stands. Beide Geräte werden anschließend auf dem Prüfplatz als innerhalb der Spezifikation befunden.

```text
Symptom:
A high-level condition reached without alarm on a vessel with two independent
level transmitters that agreed with each other throughout and were both
subsequently proven healthy on the bench.

Evidence:
- both transmitters are hydrostatic: they measure pressure at the bottom of
  the vessel and the system computes level from an assumed liquid density
- both are connected to the vessel through the same lower tapping, via a
  common manifold
- the density value used in the level calculation is a fixed configured
  constant, entered at commissioning
- the batch in question used a product grade of noticeably lower density than
  the grade in use when the constant was set
- the measured pressures were correct for the actual liquid column present
- the deviation alarm between the two transmitters never activated, because
  both were reading the same correct pressure and applying the same wrong
  density
- an independent sight indication, when eventually checked, showed the true
  level
- neither device logged a diagnostic event; neither had drifted

Reasoning:
Nothing failed. Both instruments measured pressure faithfully and both
calculations converted that pressure into level using a density that was no
longer true. The measurement was an inference, and the assumption underneath
the inference had changed.

The redundancy was ineffective for a specific and instructive reason: the two
measurements were duplicated rather than diverse. They shared the measuring
principle, the process connection and the density assumption, so every failure
mechanism available to one was available to both in exactly the same
proportion. Deviation checking between them could never detect this class of
error, because the error is common to both by construction — and the perfect
agreement between them was read as confirmation rather than as an absence of
information.

Next investigations:
- establish the range of product densities the vessel actually sees and how
  often the grade changes
- determine whether density can be measured or inferred online, or whether the
  constant must be set per product grade by the batch system
- review every other inferred measurement on the plant for a configured
  constant that a process change can invalidate
- evaluate adding a diverse level measurement on a separate connection, using
  a principle that does not depend on density
- re-specify the deviation check so that it compares measurements capable of
  disagreeing
```

**Zwei übertragbare Lehren.** Erstens: **Eine abgeleitete Messung ist nur so gültig wie ihre Annahme**, und konfigurierte Konstanten — Dichte, Dielektrizitätszahl, Emissionsgrad, Zusammensetzung, Temperaturkompensation — sind stille Abhängigkeiten, die keine Gerätediagnose überwacht. Zweitens: **Übereinstimmung zwischen identischen redundanten Messungen ist kein Nachweis**; sie ist das erwartete Ergebnis, ob sie richtig oder falsch liegen. Redundanz erkennt Ausfälle nur dort, wo die beiden Messungen unterschiedlich ausfallen können — und das ist das ganze Argument für Diversität.

## Empfohlene Praxis

- Entscheiden, ob die Anwendung Genauigkeit, Wiederholbarkeit, Auflösung oder Langzeitstabilität braucht, und diese Eigenschaft spezifizieren — nicht alle vier.
- Die eingebaute Ansprechzeit einschließlich Schutzrohr, Wirkdruckleitung oder Kapillare spezifizieren, nicht den Wert des Messelements.
- Den gesamten Betriebsbereich benennen: Anfahren, Abfahren, Reinigung, Sterilisation, Ausdampfen, Störfall und kleinste Messspanne.
- Den Zweck der Messung — Regelung, Anzeige, Schutz, Abrechnung oder Zustandsüberwachung — angeben, denn die Anforderungen unterscheiden sich.
- Die Umgebungstemperatur an der Elektronik einschließlich Strahlungs- und Sonnenwärme spezifizieren und die Elektronik abgesetzt von heißen Zonen montieren.
- Schutzarten als Prüfergebnisse behandeln und für Dampf, Reinigungschemie und Untertauchen gesondert spezifizieren.
- Belüftungen, Kabeleinführungen, Tropfschleifen und unbenutzte Einführungen als ausdrückliche Positionen prüfen.
- Dicht- und Elastomerwerkstoffe gegen Prozess, Reinigungschemie und Temperatur spezifizieren und die Werkstoffsorte statt der Familie angeben.
- Schutzrohre gegen die tatsächlichen Strömungsbedingungen beurteilen und die Eintauchtiefe zur Vermeidung des Wärmeableitfehlers festlegen.
- Einlaufstrecken- und Einbauanforderungen von Durchflussmessgeräten spezifizieren und die eingebaute Unsicherheit bewerten, nicht nur die Gerätegenauigkeit.
- Jede Messung identifizieren, die einen Wert aus einer Annahme ableitet, und die Annahme als gepflegten Parameter dokumentieren.
- Wo die Folge eines falschen Messwerts groß ist, erkennbar ausfallende Prinzipien bevorzugen.
- Die Fehlerrichtung konfigurieren und die Bereichsüberschreitungsmeldung durchgängig erhalten.
- Redundanz diversitär gestalten — anderes Prinzip, anderer Anschluss oder beides — und eine Abweichungsüberwachung einrichten, die einen Unterschied erkennen kann.
- Für Wartbarkeit auslegen: Absperrung, Entlüftung, zugängliche Montage, Kalibrierung vor Ort.
- Die Konfiguration jedes Geräts neben seiner Kennzeichnung dokumentieren und die Konfiguration eines Ersatzgeräts als Teil des Tauschs behandeln.
- Kabel und Wirkdruckleitungen gegen Vibration abstützen und jedes Kabel am Gerät zugentlasten.

## Fazit

Sensorauswahl sieht aus wie ein Vergleich von Spezifikationen und ist in der Praxis eine Folge von Urteilen über Umgebung, Medium und die Folgen des Irrtums. Das Datenblatt beschreibt ein Gerät unter Referenzbedingungen; die Anlage liefert Bedingungen, die keine Referenz sind, eine Montage, die die Messung verändert, ein Medium, das sich ändert, und ein Instandhaltungsregime, das das Gerät erreichen wird oder nicht.

Drei Gewohnheiten trennen Installationen, die zwanzig Jahre verlässlich messen, von solchen, die Arbeitsaufträge erzeugen. Die Eigenschaft spezifizieren, die die Anwendung wirklich braucht, statt der am leichtesten vergleichbaren. Aufschreiben, was jede Messung voraussetzt, denn abgeleitete Messungen versagen, wenn ihre Annahmen sich ändern, und nichts meldet es. Und Redundanz diversitär gestalten, denn zwei identische Geräte an einem Anschluss mit derselben Annahme stimmen genau bis zu dem Moment überein, in dem es darauf ankommt.
