# Sanftanlasser oder Frequenzumrichter: Auswahlkriterien

## Zusammenfassung

Die Wahl wird meist als Budgetfrage gestellt und als Modefrage beantwortet. Sie ist weder das eine noch das andere. Sie beruht auf einer physikalischen Asymmetrie, und sobald diese ausgesprochen ist, entscheiden sich die meisten Fälle von selbst.

**Ein Sanftanlasser senkt den Anlaufstrom, indem er die angelegte Spannung senkt — und das Moment fällt mit dem Quadrat der Spannung. Ein Umrichter senkt den Anlaufstrom, indem er Frequenz und Spannung gemeinsam senkt, sodass der Motor seinen Fluss behält und volles Moment bei einem Bruchteil des Netzstroms erzeugen kann.**

Deshalb kann ein Sanftanlasser nicht jede Last anfahren, die ein Umrichter schafft; deshalb ist er dennoch für einen großen Teil drehzahlfester Maschinen die bessere Lösung; und deshalb führt der zutreffende Satz „der Umrichter kann mehr“ zu schlechten Entscheidungen, wenn er als ganzes Argument benutzt wird.

**Sicherheitshinweis.** Beide Geräte enthalten Leistungshalbleiter, der Umrichter zusätzlich einen geladenen Zwischenkreis, der nach dem Freischalten gefährlich bleibt. Alle Arbeiten erfordern Freischalten, Sichern, Feststellen der Spannungsfreiheit und Einhalten der angegebenen Entladezeit — durch befähigtes Personal nach den Verfahren des Standorts.

## Die Physik, die die meisten Fälle entscheidet

Für einen Asynchronmotor bei gegebenem Schlupf sind die maßgeblichen Beziehungen einfach und verdienen eine genaue Formulierung, weil alles Weitere daraus folgt.

```text
I_start ∝ V                       stator current scales with applied voltage
T_start ∝ V²                      torque scales with the square of applied voltage

  V       = voltage applied to the motor terminals
  I_start = starting current drawn at that voltage
  T_start = torque produced at that voltage, at a given slip

Assumptions: constant supply frequency; motor operating on its normal
V/f relationship; slip unchanged at the instant compared. These are the
conditions under which a reduced-voltage starter works.
```

**Die praktische Folge:** Wird der Anlaufstrom auf etwa die Hälfte des Direktanlaufwerts gesenkt, bleibt rund ein Viertel des Direktanlaufmoments. Eine Last, deren Losbrechmoment darüber liegt, bewegt sich schlicht nicht, und der Motor steht bei hohem Strom still, bis der Schutz eingreift.

Ein Umrichter unterliegt diesem Tausch nicht, weil er die Spannung nicht bei fester Frequenz senkt. Er liefert eine niedrige Frequenz mit entsprechend niedriger Spannung, behält damit den Fluss und die Momentfähigkeit, und der Strom, den er dem Netz entnimmt, folgt der tatsächlich gelieferten Leistung statt der Kurzschlussläufer-Kennlinie des Motors.

**Das ist die gesamte Grundlage der Auswahl.** Alles Folgende ist entweder eine Konsequenz daraus oder ein praktischer Preis, der daneben steht.

## Was die Last verlangt

Die Drehzahl-Moment-Kennlinie der Last entscheidet, ob reduzierte Spannung überhaupt tragfähig ist.

| Last | Losbrechmoment | Trägheit | Anlauf mit reduzierter Spannung tragfähig? |
| --- | --- | --- | --- |
| Kreiselpumpe, Ventil gedrosselt oder geschlossen | Gering | Gering | Ja, mit Reserve |
| Ventilator, Klappe geschlossen | Gering | Mittel bis hoch | Meist ja, die Trägheit bestimmt die Hochlaufzeit |
| Ventilator, Klappe offen | Gering | Hoch | Grenzwertig; langer Hochlauf |
| Beladener Gurtförderer | Hoch | Hoch | Oft nicht — der klassische Fehlschlag |
| Verdrängerpumpe | Hoch | Gering | Meist nicht ohne Entlastung |
| Kolbenverdichter | Hoch, zyklisch | Mittel | Nur entlastet angefahren |
| Brecher oder Mühle, beladen | Sehr hoch | Sehr hoch | Nein |
| Brecher oder Mühle, leer | Mittel | Sehr hoch | Manchmal, mit langem Hochlauf |

