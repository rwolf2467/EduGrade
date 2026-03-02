(function () {
    function initAvoCloudLogos() {
        document.querySelectorAll('.avocloud-logo').forEach(function (logo) {
            const iconEl = logo.querySelector('.avocloud-logo__icon');
            const avEl   = logo.querySelector('.avocloud-logo__av');
            const wrapEl = logo.querySelector('.avocloud-logo__rest-wrap');
            const restEl = logo.querySelector('.avocloud-logo__rest');
            const pathEl = logo.querySelector('.avocloud-logo__icon svg path');

            if (!iconEl || !avEl || !wrapEl || !restEl) return;

            let locked = false;

            if (pathEl) {
                pathEl.style.strokeDasharray  = '200';
                pathEl.style.strokeDashoffset = '0';
            }

            function runTypewriterSVG(durationMs) {
                if (!pathEl) return;
                pathEl.style.transition = 'none';
                pathEl.style.strokeDashoffset = '200';
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        pathEl.style.transition = 'stroke-dashoffset ' + durationMs + 'ms cubic-bezier(0.4,0,0.2,1)';
                        pathEl.style.strokeDashoffset = '0';
                    });
                });
            }

            function expand() {
                if (locked) return;
                wrapEl.style.maxWidth      = '600px';
                avEl.style.opacity         = '1';
                avEl.style.transform       = 'translateX(0)';
                iconEl.style.opacity       = '0';
                restEl.style.opacity       = '1';
                restEl.style.transform     = 'translateX(0)';
            }

            function collapse() {
                if (locked) return;
                avEl.style.opacity         = '0';
                avEl.style.transform       = 'translateX(6px)';
                wrapEl.style.maxWidth      = '0';
                restEl.style.opacity       = '0';
                restEl.style.transform     = 'translateX(20px)';

                locked = true;
                setTimeout(function () {
                    iconEl.style.opacity = '1';
                    runTypewriterSVG(580);
                    locked = false;
                }, 200);
            }

            logo.addEventListener('mouseenter', expand);
            logo.addEventListener('mouseleave', collapse);
            logo.addEventListener('focus',      expand);
            logo.addEventListener('blur',       collapse);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAvoCloudLogos);
    } else {
        initAvoCloudLogos();
    }
})();
