document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// the background colour is keyed to the middle of each [data-bg] section and
// blends between them as you scroll. smootherstep rushes through the halfway
// point so the white to black fades don't sit on an unreadable grey for long.
const root = document.documentElement;

const bgStops = [...document.querySelectorAll('[data-bg]')].map(el => ({
  el,
  color: hexToRgb(el.dataset.bg)
}));

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function smootherstep(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

let ticking = false;

// the background photo only belongs on the opening screen, so it fades out as
// the hero scrolls away. it runs on the same frame as the background colour
// and gets written out as --bg-photo-fade.
const heroSection = document.getElementById('hero');
const bgPhotoEl = document.querySelector('.bg-photo');

function updateHeroPhoto() {
  if (!heroSection || !bgPhotoEl) return;
  const rect = heroSection.getBoundingClientRect();
  // fully there while the hero is in place, gone by the time 55% of it has left
  const travelled = Math.max(0, -rect.top);
  const distance = Math.max(1, rect.height * 0.55);
  const fade = 1 - Math.min(1, travelled / distance);
  root.style.setProperty('--bg-photo-fade', (fade * fade * (3 - 2 * fade)).toFixed(3));
}

function updateBackground() {
  ticking = false;
  updateHeroPhoto();
  if (!bgStops.length) return;

  const viewportCenter = window.scrollY + window.innerHeight / 2;

  // measured every time so it still works after images load or the window resizes
  const pts = bgStops.map(s => {
    const r = s.el.getBoundingClientRect();
    return { center: r.top + window.scrollY + r.height / 2, color: s.color };
  });

  let color;
  if (viewportCenter <= pts[0].center) {
    color = pts[0].color;
  } else if (viewportCenter >= pts[pts.length - 1].center) {
    color = pts[pts.length - 1].color;
  } else {
    for (let i = 0; i < pts.length - 1; i++) {
      if (viewportCenter >= pts[i].center && viewportCenter <= pts[i + 1].center) {
        const span = pts[i + 1].center - pts[i].center;
        const t = smootherstep(span ? (viewportCenter - pts[i].center) / span : 0);
        const a = pts[i].color, b = pts[i + 1].color;
        color = [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
        break;
      }
    }
  }

  if (color) {
    root.style.setProperty('--scroll-bg', `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
  }
}

function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(updateBackground);
  }
}

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', updateBackground);
window.addEventListener('load', updateBackground);
updateBackground();

const body = document.body;
document.querySelectorAll('.tile').forEach(tile => {
  const color = tile.dataset.color;

  tile.addEventListener('mouseenter', () => {
    root.style.setProperty('--flood', color);
    body.classList.add('flooded');
  });
  tile.addEventListener('mouseleave', () => {
    body.classList.remove('flooded');
  });
});

// the scroll reveal replays every time, in both directions. it needs two
// observers because showing and resetting want different lines: showing fires
// a little early (the -8% bottom margin) so things are already moving as they
// come up, but resetting has to wait until the element is completely off
// screen. using the same line for both faded things out while they were still
// visible at the bottom and flickered if you hovered around that line.
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

const rearmObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) return;
    entry.target.classList.remove('visible');
    // come back in from whichever edge it left by, so something that went off
    // the top drops back down instead of rising up from the bottom
    entry.target.classList.toggle('from-above', entry.boundingClientRect.top < 0);
  });
}, { threshold: 0 });

document.querySelectorAll('[data-reveal]').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 90}ms`;
  revealObserver.observe(el);
  rearmObserver.observe(el);
});

// anything already on screen at load gets revealed straight away instead of
// waiting for the first scroll
requestAnimationFrame(() => {
  document.querySelectorAll('[data-reveal]').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) el.classList.add('visible');
  });
});

// the contact form posts straight to my gmail through formsubmit's ajax
// endpoint, so there's no backend to run. the very first message sends a one
// time activation email to that inbox instead, and once that link is clicked
// everything after it arrives normally. to switch providers later just change
// CONTACT_ENDPOINT, nothing else cares.
const CONTACT_ENDPOINT = 'https://formsubmit.co/ajax/zalex9111@gmail.com';
// the fallback mailto uses the address the site displays (the ucla one), while
// the form itself keeps delivering to gmail since that's the inbox formsubmit
// is set up for. if you move the form over, it needs a fresh activation click.
const CONTACT_MAILTO = 'azhang25@g.ucla.edu';

const contactForm = document.getElementById('contact-form');