**Zwei Zeilen verdienen einen Kommentar.** Verdichter und Verdrängerpumpen werden häufig *entlastet* angefahren — über ein Entlastungsventil, einen Bypass oder ein offen belassenes Druckventil —, und diese mechanische Entscheidung, nicht der Anlasser, macht den Anlauf bei reduzierter Spannung möglich. Wo eine zuverlässige Entlastung existiert, wird der Sanftanlasser an einer Maschine tragfähig, die sonst einen Umrichter verlangte.

**Und die gegenintuitive Zeile:** Ein trägheitsreicher Ventilator gegen geschlossene Klappe verlangt wenig Moment, braucht aber lange bis zur Drehzahl — und diese Dauer ist die Randbedingung.

## Die Hochlaufzeit ist ein thermisches Budget, keine Komforteinstellung

Das häufigste Missverständnis über Sanftanlasser lautet, eine längere, sanftere Rampe sei schonender für den Motor. Sie ist schonender für die *Mechanik* und härter für den *Motor*.

**Während des Hochlaufs arbeitet der Motor bei hohem Schlupf, und der größte Teil der aufgenommenen Energie geht in den Rotor.** Die Rotorerwärmung folgt aus Strom und Hochlaufdauer. Ein Sanftanlauf, der den Strom auf 60 % des Direktanlaufwerts senkt, dafür aber viermal so lange bis zur Drehzahl braucht, kann mehr Wärme im Rotor hinterlassen als der ersetzte Direktanlauf.

Das erzeugt einen konkreten, wiedererkennbaren Fehler: Ein Motor, der am Direktschütz zuverlässig anlief, beginnt nach dem Einbau eines Sanftanlassers „zur Schonung der Maschine“ thermisch auszulösen.

**Die daraus folgende Regel: Die Rampe ist beidseitig begrenzt.** Sie muss lang genug sein, um mechanischen Stoß und Strom zu begrenzen, und kurz genug, dass die zulässige Hochlaufzeit und das Anlaufregime des Motors nicht überschritten werden. Beide Grenzen kommen von Motor und Last, nicht aus der Parameterliste des Anlassers.

**Bei trägheitsreichen Lasten** ist genau das die Bedingung, unter der ein Umrichter seinen Preis rechtfertigt: Er kann volles Moment bei niedrigem Strom so lange liefern, wie der Hochlauf dauert, weil die thermische Belastung des Motors nicht mehr an eine Kurzschlussläufer-Kennlinie gekoppelt ist.

## Wo der Sanftanlasser die bessere Wahl ist

Ein Sanftanlasser ist kein billiger Umrichter. Er ist eine andere Maschine mit echten Vorzügen, und ihn als minderwertige Option zu behandeln erzeugt überkonstruierte Anlagen.

**Wenn der Prozess eine Drehzahl braucht.** Läuft die Maschine bei Betrieb stets mit Nenndrehzahl und ist allein der Anlauf das Problem, fügt ein Umrichter eine nie genutzte Fähigkeit und dauerhaft anfallende Kosten hinzu.

**Wenn der mechanische Stoß das eigentliche Problem ist.** Riemenschlupf, Stoßbelastung von Getrieben, Kupplungsverschleiß, Kettenrucke und Druckstöße in Rohrleitungen sind sämtlich Anlaufprobleme. Eine geregelte Spannungsrampe adressiert sie direkt — und eine geregelte *Auslauframpe* adressiert den Druckstoß beim Abschalten, was oft die stärkere der beiden Begründungen ist.

