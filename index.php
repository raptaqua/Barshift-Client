<?php if (!is_file(__DIR__ . '/config.php') && !getenv('BARSHIFT_CONFIG') && is_file(__DIR__ . '/install.php')) { header('Location: install.php'); exit; } ?>
<!DOCTYPE html>
<html lang="fi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>BarShift Pro</title>
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#E14D2A">
    <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
    <link rel="icon" type="image/svg+xml" href="assets/icon.svg">
    
    <link rel="stylesheet" href="assets/vendor/bootstrap-icons/bootstrap-icons.min.css">
    <?php if (is_file(__DIR__ . '/assets/fonts/fonts.css')) echo '<link rel="stylesheet" href="assets/fonts/fonts.css">'; /* valinnainen: omalta palvelimelta ladattavat kirjasimet, ks. README */ ?>
    <link rel="stylesheet" href="assets/app.css?v=<?= (int)@filemtime(__DIR__ . '/assets/app.css') ?>">
</head>
<body>

<div id="app"></div>
<div id="toast"></div>

<div id="modal-overlay" class="modal-overlay" onclick="if(event.target===this)closeModal()">
    <div class="modal" id="modal-box">
        <div class="modal-header">
            <div class="modal-title" id="modal-title-el"></div>
            <button class="modal-close" onclick="closeModal()"><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="modal-body" id="modal-body-el"></div>
        <div class="modal-footer" id="modal-footer-el"></div>
    </div>
</div>

<script src="assets/js/i18n.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/i18n.js') ?>"></script>
<script src="leave.js"></script>
<script src="assets/js/core.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/core.js') ?>"></script>
<script src="assets/js/messages.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/messages.js') ?>"></script>
<script src="assets/js/home.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/home.js') ?>"></script>
<script src="assets/js/shifts.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/shifts.js') ?>"></script>
<script src="assets/js/absences.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/absences.js') ?>"></script>
<script src="assets/js/search.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/search.js') ?>"></script>
<script src="assets/js/guests.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/guests.js') ?>"></script>
<script src="assets/js/hours.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/hours.js') ?>"></script>
<script src="assets/js/skills.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/skills.js') ?>"></script>
<script src="assets/js/system.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/system.js') ?>"></script>
<script src="assets/js/access.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/access.js') ?>"></script>
<script src="assets/js/admin.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/admin.js') ?>"></script>
<script src="assets/js/planning.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/planning.js') ?>"></script>
<script src="assets/js/cash.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/cash.js') ?>"></script>
<script src="assets/js/eventguests.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/eventguests.js') ?>"></script>
<script src="assets/js/team.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/team.js') ?>"></script>
<script src="assets/js/customers.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/customers.js') ?>"></script>
<script src="assets/js/main.js?v=<?= (int)@filemtime(__DIR__ . '/assets/js/main.js') ?>"></script>
</body>
</html>