if (contactForm) {
  const nameEl = document.getElementById('cf-name');
  const emailEl = document.getElementById('cf-email');
  const msgEl = document.getElementById('cf-message');
  const countEl = document.getElementById('cf-count-n');
  const statusEl = document.getElementById('cf-status');
  const sendBtn = contactForm.querySelector('.cf-send');
  const sendLabel = contactForm.querySelector('.cf-send-label');
  const honeyEl = contactForm.querySelector('.cf-honey');

  // the message box grows with what you type instead of scrolling inside itself
  const autoGrow = () => {
    msgEl.style.height = 'auto';
    msgEl.style.height = `${msgEl.scrollHeight}px`;
  };
  msgEl.addEventListener('input', () => {
    autoGrow();
    countEl.textContent = msgEl.value.length;
  });
  autoGrow();

  const setStatus = (text, kind) => {
    statusEl.textContent = text;
    statusEl.className = `cf-status show${kind ? ' ' + kind : ''}`;
  };

  const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

  // drop the red error state as soon as someone starts fixing the field
  [nameEl, emailEl, msgEl].forEach(el => {
    el.addEventListener('input', () => el.closest('.cf-field').classList.remove('invalid'));
  });

  const flagInvalid = el => {
    el.closest('.cf-field').classList.add('invalid');
    el.focus();
  };

  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (sendBtn.disabled) return;

    // only bots ever fill in the hidden field, so pretend it worked and drop it
    if (honeyEl.value) {
      setStatus('Message sent.', 'ok');
      return;
    }

    if (!nameEl.value.trim()) {
      setStatus('Add your name first.', 'err');
      flagInvalid(nameEl);
      return;
    }
    if (!validEmail(emailEl.value)) {
      setStatus('That email looks off.', 'err');
      flagInvalid(emailEl);
      return;
    }
    if (msgEl.value.trim().length < 8) {
      setStatus('Say a little more.', 'err');
      flagInvalid(msgEl);
      return;
    }

    sendBtn.disabled = true;
    sendBtn.classList.add('sending');
    sendLabel.textContent = 'Sending';
    setStatus('Sending…');

    const payload = {
      name: nameEl.value.trim(),
      email: emailEl.value.trim(),
      message: msgEl.value.trim(),
      // so the email that shows up says where it came from
      'Sent from': window.location.href,
      'Referrer': document.referrer || 'direct',
      'Sent at': new Date().toLocaleString(),
      'Browser': navigator.userAgent,
      _subject: `alexzhang.site — new message from ${nameEl.value.trim()}`,
      _template: 'table',
      _captcha: 'false'
    };

    // don't leave the button stuck on "Sending" if the network hangs
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);

    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: abort.signal
      });
      clearTimeout(timeout);
      const data = await res.json().catch(() => ({}));
      const note = String(data.message || '');

      // before that first activation click, formsubmit takes the post but holds
      // the message and emails me a confirmation link instead. say that plainly
      // instead of claiming it was delivered.
      if (/activat|confirm/i.test(note)) {
        contactForm.classList.add('sent');
        setStatus('Message received — awaiting one-time inbox confirmation.', 'ok');
        console.info('FormSubmit activation pending:', note);
        return;
      }

      // opening index.html straight off disk: formsubmit refuses file:// posts
      // as its own rule (cors would actually allow them). this only happens when
      // testing locally, so say what to do about it instead of "couldn't send".
      if (/web server|HTML files/i.test(note)) {
        sendBtn.disabled = false;
        sendBtn.classList.remove('sending');
        sendLabel.textContent = 'Send message';
        setStatus('Local file preview — run a web server to send.', 'err');
        console.warn(
          'FormSubmit rejects file:// submissions. Serve the folder instead:\n' +
          '  py -m http.server 8000   →   http://localhost:8000\n' +
          'Works automatically once deployed to GitHub Pages.'
        );
        return;
      }

      if (!res.ok || (data.success !== undefined && String(data.success) !== 'true')) {
        throw new Error(note || `HTTP ${res.status}`);
      }

      contactForm.classList.add('sent');
      setStatus(`Thanks, ${payload.name.split(' ')[0]} — I'll get back to you soon.`, 'ok');
    } catch (err) {
      clearTimeout(timeout);
      console.error('Contact form failed:', err);
      sendBtn.disabled = false;
      sendBtn.classList.remove('sending');
      sendLabel.textContent = 'Send message';
      // last resort, hand the message to their own mail app
      const mailto = `mailto:${CONTACT_MAILTO}?subject=${encodeURIComponent(payload._subject)}&body=${encodeURIComponent(`${payload.message}\n\n— ${payload.name} (${payload.email})`)}`;
      statusEl.innerHTML = `Couldn't send. <a href="${mailto}">Email it instead →</a>`;
      statusEl.className = 'cf-status show err';
    }
  });
}

