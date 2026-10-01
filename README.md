# BarShift Client

Yhden baarin työvuorojen hallinta (PHP + SQLite tai MariaDB, PWA). **Tässä asennuksessa on täsmälleen yksi baari:** kannassa ei ole muiden baarien dataa, ja
kanta, jossa on useampi baari, hylätään (`thePub()`-vartija). Baarien väliset asiat (yhteinen tapahtumakalenteri, keikkatyön välitys) hoitaa erillinen
[barshift-server](https://github.com/raptaqua/barshift-server) (BarShift Hub); yhteys on valinnainen ja vain työntö: ks. *Keskuspalvelin* alla.

Demodatan poisto: tyhjennä kanta ja aja `php install.php` uudelleen (tai poista demorivit käsin).

Salasanan tai 2FA:n palautus palvelimelta: `php bin/admin.php reset-password <tunnus>` / `reset-2fa <tunnus>`.

## Käyttöönotto (asennusohjelma)

1. Lataa tiedostot palvelimelle (File Manager/FTP): joko `git clone`, GitHubin *Download ZIP* tai valmis julkaisupaketti `barshift-client.zip` (*Releases*). Riippuvuudet (`vendor/`) ovat mukana repossa, joten SSH:ta ja composeria ei tarvita. (Kehittäjä: `vendor/` päivitetään komennolla `tools/update_vendor.sh`, kun `composer.json` muuttuu.)
2. Tietokantaa ei tarvitse luoda: oletuksena käytetään **SQLitea**, jolloin kaikki tallentuu yhteen tiedostoon kansiossa `data/` (kansion on oltava PHP:lle kirjoitettava; PHP:n `pdo_sqlite` on lähes aina valmiina). Haluatko MariaDB/MySQL:n, luo tyhjä tietokanta ja käyttäjä (cPanel: *MySQL Databases*) ja valitse asennuksessa MariaDB.
3. Avaa selaimessa `https://SIVUSI/install.php`. Sivu tarkistaa vaatimukset eikä vaadi erillistä tunnistetta: **asenna heti tiedostojen lataamisen jälkeen**, koska ensimmäinen asennuksen suorittaja saa luotua ylläpitäjän. Haluatko lisäsuojan, luo palvelimelle tiedosto `install_token.php` sisällöllä `<?php // TOKEN: <32 satunnaista heksamerkkiä>`; silloin asennus pyytää tunnisteen.
4. Valitse tietokanta (SQLite: ei lisätietoja; MariaDB: osoite, nimi, käyttäjä ja salasana, voit painaa *Testaa tietokanta*), baarin nimi, ylläpitäjän nimi, tunnus, sähköposti ja salasana (väh. 12 merkkiä)
   ja paina *Asenna BarShift*.

Asennusohjelma luo tietokantataulut, `config.php`:n (oikeudet 640), push-ilmoitusten VAPID-avaimet, viestien salausavaimen
ja baarin ylläpitäjän tunnuksen. Salaisuuksia ei näytetä selaimessa. Lopuksi se lukitsee itsensä (`install.lock`) ja poistaa
`install.php`:n; jos poisto ei onnistu, poista ne käsin. 
eikä se toimi lainkaan kun `config.php` on olemassa.

Kirjautuminen: ylläpitäjän tunnus ja salasana (baaria ei valita; asennus palvelee täsmälleen yhtä baaria).

### Käsin (ilman asennusohjelmaa)

1. Kopioi `config.example.php` -> `config.php` ja täytä tiedot. Avaimet: `php -r "echo base64_encode(random_bytes(32));"`
   (`message_key`); VAPID: `vendor/bin/web-push generate:vapid-keys` (tai asennusohjelma).
   Sijoita mieluiten www-juuren ulkopuolelle ja osoita siihen ympäristömuuttujalla `BARSHIFT_CONFIG`.
2. `php migrate.php` (tuo `db/schema.sql`:n ja päivittää vanhat kannat), sitten luo baari ja ylläpitäjä asennusohjelmalla tai lisää ylläpitäjä komennolla `php bin/admin.php create-admin <tunnus> "<nimi>"` (baari on luotava ensin asennusohjelmalla).
3. MariaDB: tietokantakäyttäjälle riittävät SELECT/INSERT/UPDATE/DELETE-oikeudet (ei ALTER/CREATE) kun asennus on tehty. SQLite: PHP:n on voitava kirjoittaa `data/`-kansioon, ja kansio ei saa olla ladattavissa selaimella (`data/.htaccess` hoitaa Apachen; nginx: `location ^~ /data/ { deny all; }`). Asennusohjelma tarkistaa tämän ja varoittaa.
4. Palvelimella on oltava HTTPS.

## Käyttöohje

Sovelluksen sisäinen käyttöohje on `barshift_ohjeet.html` (avautuu yläpalkin ?-kuvakkeesta). Ohjeen kuvat ovat hakemistossa `assets/ohjeet/`
ja ne on otettu demodatasta. Kun käyttöliittymä muuttuu, päivitä kuvat: `node tools/screenshots.js` (ohje skriptin alussa) ja tarkista teksti.

## Päivitys uuteen versioon

Kun korvaat tiedostot uudemmilla, päivitä myös tietokanta (uudet ominaisuudet käyttävät uusia sarakkeita ja tauluja):

- komentorivillä: `php migrate.php` (turvallinen ajaa uudelleen; ei poista dataa).

Jos tietokanta on päivittämättä, API kertoo sen virheilmoituksessa ("Tietokanta on päivittämättä…").

## Baari ja sen asetukset

Baari on `pubs`-taulun ainoa rivi; näyttönimeä voi vaihtaa. Admin muokkaa kohdassa *Hallinta → Baari*: nimi, aikavyöhyke, vuororoolit, työaikasäännöt
(vähimmäislepo, viikkotuntiraja), palkkalisät (ilta, yö, la, su + ilta-/yörajat) ja laskutustiedot.
Rivi luodaan automaattisesti, jos sitä ei ole.

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


**Asiakaspalvelut (baarikohtaisesti aktivoitavat, oletuksena pois):** *Hallinta → Baari → Asiakaspalvelut*.
- *Ilmoittautuminen ja liput*: tapahtumalle ilmoittautuminen (paikkamäärä, hinta tiedoksi, maksu ovella) tai ulkoinen lippulinkki (https). BarShift ei käsittele maksuja. Kävijä saa vahvistuksen, peruutuslinkin ja muistutuksen sähköpostilla; ilmoittautuneet ja CSV *Tapahtumat*-sivulla. Julkisella sivulla myös jaettava **some-kortti** (PNG).
- *Pöytävaraukset*: aukioloajat, paikkamäärä, ryhmäkoko, varauksen kesto, automaattinen tai manuaalinen vahvistus. Kävijän sivu `varaus.html` (osoite näkyy *Hallinta → Varaukset*). Vahvistukset ja muistutukset sähköpostilla.
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
  ei paljasteta. Julkinen sivu näkyy vain, kun baarin julkinen profiili on julkaistu.
- **Rajapinta:** `api.php?action=public_events` (GET, ei istuntoa, CORS `*`, välimuisti 60 s). Kalenterin voi siirtää toiselle palvelimelle
  vaihtamalla tiedoston alun `BASE`-vakion.
- **Sijainti osoitteesta:** admin kirjoittaa vain osoitteen ja kaupungin; palvelin hakee koordinaatit OpenStreetMapin Nominatim-palvelusta
  (haut vain adminille, max 1 haku/s, tunnistettava User-Agent; ks. Nominatimin käyttöehdot). Käsin asetus on lisäasetus. Hakupalvelun voi vaihtaa
  configin `geocoder_url`-asetuksella ja maan rajata asetuksella `geocode_countries` (esim. `fi`).
- **Syötteet ja widget:** julkisella baarilla on `api.php?action=public_ics` (iCal-tilaus), `public_rss` (RSS 2.0) ja
  upotettava `widget.html?n=5&theme=dark&color=E14D2A` (iframe; `.htaccess` sallii vain tälle sivulle upottamisen). Osoitteet ja upotuskoodi
  näkyvät adminille kohdassa *Julkinen profiili → Jaa ja upota*. Linkit käyttävät osoitetta, jolla sivua kutsutaan; kiinteän osoitteen voi asettaa configin `base_url`-asetuksella.
- **Ulkoasu:** valoisa ja värikäs; oletusnäkymä Lista näyttää tulevan viikon tapahtumat korteissa (myös Viikonloppu, 30 päivää ja Kaikki tulevat).
- **Usean baarin kalenteri ja kartta:** hoitaa keskuspalvelin (BarShift Hub); tämä sivu näyttää vain oman baarin tapahtumat.
- Demodata sisältää demobaarin ja sen julkisen profiilin.

## Kehitys, testit ja ylläpito

**Rakenne:** `index.php` on ohut kuori; tyylit ovat tiedostossa `assets/app.css` ja käyttöliittymä jaettu moduuleihin `assets/js/`
(`core` tila/apufunktiot, `messages`, `home` etusivu/profiili, `shifts` kalenteri/vuorot/tilastot, `absences` poissaolot/tapahtumat,
`admin` hallinta ja lomakkeet, `main` kirjautuminen/käynnistys). Tiedostot ovat tavallisia globaaleja skriptejä ja latautuvat tässä järjestyksessä.
CSP sallii vain omat skriptitiedostot (`script-src 'self'`; ei inline-`<script>`-lohkoja), joten älä lisää skriptejä sivun sisään.

**Testit:**
- `node tests/leave.test.js`: vuosilomalaskenta.
- `node tests/js_handlers.test.js`: varmistaa, että kaikki HTML-käsittelijöissä (`onclick=…`) kutsutut funktiot on määritelty.
- `tests/run_api_tests.sh`: API-integraatiotestit (kirjautuminen, roolit, baarieristys, CSRF, palkka-ajo, vuorosuunnittelu, GDPR, kutsut, salasanan palautus, 2FA, sähköposti (fake SMTP), cron-muistutukset, kirjautumisraja).
  Vaatii `composer install`in. SQLite (ei palvelinta): `TEST_DB=sqlite tests/run_api_tests.sh`. MariaDB/MySQL **tyhjentää** kannan `TEST_DB_NAME` (oletus `barshift_test`):
  `TEST_DB_HOST=localhost TEST_DB_USER=root tests/run_api_tests.sh`.
- `php tests/sqlite_ddl.test.php`: MySQL→SQLite-käännös (skeema, migraatiot, erikoissyntaksit). `tests/run_install_test.sh`: SQLite-asennus selaimen tavoin (curl).
- GitHub Actions (`.github/workflows/ci.yml`) ajaa syntaksitarkistukset, salaisuustarkistuksen ja molemmat testit jokaisesta pushista ja pull requestista.

**Tietokantamigraatiot:** `db/schema.sql` on koko rakenne tuoreeseen asennukseen; yksittäiset muutokset lisätään tiedostoina
`db/migrations/NNNN_kuvaus.sql`. `php migrate.php` ajaa ne kerran järjestyksessä (kirjaus tauluun `schema_migrations`); tuoreessa asennuksessa ne
merkitään ajetuiksi. Kun lisäät migraation, päivitä myös `schema.sql`.
SQLitellä sama MySQL-muotoinen SQL käännetään lennossa (`lib/sqlite_ddl.php`: CREATE TABLE, ALTER … ADD/DROP COLUMN, indeksit, DML). Jos migraatiota ei voi kääntää (esim. `MODIFY`), lisää rinnalle käsin kirjoitettu `NNNN_kuvaus.sqlite.sql`; sitä käytetään SQLitellä MySQL-version sijaan.

**Varmuuskopiot:** `tools/backup.sh /polku/varmuuskopiot` (cron, esim. `17 2 * * *`) tallentaa tietokannan (SQLite: eheä kopio `VACUUM INTO`; MariaDB: mysqldump; gzip) ja `uploads/`-kuvat
ja poistaa yli 30 päivää vanhat (`KEEP_DAYS`). Kopiot sisältävät henkilötietoja: siirrä ne palvelimen ulkopuolelle salattuna.
Palautus: MariaDB `gunzip -c barshift-db-….sql.gz | mysql TIETOKANTA`; SQLite `gunzip barshift-db-….sqlite.gz` ja kopioi tiedosto `db_file`-polkuun (sovellus pois käytöstä kopioinnin ajaksi); kuvat `tar -xzf barshift-uploads-….tar.gz`.

**MariaDB → SQLite:** olemassa olevan asennuksen voi siirtää komennolla `php tools/mysql_to_sqlite.php --file=data/barshift.sqlite` (kopioi kaikki taulut, vanha kanta ei muutu). Vaihda sen jälkeen `config.php`:ssä `'db_driver' => 'sqlite', 'db_file' => 'data/barshift.sqlite'` ja poista `db_host`/`db_name`/`db_user`/`db_pass`.

**SQLite vai MariaDB?** SQLite sopii yhden baarin kuormalle (käyttäjiä kymmeniä, kirjoituksia satunnaisesti) ja on selvästi helpompi asentaa ja varmuuskopioida. Valitse MariaDB, jos tietokantapalvelin on jo olemassa tai kuormaa on poikkeuksellisen paljon. Jos hosting käyttää verkkolevyä (NFS), SQLiten tiedostolukitus voi olla epäluotettava: käytä silloin MariaDB:tä.

## Demodata (vain kehitys/esittely)

`mysql TIETOKANTA < db/seed_demo.sql` (SQLite: `php tests/sqlcli.php "$(cat db/seed_demo.sql)" -N`; asennusohjelmassa demodata on valinta) luo baarin `demobaari` ja kaksi kuukautta dataa
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
Liitos tehdään kokonaan hallintapaneelista, config.php:tä ei muokata:
1. Keskuksen ylläpitäjä lisää baarin keskuksen hallintasivulla (`/admin → Baarit`) ja antaa sinulle **osoitteen** ja kertakäyttöisen **liitoskoodin**.
2. Clientissa: *Baari → Asetukset → Keskuspalvelin*: syötä osoite ja koodi, paina *Yhdistä keskukseen*. Client luo itse Ed25519-avainparin ja rekisteröi vain julkisen avaimen keskukseen; yksityinen avain tallennetaan tietokantaan salattuna (`message_key`) eikä poistu clientista eikä näy käyttöliittymässä.
3. Valitse, mitä julkaistaan: **julkiset tapahtumat yhteiseen kalenteriin** ja/tai **keikkatyöpörssi** (avoin vuoro merkitään keikkatyöksi vuoron muokkauksessa; hakemukset: välilehti *Keikkahakemukset*, yhteystiedot näkyvät vasta hyväksynnän jälkeen). Tallenna asetukset.
4. **Muiden baarien vapaat vuorot** (valinnainen): kun asetus on päällä, työntekijät näkevät *Keikat*-välilehdellä muiden baarien avoimet vuorot ja voivat hakea niitä suoraan sovelluksesta; hakemus kulkee keskuksen kautta vain vuoron tarjonneelle baarille (nimi, yhteystieto ja viesti; ei muuta). Työntekijä voi ottaa profiilissaan ilmoitukset käyttöön: silloin hän saa push-ilmoituksen (tai sähköpostin) muodossa *"Baarissa X haetaan työntekijää (rooli) päivälle 5.10. ajalle 18–2"* sekä tiedon hakemuksen hyväksymisestä. Uudet vuorot haetaan keskuksesta samalla tavalla kuin hakemukset (sivulataus enintään 2 min välein, cron varmistuksena).
5. *Testaa yhteys ja synkronoi nyt* kertoo, jos jokin on pielessä. *Katkaise yhteys* poistaa baarin julkaisemat tiedot keskuksesta.

Muutokset (tapahtuma, vuoro, asetukset) lähtevät keskukseen automaattisesti heti tallennuksen jälkeen. `cron.php` on varmistus, ei vaatimus: myös ylläpitäjän sivulataus (enintään kerran 2 min välein) ja Keikkahakemukset-välilehden avaus hakevat uudet hakemukset ja lähettävät viivästyneet muutokset. Keskus ei koskaan kutsu clientia; keskukseen lähtee vain julkisia tapahtumatietoja sekä keikkavuoron aika, rooli ja palkkateksti.

Vaihtoehtoinen tapa (edistyneille): `config.php`:n `'hub' => ['url' => …, 'pub_slug' => …, 'private_key' => …]` toimii edelleen; hallintapaneelista tehty liitos ohittaa sen.