**Wenn dauerhafte Verluste zählen.** Ein Sanftanlasser mit Bypass-Schütz ist nach der Rampe elektrisch ein Schütz: praktisch keine Dauerverluste, keine Wärme im Raum, kein Oberschwingungsbeitrag, keine ausgangsseitigen Wirkungen auf den Motor. Ein Umrichter verliert dauerhaft einen Anteil der Leistung und bringt diese Wärme in jeder Betriebsstunde in den Elektroraum.

**Wenn Einfachheit betrieblich zählt.** Weniger Parameter, schnellere Inbetriebnahme, einfachere Ersatzteile, keine Motorleitungslängenbegrenzung, keine Wellenreflexions- oder Lagerstromfrage, keine Oberschwingungsstudie — und eine Instandhaltungsfachkraft versteht ihn um drei Uhr nachts.

> Die ausgangsseitigen Folgen eines Umrichters — Reflexionsbelastung der Motorisolation, Gleichtaktstrom und Lagerschäden, Leitungslängengrenzen — behandelt der Begleitbeitrag zu Oberschwingungen, EMV und Motorleitungen. Jede davon ist ein Preis, den ein Sanftanlasser mit Bypass schlicht nicht zahlt.

## Wo der Umrichter gerechtfertigt ist

**Wenn der Prozess von variabler Drehzahl profitiert.** Das ist der entscheidende Fall, und es ist ein Prozess- und kein Elektroargument. Mengen- oder Druckregelung über die Drehzahl statt über Drosselung, Anpassung eines Förderers an den nachgelagerten Bedarf, Ventilatorregelung nach einer Messgröße — Anliegen, die ein Sanftanlasser überhaupt nicht bedienen kann.

> Ob variable Drehzahl in einer konkreten Anlage tatsächlich Energie spart und warum die Antwort an der Lastkurve hängt und nicht am Umrichter, untersucht der Begleitbeitrag zur Energieoptimierung mit drehzahlvariablen Antrieben.

**Wenn volles Moment bei niedriger oder null Drehzahl gebraucht wird** oder die Last bei reduzierter Spannung schlicht nicht hochläuft.

**Wenn die Schalthäufigkeit hoch ist.** Wiederholtes Anfahren ist am Motor thermisch teuer, und der stromarme, geregelte Hochlauf eines Umrichters ist weit schonender als wiederholte Anläufe mit reduzierter Spannung. Eine Maschine, die mehrmals stündlich anläuft, ist auch bei konstanter Drehzahl eine Umrichteranwendung.

**Wenn das Netz weich ist.** An einem Generator, einer langen Stichleitung oder einem kapazitätsbegrenzten Transformator kann selbst ein Anlauf mit reduzierter Spannung einen unzulässigen Spannungseinbruch verursachen. Der Netzstrom des Umrichters während des Hochlaufs ist ein Bruchteil beider Alternativen.

**Wenn geregeltes Verzögern oder Bremsen über das hinaus verlangt wird, was ein Spannungsauslauf leisten kann** — treibende Lasten, Positionieren oder eine vom Prozess vorgegebene Auslaufzeit.

## Bypass: eine Entwurfsentscheidung mit Folgen

Die meisten Sanftanlasser arbeiten mit einem Bypass-Schütz, das die Thyristoren nach der Rampe überbrückt.

| Eigenschaft | Mit Bypass | Ohne Bypass (Dauerbetrieb der Halbleiter) |
| --- | --- | --- |
| Dauerverluste | Praktisch keine | Halbleiterverluste, dauerhaft |
| Wärme im Gehäuse | Nach dem Anlauf vernachlässigbar | Erheblich; beeinflusst Gehäuse- und Raumauslegung |
| Oberschwingungsbeitrag im Betrieb | Keiner | Vorhanden, aus der Phasenanschnittsteuerung |
| Sanftauslauf möglich | Nur wenn der Bypass zuvor öffnet | Ja |
| Zusätzlicher Fehlermodus | Bypass-Schütz | — |

**Der Bypass bringt einen erkennenswerten Fehlermodus mit.** Schließt das Bypass-Schütz nicht — verschweißt, falsch verdrahtet oder Steuerkreis defekt —, führen die Thyristoren dauerhaft den vollen Laststrom, in einem Gerät, das für intermittierenden Betrieb bemessen ist. Die Folge ist Überhitzung Minuten bis Stunden nach einem völlig normal wirkenden Anlauf.

