from pathlib import Path

path = Path('index.html')
html = path.read_text()

css_anchor = "    /* ────────────────────────────────────────\n       DAR / OFRENDAS\n    ──────────────────────────────────────── */"
events_css = '''    /* ────────────────────────────────────────
       EVENTOS
    ──────────────────────────────────────── */
    #eventos {
      padding: var(--section-pad);
      background: var(--white);
    }
    #eventos .row-top {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin-bottom: 48px;
      gap: 24px;
      flex-wrap: wrap;
    }
    .events-list { display: flex; flex-direction: column; }
    .event-row {
      display: grid;
      grid-template-columns: 100px 1fr auto;
      align-items: center;
      gap: 32px;
      padding: 30px 0;
      border-bottom: 1px solid var(--line);
      transition: padding-left 0.35s var(--ease), background 0.3s ease;
    }
    .event-row:first-child { border-top: 1px solid var(--line); }
    .event-row:hover { padding-left: 16px; background: var(--cream); }
    .event-date-box { text-align: center; }
    .event-date-num {
      font-family: 'Archivo', sans-serif;
      font-size: 2.6rem;
      font-weight: 900;
      color: var(--action);
      line-height: 1;
      display: block;
    }
    .event-date-month {
      font-family: 'Archivo', sans-serif;
      font-size: 0.65rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-weight: 700;
      color: var(--muted);
      display: block;
      margin-top: 6px;
    }
    .event-title {
      font-family: 'Archivo', sans-serif;
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--black);
      margin-bottom: 7px;
      line-height: 1.2;
    }
    .event-details { font-size: 0.88rem; color: var(--muted); font-weight: 500; line-height: 1.55; }
    .event-note { display: block; margin-top: 5px; color: var(--action-dark); font-weight: 700; }
    .event-tag {
      font-family: 'Archivo', sans-serif;
      font-size: 0.68rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 700;
      padding: 11px 18px;
      border-radius: 100px;
      border: 1px solid var(--action);
      color: var(--action-dark);
      text-decoration: none;
      white-space: nowrap;
      transition: background 0.25s ease, color 0.25s ease, transform 0.25s ease;
    }
    a.event-tag:hover { background: var(--action); color: var(--white); transform: translateY(-1px); }
    .event-tag-static { border-color: var(--rule); color: var(--muted); }

'''
if '#eventos {' not in html:
    if css_anchor not in html:
        raise SystemExit('CSS anchor not found')
    html = html.replace(css_anchor, events_css + css_anchor, 1)

responsive_anchor = "      .sermons-grid {\n        grid-template-columns: 1fr;\n        gap: 20px;\n      }"
if '.event-row { grid-template-columns: 72px 1fr;' not in html:
    if responsive_anchor not in html:
        raise SystemExit('Responsive anchor not found')
    html = html.replace(responsive_anchor, responsive_anchor + "\n\n      .event-row { grid-template-columns: 72px 1fr; gap: 16px; padding: 22px 0; }\n      .event-date-num { font-size: 2rem; }\n      .event-tag { grid-column: 2; justify-self: start; margin-top: 4px; }", 1)

small_anchor = "      .sermon-title { font-size: 1rem !important; }"
if '.event-row { grid-template-columns: 60px 1fr;' not in html:
    if small_anchor not in html:
        raise SystemExit('Small responsive anchor not found')
    html = html.replace(small_anchor, small_anchor + "\n\n      .event-row { grid-template-columns: 60px 1fr; gap: 12px; }\n      .event-date-num { font-size: 1.7rem; }\n      .event-title { font-size: 1.1rem; }", 1)

desktop_nav = '        <li><a href="#sermones" data-en="Sermons">Sermones</a></li>\n        <li><a href="#esencial">Podcast</a></li>'
desktop_new = '        <li><a href="#sermones" data-en="Sermons">Sermones</a></li>\n        <li><a href="#eventos" data-en="Events">Eventos</a></li>\n        <li><a href="#esencial">Podcast</a></li>'
if 'href="#eventos" data-en="Events">Eventos</a>' not in html.split('</nav>', 1)[0]:
    if desktop_nav not in html:
        raise SystemExit('Desktop nav anchor not found')
    html = html.replace(desktop_nav, desktop_new, 1)

mobile_nav = '      <li><a href="#sermones" data-en="Sermons">Sermones</a></li>\n      <li><a href="#esencial">Podcast</a></li>'
mobile_new = '      <li><a href="#sermones" data-en="Sermons">Sermones</a></li>\n      <li><a href="#eventos" data-en="Events">Eventos</a></li>\n      <li><a href="#esencial">Podcast</a></li>'
if mobile_nav in html:
    html = html.replace(mobile_nav, mobile_new, 1)

events_markup = '''  <!-- ── EVENTOS ── -->
  <section id="eventos">
    <div class="container">
      <div class="row-top reveal">
        <div>
          <span class="eyebrow" data-en="Upcoming Events">Próximos Eventos</span>
          <h2 class="display" data-en="What's <em>coming up</em>">Lo que <em>viene</em></h2>
          <p class="section-lead" data-en="Save the date and join us for what’s happening next at Somos Reino.">Separa la fecha y acompáñanos en lo próximo de Somos Reino.</p>
        </div>
      </div>
      <div class="events-list" data-stagger>
        <div class="event-row reveal">
          <div class="event-date-box">
            <span class="event-date-num">18</span>
            <span class="event-date-month">SEP</span>
          </div>
          <div class="event-info">
            <h3 class="event-title">Ezer</h3>
            <p class="event-details" data-en="Friday · Women's Event · Registration required">Viernes · Evento de Mujeres · Requiere registro
              <span class="event-note" data-en="Registration closes September 16">El registro cierra el 16 de septiembre</span>
            </p>
          </div>
          <a class="event-tag" href="https://casafamiliar.churchtrac.com/connect?ei=CYJAL63" target="_blank" rel="noopener" data-en="Register">Registrarse</a>
        </div>
        <div class="event-row reveal">
          <div class="event-date-box">
            <span class="event-date-num">10</span>
            <span class="event-date-month">OCT</span>
          </div>
          <div class="event-info">
            <h3 class="event-title">Avance</h3>
            <p class="event-details" data-en="Saturday · 1:00 PM – 5:00 PM">Sábado · 1:00 PM – 5:00 PM</p>
          </div>
          <span class="event-tag event-tag-static" data-en="October 10">10 de octubre</span>
        </div>
      </div>
    </div>
  </section>

'''
whatsapp_anchor = '  <!-- ── CANAL DE WHATSAPP ── -->'
if '<section id="eventos">' not in html:
    if whatsapp_anchor not in html:
        raise SystemExit('WhatsApp anchor not found')
    html = html.replace(whatsapp_anchor, events_markup + whatsapp_anchor, 1)

footer_anchor = '            <li><a href="#sermones" data-en="Sermons">Sermones</a></li>\n            <li><a href="#esencial">Podcast</a></li>'
footer_new = '            <li><a href="#sermones" data-en="Sermons">Sermones</a></li>\n            <li><a href="#eventos" data-en="Events">Eventos</a></li>\n            <li><a href="#esencial">Podcast</a></li>'
if footer_anchor in html:
    html = html.replace(footer_anchor, footer_new, 1)

path.write_text(html)
