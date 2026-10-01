# BarShift Client

Yhden baarin työvuorojen hallinta (PHP + MySQL, PWA). **Tässä asennuksessa on täsmälleen yksi baari:** kannassa ei ole muiden baarien dataa, ja
kanta, jossa on useampi baari, hylätään (`thePub()`-vartija). Baarien väliset asiat (yhteinen tapahtumakalenteri, keikkatyön välitys) hoitaa erillinen
[barshift-server](https://github.com/raptaqua/barshift-server) (BarShift Hub); yhteys on valinnainen ja vain työntö: ks. *Keskuspalvelin* alla.

Demodatan poisto kannasta (säilyttää oman baarisi): `php bin/clear_demo.php` (kysyy varmistuksen; `--yes` ohittaa). Demobaari + oma baari samassa kannassa estää muuten toiminnan.

Salasanan tai 2FA:n palautus palvelimelta: `php bin/admin.php reset-password <tunnus>` / `reset-2fa <tunnus>`.

## Käyttöönotto (asennusohjelma)

1. Lataa tiedostot palvelimelle ja aja siellä `composer install --no-dev` (luo `vendor/`-kansion).
2. Luo tyhjä MySQL/MariaDB-tietokanta ja käyttäjä (cPanel: *MySQL Databases*) ja anna käyttäjälle oikeudet kantaan.
3. Avaa selaimessa `https://SIVUSI/install.php`. Sivu tarkistaa vaatimukset ja pyytää **asennustunnisteen**:
   avaa palvelimella tiedosto `install_token.php` (File Manager/FTP) ja kopioi `TOKEN:`-sanan jälkeinen teksti.
4. Täytä tietokannan tiedot (voit painaa *Testaa yhteys*), baarin nimi, ylläpitäjän nimi, tunnus, sähköposti ja salasana (väh. 12 merkkiä)
   ja paina *Asenna BarShift*.

Asennusohjelma luo tietokantataulut, `config.php`:n (oikeudet 640), push-ilmoitusten VAPID-avaimet, viestien salausavaimen
ja baarin ylläpitäjän tunnuksen. Salaisuuksia ei näytetä selaimessa. Lopuksi se lukitsee itsensä (`install.lock`) ja poistaa
`install.php`:n ja tunnisteen; jos poisto ei onnistu, poista ne käsin. Ilman tunnistetta asennusta ei voi ajaa,
eikä se toimi lainkaan kun `config.php` on olemassa.

Kirjautuminen: ylläpitäjän tunnus ja salasana (baaria ei valita; asennus palvelee täsmälleen yhtä baaria).

### Käsin (ilman asennusohjelmaa)

1. Kopioi `config.example.php` -> `config.php` ja täytä tiedot. Avaimet: `php -r "echo base64_encode(random_bytes(32));"`
   (`message_key`); VAPID: `vendor/bin/web-push generate:vapid-keys` (tai asennusohjelma).
   Sijoita mieluiten www-juuren ulkopuolelle ja osoita siihen ympäristömuuttujalla `BARSHIFT_CONFIG`.
2. `php migrate.php` (tuo `db/schema.sql`:n ja päivittää vanhat kannat), sitten luo baari ja ylläpitäjä asennusohjelmalla tai lisää ylläpitäjä komennolla `php bin/admin.php create-admin <tunnus> "<nimi>"` (baari on luotava ensin asennusohjelmalla).
3. Tietokantakäyttäjälle riittävät SELECT/INSERT/UPDATE/DELETE-oikeudet (ei ALTER/CREATE) kun asennus on tehty.
4. Palvelimella on oltava HTTPS.

## Käyttöohje

Sovelluksen sisäinen käyttöohje on `barshift_ohjeet.html` (avautuu yläpalkin ?-kuvakkeesta). Ohjeen kuvat ovat hakemistossa `assets/ohjeet/`
ja ne on otettu demodatasta. Kun käyttöliittymä muuttuu, päivitä kuvat: `node tools/screenshots.js` (ohje skriptin alussa) ja tarkista teksti.

## Päivitys uuteen versioon

Kun korvaat tiedostot uudemmilla, päivitä myös tietokanta (uudet ominaisuudet käyttävät uusia sarakkeita ja tauluja):

- komentorivillä: `php migrate.php` (turvallinen ajaa uudelleen; ei poista dataa), tai
- phpMyAdminissa: *Tuo* → `db/upgrade.sql` (MariaDB 10.0.2+; turvallinen ajaa uudelleen).

Jos tietokanta on päivittämättä, API kertoo sen virheilmoituksessa ("Tietokanta on päivittämättä…").

## Baari ja sen asetukset

Baari on oma entiteettinsä (`pubs`-taulu): sisäinen tunniste (`slug`) pysyy samana, mutta
näyttönimeä voi vaihtaa. Admin muokkaa kohdassa *Hallinta → Baari*: nimi, aikavyöhyke, vuororoolit, työaikasäännöt
(vähimmäislepo, viikkotuntiraja), palkkalisät (ilta, yö, la, su + ilta-/yörajat) ja laskutustiedot.
Puuttuvat `pubs`-rivit luodaan automaattisesti olemassa oleville baareille (`php migrate.php` / `db/upgrade.sql`).

**Viikkopohjat ja tyhjennys:** `week_templates` tallentaa viikon vuorot (viikonpäivä, työntekijä, aika, rooli); `apply_week_template` syöttää pohjan valittuun viikkoon (luonnoksina/avoimina, duplikaatit ohitetaan); `clear_shifts` poistaa vuorot aikavälin (enintään 93 pv) ja tarvittaessa työntekijän tai luonnosten mukaan.

**Vuorosuunnittelu:** vuorolomake varoittaa päällekkäisyydestä, vähimmäislevosta, viikkotuntirajasta, poissaolosta ja estetystä
päivästä (`check_shift`); vuoropohjat (`shift_templates`), viikoittainen toisto ja luonnos/julkaise-tila (`shifts.status`;
luonnokset näkyvät vain adminille, `publish_shifts` julkaisee ja ilmoittaa).

**Raportit:** *Tilastot → Raportti ja palkka-ajo* (admin): tunnit ja kustannus (palkka + sivukulut `pubs.side_cost_pct`) kuukausittain työntekijöittäin,
JSON/CSV (`api.php?action=report&from=YYYY-MM&to=YYYY-MM[&format=csv]`, enintään 24 kk) ja tulostus PDF:ksi selaimesta. *Poissaolot → Poissaolokalenteri* näyttää kuka on pois; kollegoiden sairauspoissaolot ja odottavat hakemukset eivät näy työntekijöille.

**Palkka-ajo:** *Tilastot → Palkka-ajo → Lataa palkka-ajo (CSV)* (`api.php?action=payroll&month=YYYY-MM&format=csv`, vain admin).
Palvelin laskee tunnit leimauksista (jos niitä ei ole, jo toteutuneista vuoroista) baarin palkkalisillä; CSV avautuu suoraan Excelissä.

## Sähköposti, kutsulinkit, salasanan palautus ja 2FA

- **Sähköposti** (valinnainen): lisää configiin `mail_from` (ja tarvittaessa `smtp`, ks. `config.example.php`); `base_url` kannattaa asettaa linkkejä varten.
  Viestit menevät jonoon (`mail_queue`), joka tyhjenee heti pyynnön jälkeen ja `cron.php`:ssä. Ilman `mail_from`-arvoa mitään ei lähetetä ja ominaisuudet toimivat ilman postia
  (kutsulinkin admin jakaa itse).
- **Kutsulinkki:** *Hallinta → Työntekijät → Lisää* + "Lähetä kutsulinkki" (tai kirjekuoripainike rivillä): työntekijä asettaa salasanan itse sivulla `setpassword.html`. Linkki on
  kertakäyttöinen (7 vrk), kantaan tallennetaan vain tunnisteen tiiviste ja tunniste kulkee osoitteen `#`-osassa (ei palvelinlokeihin). Uusi linkki mitätöi vanhat.
- **Salasanan palautus:** kirjautumissivun "Unohtuiko salasana?" lähettää linkin (1 h), jos tunnukselle on tallennettu sähköposti. Vastaus on aina sama (ei paljasta tunnuksia); pyynnöt rajoitettu (5 / 15 min / IP).
- **Laiterekisteri:** *Oma profiili → Turvallisuus → Kirjautumiset ja laitteet* (taulu `user_sessions`, migraatio 0029; siivotaan 90 pv jälkeen cronissa). Salasanan vaihto ja 2FA:n nollaus mitätöivät muut istunnot.
- **Vuoronvaihto kahden kesken, palkkalaskelma-PDF, odotuslista ja tapahtumapalaute:** vaihtopyyntöön voi liittää oman vuoron (ylläpito saa vain tiedon); hyväksytyistä tunneista saa PDF-laskelman; täyteen menevään tapahtumaan voi liittyä jonoon ja palaute (1–5 tähteä) kysytään sähköpostilla tapahtuman jälkeen.
- **Asennettava sovellus (PWA):** manifestin pikakuvakkeet, push-ilmoitus avaa oikean näkymän (`?view=`), asennuspainike/iPhone-ohje profiilissa, sovelluskuvakkeen merkki. Offline-tila on vain luku.
- **Kaksivaiheinen tunnistautuminen (TOTP):** *Oma profiili → Kaksivaiheinen tunnistautuminen* (kaikille, suositeltu adminille). Sovellus näyttää avaimen syötettäväksi
  todennussovellukseen (Google/Microsoft Authenticator, Aegis, 1Password …) ja 8 kertakäyttöistä palautuskoodia. Salaisuus tallennetaan salattuna (`message_key`), koodin
  uudelleenkäyttö estetään ja yritykset on rajoitettu. Kadonneen laitteen 2FA:n nollaa admin (työntekijä) tai ylläpito (admin).
  Admin lisää työntekijän valinnalla *Henkilöllä on jo tunnus toisessa baarissa* (vaatii sähköpostin); henkilö avaa linkin, todistaa vanhan tunnuksensa (salasana + tarvittaessa 2FA)
  ja liittää baarin siihen. Sen jälkeen ylälaidassa on baarinvalitsin (`switch_pub`). Baarit eivät näe toistensa tietoja; vaihto ei ohita 2FA:ta. Jäsenyyden poistaa baarin admin poistamalla/anonymisoimalla rivin.
- **Ilmoitukset:** push (*Oma profiili → Salli ilmoitukset tähän laitteeseen*, testipainike) ja sähköposti varakanavana silloin, kun käyttäjällä ei ole toimivaa push-tilausta
  ja hän on tallentanut osoitteen ja sallinut sähköpostit. **Vuoromuistutus** (oletus 3 h ennen alkua) ja **leimaushälytykset** (sisään- tai ulosleimaus puuttuu x min; oletus pois)
  asetetaan kohdassa *Hallinta → Baari*. Ne vaativat ajastuksen: `*/10 * * * * php /polku/barshift/cron.php`.

## Uudet ominaisuudet lyhyesti

**Vuorosuunnittelu:** *Hallinta → Miehitys*: miehityssäännöt (esim. pe–la klo 20–02 vähintään 3), kattavuusnäkymä 14 päivälle, puutteista huomautus etusivulla ja **vuoroehdotukset** (ahne haku: saatavuus, poissaolot, lepoaika, viikkotuntiraja, tavoitetunnit; lisätään luonnoksina).
Työntekijä merkitsee **toistuvat estepäivät** (*Oma profiili → Saatavuus*). **Vuoronvaihto** voidaan kohdistaa tietylle työkaverille; ristiriidat (päällekkäisyys, lepoaika, poissaolo, estepäivä) **ilmoitetaan, mutta eivät estä** – työntekijä ja admin päättävät itse.

**Raha:** *Palkkatapahtumat*-CSV (rivi per työntekijä ja palkkalaji; koodit ja työntekijänumero asetetaan Baari-välilehdellä ja työntekijän tiedoissa). Tarkka tuontimuoto vaihtelee palkkajärjestelmittäin: tarkista sarakejärjestys omasta järjestelmästäsi
(Netvisor, Procountor, Visma yms. tuovat yleensä CSV:n sarakekartoituksella). **Työaikapankki** (saldo = leimatut − tavoitetunnit, ylityö viikkorajan yli), **viikon kustannusennuste** (budjetti ja päivämyynti → henkilöstökulu-%).

**Tiimi** (*Tiimi*-sivu): kiitokset, dokumentit (PDF/kuva, valinnainen kuittaus; ladattavissa vain kirjautuneena), perehdytyslistat, nimettömät kyselyt (tulokset vasta ≥ 3 vastauksella; vastaajaa ei tallenneta). Puutelistaan ja vuorokirjaan voi liittää kuvan, puutteelle vastuuhenkilö ja tila. JV-kortin vanheneminen muistutetaan 30 ja 7 pv ennen (cron).

**Keikkalaiset:** työntekijä voi itse ilmoittautua haettavaksi (*Oma profiili → Tiedot → Keikkatyö*). Muiden baarien admin näkee vain lyhennetyn nimen ja kuvauksen ja voi kutsua; hyväksyessään henkilö saa jäsenyyden kutsuvaan baariin samalla tunnuksella (ja mahdollisen avoimen vuoron). Ei arvosteluja baarien välillä.

**Asiakaspalvelut (baarikohtaisesti aktivoitavat, oletuksena pois):** *Hallinta → Baari → Asiakaspalvelut*.
- *Ilmoittautuminen ja liput*: tapahtumalle ilmoittautuminen (paikkamäärä, hinta tiedoksi, maksu ovella) tai ulkoinen lippulinkki (https). BarShift ei käsittele maksuja. Kävijä saa vahvistuksen, peruutuslinkin ja muistutuksen sähköpostilla; ilmoittautuneet ja CSV *Tapahtumat*-sivulla. Julkisella sivulla myös jaettava **some-kortti** (PNG).
- *Pöytävaraukset*: aukioloajat, paikkamäärä, ryhmäkoko, varauksen kesto, automaattinen tai manuaalinen vahvistus. Kävijän sivu `varaus.html?pub=TUNNISTE` (osoite näkyy *Hallinta → Varaukset*). Vahvistukset ja muistutukset sähköpostilla.
- Molemmat vaativat julkaistun julkisen profiilin ja toimivat parhaiten kun sähköposti on otettu käyttöön. Kävijöiden tiedot poistuvat 12 kk:n kuluttua (`cron.php`).

**Analytiikka** (*Hallinta → Analytiikka*): tunnit, kuormituskartta, täsmällisyys ja sairauspoissaolot. Kyse on työntekijöiden seurannasta: kerro siitä henkilöstölle ja käytä tietoja harkiten.

**Tietoturva:** ylläpitäjien 2FA-pakote (Baari-välilehti), istunnon käyttämättömyysaikakatkaisu (`session_idle_minutes`, oletus 480), salasanojen ilmeisten heikkouksien esto, kaikki resurssit omalta palvelimelta (ei CDN:ää eikä Google-kirjasimia; halutessasi kopioi `assets/fonts/fonts.css.example` → `fonts.css` ja lisää fontit).
CSP sallii yhä inline-tapahtumakäsittelijät (`onclick=…`, `script-src-attr`), koska käyttöliittymä rakentuu niille; inline-`<script>`-lohkot on estetty.

**Kassatilitys ja myyntigraafi:** Hallinta → Rutiinit: merkitse rutiini tyypiksi "Kassatilitys" (yksi per baari). Rutiinin kuittaus = päivän loppusumman syöttö (+ valinnaisesti kortit, kassapohja, laskettu käteinen → ero). Tiedot tallentuvat tauluun `cash_reports` ja loppusumma päivämyyntiin (`daily_sales`). Hallinta → Kassa listaa/korjaa/vie CSV:nä, Tilastot-sivun graafi (`sales_report`) vertaa viikkoa, kuukautta ja vuotta edelliseen jaksoon. Tilityksiin voi liittää kuvan (JPG/PNG/WEBP, tallennus `uploads/docs/` ilman suoraa pääsyä; näkyy vain adminille ja kirjaajalle). Tilastot → Tilitykset näyttää tilitykset ja summat päivä- (kuukausi kerrallaan) ja viikkotasolla (13 viikkoa kerrallaan), selattavissa. Migraatiot `0013`–`0014`.

**Käyttöoikeusroolit:** Hallinta → Oikeudet: matriisi, jossa jokaiselle työntekijäroolille valitaan oikeudet. Lisäoikeudet delegoivat ylläpitäjän toimintoja (vuorojen suunnittelu, poissaolojen käsittely, tapahtumat ja varaukset, sisällöt, myynti ja kassa, palkat ja raportit), perusoikeudet (kassatilitys, vuoronvaihdot, poissaolohakemukset) ovat oletuksena päällä ja ne voi poistaa. Rooli annetaan Työntekijät-välilehden muokkauksessa. Ylläpitäjä saa aina kaiken; asetukset, työntekijöiden hallinta, auditloki ja GDPR-toiminnot pysyvät vain hänellä. Oikeudet tarkistetaan palvelimella (`can()`/`requirePerm()` api.php:ssa), käyttöliittymä vain piilottaa toiminnot. Migraatio `0015`.\n\n**Baarikohtaiset valinnaiset ominaisuudet** (Hallinta → Baari → Muut valinnaiset ominaisuudet; oletuksena pois päältä, ja jokainen baari päättää itse):
- **Vuorojen haku:** avoimeen vuoroon ei voi napata suoraan; työntekijät hakevat, ylläpito valitsee hakijoista (hakijoiden varoitukset näkyvät).
- **Automaattinen vuorosuunnitelma:** "Luo viikon luonnos" täyttää miehityssäännöt luonnoksilla (saatavuus, lepoaika, osaamiset, tavoitetunnit ja 4 viikon kuormitus huomioiden).
- **Muistutukset vieraille:** sähköposti- ja halutessa tekstiviestimuistutus (Twilio, `sms`-asetus config.php:ssä, kuukausikatto) ennen varausta tai tapahtumaa.
- **Verkkomaksu lippuihin:** Stripe Checkout (`stripe`-asetus config.php:ssä; maksutapa on oletuksena vain MobilePay (`payment_methods` muuttaa); webhook `api.php?action=stripe_webhook`). Paikka pidetään 30 min; palautukset tehdään käsin Stripessä.
- **Vieraskortisto:** kanta-asiakkaat, VIP, allergiat, muistiinpanot ja käyntihistoria; poistuu 24 kk käyntien puuttuessa.

**Muut uudet ominaisuudet:** tapahtuman sisäinen **vieraslista** (työntekijät lisäävät nimiä, paikkamäärä, ei koskaan julkisissa rajapinnoissa); **kassa**: kulut ja käteistipit, kassaerojen seuranta, myyntitavoitteet, myynti/työtunti ja kirjanpitovienti ALV-erittelyllä; **osaamismatriisi** (varoitus vuoroon, jos vaadittu osaaminen puuttuu); **tuntien kuukausivahvistus** (työntekijä vahvistaa, ylläpito hyväksyy, tila näkyy palkka-ajossa); **järjestelmän tila** (cron, varmuuskopio, postijono) ja `health`-päätepiste ulkoiseen valvontaan (`health_key`); **yhteishaku** (Ctrl+K); parannettu **kalenterisyöte** (RFC-mukainen iCal, tapahtumat, poissaolot, muistutukset, Google/Apple-tilauspainikkeet; tilaus on vain luku); **kielituki** fi/en/sv (`assets/lang/*.json`, tarkistus `node tools/i18n_check.js --missing en`; englanti kattaa käyttöliittymän staattiset tekstit lähes kokonaan, ruotsi osittain ja puuttuvat tekstit näkyvät suomeksi). Migraatiot `0016`–`0025`.

**Offline-tila (PWA):** viimeksi ladattu vuorolista ja tiedot luetaan ilman verkkoa (näkyy banneri); muutokset vaativat yhteyden. Välimuisti tyhjenee uloskirjautuessa. Kuvakkeet ja `manifest.json` ovat omalla palvelimella.

## Tietosuoja (GDPR) ja ylläpito

- `tietosuoseloste.html`: seloste-pohja (täydennä rekisterinpitäjän tiedot). Työntekijä lataa omat tiedot profiilistaan, admin voi ladata
  minkä tahansa työntekijän tiedot ja **anonymisoida** tunnuksen (työtunnit säilyvät nimettöminä).
- **Auditloki:** admin-toimet (työntekijät, asetukset, poissaolojen käsittely, palkka-ajo, tietojen vienti, poistot) tallentuvat tauluun `audit_log`
  ja näkyvät kohdassa *Hallinta → Auditloki*. Lokiin ei kirjata salasanoja eikä viestien sisältöä.
- **Säilytysajat:** `cron.php` (ajastus yllä, siivous kerran vuorokaudessa klo 3 tai `php cron.php --cleanup`) poistaa kirjautumisyritykset (30 pv),
  auditlokin (24 kk) sekä baarin säilytysajan (`pubs.retention_months`, oletus 60 kk, asetetaan kohdassa *Hallinta → Baari*)
  ylittäneet leimaukset, vuorot, poissaolot, vuorokirjan ja viestit.

## Vuosiloma ja työsuhteen tiedot

Työntekijälle merkitään **aloituspäivä** ja **työsuhteen tyyppi** (vakituinen / keikkalainen) hallintapaneelin
*Työntekijät*-välilehdellä. Niiden perusteella sovellus laskee vuosiloman kertymän Suomen vuosilomalain (162/2005) mukaan
(`leave.js`, testit: `node tests/leave.test.js`):

- Lomanmääräytymisvuosi 1.4.–31.3., lomavuosi 2.5.–30.4. Kertymä 2 pv/täysi kuukausi (työsuhde alle vuoden 31.3. mennessä)
  tai 2,5 pv/kk (vähintään vuoden), enintään 30 pv; murtoluvut pyöristetään ylös.
- Täysi kuukausi: vähintään 14 päivää työsuhdetta (vakituinen; 17. päivään mennessä alkanut kuukausi on täysi) tai vähintään 35 työtuntia.
  **Keikkalaisella** kuukausi kertyy vain, jos työtunteja on vähintään 35 h (leimaukset, muuten toteutuneet vuorot);
  loma voidaan korvata rahana (lomakorvaus 9 % / 11,5 %).
- Loma-arkipäivät ovat ma–la ilman pyhiä (sunnuntait, kirkolliset juhlapäivät, itsenäisyyspäivä, vappu, joulu-, juhannus- ja pääsiäisaatto).
- Hyväksyttävät lomahakemukset (ja muu kuin sairauspoissaolo) näyttävät työntekijän lomasaldon ja sen, paljonko hakemus kuluttaa.
  Admin voi merkitä jo pidetyn loman työntekijälle (*Ilmoita uusi poissaolo* → valitse työntekijä), jolloin se kirjautuu hyväksyttynä.

Laskuri on apuväline: työehtosopimus voi antaa enemmän lomaa, eikä sairauspoissaolojen "työssäolon veroista aikaa"
huomioida tuntiperusteisessa laskennassa. Aloituspäivä ja työsuhteen tyyppi näkyvät vain adminille ja työntekijälle itselleen.

## Julkinen tapahtumakalenteri (`tapahtumat.html`)

Erillinen, kirjautumista vaatimaton sivu, joka näyttää usean baarin tapahtumat **kuukausikalenterina, listana ja kartalla**
(suodattimet baarin, tyypin, kaupungin ja haun mukaan; tapahtumasta voi ladata .ics-kalenterimerkinnän ja hakea reittiohjeen).
Sivua ei ole linkitetty sovelluksesta muualle kuin admin-näkymän painikkeeseen; se toimii omalla osoitteellaan (`/tapahtumat.html`).

- **Suostumus ensin:** baari näkyy vasta, kun admin julkaisee sen kohdassa *Hallinta → Julkinen profiili* (julkinen nimi, osoite,
  sijainti osoitteesta, esittely, verkkosivu, väri). Lisäksi jokainen tapahtuma valitaan erikseen julkiseksi tapahtumalomakkeen
  valinnalla; vanhat tapahtumat pysyvät sisäisinä päivityksessä.
- **Mitä julkaistaan:** vain profiilin tiedot ja julkiset tapahtumat (nimi, aika, tyyppi, kuvaus, kuva). Työntekijä- tai vuorotietoja
  ja baarin sisäistä tunnusta (osa kirjautumistunnusta) ei paljasteta; baarille annetaan johdettu julkinen tunniste.
  Jäädytetyt baarit eivät näy.
- **Rajapinta:** `api.php?action=public_events` (GET, ei istuntoa, CORS `*`, välimuisti 60 s). Kalenterin voi siirtää toiselle palvelimelle
  vaihtamalla tiedoston alun `BASE`-vakion.
- **Sijainti osoitteesta:** admin kirjoittaa vain osoitteen ja kaupungin; palvelin hakee koordinaatit OpenStreetMapin Nominatim-palvelusta
  (haut vain adminille, max 1 haku/s, tunnistettava User-Agent; ks. Nominatimin käyttöehdot). Käsin asetus on lisäasetus. Hakupalvelun voi vaihtaa
  configin `geocoder_url`-asetuksella ja maan rajata asetuksella `geocode_countries` (esim. `fi`).
- **Syötteet ja widget:** jokaisella julkisella baarilla on `api.php?action=public_ics&pub=TUNNISTE` (iCal-tilaus), `public_rss` (RSS 2.0) ja
  upotettava `widget.html?pub=TUNNISTE&n=5&theme=dark&color=E14D2A` (iframe; `.htaccess` sallii vain tälle sivulle upottamisen). Osoitteet ja upotuskoodi
  näkyvät adminille kohdassa *Julkinen profiili → Jaa ja upota*. Linkit käyttävät osoitetta, jolla sivua kutsutaan; kiinteän osoitteen voi asettaa configin `base_url`-asetuksella.
- **Ulkoasu:** valoisa ja värikäs; oletusnäkymä Lista näyttää tulevan viikon tapahtumat korteissa (myös Viikonloppu, 30 päivää ja Kaikki tulevat).
- **Kartta:** Leaflet (`assets/leaflet/`, BSD-2) isännöidään itse; karttalaatat tulevat OpenStreetMapista. OSM:n laattapalvelu on tarkoitettu
  kohtuulliseen käyttöön: suuremmalla liikenteellä vaihda laattapalvelu (esim. MapTiler/Stadia) ja päivitä `.htaccess`-tiedoston CSP.
- Demodata sisältää kaksi kuvitteellista esimerkkibaaria (`demo-satama`, `demo-kellari`) ja demobaarin julkisen profiilin.

## Kehitys, testit ja ylläpito

**Rakenne:** `index.php` on ohut kuori; tyylit ovat tiedostossa `assets/app.css` ja käyttöliittymä jaettu moduuleihin `assets/js/`
(`core` tila/apufunktiot, `messages`, `home` etusivu/profiili, `shifts` kalenteri/vuorot/tilastot, `absences` poissaolot/tapahtumat,
`admin` hallinta ja lomakkeet, `main` kirjautuminen/käynnistys). Tiedostot ovat tavallisia globaaleja skriptejä ja latautuvat tässä järjestyksessä.
CSP sallii vain omat skriptitiedostot (`script-src 'self'`; ei inline-`<script>`-lohkoja), joten älä lisää skriptejä sivun sisään.

**Testit:**
- `node tests/leave.test.js`: vuosilomalaskenta.
- `node tests/js_handlers.test.js`: varmistaa, että kaikki HTML-käsittelijöissä (`onclick=…`) kutsutut funktiot on määritelty.
- `tests/run_api_tests.sh`: API-integraatiotestit (kirjautuminen, roolit, baarieristys, CSRF, palkka-ajo, vuorosuunnittelu, GDPR, kutsut, salasanan palautus, 2FA, sähköposti (fake SMTP), cron-muistutukset, kirjautumisraja).
  Vaatii MariaDB/MySQL:n ja `composer install`in; **tyhjentää** kannan `TEST_DB_NAME` (oletus `barshift_test`):
  `TEST_DB_HOST=localhost TEST_DB_USER=root tests/run_api_tests.sh`.
- GitHub Actions (`.github/workflows/ci.yml`) ajaa syntaksitarkistukset, salaisuustarkistuksen ja molemmat testit jokaisesta pushista ja pull requestista.

**Tietokantamigraatiot:** `db/schema.sql` on koko rakenne tuoreeseen asennukseen; yksittäiset muutokset lisätään tiedostoina
`db/migrations/NNNN_kuvaus.sql`. `php migrate.php` ajaa ne kerran järjestyksessä (kirjaus tauluun `schema_migrations`); tuoreessa asennuksessa ne
merkitään ajetuiksi. Kun lisäät migraation, päivitä myös `schema.sql`.

**Varmuuskopiot:** `tools/backup.sh /polku/varmuuskopiot` (cron, esim. `17 2 * * *`) tallentaa tietokannan (mysqldump, gzip) ja `uploads/`-kuvat
ja poistaa yli 30 päivää vanhat (`KEEP_DAYS`). Kopiot sisältävät henkilötietoja: siirrä ne palvelimen ulkopuolelle salattuna.
Palautus: `gunzip -c barshift-db-….sql.gz | mysql TIETOKANTA` ja `tar -xzf barshift-uploads-….tar.gz`.

## Demodata (vain kehitys/esittely)

`mysql TIETOKANTA < db/seed_demo.sql` luo baarin `demobaari` ja kaksi kuukautta dataa
(-30 ... +30 päivää ajohetkestä): vuorot, leimaukset, tapahtumat, poissaolot, vuoronvaihdot,
ilmoitukset, tehtävät, ostoslista ja saatavuudet. Ajo on toistettava (poistaa vain demobaarin datan).

Kirjautuminen (baari `demobaari`): `admin@demobaari`, `mikko@demobaari`, `sari@demobaari`, `jere@demobaari`,
`laura@demobaari`, `teemu@demobaari`. Kaikkien salasana on `DemoBaari2026!`.
**Älä aja demodataa tuotantotietokantaan.**

## Tietoturva

- Salaisuudet vain `config.php`:ssä (gitignore). Älä koskaan committoi niitä.
- Kirjautuminen PHP-istunnolla (HttpOnly, Secure, SameSite=Strict); API päättelee käyttäjän ja baarin
  istunnosta, ei asiakkaan lähettämistä parametreista. Kaikki muokkaukset tarkistavat roolin ja baarin.
- Salasanat hashataan (`password_hash`); vanhat selkotekstisalasanat päivittyvät hashiksi ensimmäisellä kirjautumisella.
- Kirjautumisyrityksille on rajoitus (8 virhettä / 15 min).
- Yksityisviestit salataan tallennuksessa (AES-256-GCM, avain `message_key` configissa). Se ei ole päästä-päähän-salaus: palvelin voi purkaa viestit.
- Kuvien lataus: vain kuvatyypit (sisällön mukaan), max 5 MB, satunnainen tiedostonimi, ei skriptien suoritusta `uploads/`-hakemistossa.
- Selainpuolella käyttäjän syöttämä data escapataan (`esc()`), CSP- ja muut tietoturvaotsakkeet `.htaccess`:ssä.

## Keskuspalvelin (BarShift Hub, valinnainen)
Lisää `config.php`:hen (avainpari luodaan palvelimella `php bin/keygen.php`, julkinen avain rekisteröidään keskukseen `bin/add_pub.php`):
```php
'hub' => ['url' => 'https://hub.example.com', 'pub_slug' => 'oma-baari', 'private_key' => '<base64 yksityinen avain>'],
```
Baarin ylläpitäjä ottaa osat käyttöön kohdassa *Baari → Asetukset → Keskuspalvelin* (oletuksena pois): **julkiset tapahtumat yhteiseen kalenteriin** ja **keikkatyöpörssi**
(avoin vuoro merkitään keikkatyöksi vuoron muokkauksessa; hakemukset käsitellään välilehdellä *Keikkahakemukset*, hakijan yhteystiedot näkyvät vasta hyväksynnän jälkeen).
Muutokset (tapahtuma, vuoro, asetukset) lähtevät keskukseen automaattisesti heti tallennuksen jälkeen; `cron.php` on varmistus. Kohdassa *Baari → Asetukset → Keskuspalvelin* painike *Testaa yhteys ja synkronoi nyt* näyttää, jos osoite, baarin tunnus tai avain on väärin. `hub.url` on keskuksen osoite asennuspolkuineen (esim. `https://sivu.fi/hub`). Synkronointi ajetaan `cron.php`:ssä (vain lähtevä: client allekirjoittaa Ed25519:llä ja työntää; keskus ei koskaan kutsu clientia). Keskukseen lähtee vain julkisia tapahtumatietoja
sekä keikkavuoron aika, rooli ja palkkateksti; työntekijä- ja asiakastietoja ei lähetetä.