Die diagnostische Signatur ist eindeutig: **ein Anlasser, der einige Zeit nach einem erfolgreichen Anlauf heiß wird oder auf Übertemperatur auslöst, während der Motor normalen Strom zieht.** Die Funktion des Bypass-Schützes zu prüfen ist eine Fünf-Minuten-Bestätigung.

## Oberschwingungen, Verluste und was die Installation sieht

**Ein Sanftanlasser verzerrt das Netz nur während der Rampe.** Die Phasenanschnittsteuerung erzeugt für die Dauer des Anlaufs — Sekunden — einen verzerrten Stromverlauf, danach stellt der Bypass einen sauberen sinusförmigen Pfad her. Für eine Maschine mit wenigen Anläufen pro Tag ist der anlagenweite Oberschwingungsbeitrag vernachlässigbar.

**Ein Umrichter verzerrt dauerhaft**, weil sein Gleichrichter Strom in Impulsen entnimmt, solange die Maschine läuft. Das ist eine dauerhafte Eigenschaft der Installation und gehört in eine Netzqualitätsbetrachtung, nicht in eine Anlaufdiskussion.

**Der maßgebliche Vergleich lautet daher nicht „wer erzeugt mehr Oberschwingungen“, sondern „wie lange“.** Eine Anlage, die fünfzig drehzahlfeste Pumpen auf Umrichter umstellt, hat eine dauerhafte Oberschwingungsquelle vom Fünfzigfachen des Einzelbeitrags erworben; dieselben fünfzig mit Sanftanlassern praktisch nichts nach den ersten Sekunden jedes Anlaufs.

> Mechanismen, das Resonanzrisiko mit Kompensationskondensatoren und die Minderungsoptionen behandeln die Begleitbeiträge zu Umrichter-Oberschwingungen und zur Blindleistungskompensation. Hier zählt nur, dass beide Anlaufverfahren in jener Betrachtung in verschiedenen Kategorien liegen.

## Vergleichsübersicht

| Kriterium | Sanftanlasser | Frequenzumrichter |
| --- | --- | --- |
| Anlaufstromsenkung | Ja, auf Kosten des Moments (∝ V²) | Ja, ohne Momentverlust |
| Volles Moment bei niedriger Drehzahl | Nein | Ja, innerhalb der Bemessung |
| Kontinuierliche Drehzahlregelung | Nein | Ja |
| Geregeltes Verzögern | Nur Spannungsauslauf | Ja, inklusive Bremsstrategien |
| Trägheits- und losbrechstarke Lasten | Oft ungeeignet | Geeignet |
| Hohe Schalthäufigkeit | Durch Geräte- und Motorthermik begrenzt | Gut geeignet |
| Dauerverluste | Nach Bypass keine | Dauerhafter Anteil der Leistung |
| Oberschwingungen im Betrieb | Nach Bypass keine | Dauerhafter Gleichrichterbeitrag |
| Isolations- und Lagerbelastung | Keine über das Netz hinaus | Bewertung erforderlich |
| Motorleitungslänge | Keine besondere Grenze | Herstellergrenze gilt |
| Aufwand der Inbetriebnahme | Gering | Erheblich |
| Ersatzteile und Kompetenz | Einfach | Parametersätze, Firmware, Werkzeuge |
| Weiches Netz / Generator | Hilft, Strom bleibt erhöht | Stärkste Option |

**Keine Zeile dieser Tabelle entscheidet allein.** Die Auswahl lautet: Braucht der Prozess Drehzahlregelung (Umrichter)? Lässt sich die Last bei reduzierter Spannung innerhalb der thermischen Grenzen des Motors hochfahren (Sanftanlasser tragfähig)? Und verträgt das Netz den resultierenden Strom?

## Inbetriebnahme

**Sanftanlasser.**

