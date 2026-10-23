(function () {
    'use strict';
    var stage = document.getElementById('stage');
    var taplayer = document.getElementById('taplayer');
    var video = document.getElementById('video');
    var bg = document.getElementById('bg');
    var scrim = document.getElementById('scrim');
    var cardWrap = document.getElementById('cardWrap');
    var card = document.getElementById('card');
    var audio = document.getElementById('audio');
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
    var watchdog = null;
    var seeking = false;
    var audioTimer = null;

    function fmt(t) {
        if (!isFinite(t) || t < 0) return '0:00';
        var m = Math.floor(t / 60);
        var s = Math.floor(t % 60);
        return m + ':' + String(s).padStart(2, '0');
    }

    function setPhase(p) {
        phase = p;
        taplayer.classList.toggle('is-hidden', p !== 'poster');
        if (p === 'playing') {
            clearTimeout(watchdog);
            // iOS: Start blieb nach Tap bei 0 stehen -> sauber zum Poster zurueck.
            watchdog = setTimeout(function () {
                if (phase === 'playing' && video.currentTime < 0.1 && !video.ended) setPhase('poster');
            }, 3000);
        }
    }

    // Ein Tap: Video MIT Ton starten und Audio-Element im selben Gesture
    // fuer iOS entsperren, ohne es hoerbar zu machen.
    function start() {
        if (phase !== 'poster') return;
        audio.muted = true;
        audio.play().then(function () { audio.pause(); audio.currentTime = 0; audio.muted = false; }).catch(function () { audio.muted = false; });
        video.muted = false;
        if (video.currentTime > 0) video.currentTime = 0;
        video.play().catch(function () { setPhase('poster'); });
        setPhase('playing');
    }

    // Karte fliegt EIN, waehrend das Video dahinter weiterlaeuft.
    // Frost-Blur zieht als Uebergang mit, Blumen bleiben sichtbar.
    function beginReveal() {
        if (phase !== 'playing') return;
        phase = 'revealing';
        video.classList.add('is-frost');
        cardWrap.setAttribute('aria-hidden', 'false');
        card.classList.add('is-in');
        // Testton startet, wenn die Karte landet.
        clearTimeout(audioTimer);
        audioTimer = setTimeout(function () {
            audio.currentTime = 0;
            audio.play().catch(function () {});
        }, 1500);
    }

    // Video ist am letzten Frame angekommen: exakt dieses Standbild
    // (identisch zum Clip-Ende) als Hintergrund halten, Video weg.
    function freezeFrame() {
        if (phase !== 'revealing') return;
        phase = 'revealed';
        bg.classList.add('is-on');
        scrim.classList.add('is-on');
        setTimeout(function () { video.classList.add('is-gone'); }, 500);
    }

    function replay() {
        clearTimeout(audioTimer);
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        video.pause();
        video.currentTime = 0;
        video.classList.remove('is-frost');
        video.classList.remove('is-gone');
        card.classList.remove('is-in');
        cardWrap.setAttribute('aria-hidden', 'true');
        bg.classList.remove('is-on');
        scrim.classList.remove('is-on');
        setPhase('poster');
    }

    taplayer.addEventListener('click', start);
    // Fallback: blockierte Autoplay-Pfade (z.B. iOS) -> Ton beim naechsten
    // echten Fingertipp starten, sobald die Karte sichtbar ist.
    stage.addEventListener('pointerdown', function () {
        if (card.classList.contains('is-in') && audio.paused && audio.currentTime === 0) {
            audio.play().catch(function () {});
        }
    });
    video.addEventListener('timeupdate', function () {
        if (!video.duration) return;
        if (video.duration - video.currentTime <= 2.5) beginReveal();
    });
    video.addEventListener('ended', freezeFrame);
    video.addEventListener('error', freezeFrame);
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
