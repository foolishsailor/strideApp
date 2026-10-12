/* ===========================================================================
   STRIDE — settings.
   ---------------------------------------------------------------------------
   One document, injected into the interface as a shadow root, so its `sx-`
   selectors cannot collide with the page's styles or the page's with them.

   **How it is themed.** Every colour, radius, weight and spacing below is a
   `var(--sx-…)`, defined by the interface's theme
   (console/stride/frontend/src/theme/themes/trailmate.ts, `settings`). Custom
   properties inherit into the shadow root — `:host{all:initial}` does not
   reset them — so nothing has to be passed in. A frontend test fails if this
   file reads one the theme does not define.

   Everything is read from and written to the Kotlin bridge immediately — there
   is no Save button and nothing is held here. A console that loses a setting
   because somebody walked away from a form is a console that lies about its own
   configuration.
   =========================================================================== */
(function (global) {
  'use strict';

  var S = null;          // last settings object from the bridge
  var root = null;
  var shadowHost = null;
  var poll = null;

  function bridge() { return global.Stride; }
  function has(fn) { try { return typeof bridge()[fn] === 'function'; } catch (e) { return false; } }

  function load() {
    try { S = JSON.parse(bridge().settingsJson()); } catch (e) { S = S || {}; }
    return S;
  }

  function save(key, value) {
    try { bridge().saveSetting(key, String(value)); } catch (e) {}
    S[key] = value;
  }

  /* ---- styles ------------------------------------------------------------ */
  var CSS = [
    ':host{all:initial}',
    '.sx-root{position:absolute;top:0;right:0;bottom:0;left:0;display:flex;',
    '  background:var(--sx-bg);color:var(--sx-ink);',
    '  font-family:var(--sx-font);-webkit-font-smoothing:antialiased;',
    '  user-select:none;-webkit-tap-highlight-color:rgba(0,0,0,0)}',

    '*{margin:0;padding:0;box-sizing:border-box}',
    'button{font-family:inherit;outline:none;border:none;background:none;',
    '  -webkit-tap-highlight-color:rgba(0,0,0,0)}',
    '.sx-root::before{content:"";position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none;',
    '  background:radial-gradient(ellipse 900px 520px at 50% 44%,',
    '  var(--sx-backdrop-inner) 0%,var(--sx-backdrop-mid) 45%,transparent 72%)}',

    '.sx-rail{position:relative;z-index:2;flex:none;width:302px;height:100%;',
    '  border-right:1px solid var(--sx-line);padding:26px 0 0;display:flex;flex-direction:column}',
    '.sx-title{padding:0 30px 22px;font-size:34px;font-weight:var(--sx-w-light);letter-spacing:var(--sx-tracking)}',
    '.sx-navs{flex:1;overflow:hidden}',
    '.sx-nav{display:flex;align-items:center;width:100%;height:66px;padding:0 30px;',
    '  background:none;border:none;color:var(--sx-ink-dim);font-size:19px;font-weight:var(--sx-w-body);',
    '  text-align:left;border-left:3px solid transparent}',
    '.sx-nav .sx-ic{width:26px;height:26px;flex:none;opacity:.75;margin-right:16px}',
    '.sx-nav.sx-on{color:var(--sx-ink);border-left-color:var(--sx-accent);background:rgba(var(--sx-accent-rgb),.09)}',
    '.sx-nav.sx-on .sx-ic{opacity:1}',
    '.sx-nav.sx-down{background:rgba(var(--sx-accent-rgb),.14)}',
    /* The console has a bottom bezel and a finger needs somewhere to land that
       is not the edge of the glass. */
    '.sx-foot{padding:20px 30px 34px}',
    '.sx-close{width:100%;height:78px;border-radius:var(--sx-radius);background:rgba(var(--sx-accent-rgb),.14);',
    '  border:var(--sx-edge) solid var(--sx-accent);color:var(--sx-ink);font-size:19px;letter-spacing:var(--sx-tracking)}',
    '.sx-close.sx-down{transform:scale(.98)}',

    '.sx-panel{position:relative;z-index:2;flex:1;height:100%;padding:34px 40px 0 44px;overflow:hidden}',
    '.sx-pane{display:none;height:100%;flex-direction:column}',
    '.sx-pane.sx-on{display:flex}',
    '.sx-h{font-size:38px;font-weight:var(--sx-w-light)}',
    '.sx-sub{margin-top:9px;color:var(--sx-ink-dim);font-size:17px;font-weight:var(--sx-w-body);line-height:1.45;max-width:820px}',
    /* padding-bottom, not a spacer: it scrolls with the content, so the last
       row can always be brought clear of the bezel instead of resting under it. */
    '.sx-scroll{margin-top:24px;flex:1;overflow-y:auto;padding-right:14px;padding-bottom:46px;',
    '  -webkit-overflow-scrolling:touch}',
    '.sx-scroll::-webkit-scrollbar{width:8px}',
    '.sx-scroll::-webkit-scrollbar-thumb{background:var(--sx-line);border-radius:4px}',

    '.sx-row{display:flex;align-items:center;min-height:84px;padding:16px 0;',
    '  border-bottom:1px solid rgba(var(--sx-line-rgb),.6)}',
    '.sx-row:last-child{border-bottom:none}',
    '.sx-lbl{flex:1;min-width:0;margin-right:20px}',
    '.sx-n{font-size:20px;font-weight:var(--sx-w-body)}',
    '.sx-d{margin-top:5px;font-size:14px;color:var(--sx-ink-faint);line-height:1.4}',
    '.sx-ctl{flex:none}',
    '.sx-group{margin-top:30px}',
    '.sx-gh{font-size:13px;letter-spacing:var(--sx-tracking);text-transform:uppercase;color:var(--sx-ink-faint);padding-bottom:6px}',

    '.sx-sw{width:96px;height:52px;border-radius:26px;background:rgba(var(--sx-line-rgb),.9);',
    '  border:var(--sx-edge) solid var(--sx-line);position:relative;transition:.16s}',
    '.sx-sw i{position:absolute;top:4px;left:4px;width:40px;height:40px;border-radius:50%;',
    '  background:var(--sx-ink-faint);transition:.16s}',
    '.sx-sw.sx-on{background:rgba(var(--sx-accent-rgb),.22);border-color:var(--sx-accent)}',
    '.sx-sw.sx-on i{left:48px;background:var(--sx-accent)}',

    '.sx-seg{display:flex;border:var(--sx-edge) solid var(--sx-line);border-radius:var(--sx-radius);overflow:hidden}',
    '.sx-seg button{height:56px;padding:0 22px;background:none;border:none;color:var(--sx-ink-dim);',
    '  font-size:17px;font-weight:var(--sx-w-body);border-right:1px solid var(--sx-line)}',
    '.sx-seg button:last-child{border-right:none}',
    '.sx-seg button.sx-on{background:rgba(var(--sx-accent-rgb),.16);color:var(--sx-ink)}',

    '.sx-step{display:flex;align-items:center}',
    '.sx-step button{margin:0 2px}',
    '.sx-step button{width:60px;height:56px;border-radius:var(--sx-radius);background:rgba(var(--sx-surface-rgb),.5);',
    '  border:var(--sx-edge) solid var(--sx-line);color:var(--sx-ink);font-size:26px;font-weight:var(--sx-w-light)}',
    '.sx-step button.sx-down{background:rgba(var(--sx-accent-rgb),.2)}',
    '.sx-step .sx-v{min-width:128px;text-align:center;font-size:24px;font-weight:var(--sx-w-body)}',
    '.sx-step .sx-v small{font-size:15px;color:var(--sx-ink-dim);margin-left:5px}',

    '.sx-fld{height:56px;min-width:300px;padding:0 18px;border-radius:var(--sx-radius);',
    '  background:rgba(var(--sx-bg-rgb),.7);border:var(--sx-edge) solid var(--sx-line);color:var(--sx-ink);',
    '  font-size:18px;font-weight:var(--sx-w-body);font-family:inherit;user-select:text}',
    '.sx-fld.sx-short{min-width:132px}',
    '.sx-fld:focus{border-color:var(--sx-accent)}',

    '.sx-pill{height:56px;padding:0 26px;border-radius:var(--sx-radius);background:rgba(var(--sx-surface-rgb),.5);',
    '  border:var(--sx-edge) solid var(--sx-line);color:var(--sx-ink);font-size:16px;letter-spacing:var(--sx-tracking)}',
    '.sx-pill.sx-down{transform:scale(.98);background:rgba(var(--sx-accent-rgb),.2)}',
    '.sx-pill.sx-go{border-color:var(--sx-accent);background:rgba(var(--sx-accent-rgb),.16)}',
    '.sx-pill.sx-warn{border-color:var(--sx-alert);color:var(--sx-alert-ink)}',

    '.sx-state{display:inline-flex;align-items:center;font-size:15px;color:var(--sx-ink-dim)}',
    '.sx-dot{width:10px;height:10px;border-radius:50%;background:var(--sx-ink-faint);flex:none;margin-right:9px}',
    '.sx-dot.sx-ok{background:var(--sx-good);box-shadow:var(--sx-glow)}',
    '.sx-dot.sx-bad{background:var(--sx-alert);box-shadow:var(--sx-glow)}',
    '.sx-dot.sx-busy{background:var(--sx-warm);animation:sxp 1s infinite}',
    '@keyframes sxp{0%,100%{opacity:1}50%{opacity:.25}}',

    '.sx-people{display:flex;flex-wrap:wrap;margin-top:6px}',
    '.sx-person{width:200px;margin:0 16px 16px 0;padding:18px 14px 14px;border-radius:var(--sx-radius);text-align:center;',
    '  background:rgba(var(--sx-surface-rgb),.4);border:var(--sx-edge) solid var(--sx-line);color:var(--sx-ink)}',
    '.sx-person.sx-on{border-color:var(--sx-accent);background:rgba(var(--sx-accent-rgb),.14)}',
    '.sx-av{width:64px;height:64px;border-radius:50%;margin:0 auto 12px;',
    '  background:rgba(var(--sx-accent-rgb),.14);border:var(--sx-edge) solid var(--sx-line);display:flex;',
    '  align-items:center;justify-content:center;font-size:25px;font-weight:var(--sx-w-light);color:var(--sx-accent)}',
    '.sx-pn{font-size:20px;font-weight:var(--sx-w-body)}',
    '.sx-pd{margin-top:5px;font-size:13px;color:var(--sx-ink-faint);min-height:17px;line-height:1.35}',
    '.sx-person.sx-add{border-style:dashed;color:var(--sx-ink-dim)}',
    '.sx-person.sx-add .sx-av{color:var(--sx-ink-dim);font-size:32px}',

    '.sx-dev{display:flex;align-items:center;padding:18px 20px;margin-top:12px;',
    '  border-radius:var(--sx-radius);background:rgba(var(--sx-surface-rgb),.36);border:var(--sx-edge) solid var(--sx-line)}',
    '.sx-dev.sx-on{border-color:var(--sx-accent);background:rgba(var(--sx-accent-rgb),.12)}',
    '.sx-dev .sx-dn{flex:1;min-width:0;margin-right:18px}',
    '.sx-dev .sx-pill{margin-left:18px}',
    '.sx-bpm{font-size:30px;font-weight:var(--sx-w-light);color:var(--sx-accent);min-width:104px;text-align:right}',
    '.sx-bpm small{font-size:13px;color:var(--sx-ink-dim);margin-left:4px}',
    '.sx-empty{margin-top:14px;padding:26px;border-radius:var(--sx-radius);text-align:center;',
    '  border:var(--sx-edge) dashed var(--sx-line);color:var(--sx-ink-faint);font-size:16px;line-height:1.5}',


    '.sx-kb{position:absolute;left:0;right:0;bottom:0;z-index:20;display:none;',
    '  background:var(--sx-kb-bg);border-top:var(--sx-edge) solid var(--sx-line);padding:16px 20px 20px}',
    '.sx-kb.sx-on{display:block}',
    '.sx-kb-peek{display:flex;align-items:center;margin:0 6px 14px;height:58px;',
    '  border-radius:var(--sx-radius);background:rgba(var(--sx-bg-rgb),.8);border:var(--sx-edge) solid var(--sx-accent);',
    '  padding:0 18px;overflow:hidden}',
    '.sx-kb-peek .sx-kb-lbl{font-size:14px;color:var(--sx-ink-faint);flex:none;margin-right:14px;',
    '  text-transform:uppercase;letter-spacing:var(--sx-tracking)}',
    '.sx-kb-peek .sx-kb-val{font-size:22px;font-weight:var(--sx-w-body);color:var(--sx-ink);',
    '  white-space:nowrap;overflow:hidden}',
    '.sx-kb-peek .sx-kb-car{color:var(--sx-accent);font-weight:var(--sx-w-light)}',
    '.sx-kb-row{display:flex;justify-content:center;margin-bottom:8px}',
    '.sx-kb-row button{height:62px;min-width:62px;margin:0 4px;border-radius:var(--sx-radius);',
    '  background:rgba(var(--sx-surface-rgb),.75);border:1px solid var(--sx-line);color:var(--sx-ink);',
    '  font-size:22px;font-weight:var(--sx-w-body)}',
    '.sx-kb-row button.sx-down{background:rgba(var(--sx-accent-rgb),.28)}',
    '.sx-kb-row button.sx-wide{min-width:150px;font-size:16px;letter-spacing:var(--sx-tracking)}',
    '.sx-kb-row button.sx-space{min-width:320px}',
    '.sx-kb-row button.sx-go{border-color:var(--sx-accent);background:rgba(var(--sx-accent-rgb),.18)}',
    '.sx-note{margin-top:20px;padding:18px 20px;border-radius:var(--sx-radius);',
    '  background:rgba(var(--sx-warm-rgb),.09);border-left:3px solid var(--sx-warm);',
    '  font-size:14px;color:var(--sx-ink-dim);line-height:1.55}',
    /* TrailMate's link: the code large enough to read from the belt, and the
       QR on a light tile — a QR wants dark modules on light, and the code that
       draws it may not paint a background of its own. */
    '.sx-tm{display:flex;align-items:center;margin-top:12px;padding:22px 24px;',
    '  border-radius:var(--sx-radius);background:rgba(var(--sx-surface-rgb),.36);border:var(--sx-edge) solid var(--sx-line)}',
    '.sx-tm.sx-on{border-color:var(--sx-accent);background:rgba(var(--sx-accent-rgb),.12)}',
    '.sx-tm .sx-dn{flex:1;min-width:0;margin-right:18px}',
    '.sx-qr{flex:none;width:232px;height:232px;padding:14px;margin-right:30px;',
    '  border-radius:var(--sx-radius);background:var(--sx-ink)}',
    '.sx-qr img{display:block;width:100%;height:100%}',
    '.sx-code{font-size:58px;font-weight:var(--sx-w-light);letter-spacing:var(--sx-tracking);',
    '  color:var(--sx-ink);margin:6px 0 10px}',
    '.sx-tm .sx-pill{margin-left:14px}',
    '.sx-ro{font-size:19px;font-weight:var(--sx-w-body);color:var(--sx-ink-dim)}',
    '.sx-ro b{color:var(--sx-ink);font-weight:var(--sx-w-body)}'
  ].join('');

  /* ---- tiny DOM helpers -------------------------------------------------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* For text that came from somewhere else — TrailMate's messages, the name
     somebody linked as — before it goes anywhere near innerHTML. */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Presses fire on touchstart for the same reason the rest of the console
     does — `click` waits for touch-end plus gesture disambiguation, which reads
     as an ignored press. Mouse events too, so this is usable in a browser. */
  function press(e, fn) {
    if (!e) return e;
    var done = false;
    e.addEventListener('touchstart', function (ev) {
      done = true; e.classList.add('sx-down'); fn(ev); ev.preventDefault();
    }, { passive: false });
    var up = function () { e.classList.remove('sx-down'); };
    e.addEventListener('touchend', up);
    e.addEventListener('touchcancel', up);
    e.addEventListener('click', function (ev) { if (!done) fn(ev); });
    return e;
  }

  function row(name, desc, ctl) {
    // The keyboard covers the row it is editing, so the control needs to carry
    // its own name into the preview.
    if (ctl && ctl.classList && ctl.classList.contains('sx-fld')) ctl.sxLabel = name;
    if (ctl && ctl.querySelector) {
      var inner = ctl.querySelector('.sx-fld');
      if (inner) inner.sxLabel = name;
    }
    var r = el('div', 'sx-row');
    var l = el('div', 'sx-lbl');
    l.appendChild(el('div', 'sx-n', name));
    if (desc) l.appendChild(el('div', 'sx-d', desc));
    r.appendChild(l);
    var c = el('div', 'sx-ctl');
    c.appendChild(ctl);
    r.appendChild(c);
    return r;
  }

  function toggle(key, initial, onChange) {
    var t = el('div', 'sx-sw' + (initial ? ' sx-on' : ''), '<i></i>');
    press(t, function () {
      var on = !t.classList.contains('sx-on');
      t.classList.toggle('sx-on', on);
      if (key) save(key, on);
      if (onChange) onChange(on);
    });
    return t;
  }

  function segment(key, options, current, onChange) {
    var s = el('div', 'sx-seg');
    options.forEach(function (o) {
      var b = el('button', o[0] === current ? 'sx-on' : '', o[1]);
      press(b, function () {
        [].forEach.call(s.children, function (c) { c.classList.remove('sx-on'); });
        b.classList.add('sx-on');
        if (key) save(key, o[0]);
        if (onChange) onChange(o[0]);
      });
      s.appendChild(b);
    });
    return s;
  }

  function stepper(key, value, min, max, inc, unit, dp) {
    var s = el('div', 'sx-step');
    var v = el('div', 'sx-v');
    var draw = function () {
      v.innerHTML = value.toFixed(dp || 0) + '<small>' + unit + '</small>';
    };
    var bump = function (d) {
      value = Math.min(max, Math.max(min, value + d * inc));
      // Floating point: 0.1 + 0.2 has no business reaching a settings store.
      value = Math.round(value * 100) / 100;
      draw();
      save(key, value);
    };
    s.appendChild(press(el('button', '', '&minus;'), function () { bump(-1); }));
    s.appendChild(v);
    s.appendChild(press(el('button', '', '+'), function () { bump(1); }));
    draw();
    return s;
  }

  /* Somebody's age, which saves through setPersonAge rather than the global
     store the ordinary stepper writes to — it belongs to a person, not to the
     console.

     "Not set" is a real value and the one it ships in: stepping below the
     bottom clears it rather than sticking at a floor, because declining to
     give a treadmill your age has to stay a supported answer. The first tap
     up lands mid-range rather than at 13, so nobody has to press + forty
     times to reach themselves. */
  function ageStepper(p) {
    var s = el('div', 'sx-step');
    var v = el('div', 'sx-v');
    var value = p.age || 0;
    var draw = function () {
      v.innerHTML = value >= 13
        ? value + '<small>years</small>' : '<small>not set</small>';
    };
    var bump = function (d) {
      if (value < 13) value = d > 0 ? 40 : 0;
      else value = value + d;
      if (value > 100) value = 100;
      if (value < 13) value = 0;
      draw();
      try { S = JSON.parse(bridge().setPersonAge(p.name, value)); } catch (e) {}
      p.age = value;
    };
    s.appendChild(press(el('button', '', '&minus;'), function () { bump(-1); }));
    s.appendChild(v);
    s.appendChild(press(el('button', '', '+'), function () { bump(1); }));
    draw();
    return s;
  }

  /* What a stored password looks like from here. The console does not send
     the password itself — Settings.json() sends `mqtt_pass_set` instead — so
     this is a statement that one exists, never the thing itself. */
  var SECRET_MASK = '••••••••';

  function field(key, value, short, type) {
    var f = el('input', 'sx-fld' + (short ? ' sx-short' : ''));
    f.value = value == null ? '' : value;
    if (type) f.type = type;
    var secret = type === 'password';
    var hadOne = secret && f.value === SECRET_MASK;
    // readonly: the caret and the (never-appearing) system keyboard are both
    // noise here. The on-screen keyboard owns the value.
    f.setAttribute('readonly', 'readonly');
    // Saved when the keyboard closes, not per keystroke — a bridge call per
    // character would write a broker host of "1", "19", "192"… and try to
    // connect to each one.
    f.sxCommit = function () {
      var v = f.value.trim();
      // A password box that was left alone must not wipe the password. This
      // page is never given the stored one, so "empty" here means "nothing
      // was typed", not "clear it" — and putting the mask back keeps the
      // screen honest about the fact that one is still stored.
      if (secret && (v === '' || v === SECRET_MASK)) {
        if (hadOne) f.value = SECRET_MASK;
        return;
      }
      save(key, v);
    };
    press(f, function () {
      // Clear the mask before the keyboard opens, or the first thing typed
      // lands on the end of eight bullets and gets saved that way.
      if (secret && f.value === SECRET_MASK) f.value = '';
      openKeyboard(f);
    });
    return f;
  }

  function group(title) {
    var g = el('div', 'sx-group');
    if (title) g.appendChild(el('div', 'sx-gh', title));
    return g;
  }


  /* ---- on-screen keyboard ------------------------------------------------
     The console never shows the system one.

     It has an IME installed and enabled (AOSP LatinIME) but the activity runs
     under SYSTEM_UI_FLAG_FULLSCREEN | HIDE_NAVIGATION | IMMERSIVE_STICKY, and
     `dumpsys input_method` confirms `mInputShown=false` when a WebView field
     takes focus: the window never gives it room. Dropping immersive mode to
     get a keyboard would put the Android navigation bar across the bottom of a
     treadmill console for the sake of typing a name twice in its life.

     So the screen brings its own. It is also simply better here — sized for
     the panel, laid out for what actually gets typed (names, hostnames,
     passwords) and reachable at arm's length.
     -------------------------------------------------------------------- */
  var kb = null, kbTarget = null, kbShift = false;

  var KB_ROWS = [
    '1234567890'.split(''),
    'qwertyuiop'.split(''),
    'asdfghjkl'.split(''),
    'zxcvbnm'.split('')
  ];
  /* Everything a broker host, a topic prefix or a password realistically needs,
     and nothing else — a full symbol plane would be another shift layer to
     find. */
  var KB_SYMS = ['.', '-', '_', ':', '/', '@', '#', '!'];

  function buildKeyboard() {
    if (kb) return kb;
    kb = el('div', 'sx-kb');
    var peek = el('div', 'sx-kb-peek');
    kb.appendChild(peek);

    var draw = function () {
      var v = kbTarget ? kbTarget.value : '';
      var label = (kbTarget && kbTarget.sxLabel) || '';
      // Password fields are dotted here too — the keyboard is at chest height
      // on a screen in a room, not on a phone held to your face.
      if (kbTarget && kbTarget.type === 'password') v = v.replace(/./g, '\u2022');
      peek.innerHTML =
        (label ? '<span class="sx-kb-lbl">' + label + '</span>' : '') +
        '<span class="sx-kb-val">' + v.replace(/</g, '&lt;') +
        '<span class="sx-kb-car">|</span></span>';
    };
    kb.sxDraw = draw;

    var type = function (ch) {
      if (!kbTarget) return;
      var max = parseInt(kbTarget.getAttribute('maxlength') || '0', 10);
      if (max && kbTarget.value.length >= max) return;
      kbTarget.value += ch;
      // Shift is a one-shot, as on every phone keyboard. Left latched it types
      // KEZ when you wanted Kez, and nothing on screen explains why.
      if (kbShift) { kbShift = false; paintCase(); }
      draw();
    };

    /* Names want a capital; hostnames and topic prefixes do not. Auto-shift
       only where a capital is the likely next character. */
    var autoShift = function () {
      kbShift = !!(kbTarget && kbTarget.sxCapitalise && !kbTarget.value.length);
      paintCase();
    };

    KB_ROWS.forEach(function (chars, i) {
      var r = el('div', 'sx-kb-row');
      chars.forEach(function (c) {
        var b = press(el('button', '', c), function () {
          type(kbShift && i > 0 ? c.toUpperCase() : c);
        });
        b.sxChar = c;
        r.appendChild(b);
      });
      if (i === 3) {
        r.insertBefore(press(el('button', 'sx-wide', 'SHIFT'), function () {
          kbShift = !kbShift;
          paintCase();
        }), r.firstChild);
        r.appendChild(press(el('button', 'sx-wide', 'DELETE'), function () {
          if (!kbTarget) return;
          kbTarget.value = kbTarget.value.slice(0, -1);
          draw();
        }));
      }
      kb.appendChild(r);
    });

    kb.sxAutoShift = autoShift;

    var last = el('div', 'sx-kb-row');
    KB_SYMS.forEach(function (c) {
      last.appendChild(press(el('button', '', c), function () { type(c); }));
    });
    last.appendChild(press(el('button', 'sx-space', 'space'), function () { type(' '); }));
    last.appendChild(press(el('button', 'sx-wide sx-go', 'DONE'), closeKeyboard));
    kb.appendChild(last);

    root.appendChild(kb);
    return kb;
  }

  function paintCase() {
    if (!kb) return;
    [].forEach.call(kb.querySelectorAll('.sx-kb-row button'), function (b) {
      if (b.sxChar && /[a-z]/i.test(b.sxChar)) {
        b.textContent = kbShift ? b.sxChar.toUpperCase() : b.sxChar;
      }
    });
  }

  function openKeyboard(input) {
    buildKeyboard();
    kbTarget = input;
    kb.sxAutoShift();
    kb.sxDraw();
    kb.classList.add('sx-on');
  }

  function closeKeyboard() {
    if (!kb) return;
    kb.classList.remove('sx-on');
    // Commit on close, the same moment a blur would have.
    if (kbTarget && kbTarget.sxCommit) kbTarget.sxCommit();
    kbTarget = null;
  }

  /* ---- sections ---------------------------------------------------------- */
  var ICONS = {
    people: 'M12 12a5 5 0 100-10 5 5 0 000 10zm-9 9a9 9 0 0118 0',
    devices: 'M7 7l10 10-5 5V2l5 5L7 17',
    ha: 'M3 11l9-8 9 8M5 10v10h14V10',
    deck: 'M3 17h18M6 17l3-9h6l3 9M9 8V5h6v3',
    coach: 'M4 5h16v11H9l-5 4V5z',
    screen: 'M3 4h18v12H3zM8 20h8M12 16v4',
    routes: 'M3 18l6-3 6 3 6-3V6l-6 3-6-3-6 3zM9 15V6M15 18V9',
    about: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 10v7M12 7h.01'
  };

  var SECTIONS = [
    ['people', 'Who walks',      paneWho],
    ['devices', 'Devices',       paneDevices],
    ['ha',     'Home Assistant', paneHa],
    ['deck',   'Treadmill',      paneDeck],
    ['routes', 'My routes',      paneRoutes],
    ['coach',  'Coach',          paneCoach],
    ['screen', 'Display',        paneScreen],
    ['about',  'About',          paneAbout]
  ];

  function head(pane, title, sub) {
    pane.appendChild(el('div', 'sx-h', title));
    pane.appendChild(el('div', 'sx-sub', sub));
    var sc = el('div', 'sx-scroll');
    pane.appendChild(sc);
    return sc;
  }

  // --- who walks ---
  function paneWho(pane) {
    var sc = head(pane, 'Who walks',
      'Everyone who uses this treadmill. Each person keeps their own distance and ' +
      'history, and chooses whether any of it leaves the console.');

    var g = group('Household');
    var list = el('div', 'sx-people');
    g.appendChild(list);
    sc.appendChild(g);

    function drawPeople() {
      list.innerHTML = '';
      var tst = tmStatus();
      (S.people || []).forEach(function (p) {
        var c = el('button', 'sx-person' + (p.name === S.default_walker ? ' sx-on' : ''));
        var bits = [];
        bits.push(p.coached ? 'Coaching' : 'No coaching');
        // Being linked is a different fact from being published, and the one
        // people actually ask about: is this the same person Home Assistant
        // knows? Somebody with no link is not broken — they simply only exist
        // here, and saying so is better than leaving it to be guessed.
        bits.push(p.ha_person ? 'linked' : 'console only');
        var t = tmPerson(tst, p.id);
        if (t.linked) bits.push(t.reconnect ? 'TrailMate: reconnect' : 'TrailMate');
        c.innerHTML = '<div class="sx-av">' + p.name.charAt(0).toUpperCase() + '</div>' +
                      '<div class="sx-pn">' + p.name + '</div>' +
                      '<div class="sx-pd">' + bits.join(' · ') + '</div>';
        press(c, function () { editPerson(p); });
        list.appendChild(c);
      });
      var add = el('button', 'sx-person sx-add',
        '<div class="sx-av">+</div><div class="sx-pn">Add someone</div><div class="sx-pd"></div>');
      press(add, addPerson);
      list.appendChild(add);
    }

    /**
     * An inline field, not `prompt()`.
     *
     * `window.prompt` in an Android WebView does nothing at all unless the app
     * installs a WebChromeClient to handle `onJsPrompt` — it returns null and
     * the button appears dead. This console has no WebChromeClient, and adding
     * one to get a system dialog on a treadmill is the wrong trade anyway: the
     * dialog is sized for a phone and lands wherever it likes.
     */
    function addPerson() {
      tmShowing = null;
      detail.innerHTML = '';
      detail.appendChild(el('div', 'sx-gh', 'Add someone'));

      var input = el('input', 'sx-fld');
      input.setAttribute('placeholder', 'Name');
      input.setAttribute('maxlength', '20');
      input.setAttribute('autocomplete', 'off');

      var commit = function () {
        var name = input.value.trim();
        if (!name) return;
        try { S = JSON.parse(bridge().addPerson(name)); } catch (e) {}
        detail.innerHTML = '';
        drawPeople(); drawDefault(); drawHa();
      };
      input.setAttribute('readonly', 'readonly');
      input.sxCapitalise = true;
      input.sxCommit = function () {};
      press(input, function () { openKeyboard(input); });

      var wrap = el('div');
      wrap.style.cssText = 'display:flex;align-items:center';
      input.style.marginRight = '14px';
      wrap.appendChild(input);
      wrap.appendChild(press(el('button', 'sx-pill sx-go', 'ADD'), commit));

      detail.appendChild(row('Their name',
        'Everyone who walks gets their own totals. Coaching and recording are ' +
        'set per person once they are here.', wrap));

      // Straight into the keyboard — the only reason to be on this screen is
      // to type a name.
      openKeyboard(input);
    }

    /* Editing is a second tap on the card rather than a nested screen: there
       are only three things to change and one of them is "remove". */
    function editPerson(p) {
      detail.innerHTML = '';
      detail.appendChild(el('div', 'sx-gh', p.name));
      detail.appendChild(row('Home Assistant',
        p.ha_person
          ? 'Linked, so walks recorded here line up with the person Home '
            + 'Assistant already knows.'
          : 'Not linked. This person exists only on the console — recording '
            + 'them still works, it just creates a device with no matching '
            + 'person in Home Assistant.',
        el('div', 'sx-ro', p.ha_person
          ? '<b>' + p.ha_person + '</b>' : 'console only')));
      detail.appendChild(row('Coaching',
        'Send this walk to Home Assistant to be turned into words. The prompt there ' +
        'carries one person\'s weight and blood pressure, which is why this is per person.',
        toggle(null, p.coached, function (on) {
          try { S = JSON.parse(bridge().setPersonFlag(p.name, 'coached', on)); } catch (e) {}
          p.coached = on; drawPeople();
        })));
      detail.appendChild(row('Age',
        'Only used for heart-rate zones. With it the coach can tell "taking it ' +
        'easy" from "working hard"; without it, it can still tell "harder than ' +
        'earlier in this walk" and says so. Leaving it unset costs the first of ' +
        'those and nothing else — the estimate behind it is rough anyway, so ' +
        'the coach talks in words rather than numbers either way.',
        ageStepper(p)));
      detail.appendChild(row('Record to Home Assistant',
        'Their distance, time and calories, published under their own name.',
        toggle(null, p.publish, function (on) {
          try { S = JSON.parse(bridge().setPersonFlag(p.name, 'publish', on)); } catch (e) {}
          p.publish = on; drawPeople();
        })));
      // Redrawn from the tick while it is on screen: a link in progress
      // changes under it, from somebody's phone.
      if (has('trailmateStatus')) {
        tmBox = el('div');
        detail.appendChild(tmBox);
        tmShowing = p;
        drawTm(true);
      }
      detail.appendChild(row('Start as ' + p.name,
        'Assume this person when the belt starts without anyone tapping a name.',
        press(el('button', 'sx-pill', 'MAKE DEFAULT'), function () {
          save('default_walker', p.name); drawPeople(); drawDefault();
        })));
      detail.appendChild(row('Remove ' + p.name,
        'Their recorded walks are not deleted.',
        press(el('button', 'sx-pill sx-warn', 'REMOVE'), function () {
          try { S = JSON.parse(bridge().removePerson(p.name)); } catch (e) {}
          tmShowing = null;
          detail.innerHTML = ''; drawPeople(); drawDefault(); drawHa();
        })));
    }

    var detail = group('');
    sc.appendChild(detail);

    /* Offered, never applied. A list arriving over MQTT is not permission to
       create walkers on somebody's treadmill — the person standing in front of
       it decides, one at a time. */
    var fromHa = group('From Home Assistant');
    var haBox = el('div', 'sx-people');
    fromHa.appendChild(haBox);
    sc.appendChild(fromHa);

    function drawHa() {
      var list = [];
      try { list = JSON.parse(bridge().haPeople()); } catch (e) {}
      haBox.innerHTML = '';
      fromHa.style.display = list.length ? '' : 'none';
      list.forEach(function (h) {
        var c = el('button', 'sx-person');
        c.innerHTML = '<div class="sx-av">' + h.first.charAt(0).toUpperCase() + '</div>' +
                      '<div class="sx-pn">' + h.first + '</div>' +
                      '<div class="sx-pd">' + h.name + '</div>';
        press(c, function () {
          try { S = JSON.parse(bridge().addHaPerson(h.entity_id, h.first)); } catch (e) {}
          drawPeople(); drawDefault(); drawHa();
        });
        haBox.appendChild(c);
      });
    }

    var g2 = group('When nobody chooses');
    var defRow = el('div');
    g2.appendChild(defRow);
    g2.appendChild(row('Guest walks',
      'A one-off walk counted on the console but never recorded against a person. ' +
      'Guests are never coached and never published.',
      toggle('allow_guest', S.allow_guest !== false)));
    sc.appendChild(g2);

    function drawDefault() {
      defRow.innerHTML = '';
      var opts = [['', 'Ask every time']];
      (S.people || []).forEach(function (p) { opts.push([p.name, p.name]); });
      defRow.appendChild(row('Start as', 'Who the welcome screen assumes.',
        segment('default_walker', opts, S.default_walker || '', function () { drawPeople(); })));
    }

    /* ---- TrailMate, per person ------------------------------------------
       Connecting is a code on this screen and a tap on the walker's phone:
       Kotlin asks TrailMate for a code and a QR, and polls until it is
       approved, denied or runs out. This only ever shows what trailmateStatus
       says — never a token, which this page is not given. */
    var tmShowing = null, tmBox = null, tmKey = '';

    function mmss(s) {
      s = Math.max(0, Math.round(s || 0));
      return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }

    function when(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return 'a walk';
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    function howFar(m) {
      return S.units === 'mi' ? (m / 1609.344).toFixed(2) + ' mi' : (m / 1000).toFixed(2) + ' km';
    }

    function pills(list) {
      var w = el('div');
      w.style.cssText = 'display:flex;align-items:center';
      list.forEach(function (b, i) { if (i) b.style.marginLeft = '12px'; w.appendChild(b); });
      return w;
    }

    function call(fn, arg) {
      try { if (arg === undefined) bridge()[fn](); else bridge()[fn](arg); } catch (e) {}
      drawTm(true);
    }

    function drawTm(force) {
      if (!tmShowing || !tmBox) return;
      var st = tmStatus();
      if (!st) { tmBox.innerHTML = ''; return; }
      var p = tmShowing;
      var me = tmPerson(st, p.id);
      var lk = st.link && st.link.personId === p.id ? st.link : null;
      var failed = (st.failed || []).filter(function (f) { return f.personId === p.id; });
      var key = JSON.stringify([me, lk && [lk.state, lk.userCode, lk.message],
        failed.map(function (f) { return f.workoutId; })]);
      // Only the countdown moves between ticks. Rebuilding the whole box —
      // the QR with it — every 1.2 s would flicker for nothing.
      if (key === tmKey && !force) {
        var left = tmBox.querySelector('.sx-tm-left');
        if (left && lk) left.textContent = mmss(lk.left) + ' left';
        return;
      }
      var wasLinked = tmKey && JSON.parse(tmKey)[0].linked;
      tmKey = key;
      tmBox.innerHTML = '';
      if (!!wasLinked !== !!me.linked) drawPeople();

      if (lk && (lk.state === 'starting' || lk.state === 'waiting')) {
        if (lk.state === 'starting') {
          tmBox.appendChild(row('TrailMate',
            '<span class="sx-state"><i class="sx-dot sx-busy"></i>Asking TrailMate for a code…</span>',
            press(el('button', 'sx-pill', 'CANCEL'), function () { call('trailmateCancel'); })));
          return;
        }
        var card = el('div', 'sx-tm sx-on');
        var qr = el('div', 'sx-qr');
        // Drawn as a picture from a data URI, never parsed into the page: an
        // SVG that arrived over the network does not get to be markup here.
        if (lk.qr) {
          var img = document.createElement('img');
          img.alt = '';
          img.src = 'data:image/svg+xml;base64,' + lk.qr;
          qr.appendChild(img);
        }
        card.appendChild(qr);
        var txt = el('div', 'sx-dn');
        txt.appendChild(el('div', 'sx-d',
          'Scan with your phone, or go to <b>' + esc((lk.uri || '').replace(/^https?:\/\//, '')) +
          '</b> and enter'));
        txt.appendChild(el('div', 'sx-code', esc(lk.userCode)));
        var line = el('div', 'sx-state',
          '<i class="sx-dot sx-busy"></i>Waiting for ' + esc(p.name) +
          ' to allow it in TrailMate&nbsp;·&nbsp;<span class="sx-tm-left"></span>');
        line.querySelector('.sx-tm-left').textContent = mmss(lk.left) + ' left';
        txt.appendChild(line);
        card.appendChild(txt);
        card.appendChild(press(el('button', 'sx-pill', 'CANCEL'), function () { call('trailmateCancel'); }));
        tmBox.appendChild(row('Connect TrailMate',
          'Signing in happens on the phone. Nothing is typed here.', el('div')));
        tmBox.appendChild(card);
        // It lands below the person's other rows, which is off the bottom of
        // the panel — and a code nobody can see is no use to anyone.
        try { card.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        return;
      }

      if (lk && lk.state !== 'connected') {
        var said = lk.state === 'denied' ? 'Declined in TrailMate.'
          : lk.state === 'expired' ? 'The code ran out before it was used.'
          : esc(lk.message || 'Something went wrong.');
        tmBox.appendChild(row('TrailMate',
          '<span class="sx-state"><i class="sx-dot sx-bad"></i>' + said + '</span>',
          pills([
            press(el('button', 'sx-pill sx-go', 'TRY AGAIN'), function () { call('trailmateConnect', p.id); }),
            press(el('button', 'sx-pill', 'OK'), function () { call('trailmateCancel'); })
          ])));
        return;
      }

      var waiting = me.queued ? ' ' + me.queued + (me.queued === 1 ? ' walk is' : ' walks are') +
        ' waiting to send.' : '';
      if (me.linked && me.reconnect) {
        tmBox.appendChild(row('TrailMate',
          '<span class="sx-state"><i class="sx-dot sx-bad"></i>Reconnect needed</span><br>' +
          'TrailMate stopped accepting this console\'s link — it was disconnected on the website, ' +
          'or the account changed. Connect again and the walks waiting here will follow.' + waiting,
          pills([
            press(el('button', 'sx-pill sx-go', 'CONNECT AGAIN'), function () { call('trailmateConnect', p.id); }),
            press(el('button', 'sx-pill sx-warn', 'DISCONNECT'), function () { call('trailmateDisconnect', p.id); })
          ])));
      } else if (me.linked) {
        tmBox.appendChild(row('TrailMate',
          '<span class="sx-state"><i class="sx-dot sx-ok"></i>Connected' +
          (me.account ? ' as ' + esc(me.account) : '') + '</span><br>' +
          'Each walk goes to TrailMate when it ends, and on to Garmin Connect if that is ' +
          'connected there.' + waiting,
          press(el('button', 'sx-pill sx-warn', 'DISCONNECT'), function () { call('trailmateDisconnect', p.id); })));
      } else {
        tmBox.appendChild(row('TrailMate',
          'Send ' + esc(p.name) + '\'s walks to TrailMate, and from there to Garmin Connect. ' +
          'Connecting shows a code to scan with a phone. Until then their walks stay on the console.',
          press(el('button', 'sx-pill sx-go', 'CONNECT'), function () { call('trailmateConnect', p.id); })));
      }

      // Walks TrailMate turned down. Parked so they do not hold up the ones
      // behind them; shown so they are not silently lost.
      failed.forEach(function (f) {
        var r = el('div', 'sx-dev');
        r.innerHTML = '<div class="sx-dn"><div class="sx-n">Not sent: ' + esc(when(f.startedAt)) +
          ' · ' + howFar(f.distanceM || 0) + '</div><div class="sx-d">' +
          esc(f.reason || 'refused') + (f.status ? ' (' + f.status + ')' : '') + '</div></div>';
        r.appendChild(press(el('button', 'sx-pill', 'RETRY'), function () { call('trailmateRetry', f.workoutId); }));
        tmBox.appendChild(r);
      });
    }

    var g3 = null, queueRow = null, tmPeopleBox = null, tmPeopleKey = '';
    if (has('trailmateStatus')) {
      g3 = group('TrailMate');
      // Everyone and whether they are connected, here where TrailMate is
      // named — the per-person row inside a card is two taps from anywhere
      // and was not found. CONNECT opens that person's card and starts the
      // link, so the code and QR still appear in the one place they are drawn.
      tmPeopleBox = el('div');
      g3.appendChild(tmPeopleBox);
      queueRow = el('div');
      g3.appendChild(queueRow);
      g3.appendChild(row('TrailMate server',
        'Where walks are sent. Leave it alone unless you are testing against a TrailMate of ' +
        'your own; clearing it goes back to foolishrunner.com.',
        field('trailmate_url', S.trailmate_url)));
      sc.appendChild(g3);
    }

    function drawTmPeople() {
      if (!tmPeopleBox) return;
      var st = tmStatus() || {};
      var people = S.people || [];
      var key = JSON.stringify(people.map(function (p) {
        var t = tmPerson(st, p.id);
        return [p.id, p.name, !!t.linked, !!t.reconnect, t.account || ''];
      }));
      if (key === tmPeopleKey) return;
      tmPeopleKey = key;
      tmPeopleBox.innerHTML = '';
      if (!people.length) {
        tmPeopleBox.appendChild(row('Connect TrailMate',
          'Add someone above first — each person connects their own TrailMate account. ' +
          'Guests are never sent.', el('div')));
        return;
      }
      people.forEach(function (p) {
        var t = tmPerson(st, p.id);
        var said, btn;
        if (t.linked && t.reconnect) {
          said = '<span class="sx-state"><i class="sx-dot sx-bad"></i>Reconnect needed</span>';
          btn = press(el('button', 'sx-pill sx-go', 'CONNECT AGAIN'), function () { connectFor(p); });
        } else if (t.linked) {
          said = '<span class="sx-state"><i class="sx-dot sx-ok"></i>Connected' +
            (t.account ? ' as ' + esc(t.account) : '') + '</span>';
          btn = press(el('button', 'sx-pill', 'MANAGE'), function () { editPerson(p); });
        } else {
          said = 'Not connected — their walks stay on the console.';
          btn = press(el('button', 'sx-pill sx-go', 'CONNECT'), function () { connectFor(p); });
        }
        tmPeopleBox.appendChild(row(esc(p.name), said, btn));
      });
    }

    /* Open the person's card and start the link there: the code and QR are drawn by drawTm. */
    function connectFor(p) {
      editPerson(p);
      call('trailmateConnect', p.id);
    }

    function drawQueue() {
      if (!queueRow) return;
      var st = tmStatus() || {};
      var n = (st.queued || []).length;
      var said = n ? n + (n === 1 ? ' walk' : ' walks') + ' waiting to send' : 'Nothing waiting to send';
      var why = '';
      if (n && st.lastError) why = esc(st.lastError) + (st.retryIn ? ' · trying again in ' + mmss(st.retryIn) : '');
      else if (n) why = 'Waiting for the walker to connect (or reconnect) TrailMate.';
      queueRow.innerHTML = '';
      queueRow.appendChild(row('Walks to send',
        '<span class="sx-state"><i class="sx-dot ' + (n ? (st.lastError ? 'sx-bad' : 'sx-busy') : 'sx-ok') +
        '"></i>' + said + '</span>' + (why ? '<br>' + why : ''), el('div')));
    }

    drawPeople();
    drawDefault();
    drawHa();
    drawQueue();
    drawTmPeople();
    pane.sxTick = function () { drawTm(); drawQueue(); drawTmPeople(); };
  }

  /* What Kotlin says about TrailMate, or null on a build without it. */
  function tmStatus() {
    if (!has('trailmateStatus')) return null;
    try { return JSON.parse(bridge().trailmateStatus()); } catch (e) { return null; }
  }

  function tmPerson(st, id) {
    return ((st && st.people) || []).filter(function (x) { return x.id === id; })[0] || {};
  }

  // --- devices: heart-rate strap, foot pod, headphones ---
  /* One place for everything Bluetooth. One scan looks for all three kinds at
     once; each kind keeps one paired device. Kotlin's devices* calls. */
  var KINDS = [
    ['hr', 'Heart rate strap', 'Heart rate'],
    ['pod', 'Foot pod', 'Foot pod'],
    ['phones', 'Headphones', 'Headphones']
  ];

  function paneDevices(pane) {
    var sc = head(pane, 'Devices',
      'Heart-rate straps, foot pods such as Stryd, and headphones for the coach. ' +
      'The console connects to each itself; nothing else needs to be paired.');

    var g1 = group('Your devices');
    var pairedBox = el('div');
    g1.appendChild(pairedBox);
    sc.appendChild(g1);

    var g2 = group('Add a device');
    var scanBtn = press(el('button', 'sx-pill sx-go', 'SCAN'), function () {
      scanBtn.textContent = 'SCANNING';
      foundBox.innerHTML = '<div class="sx-empty"><span class="sx-state">' +
        '<i class="sx-dot sx-busy"></i>Looking for devices…</span></div>';
      try { bridge().devicesScan(); } catch (e) {}
      // Sensors answer in a second or two; headphones take the full
      // discovery, about twelve seconds. Show what there is as it arrives.
      [3000, 6000, 9000, 13000].forEach(function (ms, i, all) {
        setTimeout(function () { drawFound(i === all.length - 1); }, ms);
      });
    });
    g2.appendChild(row('Scan for devices',
      'Wear the strap, give the pod a few steps, and put headphones in pairing ' +
      'mode. A pod your watch holds over Bluetooth may have no room for the console.', scanBtn));
    var foundBox = el('div');
    g2.appendChild(foundBox);
    sc.appendChild(g2);

    var g3 = group('Heart rate');
    g3.appendChild(row('Source',
      'Automatic prefers a paired strap and falls back to the board. If your machine has no grips, the board reads zero and only a strap will work.',
      segment('hr_source', [['auto', 'Automatic'], ['strap', 'Strap only'], ['grips', 'Board only']],
        S.hr_source || 'auto')));
    sc.appendChild(g3);

    function drawFound(done) {
      var list = [];
      try { list = JSON.parse(bridge().devicesFound()); } catch (e) {}
      if (!list.length && !done) return;
      if (done) scanBtn.textContent = 'SCAN AGAIN';
      foundBox.innerHTML = '';
      if (!list.length) {
        foundBox.appendChild(el('div', 'sx-empty',
          'Nothing found.<br>Straps advertise once they touch skin, pods once they move, ' +
          'and headphones only in pairing mode.'));
        return;
      }
      list.forEach(function (d) {
        var kind = KINDS.filter(function (k) { return k[0] === d.kind; })[0];
        var r = el('div', 'sx-dev');
        r.innerHTML = '<div class="sx-dn"><div class="sx-n">' + d.name + ' · ' +
          d.address.slice(0, 8) + '</div><div class="sx-d">' + (kind ? kind[2] : d.kind) +
          ' · ' + d.rssi + ' dBm</div></div>';
        r.appendChild(press(el('button', 'sx-pill sx-go', 'PAIR'), function () {
          try { bridge().devicePair(d.kind, d.address, d.name); } catch (e) {}
          foundBox.innerHTML = '';
          scanBtn.textContent = 'SCAN';
          load(); drawPaired();
        }));
        foundBox.appendChild(r);
      });
    }

    /* The live reading beside each device: what it is there to provide. */
    function reading(kind, d) {
      if (kind === 'hr') return d.bpm > 0 ? d.bpm + ' <small>bpm</small>' : '— <small>bpm</small>';
      if (kind === 'pod') return d.cadence > 0 ? d.cadence + ' <small>spm</small>' : '— <small>spm</small>';
      return '';
    }

    function drawPaired() {
      var st = {};
      try { st = JSON.parse(bridge().devicesStatus()); } catch (e) {}
      pairedBox.innerHTML = '';
      if (!st.available) {
        pairedBox.appendChild(el('div', 'sx-empty',
          'Bluetooth is off, or this console has none.'));
        return;
      }
      KINDS.forEach(function (k) {
        var d = st[k[0]] || {};
        var r;
        if (!d.address) {
          r = el('div', 'sx-dev');
          r.innerHTML = '<div class="sx-dn"><div class="sx-n">' + k[1] +
            '</div><div class="sx-d">None paired</div></div>';
          pairedBox.appendChild(r);
          return;
        }
        r = el('div', 'sx-dev' + (d.connected ? ' sx-on' : ''));
        var bits = [k[1], d.connected ? 'Connected' : 'Not in range'];
        if (d.battery >= 0) bits.push('battery ' + d.battery + '%');
        if (d.watts > 0) bits.push(d.watts + ' W');
        r.innerHTML = '<div class="sx-dn"><div class="sx-n">' + (d.name || k[1]) +
          ' · ' + d.address.slice(0, 8) + '</div><div class="sx-d">' + bits.join(' · ') +
          '</div></div><div class="sx-bpm">' + reading(k[0], d) + '</div>';
        r.appendChild(press(el('button', 'sx-pill sx-warn', 'FORGET'), function () {
          try { bridge().deviceForget(k[0]); } catch (e) {}
          load(); drawPaired();
        }));
        pairedBox.appendChild(r);
      });
    }

    drawPaired();
    pane.sxTick = drawPaired;   // live readings while this section is open
  }

  // --- home assistant ---
  function paneHa(pane) {
    var sc = head(pane, 'Home Assistant',
      'Optional. The treadmill runs perfectly well with none of this set — you lose ' +
      'the history, the dashboards and the talking coach, and nothing else.');

    var g = group('Connection');
    g.appendChild(row('Publish to Home Assistant',
      'Everything below is ignored while this is off.',
      toggle('ha_enabled', !!S.ha_enabled)));
    g.appendChild(row('MQTT broker', 'Host or IP of the broker, not of Home Assistant itself.',
      field('mqtt_host', S.mqtt_host)));
    g.appendChild(row('Port', '1883 plain, 8883 with TLS.',
      field('mqtt_port', S.mqtt_port, true)));
    g.appendChild(row('Username', '', field('mqtt_user', S.mqtt_user)));
    g.appendChild(row('Password', '',
      field('mqtt_pass', S.mqtt_pass_set ? SECRET_MASK : '', false, 'password')));
    g.appendChild(row('Use TLS', 'Off is reasonable on a home network you control.',
      toggle('mqtt_tls', !!S.mqtt_tls)));
    g.appendChild(row('Topic prefix',
      'Change only if stride/ already means something else on your broker.',
      field('mqtt_prefix', S.mqtt_prefix)));

    var stateEl = el('span', 'sx-state', '<i class="sx-dot"></i>Not tested');
    var testWrap = el('div');
    testWrap.style.cssText = 'display:flex;align-items:center';
    stateEl.style.marginRight = '18px';
    testWrap.appendChild(stateEl);
    testWrap.appendChild(press(el('button', 'sx-pill', 'TEST'), function () {
      stateEl.innerHTML = '<i class="sx-dot sx-busy"></i>Connecting…';
      try { bridge().mqttTest(); } catch (e) {}
      setTimeout(drawState, 2500);
    }));
    g.appendChild(row('Test the connection',
      'Connects, publishes discovery, and reports back. Changes nothing else.', testWrap));
    sc.appendChild(g);

    function drawState() {
      var st = {};
      try { st = JSON.parse(bridge().mqttStatus()); } catch (e) {}
      if (!st.enabled) stateEl.innerHTML = '<i class="sx-dot"></i>Not publishing';
      else if (st.connected) stateEl.innerHTML = '<i class="sx-dot sx-ok"></i>Connected';
      else stateEl.innerHTML = '<i class="sx-dot sx-bad"></i>Could not connect';
    }
    drawState();
    pane.sxTick = drawState;
  }

  // --- treadmill ---
  function paneDeck(pane) {
    var sc = head(pane, 'Treadmill',
      'How the console drives the deck. The board\'s own limits always win — these ' +
      'are preferences within them, never overrides of them.');

    var g2 = group('Starting and stopping');
    g2.appendChild(row('Warm-up', 'Skippable. Zero starts every walk at your chosen pace.',
      stepper('warmup_min', S.warmup_min || 0, 0, 10, 1, 'min')));
    g2.appendChild(row('Cool-down', '',
      stepper('cooldown_min', S.cooldown_min || 0, 0, 10, 1, 'min')));
    g2.appendChild(row('Warm-up speed', 'Also the speed a cool-down eases back to.',
      stepper('warmup_kph', S.warmup_kph || 2, 1, 6, 0.5, 'km/h', 1)));
    sc.appendChild(g2);

    var g3 = group('Guided walks');
    g3.appendChild(row('Incline changes',
      'How fast the deck may move during a plan. Gentler is kinder underfoot, and no ' +
      'plan is ever allowed to move it all at once.',
      segment('incline_rate', [['gentle', 'Gentle'], ['normal', 'Normal'], ['quick', 'Quick']],
        S.incline_rate || 'normal')));
    g3.appendChild(row('Open circuit lap',
      'How long one lap is before the ground repeats. Nothing ends an open circuit but STOP.',
      stepper('open_lap_min', S.open_lap_min || 20, 5, 45, 5, 'min')));
    sc.appendChild(g3);

    if (has('calibrationJson')) sc.appendChild(beltCalibration());

    var g4 = group('Reported by the board');
    var lim = { minGrade: 0, maxGrade: 0, minKph: 0, maxKph: 0 };
    try { lim = JSON.parse(bridge().boardLimits()); } catch (e) {}
    g4.appendChild(row('Incline range', 'Read from the machine. Plans are clamped to this.',
      el('div', 'sx-ro', '<b>' + lim.minGrade.toFixed(1) + '</b> to <b>+' +
        lim.maxGrade.toFixed(1) + '</b> %')));
    g4.appendChild(row('Speed range', '',
      el('div', 'sx-ro', '<b>' + lim.minKph.toFixed(1) + '</b> to <b>' +
        lim.maxKph.toFixed(1) + '</b> km/h')));
    sc.appendChild(g4);
  }

  /* "9:05 /mi", the way a Stryd shows it. */
  function paceText(kph, miles) {
    if (!(kph >= 0.5)) return '–';
    var s = Math.round(3600 / kph * (miles ? 1.609344 : 1));
    return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) + ' /' + (miles ? 'mi' : 'km');
  }

  /* "+5.6%": how much more than the dial the board is sent. */
  function beltOffset(kph, belt) {
    var pct = (belt / kph - 1) * 100;
    return (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%';
  }

  /* The belt measured against a foot pod — see BeltCalibration.kt. The points
     are taken on the walk screen; this lists them and lets them go. */
  function beltCalibration() {
    var g = group('Belt speed calibration');
    var start = press(el('button', 'sx-pill sx-go', 'START'), function () {
      try { bridge().calibrate(); } catch (e) {}
      close();
    });
    g.appendChild(row('Calibrate with your Stryd',
      'Starts the belt. Hold a pace, move the belt until the Stryd agrees, and save. ' +
      'Several paces across your range make it most accurate: speeds between and beyond ' +
      'them are worked out from the points. Distance is corrected too.', start));
    var box = el('div');
    g.appendChild(box);

    function draw(json) {
      var st = { points: [] };
      try { st = JSON.parse(json || bridge().calibrationJson()); } catch (e) {}
      var pts = st.points || [];
      box.innerHTML = '';
      if (!st.pod) {
        box.appendChild(el('div', 'sx-empty',
          'No foot pod connected. Pair your Stryd in Devices first.'));
      }
      if (!pts.length) {
        box.appendChild(el('div', 'sx-empty',
          'Not calibrated. The belt runs at the speed the board believes.'));
        return;
      }
      pts.forEach(function (p) {
        var r = el('div', 'sx-dev');
        r.innerHTML = '<div class="sx-dn"><div class="sx-n">' + paceText(p.kph, st.miles) +
          ' · ' + p.kph.toFixed(2) + ' km/h</div><div class="sx-d">Belt sent ' +
          p.belt.toFixed(2) + ' km/h · ' + beltOffset(p.kph, p.belt) + '</div></div>';
        r.appendChild(press(el('button', 'sx-pill sx-warn', 'REMOVE'), function () {
          var next = null;
          try { next = bridge().calibrationRemove(p.kph); } catch (e) {}
          draw(next);
        }));
        box.appendChild(r);
      });
      box.appendChild(row('Start again', 'Forget every point. The board is believed again.',
        press(el('button', 'sx-pill sx-warn', 'CLEAR ALL'), function () {
          var next = null;
          try { next = bridge().calibrationClear(); } catch (e) {}
          draw(next);
        })));
    }

    draw();
    return g;
  }

  // --- coach ---
  function paneCoach(pane) {
    var sc = head(pane, 'Coach',
      'Marks your kilometres and says something occasionally. It never touches the ' +
      'belt — every pace change is yours.');

    var g = group('');
    g.appendChild(row('Coach', 'Off means a silent walk with no ribbon at all.',
      toggle('coach_on', S.coach_on !== false)));
    g.appendChild(row('How much it talks',
      'Sparing marks kilometres and little else. Chatty adds pace and rhythm observations.',
      segment('coach_talk', [['sparing', 'Sparing'], ['normal', 'Normal'], ['chatty', 'Chatty']],
        S.coach_talk || 'normal')));
    g.appendChild(row('Voice', 'Only affects wording, never what it is willing to say.',
      segment('coach_voice', [
        ['Supportive Friend', 'Supportive'], ['Drill Sergeant', 'Drill sergeant'],
        ['Data Nerd', 'Data nerd'], ['Zen Master', 'Zen']
      ], S.coach_voice || 'Supportive Friend')));
    g.appendChild(row('Written by Home Assistant',
      'Off keeps every line on the console — the built-in ones, which are shorter and never late.',
      toggle('coach_remote', S.coach_remote !== false)));
    g.appendChild(row('Announce milestones', 'First mark at 500 m, then every kilometre.',
      toggle('coach_milestones', S.coach_milestones !== false)));
    sc.appendChild(g);
  }


  // --- display ---
  function paneScreen(pane) {
    var sc = head(pane, 'Display',
      'The console is a screen in a room, on all day. These are about living with it ' +
      'rather than walking on it.');

    /* Units live here rather than under Treadmill, where they sat until
       somebody asked on Reddit for an MPH setting that had existed for
       months. It is a question about what the screen says, and this is the
       screen page. The board is metric underneath either way: nothing about
       this reaches the serial link. */
    var gu = group('Units');
    gu.appendChild(row('Distance and speed',
      'Everything on every screen, and everything published. The board stays ' +
      'metric underneath.',
      segment('units', [['km', 'Kilometres'], ['mi', 'Miles']], S.units || 'km')));
    sc.appendChild(gu);

    var g = group('');
    g.appendChild(row('Sleep after',
      'Shows a clock. Any tap wakes it, and the belt never sleeps mid-walk.',
      stepper('sleep_min', S.sleep_min || 5, 1, 60, 1, 'min')));
    g.appendChild(row('Clock', '',
      segment('clock_24', [['true', '24 hour'], ['false', '12 hour']],
        String(S.clock_24 !== false))));
    g.appendChild(row('Brightness',
      'Dimmer is easier to live with in a dark room and reads fine at arm\'s length.',
      segment('brightness', [['dim', 'Dim'], ['normal', 'Normal'], ['bright', 'Bright']],
        S.brightness || 'normal')));
    g.appendChild(row('Keep the screen on while walking',
      'Off lets it sleep even mid-walk, which saves the panel on long sessions.',
      toggle('keep_awake', S.keep_awake !== false)));
    sc.appendChild(g);
  }

  // --- about ---
  /* Routes converted from real outdoor walks. Read-only here on purpose: they
     are made on the phone, where the walk and its GPS track are, and a second
     place to edit a name is a second place for the two to disagree. What this
     screen is for is answering "did it arrive" without a laptop. */
  function paneRoutes(pane) {
    var sc = head(pane, 'My routes',
      'Walks you have already done outdoors, converted into ground this ' +
      'treadmill can walk. They arrive from the STRIDE Health app on your ' +
      'phone and are kept on the console, so they work with the network down.');

    /* Live, because routes arrive while you are looking at this.
       `rebuild()` runs once per `open()` and builds all nine panes together, so
       a pane built before the phone synced would say "no routes yet" for as
       long as the screen stayed open — and clicking the rail only toggles
       visibility, so it would never correct itself. That is exactly what
       happened the first time a route was synced with settings already up.
       The payload is compared as a string and only redrawn when it changes,
       so an idle pane costs one bridge call every 1.2 s and no DOM work. */
    var raw = '[]';
    try { raw = bridge().routes() || '[]'; } catch (e) {}

    /* The payload this pane was drawn from. Compared, not re-parsed: an
       unchanged pane must cost one bridge call and no DOM work, or a rebuild
       every 1.2 s would fight the scroll position under your finger. */
    var seen = raw;
    pane.sxTick = function () {
      var now = '[]';
      try { now = bridge().routes() || '[]'; } catch (e) {}
      if (now === seen) return;
      var wasOpen = pane.classList.contains('sx-on');
      pane.innerHTML = '';
      paneRoutes(pane);
      if (wasOpen) pane.classList.add('sx-on');
    };

    var routes = [];
    try { routes = JSON.parse(raw); } catch (e) { routes = []; }

    if (!routes.length) {
      var g0 = group('');
      g0.appendChild(row('No routes yet',
        'Open STRIDE Health on your phone, go to Workouts & Routes, convert an ' +
        'outdoor walk and keep it. It arrives here on the next sync.',
        el('div', 'sx-ro', '—')));
      sc.appendChild(g0);
      return;
    }

    var g = group(routes.length + (routes.length === 1 ? ' route' : ' routes'));
    routes.forEach(function (r) {
      var km = ((r.distance_m || 0) / 1000).toFixed(2);
      var climb = Math.round(r.climb_m || 0);
      var changes = (r.segments || []).length;
      var desc = km + ' km · ' + climb + ' m of climb · ' + changes +
                 ' incline changes';
      if (r.difficulty && r.difficulty !== 1) {
        desc += ' · at ' + Math.round(r.difficulty * 100) + '%';
      }
      g.appendChild(row(r.name || 'Route', desc,
        el('div', 'sx-ro', spark(r))));
    });
    sc.appendChild(g);

    var g2 = group('Where they come from');
    g2.appendChild(row('Home Assistant',
      'Routes ride the same webhook as your health data and are cached here. ' +
      'Delete or rename them on the phone; this console follows.',
      el('div', 'sx-ro', S.ha_enabled ? 'connected' : 'not configured')));
    sc.appendChild(g2);
  }

  /* The route's own profile as a small inline SVG — the ground it is, rather
     than a number saying how much of it there is. Segments are
     [startM, endM, incline] triples; the deck runs -3..+12. */
  function spark(r) {
    var segs = r.segments || [];
    if (!segs.length) return '';
    var total = segs[segs.length - 1][1] || 1;
    var pts = [];
    for (var i = 0; i <= 40; i++) {
      var d = i / 40 * total, v = segs[segs.length - 1][2];
      for (var j = 0; j < segs.length; j++) {
        if (d < segs[j][1]) { v = segs[j][2]; break; }
      }
      pts.push((i / 40 * 120).toFixed(1) + ',' +
               (34 - (v + 3) / 15 * 30).toFixed(1));
    }
    return '<svg width="120" height="36" viewBox="0 0 120 36" ' +
           'preserveAspectRatio="none"><polyline points="' + pts.join(' ') +
           '" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  }

  function paneAbout(pane) {
    var sc = head(pane, 'About', 'What this is talking to, and what it is.');
    var a = {};
    try { a = JSON.parse(bridge().about()); } catch (e) {}
    var g = group('');
    g.appendChild(row('STRIDE', '', el('div', 'sx-ro', a.version + ' · build ' + a.build)));
    g.appendChild(row('Treadmill board', 'Detected over USB serial at start-up.',
      el('div', 'sx-ro', a.board || '—')));
    g.appendChild(row('Console', '', el('div', 'sx-ro', 'Android ' + a.android)));
    sc.appendChild(g);

    var g2 = group('Starting over');
    g2.appendChild(row('Reset every setting',
      'People, totals and history are kept. Only settings go back to defaults.',
      press(el('button', 'sx-pill sx-warn', 'RESET'), function () {
        try { S = JSON.parse(bridge().resetSettings()); } catch (e) {}
        rebuild();
      })));
    sc.appendChild(g2);
  }

  /* ---- build ------------------------------------------------------------- */
  var currentSection = 'people';

  function rebuild() {
    load();
    var panel = root.querySelector('.sx-panel');
    panel.innerHTML = '';
    SECTIONS.forEach(function (s) {
      var pane = el('div', 'sx-pane' + (s[0] === currentSection ? ' sx-on' : ''));
      pane.setAttribute('data-p', s[0]);
      s[2](pane);
      panel.appendChild(pane);
    });
    [].forEach.call(root.querySelectorAll('.sx-nav'), function (n) {
      n.classList.toggle('sx-on', n.getAttribute('data-go') === currentSection);
    });
  }

  /**
   * Built inside a shadow root, which is the only thing that actually works.
   *
   * The first device build rendered as a 160px column of shrink-wrapped pills.
   * `original.html` carries a bare `button { flex:1; max-width:160px;
   * height:76px; border-radius:38px }` for its own big touch targets, and a
   * bare element selector reaches anything in the document — including a
   * settings screen injected into it. Prefixing every class `sx-` prevented
   * *collisions*; it does nothing about inheritance from element selectors.
   *
   * And it would have been a different wrong shape in each of the five UIs,
   * one of which is a light theme, so there was no set of overrides to write.
   *
   * A shadow root is a real boundary: page rules do not cross it. Only
   * inherited properties do, which `:host{all:initial}` stops. Chromium 83 has
   * had `attachShadow` since long before it — but if it is ever missing, this
   * falls back to appending in the light DOM, which is the old broken-looking
   * behaviour rather than no settings screen at all.
   */
  function build() {
    if (root) return;

    var host = el('div');
    host.id = 'stride-settings';
    // Positioning lives on the host, inline, where no page rule can reach it.
    host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;' +
                         'z-index:9000;display:none';
    document.body.appendChild(host);

    var mount = host;
    if (host.attachShadow) mount = host.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = CSS;
    mount.appendChild(style);

    shadowHost = host;
    root = el('div', 'sx-root');

    var rail = el('div', 'sx-rail');
    rail.appendChild(el('div', 'sx-title', 'Settings'));
    var navs = el('div', 'sx-navs');
    SECTIONS.forEach(function (s) {
      var b = el('button', 'sx-nav' + (s[0] === currentSection ? ' sx-on' : ''));
      b.setAttribute('data-go', s[0]);
      b.innerHTML = '<svg class="sx-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="' +
        ICONS[s[0]] + '"/></svg><span>' + s[1] + '</span>';
      press(b, function () {
        currentSection = s[0];
        [].forEach.call(navs.children, function (c) { c.classList.remove('sx-on'); });
        b.classList.add('sx-on');
        [].forEach.call(root.querySelectorAll('.sx-pane'), function (p) {
          p.classList.toggle('sx-on', p.getAttribute('data-p') === s[0]);
        });
      });
      navs.appendChild(b);
    });
    rail.appendChild(navs);

    var foot = el('div', 'sx-foot');
    foot.appendChild(press(el('button', 'sx-close', 'CLOSE'), close));
    rail.appendChild(foot);

    root.appendChild(rail);
    root.appendChild(el('div', 'sx-panel'));
    mount.appendChild(root);
  }

  function open() {
    build();
    rebuild();
    shadowHost.style.display = 'block';
    // Only the visible section ticks — polling a bridge for a heart rate while
    // looking at the broker settings is work nobody asked for.
    poll = setInterval(function () {
      var pane = root.querySelector('.sx-pane.sx-on');
      if (pane && pane.sxTick) pane.sxTick();
    }, 1200);
  }

  function close() {
    if (!shadowHost) return;
    closeKeyboard();
    shadowHost.style.display = 'none';
    if (poll) { clearInterval(poll); poll = null; }
    // The host document may be showing something this screen just changed —
    // the welcome screen's list of people, most obviously. It cannot know that
    // without being told, and polling for it would be worse.
    try {
      document.dispatchEvent(new CustomEvent('stride-settings-closed'));
    } catch (e) {
      // Chromium 83 has CustomEvent; a host without it simply misses the hint.
    }
  }

  function isOpen() { return !!shadowHost && shadowHost.style.display !== 'none'; }

  global.STRIDE_SETTINGS = { open: open, close: close, isOpen: isOpen };
})(this);
