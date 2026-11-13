"""Turns content/rules.html and content/faq.html (the article text) into the static /rules and /faq pages.
Run from the repo root:  python3 scripts/build_guides.py"""
import html, json, re

SITE = 'https://takaradecks.vercel.app'
PAGES = {
    'rules': dict(title='HORO-BEAT Comprehensive Rules in English', nav='Rules',
                  desc='The full HORO-BEAT Comprehensive Rules translated into English: card types, zones, setup, turn flow, battles, effects and keywords.'),
    'faq': dict(title='HORO-BEAT FAQ: Official Rulings in English', nav='FAQ',
                desc='Official HORO-BEAT FAQ rulings from Takara Tomy in English: battle order, Ena colors for Boost and Overbeat, triggers, and card-specific answers.'),
    'haikyu/rules': dict(title='Haikyu!! VOBACA!! BREAK Official Rules', nav='Rules', src='haikyu-rules',
                         desc='Official English rules for Haikyu!! VOBACA!! BREAK from Takara Tomy: rule sheet, how to play videos, deck rules and rulings by topic.'),
    'haikyu/faq': dict(title='Haikyu!! VOBACA!! BREAK FAQ', nav='FAQ', src='haikyu-faq',
                       desc='Official English questions and answers for Haikyu!! VOBACA!! BREAK from Takara Tomy, by topic.'),
}
strip = lambda s: html.unescape(re.sub(r'<[^>]+>', '', s)).strip()
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', strip(s).lower()).strip('-')[:60]

def build(key):
    page = PAGES[key]
    hv = key.startswith('haikyu/')
    body = open(f'content/{page.get("src", key)}.html', encoding='utf8').read()
    body = body.replace('href="/blog/horo-beat-faq"', 'href="/faq"').replace('href="/blog/horo-beat-comprehensive-rules"', 'href="/rules"')
    toc, used = [], set()
    def anchor(m):
        tag, inner = m.group(1), m.group(2)
        i = slug(inner); n = 2
        while i in used: i = f'{slug(inner)}-{n}'; n += 1
        used.add(i)
        if tag == 'h2': toc.append((i, strip(inner)))
        return f'<{tag} id="{i}">{inner}</{tag}>'
    body = re.sub(r'<(h[23])>(.*?)</\1>', anchor, body, flags=re.S)
    extra = ''
    if key == 'faq':  # lets Google show the questions directly in search results
        qa = re.findall(r'<h3 id="[^"]*">(.*?)</h3>(.*?)(?=<h[23] |\Z)', body, flags=re.S)
        extra = '<script type="application/ld+json">' + json.dumps({
            '@context': 'https://schema.org', '@type': 'FAQPage',
            'mainEntity': [{'@type': 'Question', 'name': strip(q), 'acceptedAnswer': {'@type': 'Answer', 'text': re.sub(r'\s+', ' ', strip(a))}} for q, a in qa],
        }, ensure_ascii=False) + '</script>'
    nav = ''.join(f'<a href="/{k}"{" aria-current=page" if k == key else ""}>{p["nav"]}</a>' for k, p in PAGES.items() if k.startswith('haikyu/') == hv)
    contents = ''.join(f'<li><a href="#{i}">{html.escape(t)}</a></li>' for i, t in toc)
    out = f'''<!doctype html>
<html lang="en" data-game="{'haikyu' if hv else 'horobeat'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{page["title"]} | TakaraDecks</title>
    <meta name="description" content="{page["desc"]}" />
    <link rel="canonical" href="{SITE}/{key}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="theme-color" content="#17171a" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="TakaraDecks" />
    <meta property="og:title" content="{page["title"]}" />
    <meta property="og:description" content="{page["desc"]}" />
    <meta property="og:url" content="{SITE}/{key}" />
    <meta property="og:image" content="{SITE}/share.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=Cinzel:wght@600;700&family=Montserrat:ital,wght@1,800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/guide.css" />
    {extra}
  </head>
  <body>
    <nav class="games" aria-label="Choose a game"><a href="/"{'' if hv else ' class="on"'}><img src="/logos/horobeat.svg" alt="HORO-BEAT" /></a><a href="/haikyu"{' class="on"' if hv else ''}><img src="/logos/haikyu.svg" alt="Haikyu!! VOBACA!! BREAK" /></a></nav>
    <header class="top">
      <a class="brand" href="{'/haikyu' if hv else '/'}"><span class="brand-game">{'HAIKYU!!' if hv else 'HORO-BEAT'}</span><span class="brand-tool">Deck Builder</span></a>
      <nav class="links">{nav}<a class="build" href="{'/haikyu' if hv else '/'}">Build a deck</a></nav>
    </header>
    <div class="wrap">
      <aside class="toc"><h2>On this page</h2><ol>{contents}</ol></aside>
      <main class="doc">
        <h1>{page["title"]}</h1>
{body}
      </main>
    </div>
  </body>
</html>
'''
    __import__('os').makedirs('public/haikyu', exist_ok=True)
    open(f'public/{key}.html', 'w', encoding='utf8').write(out)
    print(key, len(out), len(toc))

for k in PAGES: build(k)
