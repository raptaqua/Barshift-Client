// Ohjesivun toiminnot (ulkoisessa tiedostossa, koska sivuston CSP estää inline-skriptit)
    function toggleExample(el) {
        el.classList.toggle('open');
    }

    function toggleMobileNav() {
        document.getElementById('mobileNav').classList.toggle('open');
    }
    function closeMobileNav() {
        document.getElementById('mobileNav').classList.remove('open');
    }

    // Highlight active nav link on scroll
    const sections = document.querySelectorAll('.section');
    const navLinks = document.querySelectorAll('.sidebar .nav-link');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                navLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === '#' + id);
                });
            }
        });
    }, { rootMargin: '-30% 0px -60% 0px' });

    sections.forEach(s => observer.observe(s));

    document.addEventListener('click', function (e) {
        var img = e.target.closest('figure.shot img');
        if (!img) return;
        var lb = document.getElementById('lightbox');
        document.getElementById('lightbox-img').src = img.src;
        document.getElementById('lightbox-img').alt = img.alt;
        lb.classList.add('open');
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.getElementById('lightbox').classList.remove('open'); });
