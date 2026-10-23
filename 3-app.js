(function () {
    'use strict';
    var overlay = document.getElementById('overlay');
    var posterImg = document.getElementById('posterImg');
    var video = document.getElementById('video');
    var audio = document.getElementById('audio');
    var tapHint = document.getElementById('tapHint');
    var playBtn = document.getElementById('playBtn');
    var iconPlay = document.getElementById('iconPlay');
    var iconPause = document.getElementById('iconPause');
    var muteBtn = document.getElementById('muteBtn');
    var iconVol = document.getElementById('iconVol');
    var iconMute = document.getElementById('iconMute');
    var track = document.getElementById('track');
    var fill = document.getElementById('fill');
    var tCur = document.getElementById('tCur');
    var tDur = document.getElementById('tDur');
    var replayBtn = document.getElementById('replayBtn');

    var phase = 'poster';
    var fadeTimer = null;
    var watchdog = null;
    var seeking = false;

    function fmt(t) {
        if (!isFinite(t) || t < 0) return '0:00';
        var m = Math.floor(t / 60);
        var s = Math.floor(t % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    function setPhase(p) {
        phase = p;
        overlay.classList.toggle('is-fading', p === 'fading');
        overlay.classList.toggle('is-hidden', p === 'revealed');
        overlay.setAttribute('aria-hidden', p === 'revealed' ? 'true' : 'false');
        posterImg.style.opacity = p === 'poster' ? '1' : '0';
        video.style.opacity = p === 'poster' ? '0' : '1';
        tapHint.style.display = p === 'poster' ? '' : 'none';
        if (p === 'fading') {
            clearTimeout(fadeTimer);
            fadeTimer = setTimeout(finishReveal, 1400);
        }
        if (p === 'playing') {
            clearTimeout(watchdog);
            // Start blieb 3s nach dem Tap bei 0 stehen (abgelehnt/haengend):
            // sauber zum Poster zurueck statt im toten Zustand haengen.
            watchdog = setTimeout(function () {
                if (phase === 'playing' && video.currentTime < 0.1 && !video.ended) setPhase('poster');
            }, 3000);
        }
    }

    // Einmaliger Tap: startet das Video MIT Ton und entsperrt das Audio-Element
    // im selben User-Gesture (iOS-Autoplay-Muster), ohne es hoerbar zu machen.
    function start() {
        if (phase !== 'poster') return;
        audio.muted = true;
        audio.play().then(function () { audio.pause(); audio.currentTime = 0; audio.muted = false; }).catch(function () { audio.muted = false; });
        video.muted = false;
        if (video.currentTime > 0) video.currentTime = 0;
        video.play().catch(function () { setPhase('poster'); });
        setPhase('playing');
    }

    function beginFade() {
        if (phase === 'playing') setPhase('fading');
    }

    function finishReveal() {
        if (phase !== 'fading' && phase !== 'playing') return;
        setPhase('revealed');
        audio.currentTime = 0;
        audio.play().catch(function () {});
    }

    function replay() {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        video.pause();
        video.currentTime = 0;
        setPhase('poster');
    }

    overlay.addEventListener('click', start);
    overlay.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'opacity' && phase === 'fading') finishReveal();
    });
    video.addEventListener('timeupdate', function () {
        if (!video.duration) return;
        if (video.duration - video.currentTime <= 1.2) beginFade();
    });
    video.addEventListener('ended', beginFade);
    video.addEventListener('error', beginFade);
    replayBtn.addEventListener('click', replay);

    // ---------- Player ----------
    playBtn.addEventListener('click', function () {
        if (audio.paused) audio.play().catch(function () {});
        else audio.pause();
    });
    muteBtn.addEventListener('click', function () {
        audio.muted = !audio.muted;
        iconVol.style.display = audio.muted ? 'none' : '';
        iconMute.style.display = audio.muted ? '' : 'none';
        muteBtn.setAttribute('aria-label', audio.muted ? 'Ton an' : 'Stumm');
    });
    audio.addEventListener('play', function () {
        iconPlay.style.display = 'none';
        iconPause.style.display = '';
        playBtn.setAttribute('aria-label', 'Pause');
    });
    audio.addEventListener('pause', function () {
        iconPlay.style.display = '';
        iconPause.style.display = 'none';
        playBtn.setAttribute('aria-label', 'Abspielen');
    });
    audio.addEventListener('ended', function () {
        iconPlay.style.display = '';
        iconPause.style.display = 'none';
        audio.currentTime = 0;
    });
    audio.addEventListener('loadedmetadata', function () {
        tDur.textContent = fmt(audio.duration);
        track.setAttribute('aria-valuemax', String(Math.round(audio.duration)));
    });
    audio.addEventListener('timeupdate', function () {
        if (seeking) return;
        tCur.textContent = fmt(audio.currentTime);
        track.setAttribute('aria-valuenow', String(Math.round(audio.currentTime)));
        if (audio.duration > 0) fill.style.width = Math.min(100, (audio.currentTime / audio.duration) * 100) + '%';
    });

    function seekTo(clientX) {
        if (!audio.duration) return;
        var r = track.getBoundingClientRect();
        var ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
        audio.currentTime = ratio * audio.duration;
        tCur.textContent = fmt(audio.currentTime);
        fill.style.width = (ratio * 100) + '%';
    }
    track.addEventListener('pointerdown', function (e) {
        seeking = true;
        seekTo(e.clientX);
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
    });
    track.addEventListener('pointermove', function (e) {
        if (seeking) seekTo(e.clientX);
    });
    track.addEventListener('pointerup', function () { seeking = false; });

    if (audio.readyState >= 1) tDur.textContent = fmt(audio.duration);
    setPhase('poster');
})();
