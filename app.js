/* 60秒ニュース 本体
 * ニュースのデータは data/manifest.js（日付の一覧）と
 * data/articles/YYYY-MM-DD.js（その日の記事）から読み込む。
 */
(function () {
  'use strict';

  var AGES = ['10代', '20代', '30代', '40代', '50代', '60代', '70代以上'];
  var LABELS = {
    fact: '事実',
    forecast: '予測',
    view: '見方'
  };
  var STAGES = [
    { key: 'cause', title: 'そもそもの原因' },
    { key: 'past', title: '過去に何があった？' },
    { key: 'now', title: 'なぜ今、問題になっている？' }
  ];

  var app = document.getElementById('app');
  var articles = [];
  var whyState = {}; // 記事ごとの「なぜ？」の会話履歴

  /* ---------- 小さな道具 ---------- */

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }

  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }

  function label(type) {
    if (!LABELS[type]) return null;
    return h('span', { class: 'label ' + type, text: LABELS[type] });
  }

  function formatDate(d) {
    var p = d.split('-');
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    var w = '日月火水木金土'.charAt(dt.getDay());
    return (+p[1]) + '月' + (+p[2]) + '日（' + w + '）';
  }

  function getAge() { return localStorage.getItem('age'); }
  function setAge(a) { localStorage.setItem('age', a); }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error(src)); };
      document.head.appendChild(s);
    });
  }

  function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* 本文中の専門用語に点線を付け、タップで意味を表示する */
  function richText(text, glossary) {
    var frag = document.createDocumentFragment();
    if (!text) return frag;
    var terms = (glossary || []).map(function (g) { return g.term; })
      .filter(Boolean).sort(function (a, b) { return b.length - a.length; });
    if (!terms.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    var re = new RegExp('(' + terms.map(escapeReg).join('|') + ')');
    var used = {};
    text.split(re).forEach(function (part) {
      if (!part) return;
      if (terms.indexOf(part) !== -1 && !used[part]) {
        used[part] = true;
        frag.appendChild(h('button', {
          class: 'term', type: 'button', text: part,
          onclick: function () { showTerm(part, glossary); }
        }));
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    });
    return frag;
  }

  function paragraphs(text, glossary) {
    return String(text || '').split(/\n+/).filter(Boolean).map(function (t) {
      return h('p', null, richText(t, glossary));
    });
  }

  /* ---------- 用語シート ---------- */

  var sheet = document.getElementById('sheet');
  sheet.addEventListener('click', function (e) {
    if (e.target.getAttribute('data-close')) sheet.classList.add('hidden');
  });

  function showTerm(term, glossary) {
    var g = (glossary || []).filter(function (x) { return x.term === term; })[0];
    document.getElementById('sheet-title').textContent = term;
    document.getElementById('sheet-text').textContent = g ? g.meaning : '';
    sheet.classList.remove('hidden');
  }

  /* ---------- 画面 ---------- */

  function brand() {
    return h('a', { href: '#/', class: 'brand' },
      h('span', { class: 'brand-mark', text: '60s' }),
      h('span', { class: 'brand-name', text: 'NEWS' }));
  }

  /* 上部バー。left を渡すとロゴの代わりに表示（戻るボタンなど） */
  function topbar(left) {
    var age = getAge();
    return h('header', { class: 'topbar' },
      left || brand(),
      h('button', {
        class: 'age-chip', type: 'button', 'aria-label': '年代を変更',
        onclick: function () {
          sessionStorage.setItem('afterAge', location.hash || '#/');
          location.hash = '#/age';
        }
      }, h('span', { class: 'age-dot' }), age || '年代を選ぶ')
    );
  }

  function backLink(href, text) {
    return h('a', { class: 'back', href: href }, '←', h('span', { text: text }));
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function viewAge() {
    var now = getAge();
    var back = sessionStorage.getItem('afterAge') || '#/';
    return h('div', { class: 'welcome' },
      brand(),
      h('h1', null, 'まず、あなたの', h('br'), '年代を教えてください。'),
      h('p', null, 'ニュースが「あなたの生活にどう関係するか」を、年代に合わせて説明します。あとからいつでも変更できます。'),
      h('div', { class: 'age-grid' }, AGES.map(function (a) {
        return h('button', {
          type: 'button', class: a === now ? 'on' : '', text: a,
          onclick: function () {
            setAge(a);
            sessionStorage.removeItem('afterAge');
            location.hash = back === '#/age' ? '#/' : back;
          }
        });
      }))
    );
  }

  function viewHome() {
    var root = h('div', null, topbar());
    if (!articles.length) {
      root.appendChild(h('p', { class: 'empty', text: 'まだニュースがありません。' }));
      return root;
    }
    var p = articles[0].date.split('-');
    var dt = new Date(+p[0], +p[1] - 1, +p[2]);
    root.appendChild(h('section', { class: 'hero' },
      h('div', { class: 'hero-date' },
        h('span', { class: 'hero-day', text: (+p[1]) + '.' + pad(+p[2]) }),
        h('span', { class: 'hero-week', text: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][dt.getDay()] })),
      h('h1', { class: 'hero-title' }, 'ニュースを、', h('br'), 'あなたの生活の話に。'),
      h('p', { class: 'hero-sub', text: '1本60秒。何が起きて、あなたにどう関係するのか。' })
    ));
    var lastDate = null, n = 0;
    articles.forEach(function (a, i) {
      if (a.date !== lastDate) {
        lastDate = a.date;
        n = 0;
        root.appendChild(h('div', { class: 'date-head', text: i === 0 ? 'TODAY — ' + formatDate(a.date) : formatDate(a.date) }));
      }
      n++;
      root.appendChild(h('a', { class: 'news-card' + (i === 0 ? ' featured' : ''), href: '#/a/' + encodeURIComponent(a.id) },
        h('div', { class: 'card-top' },
          h('span', { class: 'idx', text: pad(n) }),
          h('span', { class: 'cat', text: a.category || '経済' }),
          h('span', { class: 'read', text: '⏱ 60秒' })),
        h('h2', { text: a.title }),
        h('p', { text: a.lead || '' }),
        h('span', { class: 'card-arrow', text: '→' })
      ));
    });
    root.appendChild(h('p', {
      class: 'note',
      text: 'このアプリの解説はAIが作成しています。誤りが含まれる可能性があるため、大事な判断の前には各記事の出典を確認してください。投資や借入の判断はご自身の責任で行ってください。'
    }));
    return root;
  }

  function step(no, title, type, body) {
    return h('section', { class: 'step' },
      h('div', { class: 'step-head' },
        h('span', { class: 'step-no', text: pad(no) }),
        h('span', { class: 'step-title', text: title }),
        label(type)),
      body);
  }

  function viewArticle(a) {
    var g = a.glossary || [];
    var s = a.summary || {};
    var age = getAge() || '20代';
    var youBody = h('div');

    function renderYou(selected) {
      youBody.innerHTML = '';
      youBody.appendChild(h('div', { class: 'age-tabs' }, AGES.map(function (x) {
        return h('button', {
          type: 'button', class: x === selected ? 'on' : '', text: x,
          onclick: function () { renderYou(x); }
        });
      })));
      var txt = (s.forYou || {})[selected];
      append(youBody, txt ? paragraphs(txt, g) : h('p', { text: 'この年代向けの説明はまだありません。' }));
    }
    renderYou(age);

    var who = h('ul', { class: 'who-list' }, (s.who || []).map(function (w) {
      return h('li', null,
        h('span', { class: 'gl ' + (w.type === 'loss' ? 'loss' : 'gain'), text: w.type === 'loss' ? '損' : '得' }),
        h('div', null, h('span', { class: 'who-name', text: w.who }), h('span', { class: 'who-why' }, richText(w.why, g))));
    }));

    return h('div', null,
      h('div', { class: 'progress' }, h('div', { class: 'progress-bar', id: 'pbar' })),
      topbar(backLink('#/', 'ニュース一覧')),
      h('div', { class: 'article-hero' },
        h('span', { class: 'cat', text: a.category || '経済' }),
        h('h1', { class: 'article-title', text: a.title }),
        h('div', { class: 'meta' },
          h('span', { text: formatDate(a.date) }),
          h('span', { class: 'pill', text: '⏱ 60秒でわかる' }))),
      step(1, '何が起きた？', 'fact', paragraphs(s.what, g)),
      step(2, 'なぜ起きた？', 'fact', paragraphs(s.why, g)),
      step(3, '誰が得をする？ 損をする？', 'view', who),
      step(4, 'あなたにどう関係する？', 'view', youBody),
      step(5, '今後どうなる？', 'forecast', paragraphs(s.next, g)),
      g.length ? h('section', { class: 'step' },
        h('div', { class: 'step-head' },
          h('span', { class: 'step-no', text: 'Aa' }),
          h('span', { class: 'step-title', text: '用語をやさしく' })),
        h('div', { class: 'terms' }, g.map(function (x) {
          return h('button', { type: 'button', text: x.term, onclick: function () { showTerm(x.term, g); } });
        }))) : null,
      h('div', { class: 'deep-links' },
        a.story ? h('a', { class: 'btn', href: '#/a/' + encodeURIComponent(a.id) + '/story' },
          h('span', null, 'ストーリーで深く知る', h('small', { text: '過去から今、これからを一本の流れで' })),
          h('span', { class: 'arrow', text: '→' })) : null,
        a.why ? h('a', { class: 'btn btn-accent', href: '#/a/' + encodeURIComponent(a.id) + '/why' },
          h('span', null, '「なぜ？」を掘り下げる', h('small', { text: '疑問をタップして、どんどん深掘り' })),
          h('span', { class: 'arrow', text: '→' })) : null
      ),
      sources(a),
      labelNote()
    );
  }

  function sources(a) {
    if (!a.sources || !a.sources.length) return null;
    return h('div', { class: 'sources' }, h('div', { class: 'sources-title', text: 'SOURCES — 出典・参考' }),
      h('ul', null, a.sources.map(function (x) {
        return h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener', text: x.name }));
      })));
  }

  function labelNote() {
    return h('p', { class: 'note' },
      '【事実】報道や公式発表で確認できること　【見方】立場によって評価が分かれること　【予測】これから起こりうること（外れる可能性があります）。解説はAIが作成しており、誤りを含む可能性があります。');
  }

  function viewStory(a) {
    var g = a.glossary || [];
    var st = a.story || {};
    var root = h('div', null,
      h('div', { class: 'progress' }, h('div', { class: 'progress-bar', id: 'pbar' })),
      topbar(backLink('#/a/' + encodeURIComponent(a.id), '60秒まとめ')),
      h('div', { class: 'article-hero' },
        h('span', { class: 'cat', text: 'STORY' }),
        h('h1', { class: 'article-title', text: a.title }),
        st.intro ? h('div', { class: 'intro' }, paragraphs(st.intro, g)) : null)
    );
    STAGES.forEach(function (sg, i) {
      var list = (st.chapters || []).filter(function (c) { return c.stage === sg.key; });
      if (!list.length) return;
      root.appendChild(h('div', { class: 'stage' },
        h('div', { class: 'stage-title' }, 'CHAPTER ' + (i + 1), h('b', { text: sg.title })),
        h('div', { class: 'timeline' }, list.map(function (c) {
          return h('div', { class: 'chapter' },
            c.era ? h('div', { class: 'era', text: c.era }) : null,
            h('h3', null, c.title, label(c.label || 'fact')),
            paragraphs(c.text, g));
        }))));
    });
    if (st.scenarios && st.scenarios.length) {
      root.appendChild(h('div', { class: 'stage' },
        h('div', { class: 'stage-title' }, 'CHAPTER 4 — 予測', h('b', { text: 'これから、どうなる？' })),
        st.scenarios.map(function (sc, i) {
          var name = String(sc.name || '').replace(/^シナリオ\s*[A-ZＡ-Ｚ]\s*[：:]\s*/, '');
          return h('div', { class: 'scenario' },
            h('div', { class: 'scenario-letter', text: 'ABCDEFG'.charAt(i) }),
            h('div', null,
              h('h3', { text: name }),
              paragraphs(sc.text, g)));
        })));
    }
    if (a.why) {
      root.appendChild(h('div', { class: 'deep-links' },
        h('a', { class: 'btn btn-accent', href: '#/a/' + encodeURIComponent(a.id) + '/why' },
          h('span', null, '「なぜ？」を掘り下げる', h('small', { text: '疑問をタップして、どんどん深掘り' })),
          h('span', { class: 'arrow', text: '→' }))));
    }
    root.appendChild(sources(a));
    root.appendChild(labelNote());
    return root;
  }

  function viewWhy(a) {
    var g = a.glossary || [];
    var why = a.why || { start: [], items: {} };
    var items = why.items || {};
    var asked = whyState[a.id] || (whyState[a.id] = []);
    var thread = h('div', { class: 'thread' });
    var chipsBox = h('div');

    function render(scroll) {
      thread.innerHTML = '';
      thread.appendChild(h('div', { class: 'bubble a' }, 'このニュースについて、気になる疑問をタップしてください。答えのあとに、さらに深い疑問が出てきます。'));
      asked.forEach(function (id) {
        var it = items[id];
        if (!it) return;
        thread.appendChild(h('div', { class: 'bubble q', text: it.q }));
        thread.appendChild(h('div', { class: 'bubble a' }, label(it.label || 'fact'), paragraphs(it.a, g)));
      });

      chipsBox.innerHTML = '';
      var last = asked.length ? items[asked[asked.length - 1]] : null;
      var follow = ((last && last.next) || []).filter(function (id) { return items[id] && asked.indexOf(id) === -1; });
      var others = (why.start || []).filter(function (id) { return items[id] && asked.indexOf(id) === -1 && follow.indexOf(id) === -1; });

      if (follow.length) {
        chipsBox.appendChild(h('div', { class: 'chips-title', text: 'DIG DEEPER — さらに深掘り' }));
        chipsBox.appendChild(h('div', { class: 'chips' }, follow.map(function (id) { return chip(id, ''); })));
      }
      if (others.length) {
        chipsBox.appendChild(h('div', { class: 'chips-title', text: asked.length ? 'OTHER — ほかの疑問' : 'QUESTIONS — よくある疑問' }));
        chipsBox.appendChild(h('div', { class: 'chips' }, others.map(function (id) { return chip(id, asked.length ? 'other' : ''); })));
      }
      if (!follow.length && !others.length) {
        chipsBox.appendChild(h('p', { class: 'chips-title', text: '用意した疑問はすべて見ました。' }));
      }
      if (asked.length) {
        chipsBox.appendChild(h('div', { style: 'margin-top:14px' }, h('button', {
          class: 'btn btn-sub', type: 'button', text: '最初からやり直す',
          onclick: function () { asked.length = 0; render(false); window.scrollTo(0, 0); }
        })));
      }
      if (scroll) {
        var bubbles = thread.querySelectorAll('.bubble.q');
        var lastQ = bubbles[bubbles.length - 1];
        if (lastQ) lastQ.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function chip(id, cls) {
      return h('button', {
        type: 'button', class: cls, text: items[id].q,
        onclick: function () { asked.push(id); render(true); }
      });
    }

    render(false);
    return h('div', null,
      topbar(backLink('#/a/' + encodeURIComponent(a.id), '60秒まとめ')),
      h('div', { class: 'article-hero' },
        h('span', { class: 'cat', text: 'WHY?' }),
        h('h1', { class: 'article-title', text: a.title })),
      thread, chipsBox, labelNote());
  }

  /* ---------- 画面の切り替え ---------- */

  function route() {
    var hash = location.hash || '#/';
    var parts = hash.replace(/^#\/?/, '').split('/');
    var view;

    if (!getAge() && parts[0] !== 'age') {
      sessionStorage.setItem('afterAge', hash);
      location.hash = '#/age';
      return;
    }

    if (parts[0] === 'age') {
      view = viewAge();
    } else if (parts[0] === 'a' && parts[1]) {
      var id = decodeURIComponent(parts[1]);
      var a = articles.filter(function (x) { return x.id === id; })[0];
      if (!a) view = h('div', null, topbar(), h('p', { class: 'empty', text: '記事が見つかりませんでした。' }));
      else if (parts[2] === 'story') view = viewStory(a);
      else if (parts[2] === 'why') view = viewWhy(a);
      else view = viewArticle(a);
    } else {
      view = viewHome();
    }

    app.innerHTML = '';
    app.appendChild(view);
    if (parts[2] !== 'why') window.scrollTo(0, 0);
  }

  /* 読んだ量を上部のバーで表示 */
  function updateProgress() {
    var bar = document.getElementById('pbar');
    if (!bar) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (max > 0 ? Math.min(100, window.scrollY / max * 100) : 0) + '%';
  }

  function init() {
    window.NEWS_ARTICLES = [];
    loadScript('data/manifest.js?v=' + Date.now()).then(function () {
      var dates = (window.NEWS_MANIFEST || []).slice();
      return Promise.all(dates.map(function (d) {
        return loadScript('data/articles/' + d + '.js?v=' + Date.now()).catch(function () {});
      }));
    }).then(function () {
      articles = window.NEWS_ARTICLES.slice().sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (a.order || 0) - (b.order || 0);
      });
      window.addEventListener('hashchange', route);
      window.addEventListener('scroll', updateProgress, { passive: true });
      route();
    }).catch(function () {
      app.innerHTML = '';
      app.appendChild(h('p', { class: 'empty', text: 'ニュースの読み込みに失敗しました。ページを再読み込みしてください。' }));
    });
  }

  init();
})();