// each project title gets split into letters that ripple up one after another
// as the card opens, pulling the description and tags in behind them. the cards
// also open themselves one at a time while the projects section is on screen,
// so you can read them without hovering (which also makes it work on phones).
// a real hover takes over straight away and the cycle steps aside.
const projectSection = document.getElementById('projects');
const projectTiles = [...document.querySelectorAll('.tile')];
const reduceMotionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

if (projectSection && projectTiles.length) {
  // split a title into words and then letters, but keep a whole copy for
  // screen readers
  const splitLetters = el => {
    const text = el.textContent.trim();
    el.textContent = '';

    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = text;
    el.appendChild(sr);

    const chars = [];
    const words = text.split(' ');

    words.forEach((word, w) => {
      // each word stays in one piece so a line never breaks in the middle of it
      const wordEl = document.createElement('span');
      wordEl.className = 'word';
      wordEl.setAttribute('aria-hidden', 'true');

      [...word].forEach(ch => {
        const charEl = document.createElement('span');
        charEl.className = 'char';
        charEl.textContent = ch;
        wordEl.appendChild(charEl);
        chars.push(charEl);
      });

      el.appendChild(wordEl);

      if (w < words.length - 1) {
        const space = document.createElement('span');
        space.setAttribute('aria-hidden', 'true');
        space.innerHTML = '&nbsp;';
        el.appendChild(space);
      }
    });

    chars.forEach((charEl, i) => {
      charEl.style.setProperty('--i', i);                    // opens left to right
      charEl.style.setProperty('--r', chars.length - 1 - i); // closes right to left
    });
  };

  projectTiles.forEach(tile => {
    const nameEl = tile.querySelector('.tile-name');
    if (nameEl) splitLetters(nameEl);

    const hoverEl = tile.querySelector('.tile-hover');
    if (hoverEl && !hoverEl.querySelector('.tile-rule')) {
      const rule = document.createElement('div');
      rule.className = 'tile-rule';
      rule.setAttribute('aria-hidden', 'true');
      hoverEl.insertBefore(rule, hoverEl.firstChild);
    }

    tile.querySelectorAll('.tile-tags span').forEach((tag, i) => {
      tag.style.setProperty('--i', i);
    });
  });

  const AUTO_HOLD = 3400; // how long a card stays open
  const AUTO_GAP = 800;   // breath between cards

  let autoIndex = -1;
  let autoTimer = null;
  let sectionInView = false;
  let userEngaged = false;

  const canCycle = () =>
    sectionInView &&
    !userEngaged &&
    !reduceMotionMQ.matches &&
    document.visibilityState === 'visible' &&
    projectTiles.length > 1;

  const closeAll = () => projectTiles.forEach(t => t.classList.remove('is-open'));
  const queue = (fn, ms) => {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(fn, ms);
  };

  function advance() {
    if (!canCycle()) return stopCycle();
    autoIndex = (autoIndex + 1) % projectTiles.length;
    projectTiles.forEach((t, i) => t.classList.toggle('is-open', i === autoIndex));
    queue(() => {
      closeAll();
      queue(advance, AUTO_GAP);
    }, AUTO_HOLD);
  }

  function startCycle(delay = 700) {
    if (!canCycle()) return;
    queue(advance, delay);
  }

  function stopCycle() {
    clearTimeout(autoTimer);
    closeAll();
  }

  // a real hover always wins, and the cycle picks up from that card afterwards
  projectTiles.forEach((tile, i) => {
    tile.addEventListener('mouseenter', () => {
      userEngaged = true;
      stopCycle();
      autoIndex = i;
    });
    tile.addEventListener('mouseleave', () => {
      userEngaged = false;
      startCycle(1600);
    });
    tile.addEventListener('focusin', () => {
      userEngaged = true;
      stopCycle();
      autoIndex = i;
    });
    tile.addEventListener('focusout', () => {
      userEngaged = false;
      startCycle(1600);
    });
  });

  new IntersectionObserver(entries => {
    entries.forEach(entry => {
      sectionInView = entry.isIntersecting;
      if (sectionInView) startCycle();
      else stopCycle();
    });
  }, { threshold: 0.25 }).observe(projectSection);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startCycle();
    else stopCycle();
  });

  reduceMotionMQ.addEventListener('change', () => {
    if (reduceMotionMQ.matches) stopCycle();
    else startCycle();
  });
}