- Strombegrenzung und Rampe aus dem gemessenen oder gerechneten Losbrech- und Hochlaufbedarf der Last festlegen — nicht aus einer Vorgabe.
- Den Hochlauf **unter ungünstigster Last** verifizieren, nicht an der leeren Maschine. Ein Förderer, der bei der Inbetriebnahme leer und in Produktion beladen anläuft, ist die klassische Überraschung.
- Bestätigen, dass die erreichte Hochlaufzeit innerhalb des zulässigen Werts und des Anlaufregimes des Motors liegt.
- Die Bypass-Funktion verifizieren und bestätigen, dass der Anlasser nach der Rampe wieder abkühlt.
- Wo ein Sanftauslauf genutzt wird, prüfen, ob die Auslauframpe das beabsichtigte mechanische Ergebnis erreicht — meist geht es um Rohrleitungsdruck oder Gurtspannung, und das gehört beobachtet, nicht angenommen.

**Beides.**

- Prüfen, dass der thermische Motorschutz die tatsächliche Anlaufbetriebsart einschließlich wiederholter Anläufe abbildet.
- Das Wiederanlaufverhalten nach Netzunterbrechung bestätigen; der unerwartete Anlauf drehender Maschinen ist eine Gefährdung, keine Bequemlichkeit.
- Den Parametersatz dokumentieren und dort ablegen, wo die Instandhaltung ihn findet.

## Fehlermodi

**Sanftanlasser an losbrechstarker Last.** Der Motor bleibt bei reduzierter Spannung stehen; der Schutz spricht an; die Rampe wird verlängert, was das thermische Problem verschärft.

**Rampe zur Stoßminderung verlängert.** Die Rotorerwärmung steigt; der Motor löst bei einer zuvor beherrschten Betriebsart aus.

**Hochlauf an der unbeladenen Maschine verifiziert.** Die Produktionslast deckt die Lücke auf.

**Bypass-Schütz schließt nicht.** Die Thyristoren führen dauerhaft; Übertemperatur einige Zeit nach normalem Anlauf.

**Umrichter dort eingebaut, wo nur der Anlauf störte.** Dauerverluste, Oberschwingungsbeitrag, Leitungs- und Lagerfragen sowie ein zu pflegender Parametersatz — für eine Maschine mit einer Drehzahl.

**Umrichter ohne Oberschwingungsbetrachtung in einer Anlage mit Kompensation.** Die Wechselwirkung zeigt sich später an der Kondensatoranlage.

**Anlaufregime ignoriert.** Gleich welches Gerät verbaut ist: Der Prozess startet die Maschine nach Störungen wiederholt, und die zulässigen Anläufe pro Stunde werden überschritten.

## Ein Beispielszenario

*Das Folgende ist ein illustratives ingenieurtechnisches Beispiel und kein Bericht über ein konkretes Projekt.*

Ein Bergwerk rüstet zwei beladene Gurtförderer mit Sanftanlassern aus und ersetzt Direktschütze. Erklärtes Ziel ist, den mechanischen Stoß auf die Getriebe zu mindern und den Spannungseinbruch am örtlichen Netz beim Anlauf zu begrenzen. Die Inbetriebnahme erfolgt im Wartungsfenster mit leeren Gurten; beide Maschinen laufen sauber an.

Im Produktionsbetrieb läuft einer der Förderer beladen wiederholt nicht an.

```text
Symptom:
Loaded conveyor does not accelerate; motor overload operates after several seconds.

Evidence:
- current rises immediately to the configured limit and stays there
- shaft speed remains at or near zero throughout
- the same machine starts normally when the belt is empty or lightly loaded
- the second conveyor, on the same bus and same starter type, starts loaded
- supply voltage at the starter terminals is within tolerance during the attempt
- no upstream protection operates

Reasoning:
Current at the limit with no rotation is a torque shortfall, not a supply
problem and not a starter fault. At the reduced voltage produced by the
current limit, available torque is approximately the square of the voltage
ratio, and it is below the loaded breakaway requirement of this conveyor.
The second conveyor differs in loading profile or incline, which is why it
succeeds under the same settings.

Next investigations:
- loaded breakaway torque of each conveyor, from the mechanical design
- motor speed-torque curve at the applied voltage
- permitted acceleration time and start regime of the motor
- whether the belt can be started partially unloaded as an operating procedure
```

