<?php
// Kopioi tämä tiedostoksi config.php ja täytä oikeat arvot.
// config.php EI saa mennä versionhallintaan (.gitignore estää sen).
// Vielä parempi: sijoita config.php julkisen www-hakemiston ULKOPUOLELLE
// ja aseta sen polku ympäristömuuttujaan BARSHIFT_CONFIG.
return [
    'db_host' => 'localhost',
    'db_name' => 'tietokannan_nimi',
    'db_user' => 'tietokannan_kayttaja',
    'db_pass' => 'VAIHDA_TÄMÄ',

    // Luo avaimet: vendor/bin/web-push generate:vapid-keys (tai: npx web-push generate-vapid-keys)
    'vapid_subject'     => 'mailto:sinun@osoite.fi',
    'vapid_public_key'  => 'VAIHDA_TÄMÄ',
    'vapid_private_key' => 'VAIHDA_TÄMÄ',

    // Yksityisviestien salausavain (base64, 32 tavua). Luo: php -r "echo base64_encode(random_bytes(32));"
    // ÄLÄ VAIHDA myöhemmin: vanhat viestit eivät enää aukea.
    'message_key' => 'VAIHDA_TÄMÄ',

    // Sijainnin haku osoitteesta (valinnainen). Oletus: OpenStreetMapin Nominatim; rajaa maa esim. 'fi' tarkempia osumia varten.
    // Sovelluksen julkinen osoite (iCal/RSS-syötteiden linkit); oletuksena päätellään pyynnöstä
    // 'base_url' => 'https://tyovuorot.example.fi',
    // 'geocoder_url' => 'https://nominatim.openstreetmap.org/search',
    // 'geocode_countries' => 'fi',

    // Sähköposti (valinnainen): kutsulinkit, salasanan palautus ja ilmoitusten varakanava. Ilman 'mail_from'-arvoa postia ei lähetetä.
    // Ilman 'smtp'-asetusta käytetään PHP:n mail()-funktiota (toimii useimmilla jaetuilla palvelimilla).
    // 'mail_from' => 'BarShift <noreply@esimerkki.fi>',
    // 'smtp' => ['host' => 'smtp.esimerkki.fi', 'port' => 587, 'secure' => 'tls', 'user' => 'käyttäjä', 'pass' => 'salasana'],   // secure: 'tls' (STARTTLS), 'ssl' tai ''

    // Tekstiviestit (valinnainen, Twilio): vieraiden muistutukset, jos baari on ottanut ne käyttöön. Viestit maksavat: kuukausikatto suojaa kuluilta.
    // 'sms' => ['account_sid' => 'ACxxxxxxxx', 'auth_token' => '…', 'from' => '+358401234567', 'default_country_code' => '358', 'monthly_cap' => 300],

    // Verkkomaksu (valinnainen, Stripe Checkout): maksulliset tapahtumaliput. Webhook-osoite: <sovelluksen osoite>/api.php?action=stripe_webhook
    // (tapahtumat checkout.session.completed ja checkout.session.expired). Baari ottaa maksun käyttöön asetuksissaan.
    // 'stripe' => ['secret_key' => 'sk_live_…', 'webhook_secret' => 'whsec_…', 'payment_methods' => ['mobilepay']],   // oletus: vain MobilePay; ['mobilepay','card'] lisää kortin, [] = Stripen automaattiset tavat

    // Valvonta (valinnainen): osoite api.php?action=health&key=… palauttaa 200 (kunnossa) tai 503 (cron tai varmuuskopio myöhässä).
    // 'health_key' => 'pitkä-satunnainen-avain',
    // 'cron_max_minutes' => 60,      // hälytys, jos cron.php ei ole ajanut näin pitkään
    // 'backup_expected' => true,     // hälytä myös, jos varmuuskopiota ei ole koskaan tehty (muuten seuranta alkaa ensimmäisestä onnistuneesta)
    // 'backup_max_hours' => 48,

    // Keskuspalvelin (BarShift Hub) liitetään hallintapaneelista (Baari → Asetukset → Keskuspalvelin); config.php:hen ei tarvitse lisätä mitään.

    // Sallitut origin-osoitteet API-kutsuille (tyhjä = vain sama isäntä)
    'allowed_origins' => [],
];