Die Lösung ist eine Auswahlentscheidung, keine Einstellung. Die Strombegrenzung so weit anzuheben, bis der Gurt anläuft, führt den Anlaufstrom zurück in Richtung Direktanlauf — womit der Zweck des Sanftanlassers entfällt und die Belastbarkeit des Netzes überschritten werden kann. Die Rampe zu verlängern erhöht die Rotorerwärmung bei einem ohnehin thermisch anspruchsvollen Anlauf.

**Wo ein beladener, trägheitsreicher Gurt zuverlässig anlaufen muss, verlangt die Lastkennlinie ein Moment, das reduzierte Spannung nicht liefern kann — und die richtige Antwort ist ein Umrichter oder eine mechanische Lösung, die den Anlauf unbeladen erlaubt.**

Der übertragbare Punkt: Der Sanftanlasser hat nicht versagt. Er wurde an einer Last eingesetzt, deren Momentbedarf nie gegen das gestellt wurde, was reduzierte Spannung liefern kann — und der Leerlauftest bei der Inbetriebnahme konnte das nicht zeigen.

## Empfohlene Praxis

- Zuerst klären, ob der Prozess Drehzahlregelung braucht; wenn ja, ist der Vergleich beendet.
- Wenn nein, den Losbrech- und Hochlaufbedarf der Last gegen das stellen, was die vorgesehene reduzierte Spannung erzeugt — mit der Quadratbeziehung im Blick.
- Die Hochlaufzeit als thermisches Budget behandeln, beidseitig begrenzt durch das zulässige Anlaufverhalten des Motors.
- Mechanische Entlastungsmöglichkeiten prüfen; sie machen Sanftanlasser an Maschinen tragfähig, die sonst keinen nutzen könnten.
- Anläufe pro Stunde zählen; hohe Schalthäufigkeit spricht unabhängig von Drehzahlanforderungen für den Umrichter.
- Das Netz bewerten: Ein weiches Netz oder ein Generator verträgt womöglich nicht einmal einen Anlauf mit reduzierter Spannung.
- Bypass vorsehen, sofern kein Sanftauslauf Dauerbetrieb der Halbleiter verlangt, und den Bypass als Fehlermodus einplanen.
- Dauerverluste, Gehäusewärme und Oberschwingungsbeitrag in den Vergleich aufnehmen, nicht nur den Anschaffungspreis.
- Den Hochlauf bei der Inbetriebnahme unter ungünstigster Last verifizieren, nie an der leeren Maschine.
- Den thermischen Motorschutz auf die tatsächliche Anlaufbetriebsart einstellen und das Wiederanlaufverhalten verifizieren.
- Bei Umrüstung ganzer Flotten die summierten Oberschwingungs- und Wärmefolgen bewerten, bevor auf Umrichter standardisiert wird.

## Fazit

Die ehrliche Zusammenfassung lautet: Das sind keine konkurrierenden Produkte in zwei Preisklassen. Ein Sanftanlasser bewältigt den Anlauf einer drehzahlfesten Maschine und nimmt sich anschließend aus dem Kreis. Ein Umrichter übernimmt dauerhaft die Kontrolle über den Motor, gewinnt Drehzahlregelung und volles Moment bei jeder Drehzahl — und nimmt dafür Dauerverluste, dauerhafte Oberschwingungen, ausgangsseitige Belastung des Motors und ein zu pflegendes Konfigurationsobjekt in Kauf.

Wo der Prozess Drehzahl braucht, ist der Umrichter nicht optional. Wo er sie nicht braucht, lautet die Frage, ob die Last bei reduzierter Spannung innerhalb der thermischen Grenzen des Motors hochläuft — und wenn ja, ist die einfachere Maschine sehr oft die bessere Lösung und kein Kompromiss.
